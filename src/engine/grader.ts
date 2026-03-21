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

Respond with JSON only:
{
  "results": [
    {"text": "<assertion text>", "passed": true/false, "evidence": "<quote from output supporting your verdict>"}
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
    const stdout = execFileSync(scriptPath, [outputDir], { encoding: 'utf-8', timeout: 30000 }).trim();
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

function extractJSON(text: string): string {
  // Try JSON-tagged fence first, then bare fence, then raw text
  const jsonFence = text.match(/```json\s*([\s\S]*?)```/);
  if (jsonFence) return jsonFence[1].trim();
  // Try parsing raw text as JSON before falling back to any fence
  const trimmed = text.trim();
  try { JSON.parse(trimmed); return trimmed; } catch { /* not raw JSON */ }
  const anyFence = text.match(/```\s*([\s\S]*?)```/);
  if (anyFence) return anyFence[1].trim();
  return trimmed;
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
    const response = await inference.chat(
      [{ role: 'user', content: prompt }],
      { temperature: 0, responseFormat: 'json' }
    );
    const parsed = JSON.parse(extractJSON(response));
    for (const r of parsed.results) {
      results.push({ text: r.text, passed: Boolean(r.passed), evidence: r.evidence });
    }
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
