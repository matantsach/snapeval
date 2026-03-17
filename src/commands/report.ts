import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import * as os from 'node:os';
import type { EvalResults } from '../types.js';
import { JSONReporter } from '../adapters/report/json.js';
import { TerminalReporter } from '../adapters/report/terminal.js';
import { HTMLReporter } from '../adapters/report/html.js';

export async function reportCommand(
  skillPath: string,
  results: EvalResults,
  options: { verbose?: boolean; html?: boolean } = {}
): Promise<string> {
  // Determine next iteration number
  const resultsBaseDir = path.join(skillPath, 'evals', 'results');
  fs.mkdirSync(resultsBaseDir, { recursive: true });

  const existingIterations = fs.readdirSync(resultsBaseDir)
    .filter((d) => /^iteration-\d+$/.test(d))
    .map((d) => parseInt(d.replace('iteration-', ''), 10))
    .sort((a, b) => a - b);

  const nextIteration = existingIterations.length > 0
    ? existingIterations[existingIterations.length - 1] + 1
    : 1;

  const iterationDir = path.join(resultsBaseDir, `iteration-${nextIteration}`);

  // Write JSON report
  const jsonReporter = new JSONReporter(iterationDir);
  await jsonReporter.report(results);

  // Write HTML report if requested
  if (options.html) {
    const htmlReporter = new HTMLReporter(iterationDir, nextIteration);
    await htmlReporter.report(results);
    const reportPath = path.join(iterationDir, 'report.html');
    console.log(`Report written to ${reportPath}`);
    if (!process.env.CI) {
      const platform = os.platform();
      const opener = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open';
      const args = platform === 'win32' ? ['/c', 'start', '', reportPath] : [reportPath];
      execFile(opener, args, (err) => {
        if (err) {
          // Fallback: print path so user can open manually
          console.log(`Open in browser: ${reportPath}`);
        }
      });
    }
  }

  // Print terminal report
  if (options.verbose !== false) {
    const terminalReporter = new TerminalReporter();
    await terminalReporter.report(results);
  }

  return iterationDir;
}
