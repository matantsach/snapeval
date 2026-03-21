import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import type { Harness, InferenceAdapter, FeedbackData } from '../types.js';
import { evalCommand } from './eval.js';
import { TerminalReporter } from '../adapters/report/terminal.js';

export async function reviewCommand(
  skillPath: string,
  harness: Harness,
  inference: InferenceAdapter,
  options: { workspace?: string; runs?: number; oldSkill?: string; noOpen?: boolean; concurrency?: number }
): Promise<void> {
  const results = await evalCommand(skillPath, harness, inference, options);

  const terminal = new TerminalReporter();
  await terminal.report(results);

  // feedback.json template
  const feedback: FeedbackData = {};
  for (const run of results.evalRuns) {
    feedback[`eval-${run.slug}`] = '';
  }
  fs.writeFileSync(
    path.join(results.iterationDir, 'feedback.json'),
    JSON.stringify(feedback, null, 2)
  );

  // Open in browser (placeholder - HTML reporter will be wired later)
  if (!options.noOpen) {
    const reportPath = path.join(results.iterationDir, 'benchmark.json');
    openInBrowser(reportPath);
  }
}

function openInBrowser(filePath: string): void {
  const cmd =
    process.platform === 'darwin' ? 'open' :
    process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args =
    process.platform === 'win32' ? ['/c', 'start', '', filePath] : [filePath];
  execFile(cmd, args, (err) => {
    if (err) console.warn(`Could not open browser: ${err.message}`);
  });
}
