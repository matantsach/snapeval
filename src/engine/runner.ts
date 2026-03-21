import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Harness, HarnessRunResult, EvalCase, TimingData } from '../types.js';

interface RunEvalResult {
  evalId: number;
  slug: string;
  label?: string;
  prompt: string;
  withSkill: { output: HarnessRunResult };
  withoutSkill: { output: HarnessRunResult };
}

function writeTiming(dir: string, result: HarnessRunResult): void {
  const timing: TimingData = { total_tokens: result.total_tokens, duration_ms: result.duration_ms };
  fs.writeFileSync(path.join(dir, 'timing.json'), JSON.stringify(timing, null, 2));
}

function writeOutput(dir: string, result: HarnessRunResult): void {
  fs.writeFileSync(path.join(dir, 'outputs', 'output.txt'), result.raw);
  if (result.transcript) {
    fs.writeFileSync(path.join(dir, 'transcript.log'), result.transcript);
  }
}

export async function runEval(
  evalCase: EvalCase,
  skillPath: string,
  evalDir: string,
  harness: Harness,
  oldSkillPath?: string,
): Promise<RunEvalResult> {
  const withSkillDir = path.join(evalDir, 'with_skill');
  const baselineVariant = oldSkillPath ? 'old_skill' : 'without_skill';
  const baselineDir = path.join(evalDir, baselineVariant);

  const [withSkillResult, baselineResult] = await Promise.all([
    harness.run({
      skillPath,
      prompt: evalCase.prompt,
      files: evalCase.files,
      outputDir: path.join(withSkillDir, 'outputs'),
    }),
    harness.run({
      skillPath: oldSkillPath,
      prompt: evalCase.prompt,
      files: evalCase.files,
      outputDir: path.join(baselineDir, 'outputs'),
    }),
  ]);
  writeTiming(withSkillDir, withSkillResult);
  writeOutput(withSkillDir, withSkillResult);
  writeTiming(baselineDir, baselineResult);
  writeOutput(baselineDir, baselineResult);

  return {
    evalId: evalCase.id,
    slug: evalCase.slug ?? `${evalCase.id}`,
    label: evalCase.label,
    prompt: evalCase.prompt,
    withSkill: { output: withSkillResult },
    withoutSkill: { output: baselineResult },
  };
}
