import type { SkillAdapter, InferenceAdapter } from '../types.js';
import { checkCommand } from './check.js';
import { reportCommand } from './report.js';

export async function reviewCommand(
  skillPath: string,
  skillAdapter: SkillAdapter,
  inference: InferenceAdapter,
  options: { budget: string }
): Promise<{ iterationDir: string; hasRegressions: boolean }> {
  const results = await checkCommand(skillPath, skillAdapter, inference, options);

  const iterationDir = await reportCommand(skillPath, results, {
    verbose: true,
    html: true,
  });

  return {
    iterationDir,
    hasRegressions: results.summary.regressed > 0,
  };
}
