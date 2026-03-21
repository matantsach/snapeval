import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import type { ReportAdapter, EvalResults, BenchmarkData, GradingResult } from '../../types.js';

interface PreviousIteration {
  benchmark: BenchmarkData;
  gradings: Map<string, { withSkill?: GradingResult; withoutSkill?: GradingResult }>;
}

function loadPreviousIteration(iterationDir: string): PreviousIteration | null {
  const workspaceDir = path.dirname(iterationDir);
  const currentName = path.basename(iterationDir);
  const currentNum = parseInt(currentName.replace('iteration-', ''), 10);
  if (isNaN(currentNum) || currentNum <= 1) return null;
  const prevDir = path.join(workspaceDir, `iteration-${currentNum - 1}`);
  const prevBenchmarkPath = path.join(prevDir, 'benchmark.json');
  if (!fs.existsSync(prevBenchmarkPath)) return null;
  try {
    const benchmark = JSON.parse(fs.readFileSync(prevBenchmarkPath, 'utf-8'));
    const gradings = new Map<string, { withSkill?: GradingResult; withoutSkill?: GradingResult }>();
    const evalDirs = fs.readdirSync(prevDir).filter(d => d.startsWith('eval-'));
    for (const evalDir of evalDirs) {
      const wsPath = path.join(prevDir, evalDir, 'with_skill', 'grading.json');
      const wosPath = path.join(prevDir, evalDir, 'without_skill', 'grading.json');
      const ws = fs.existsSync(wsPath) ? JSON.parse(fs.readFileSync(wsPath, 'utf-8')) : undefined;
      const wos = fs.existsSync(wosPath) ? JSON.parse(fs.readFileSync(wosPath, 'utf-8')) : undefined;
      gradings.set(evalDir, { withSkill: ws, withoutSkill: wos });
    }
    return { benchmark, gradings };
  } catch {
    return null;
  }
}

function evalLabel(run: { evalId: number; slug: string; prompt: string }): string {
  // Use expected_output or slug as a readable label instead of truncated prompt
  if (run.slug && run.slug !== `${run.evalId}`) return run.slug;
  // Truncate prompt but show first meaningful line
  const firstLine = run.prompt.split('\n')[0].slice(0, 60);
  return firstLine;
}

export class TerminalReporter implements ReportAdapter {
  readonly name = 'terminal';

  async report(results: EvalResults): Promise<void> {
    const { skillName, evalRuns, benchmark } = results;

    console.log(chalk.bold(`\nsnapeval — ${skillName}`));
    console.log(chalk.dim(`Baseline = without SKILL.md (raw AI response)`));
    console.log(chalk.dim('─'.repeat(60)));

    const prev = loadPreviousIteration(results.iterationDir);

    for (const run of evalRuns) {
      const wsGrading = run.withSkill.grading;
      const wsRate = wsGrading?.summary.pass_rate;
      const wosRate = run.withoutSkill.grading?.summary.pass_rate;
      const wsLabel = wsRate !== undefined ? `${(wsRate * 100).toFixed(0)}%` : 'n/a';
      const wosLabel = wosRate !== undefined ? `${(wosRate * 100).toFixed(0)}%` : 'n/a';
      const wsColor = wsRate === 1 ? chalk.green : wsRate === 0 ? chalk.red : chalk.yellow;
      const durationS = (run.withSkill.output.duration_ms / 1000).toFixed(1);

      // Show per-eval delta from previous iteration
      let perEvalDelta = '';
      if (prev) {
        const prevGrading = prev.gradings.get(`eval-${run.slug}`);
        const prevRate = prevGrading?.withSkill?.summary.pass_rate;
        if (prevRate !== undefined && wsRate !== undefined) {
          const change = wsRate - prevRate;
          if (change !== 0) {
            const arrow = change > 0 ? chalk.green('↑') : chalk.red('↓');
            perEvalDelta = ` ${arrow} was ${(prevRate * 100).toFixed(0)}%`;
          }
        }
      }

      console.log(`  ${chalk.cyan(`#${run.evalId}`)} ${evalLabel(run)}`);
      console.log(`    Skill: ${wsColor(wsLabel)}${perEvalDelta} | Baseline: ${wosLabel} | ${durationS}s`);

      // Show failed assertions inline
      if (wsGrading) {
        const failed = wsGrading.assertion_results.filter((a) => !a.passed);
        for (const f of failed) {
          console.log(chalk.red(`    FAIL: ${f.text}`));
          if (f.evidence) {
            console.log(chalk.dim(`          ${f.evidence.slice(0, 100)}`));
          }
        }
      }
    }

    console.log(chalk.dim('─'.repeat(60)));

    const ws = benchmark.run_summary.with_skill;
    const wos = benchmark.run_summary.without_skill;
    const delta = benchmark.run_summary.delta;
    const deltaColor = delta.pass_rate > 0 ? chalk.green : delta.pass_rate < 0 ? chalk.red : chalk.dim;

    console.log(chalk.bold('Summary:'));
    console.log(`  Skill pass rate:    ${(ws.pass_rate.mean * 100).toFixed(1)}%`);
    console.log(`  Baseline pass rate: ${(wos.pass_rate.mean * 100).toFixed(1)}%`);
    console.log(`  Improvement:        ${deltaColor(`${delta.pass_rate > 0 ? '+' : ''}${(delta.pass_rate * 100).toFixed(1)}%`)}`);

    if (prev) {
      const prevRate = prev.benchmark.run_summary.with_skill.pass_rate.mean;
      const currRate = ws.pass_rate.mean;
      const change = currRate - prevRate;
      const changeColor = change > 0 ? chalk.green : change < 0 ? chalk.red : chalk.dim;
      console.log(`  vs previous:        ${changeColor(`${change > 0 ? '+' : ''}${(change * 100).toFixed(1)}%`)} (was ${(prevRate * 100).toFixed(1)}%)`);

      // Note if eval set size changed
      const prevEvalCount = prev.gradings.size;
      const currEvalCount = evalRuns.length;
      if (prevEvalCount !== currEvalCount) {
        console.log(chalk.dim(`  Note: eval set changed (${prevEvalCount} → ${currEvalCount} evals)`));
      }
    }
  }
}
