import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import type {
  InferenceAdapter,
  HarnessRunResult,
  GradingResult,
  AssertionResult,
} from '../types.js';

function buildGradingPrompt(assertions: string[], output: string, files: string[]): string {
  const fileList = files.length > 0 ? `\nFiles produced: ${files.join(', ')}` : '';
  return `You are a strict eval grader. For each assertion, determine PASS or FAIL based on the output below. Require concrete evidence for a PASS — do not give the benefit of the doubt.

OUTPUT:
---
${output}
---${fileList}

ASSERTIONS TO GRADE:
${assertions.map((a, i) => `${i + 1}. ${a}`).join('\n')}

Respond with JSON only:
{
  "results": [
    {"text": "<assertion text>", "passed": true/false, "evidence": "<quote or reference from output>"}
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
    const evidence = execFileSync(scriptPath, [outputDir], { encoding: 'utf-8', timeout: 30000 }).trim();
    return { text: `script:${scriptName}`, passed: true, evidence };
  } catch (err: any) {
    const evidence = err.stdout?.trim() || err.message || 'Script exited with non-zero code';
    return { text: `script:${scriptName}`, passed: false, evidence };
  }
}

function extractJSON(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) return match[1].trim();
  return text.trim();
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
  const llmAssertions = assertions.filter(a => !a.startsWith('script:'));
  const results: AssertionResult[] = [];

  for (const assertion of scriptAssertions) {
    const scriptName = assertion.slice('script:'.length);
    const outputDir = path.join(runDir, 'outputs');
    const dir = scriptsDir ?? path.join(runDir, '..', '..', '..', 'evals', 'scripts');
    results.push(runScript(scriptName, outputDir, dir));
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
