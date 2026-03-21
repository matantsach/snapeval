import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import type {
  InferenceAdapter,
  HarnessRunResult,
  GradingResult,
  AssertionResult,
} from '../types.js';

const EXACT_MATCH_PATTERN = /^Output (?:is |equals )exactly:\s*"(.+)"$/i;

function gradeExactMatch(assertion: string, output: string): AssertionResult | null {
  const match = assertion.match(EXACT_MATCH_PATTERN);
  if (!match) return null;
  const expected = match[1];
  const actual = output.trim();
  const passed = actual === expected;
  return {
    text: assertion,
    passed,
    evidence: passed
      ? `Exact match: "${expected}"`
      : `Expected: "${expected}"\nGot: "${actual}"`,
  };
}

function buildGradingPrompt(assertions: string[], output: string, files: string[]): string {
  const fileList = files.length > 0 ? `\nFiles produced: ${files.join(', ')}` : '';
  return `You are an eval grader. For each assertion, determine PASS or FAIL based solely on the output below.

GRADING RULES:
- PASS if the output satisfies the assertion's intent, even if wording differs slightly.
- FAIL only if the output clearly does not satisfy the assertion.
- Be consistent: if an assertion checks for X and the output contains X in different phrasing, that is a PASS.
- For "contains" assertions: look for semantic presence, not exact substring.
- For "identifies" assertions: the output must demonstrate awareness of the concept, not use identical words.
- Always cite specific text from the output as evidence.

OUTPUT:
---
${output}
---${fileList}

ASSERTIONS TO GRADE:
${assertions.map((a, i) => `${i + 1}. ${a}`).join('\n')}

Respond with valid JSON only. IMPORTANT: Escape any double quotes inside string values with a backslash (\\"). Do not use unescaped double quotes inside evidence text.
{
  "results": [
    {"text": "<assertion text>", "passed": true/false, "evidence": "<quote from output — escape any double quotes>"}
  ]
}`;
}

function runScript(
  scriptName: string,
  outputDir: string,
  scriptsDir: string
): AssertionResult {
  const scriptPath = path.join(scriptsDir, scriptName);
  if (!fs.existsSync(scriptPath)) {
    return { text: `script:${scriptName}`, passed: false, evidence: `Script not found: ${scriptPath}` };
  }
  try {
    const stdout = execFileSync(scriptPath, [outputDir], { encoding: 'utf-8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const evidence = stdout || `Script passed: ${scriptName}`;
    return { text: `script:${scriptName}`, passed: true, evidence };
  } catch (err: any) {
    // Extract the most useful error info without raw stack traces
    const stderr = err.stderr?.trim();
    const stdout = err.stdout?.trim();
    let evidence: string;
    if (err.code === 'EACCES') {
      evidence = `Permission denied: ${scriptPath} is not executable. Run: chmod +x ${scriptPath}`;
    } else if (stderr) {
      // Take only the first line of stderr to avoid stack trace noise
      evidence = stderr.split('\n')[0];
    } else if (stdout) {
      evidence = stdout.split('\n')[0];
    } else {
      evidence = `Script exited with code ${err.status ?? 'unknown'}`;
    }
    return { text: `script:${scriptName}`, passed: false, evidence };
  }
}

function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

function extractJSON(text: string): string {
  const clean = stripAnsi(text);
  // Try JSON-tagged fence first, then bare fence, then raw text
  const jsonFence = clean.match(/```json\s*([\s\S]*?)```/);
  if (jsonFence) return jsonFence[1].trim();
  // Try parsing raw text as JSON before falling back to any fence
  const trimmed = clean.trim();
  try { JSON.parse(trimmed); return trimmed; } catch { /* not raw JSON */ }
  const anyFence = clean.match(/```\s*([\s\S]*?)```/);
  if (anyFence) return anyFence[1].trim();
  // Last resort: find first { or [ and extract to its matching close
  const start = trimmed.search(/[{[]/);
  if (start >= 0) {
    const sub = trimmed.slice(start);
    try { JSON.parse(sub); return sub; } catch { /* not valid from here */ }
  }
  return trimmed;
}

function parseGraderResponse(response: string): AssertionResult[] {
  const jsonText = extractJSON(response);
  const parsed = JSON.parse(jsonText);
  const items = Array.isArray(parsed) ? parsed : parsed.results;
  if (!Array.isArray(items)) throw new Error('No results array in grader response');
  return items.map((r: any) => ({
    text: r.text ?? '',
    passed: Boolean(r.passed),
    evidence: r.evidence ?? '',
  }));
}

async function gradeLLMAssertions(
  prompt: string,
  assertions: string[],
  runDir: string,
  inference: InferenceAdapter,
): Promise<AssertionResult[]> {
  // Step 1: Grade assertions
  const response = await inference.chat(
    [{ role: 'user', content: prompt }],
    { temperature: 0, responseFormat: 'json' }
  );

  try {
    return parseGraderResponse(response);
  } catch (firstErr) {
    // Step 2: Validation loop — send malformed JSON back to LLM to fix
    const debugPath = path.join(runDir, 'grader-debug.txt');
    fs.writeFileSync(debugPath, `--- original response ---\n${response}\n--- parse error ---\n${firstErr}\n`);

    const fixPrompt = `The following JSON is malformed. Fix it so it is valid JSON. Return ONLY the corrected JSON, nothing else.

Error: ${firstErr}

Malformed JSON:
${extractJSON(response)}`;

    try {
      const fixedResponse = await inference.chat(
        [{ role: 'user', content: fixPrompt }],
        { temperature: 0, responseFormat: 'json' }
      );
      const results = parseGraderResponse(fixedResponse);
      // Append fix success to debug log
      fs.appendFileSync(debugPath, `\n--- fix succeeded ---\n${extractJSON(fixedResponse)}\n`);
      return results;
    } catch (fixErr) {
      // Step 3: Both attempts failed — fail gracefully
      fs.appendFileSync(debugPath, `\n--- fix also failed ---\n${fixErr}\n`);
      return assertions.map((text) => ({
        text,
        passed: false,
        evidence: `Grading failed: LLM returned malformed JSON that could not be repaired. See ${debugPath}`,
      }));
    }
  }
}

export async function gradeAssertions(
  assertions: string[],
  output: HarnessRunResult,
  runDir: string,
  inference: InferenceAdapter,
  scriptsDir?: string,
): Promise<GradingResult | null> {
  if (assertions.length === 0) return null;

  const scriptAssertions = assertions.filter(a => a.startsWith('script:'));
  const exactAssertions = assertions.filter(a => !a.startsWith('script:') && EXACT_MATCH_PATTERN.test(a));
  const llmAssertions = assertions.filter(a => !a.startsWith('script:') && !EXACT_MATCH_PATTERN.test(a));
  const results: AssertionResult[] = [];

  for (const assertion of scriptAssertions) {
    const scriptName = assertion.slice('script:'.length);
    const outputDir = path.join(runDir, 'outputs');
    const dir = scriptsDir ?? path.join(runDir, '..', '..', '..', 'evals', 'scripts');
    results.push(runScript(scriptName, outputDir, dir));
  }

  for (const assertion of exactAssertions) {
    const result = gradeExactMatch(assertion, output.raw);
    if (result) results.push(result);
  }

  if (llmAssertions.length > 0) {
    const prompt = buildGradingPrompt(llmAssertions, output.raw, output.files);
    const graded = await gradeLLMAssertions(prompt, llmAssertions, runDir, inference);
    results.push(...graded);
  }

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  const grading: GradingResult = {
    assertion_results: results,
    summary: { passed, failed, total, pass_rate: total > 0 ? passed / total : 0 },
  };

  fs.writeFileSync(path.join(runDir, 'grading.json'), JSON.stringify(grading, null, 2));

  return grading;
}
