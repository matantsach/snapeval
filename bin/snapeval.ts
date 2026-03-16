#!/usr/bin/env tsx
import { Command } from 'commander';
import { resolveConfig } from '../src/config.js';
import { resolveInference } from '../src/adapters/inference/resolve.js';
import { CopilotCLIAdapter } from '../src/adapters/skill/copilot-cli.js';
import { TerminalReporter } from '../src/adapters/report/terminal.js';
import { initCommand } from '../src/commands/init.js';
import { captureCommand } from '../src/commands/capture.js';
import { checkCommand } from '../src/commands/check.js';
import { approveCommand, approveFromResults } from '../src/commands/approve.js';
import { reportCommand } from '../src/commands/report.js';
import { ideateCommand } from '../src/commands/ideate.js';
import { reviewCommand } from '../src/commands/review.js';
import { SnapevalError } from '../src/errors.js';
import * as path from 'node:path';

const program = new Command();

program
  .name('snapeval')
  .description('Semantic snapshot testing for AI skills')
  .version('1.0.0');

// --- init ---
program
  .command('init')
  .description('Generate test cases from SKILL.md using AI')
  .option('--adapter <adapter>', 'Skill adapter to use', 'copilot-cli')
  .option('--inference <inference>', 'Inference adapter to use', 'auto')
  .option('--verbose', 'Verbose output')
  .argument('[skill-dir]', 'Path to skill directory', process.cwd())
  .action(async (skillDir: string, opts: Record<string, string | boolean>) => {
    try {
      const skillPath = path.resolve(skillDir);
      const config = resolveConfig(
        { adapter: opts.adapter as string, inference: opts.inference as string },
        process.cwd(),
        skillPath
      );
      const inference = resolveInference(config.inference);
      await initCommand(skillPath, inference);
      console.log(`Generated evals at ${path.join(skillPath, 'evals', 'evals.json')}`);
      process.exit(0);
    } catch (err) {
      handleError(err);
    }
  });

// --- capture ---
program
  .command('capture')
  .description('Run skill against all scenarios and save baseline snapshots')
  .option('--adapter <adapter>', 'Skill adapter to use', 'copilot-cli')
  .option('--inference <inference>', 'Inference adapter to use', 'auto')
  .option('--runs <n>', 'Number of runs per scenario', '1')
  .option('--verbose', 'Verbose output')
  .argument('[skill-dir]', 'Path to skill directory', process.cwd())
  .action(async (skillDir: string, opts: Record<string, string | boolean>) => {
    try {
      const skillPath = path.resolve(skillDir);
      const config = resolveConfig(
        {
          adapter: opts.adapter as string,
          inference: opts.inference as string,
          runs: opts.runs ? parseInt(opts.runs as string, 10) : undefined,
        },
        process.cwd(),
        skillPath
      );
      const skillAdapter = resolveSkillAdapter(config.adapter);
      await captureCommand(skillPath, skillAdapter, { runs: config.runs });
      console.log(`Captured baselines at ${path.join(skillPath, 'evals', 'snapshots')}`);
      process.exit(0);
    } catch (err) {
      handleError(err);
    }
  });

// --- check ---
program
  .command('check')
  .description('Compare current skill output against baselines')
  .option('--adapter <adapter>', 'Skill adapter to use', 'copilot-cli')
  .option('--inference <inference>', 'Inference adapter to use', 'auto')
  .option('--budget <amount>', 'Spend cap in USD (or "unlimited")', 'unlimited')
  .option('--ci', 'CI mode: exit 1 on regressions, no interactive prompts')
  .option('--verbose', 'Verbose output')
  .option('--scenario <ids>', 'Comma-separated scenario IDs to check')
  .argument('[skill-dir]', 'Path to skill directory', process.cwd())
  .action(async (skillDir: string, opts: Record<string, string | boolean>) => {
    try {
      const skillPath = path.resolve(skillDir);
      const config = resolveConfig(
        {
          adapter: opts.adapter as string,
          inference: opts.inference as string,
          budget: opts.budget as string,
        },
        process.cwd(),
        skillPath
      );
      const skillAdapter = resolveSkillAdapter(config.adapter);
      const inference = resolveInference(config.inference);

      const results = await checkCommand(skillPath, skillAdapter, inference, {
        budget: config.budget,
      });

      // Always print terminal report
      const reporter = new TerminalReporter();
      await reporter.report(results);

      const hasRegressions = results.summary.regressed > 0;
      if (hasRegressions) {
        process.exit(1);
      }
      process.exit(0);
    } catch (err) {
      handleError(err);
    }
  });

// --- approve ---
program
  .command('approve')
  .description('Approve regressed scenarios as new baselines')
  .option('--adapter <adapter>', 'Skill adapter to use', 'copilot-cli')
  .option('--inference <inference>', 'Inference adapter to use', 'auto')
  .option('--scenario <ids>', 'Comma-separated scenario IDs to approve (default: all)')
  .option('--verbose', 'Verbose output')
  .argument('[skill-dir]', 'Path to skill directory', process.cwd())
  .action(async (skillDir: string, opts: Record<string, string | boolean>) => {
    try {
      const skillPath = path.resolve(skillDir);
      const config = resolveConfig(
        { adapter: opts.adapter as string, inference: opts.inference as string },
        process.cwd(),
        skillPath
      );
      const skillAdapter = resolveSkillAdapter(config.adapter);

      const scenarioIds = opts.scenario
        ? (opts.scenario as string).split(',').map((s) => parseInt(s.trim(), 10))
        : undefined;

      await approveCommand(skillPath, skillAdapter, { scenarioIds });
      console.log('Approved snapshots updated.');
      process.exit(0);
    } catch (err) {
      handleError(err);
    }
  });

// --- report ---
program
  .command('report')
  .description('Write latest check results to evals/results/iteration-N/')
  .option('--adapter <adapter>', 'Skill adapter to use', 'copilot-cli')
  .option('--inference <inference>', 'Inference adapter to use', 'auto')
  .option('--budget <amount>', 'Spend cap in USD (or "unlimited")', 'unlimited')
  .option('--verbose', 'Verbose output')
  .option('--html', 'Generate HTML report viewer')
  .argument('[skill-dir]', 'Path to skill directory', process.cwd())
  .action(async (skillDir: string, opts: Record<string, string | boolean>) => {
    try {
      const skillPath = path.resolve(skillDir);
      const config = resolveConfig(
        {
          adapter: opts.adapter as string,
          inference: opts.inference as string,
          budget: opts.budget as string,
        },
        process.cwd(),
        skillPath
      );
      const skillAdapter = resolveSkillAdapter(config.adapter);
      const inference = resolveInference(config.inference);

      const results = await checkCommand(skillPath, skillAdapter, inference, {
        budget: config.budget,
      });

      await reportCommand(skillPath, results, {
        verbose: Boolean(opts.verbose),
        html: Boolean(opts.html),
      });

      const hasRegressions = results.summary.regressed > 0;
      if (hasRegressions) {
        process.exit(1);
      }
      process.exit(0);
    } catch (err) {
      handleError(err);
    }
  });

// --- review ---
program
  .command('review')
  .description('Run checks, generate HTML report, and open in browser')
  .option('--adapter <adapter>', 'Skill adapter to use', 'copilot-cli')
  .option('--inference <inference>', 'Inference adapter to use', 'auto')
  .option('--budget <amount>', 'Spend cap in USD (or "unlimited")', 'unlimited')
  .option('--verbose', 'Verbose output')
  .argument('[skill-dir]', 'Path to skill directory', process.cwd())
  .action(async (skillDir: string, opts: Record<string, string | boolean>) => {
    try {
      const skillPath = path.resolve(skillDir);
      const config = resolveConfig(
        {
          adapter: opts.adapter as string,
          inference: opts.inference as string,
          budget: opts.budget as string,
        },
        process.cwd(),
        skillPath
      );
      const skillAdapter = resolveSkillAdapter(config.adapter);
      const inference = resolveInference(config.inference);

      const { hasRegressions } = await reviewCommand(skillPath, skillAdapter, inference, {
        budget: config.budget,
      });

      if (hasRegressions) {
        process.exit(1);
      }
      process.exit(0);
    } catch (err) {
      handleError(err);
    }
  });

// --- ideate ---
program
  .command('ideate')
  .description('Open the interactive scenario ideation viewer')
  .argument('[skill-dir]', 'Path to skill directory', process.cwd())
  .action(async (skillDir: string) => {
    try {
      const skillPath = path.resolve(skillDir);
      const outputPath = await ideateCommand(skillPath);
      console.log(`Ideation viewer opened: ${outputPath}`);
      process.exit(0);
    } catch (err) {
      handleError(err);
    }
  });

// --- helpers ---

function resolveSkillAdapter(adapterName: string) {
  if (adapterName === 'copilot-cli') {
    return new CopilotCLIAdapter();
  }
  throw new SnapevalError(
    `Unknown skill adapter "${adapterName}". Valid options: copilot-cli.`
  );
}

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
