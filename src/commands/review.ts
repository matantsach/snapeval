import { execFile } from 'node:child_process';
import * as path from 'node:path';
import * as process from 'node:process';
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

  const reportPath = path.join(iterationDir, 'report.html');
  openInBrowser(reportPath);

  return {
    iterationDir,
    hasRegressions: results.summary.regressed > 0,
  };
}

function openInBrowser(filePath: string): void {
  const cmd =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'cmd'
        : 'xdg-open';

  const args =
    process.platform === 'win32'
      ? ['/c', 'start', '', filePath]
      : [filePath];

  execFile(cmd, args, (err) => {
    if (err) {
      console.warn(`Could not open browser: ${err.message}`);
    }
  });
}
