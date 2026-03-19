import chalk from 'chalk';
import type { ReportAdapter, EvalResults } from '../../types.js';

export class TerminalReporter implements ReportAdapter {
  readonly name = 'terminal';

  async report(results: EvalResults): Promise<void> {
    const { skillName, evalRuns, benchmark } = results;

    console.log(chalk.bold(`\nsnapeval — ${skillName}`));
    console.log(chalk.dim('─'.repeat(50)));

    for (const run of evalRuns) {
      const wsRate = run.withSkill.grading?.summary.pass_rate;
      const wosRate = run.withoutSkill.grading?.summary.pass_rate;
      const wsLabel = wsRate !== undefined ? `${(wsRate * 100).toFixed(0)}%` : 'n/a';
      const wosLabel = wosRate !== undefined ? `${(wosRate * 100).toFixed(0)}%` : 'n/a';
      const tokens = run.withSkill.output.total_tokens;
      const durationS = (run.withSkill.output.duration_ms / 1000).toFixed(2);
      console.log(`  ${chalk.cyan(`#${run.evalId}`)} ${run.prompt.slice(0, 60)}`);
      console.log(`    with_skill: ${wsLabel} | without_skill: ${wosLabel} | ${tokens} tokens, ${durationS}s`);
    }

    console.log(chalk.dim('─'.repeat(50)));

    const delta = benchmark.run_summary.delta;
    const deltaColor = delta.pass_rate > 0 ? chalk.green : delta.pass_rate < 0 ? chalk.red : chalk.dim;
    console.log(`Delta: ${deltaColor(`${(delta.pass_rate * 100).toFixed(1)}% pass rate`)} | ${delta.time_seconds.toFixed(1)}s time | ${delta.tokens.toFixed(0)} tokens`);
    console.log(chalk.dim(`with_skill avg: ${(benchmark.run_summary.with_skill.pass_rate.mean * 100).toFixed(1)}% | without_skill avg: ${(benchmark.run_summary.without_skill.pass_rate.mean * 100).toFixed(1)}%`));
  }
}
