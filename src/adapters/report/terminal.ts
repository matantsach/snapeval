import chalk from 'chalk';
import type { ReportAdapter, EvalResults, ScenarioResult, ComparisonVerdict } from '../../types.js';

function verdictIcon(verdict: ComparisonVerdict): string {
  switch (verdict) {
    case 'pass':
      return chalk.green('✓');
    case 'regressed':
      return chalk.red('✗');
    default:
      return chalk.yellow('?');
  }
}

function formatScenario(scenario: ScenarioResult): string {
  const icon = verdictIcon(scenario.comparison.verdict);
  const tier = `tier${scenario.comparison.tier}`;
  const tokens = scenario.timing.total_tokens;
  const durationS = (scenario.timing.duration_ms / 1000).toFixed(2);
  const cost = scenario.newOutput.metadata.adapter;
  return `  ${icon} Scenario ${scenario.scenarioId} [${tier}] — ${tokens} tokens, ${durationS}s (${cost})`;
}

export class TerminalReporter implements ReportAdapter {
  readonly name = 'terminal';

  async report(results: EvalResults): Promise<void> {
    const { skillName, scenarios, summary, timing } = results;

    console.log(chalk.bold(`\nSnapeval — ${skillName}`));
    console.log(chalk.dim('─'.repeat(50)));

    for (const scenario of scenarios) {
      console.log(formatScenario(scenario));
    }

    console.log(chalk.dim('─'.repeat(50)));

    const passedStr = chalk.green(`${summary.passed} passed`);
    const regressedCount = summary.regressed;
    const regressedStr = regressedCount > 0
      ? chalk.red(`${regressedCount} regressed`)
      : chalk.dim(`${regressedCount} regressed`);
    const totalStr = `${summary.total_scenarios} total`;
    const passRate = (summary.pass_rate * 100).toFixed(0);

    console.log(`${passedStr}, ${regressedStr}, ${totalStr} (${passRate}%)`);
    console.log(
      chalk.dim(
        `Tokens: ${timing.total_tokens} | Duration: ${(timing.duration_ms / 1000).toFixed(2)}s | Cost: $${summary.total_cost_usd.toFixed(4)}`
      )
    );
    console.log(
      chalk.dim(
        `Tier breakdown — schema: ${summary.tier_breakdown.tier1_schema}, llm judge: ${summary.tier_breakdown.tier2_llm_judge}`
      )
    );
  }
}
