import chalk from 'chalk';
import type { ReportAdapter, EvalResults } from '../../types.js';

export class TerminalReporter implements ReportAdapter {
  readonly name = 'terminal';

  async report(results: EvalResults): Promise<void> {
    const { skillName, evalRuns, benchmark } = results;

    console.log(chalk.bold(`\nsnapeval — ${skillName}`));
    console.log(chalk.dim('─'.repeat(60)));

    for (const run of evalRuns) {
      const wsGrading = run.withSkill.grading;
      const wosGrading = run.withoutSkill.grading;
      const wsRate = wsGrading?.summary.pass_rate;
      const wosRate = wosGrading?.summary.pass_rate;
      const wsLabel = wsRate !== undefined ? `${(wsRate * 100).toFixed(0)}%` : 'n/a';
      const wosLabel = wosRate !== undefined ? `${(wosRate * 100).toFixed(0)}%` : 'n/a';
      const wsColor = wsRate === 1 ? chalk.green : wsRate === 0 ? chalk.red : chalk.yellow;
      const durationS = (run.withSkill.output.duration_ms / 1000).toFixed(1);

      console.log(`  ${chalk.cyan(`#${run.evalId}`)} ${run.prompt.slice(0, 80)}`);
      console.log(`    Skill: ${wsColor(wsLabel)} | Baseline: ${wosLabel} | ${durationS}s`);

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
  }
}
