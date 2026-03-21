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
        },
        process.cwd(), skillPath
      );
      const harness = resolveHarness(config.harness);
      const inference = resolveInference(config.inference);

      const results = await evalCommand(skillPath, harness, inference, {
        workspace: config.workspace,
        runs: config.runs,
        oldSkill: opts.oldSkill as string | undefined,
      });

      const terminal = new TerminalReporter();
      await terminal.report(results);
      console.log(`Results at ${results.iterationDir}`);
      process.exit(0);
    } catch (err) { handleError(err); }
  });

// --- review ---
program
  .command('review')
  .description('Run eval + generate HTML report + open in browser')
  .option('--harness <harness>', 'Harness to use')
  .option('--inference <inference>', 'Inference adapter to use')
  .option('--workspace <path>', 'Workspace directory')
  .option('--runs <n>', 'Runs per eval for statistical significance', '1')
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
        },
        process.cwd(), skillPath
      );
      const harness = resolveHarness(config.harness);
      const inference = resolveInference(config.inference);

      await reviewCommand(skillPath, harness, inference, {
        workspace: config.workspace,
        runs: config.runs,
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
