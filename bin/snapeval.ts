#!/usr/bin/env tsx
import { Command } from 'commander';
import { resolveConfig } from '../src/config.js';
import { resolveInference } from '../src/adapters/inference/resolve.js';
import { resolveHarness } from '../src/adapters/harness/resolve.js';
import { evalCommand } from '../src/commands/eval.js';
import { reviewCommand } from '../src/commands/review.js';
import { TerminalReporter } from '../src/adapters/report/terminal.js';
import { SnapevalError } from '../src/errors.js';
import * as path from 'node:path';

const program = new Command();

program
  .name('snapeval')
  .description('Harness-agnostic eval runner for agentskills.io skills')
  .version('2.0.0');

// --- eval ---
program
  .command('eval')
  .description('Run evals (with/without skill), grade assertions, compute benchmark')
  .option('--harness <harness>', 'Harness to use')
  .option('--inference <inference>', 'Inference adapter to use')
  .option('--workspace <path>', 'Workspace directory')
  .option('--runs <n>', 'Runs per eval for statistical significance', '1')
  .option('--concurrency <n>', 'Number of eval cases to run in parallel (1-10)', '1')
  .option('--only <ids>', 'Run only specific eval IDs (comma-separated, e.g. --only 1,3,5)')
  .option('--threshold <rate>', 'Minimum pass rate (0-1) for exit code 0. Below threshold exits with code 1.')
  .option('--old-skill <path>', 'Compare against old skill version instead of no-skill')
  .option('--verbose', 'Verbose output')
  .argument('[skill-dir]', 'Path to skill directory', process.cwd())
  .action(async (skillDir: string, opts: Record<string, string | boolean>) => {
    try {
      const skillPath = path.resolve(skillDir);
      const config = resolveConfig(
        {
          harness: opts.harness as string,
          inference: opts.inference as string,
          workspace: opts.workspace as string,
          runs: opts.runs ? parseInt(opts.runs as string, 10) : undefined,
          concurrency: opts.concurrency ? parseInt(opts.concurrency as string, 10) : undefined,
        },
        process.cwd(), skillPath
      );
      const harness = resolveHarness(config.harness);
      const inference = resolveInference(config.inference);

      const only = opts.only
        ? (opts.only as string).split(',').map((s) => parseInt(s.trim(), 10))
        : undefined;
      const threshold = opts.threshold
        ? parseFloat(opts.threshold as string)
        : undefined;

      const results = await evalCommand(skillPath, harness, inference, {
        workspace: config.workspace,
        runs: config.runs,
        concurrency: config.concurrency,
        only,
        threshold,
        oldSkill: opts.oldSkill as string | undefined,
      });

      const terminal = new TerminalReporter();
      await terminal.report(results);
      console.log(`Results at ${results.iterationDir}`);
      process.exit(0);
    } catch (err: any) {
      // ThresholdError has results attached — show them before failing
      if (err.results) {
        const terminal = new TerminalReporter();
        await terminal.report(err.results);
        console.log(`Results at ${err.results.iterationDir}`);
      }
      handleError(err);
    }
  });

// --- review ---
program
  .command('review')
  .description('Run eval + generate HTML report + open in browser')
  .option('--harness <harness>', 'Harness to use')
  .option('--inference <inference>', 'Inference adapter to use')
  .option('--workspace <path>', 'Workspace directory')
  .option('--runs <n>', 'Runs per eval for statistical significance', '1')
  .option('--concurrency <n>', 'Number of eval cases to run in parallel (1-10)', '1')
  .option('--old-skill <path>', 'Compare against old skill version instead of no-skill')
  .option('--no-open', 'Do not open browser')
  .option('--verbose', 'Verbose output')
  .argument('[skill-dir]', 'Path to skill directory', process.cwd())
  .action(async (skillDir: string, opts: Record<string, string | boolean>) => {
    try {
      const skillPath = path.resolve(skillDir);
      const config = resolveConfig(
        {
          harness: opts.harness as string,
          inference: opts.inference as string,
          workspace: opts.workspace as string,
          runs: opts.runs ? parseInt(opts.runs as string, 10) : undefined,
          concurrency: opts.concurrency ? parseInt(opts.concurrency as string, 10) : undefined,
        },
        process.cwd(), skillPath
      );
      const harness = resolveHarness(config.harness);
      const inference = resolveInference(config.inference);

      await reviewCommand(skillPath, harness, inference, {
        workspace: config.workspace,
        runs: config.runs,
        concurrency: config.concurrency,
        oldSkill: opts.oldSkill as string | undefined,
        noOpen: opts.open === false,
      });
      process.exit(0);
    } catch (err) { handleError(err); }
  });

function handleError(err: unknown): never {
  if (err instanceof SnapevalError) {
    console.error(`Error: ${err.message}`);
    process.exit(err.exitCode ?? 2);
  }
  if (err instanceof Error) {
    console.error(`Error: ${err.message}`);
    process.exit(2);
  }
  console.error('An unknown error occurred.');
  process.exit(2);
}

program.parse(process.argv);
