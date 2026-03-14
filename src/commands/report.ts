import * as fs from 'node:fs';
import * as path from 'node:path';
import type { EvalResults } from '../types.js';
import { JSONReporter } from '../adapters/report/json.js';
import { TerminalReporter } from '../adapters/report/terminal.js';

export async function reportCommand(
  skillPath: string,
  results: EvalResults,
  options: { verbose?: boolean } = {}
): Promise<void> {
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

  // Print terminal report
  if (options.verbose !== false) {
    const terminalReporter = new TerminalReporter();
    await terminalReporter.report(results);
  }
}
