import type { EvalRunResult, BenchmarkData, StatEntry } from '../types.js';

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length <= 1) return 0;
  const avg = mean(values);
  const squareDiffs = values.map(v => (v - avg) ** 2);
  return Math.sqrt(mean(squareDiffs));
}

function computeStats(values: number[]): StatEntry {
  return { mean: mean(values), stddev: stddev(values) };
}

export function computeBenchmark(runs: EvalRunResult[]): BenchmarkData {
  const wsPassRates: number[] = [];
  const wsTimeSec: number[] = [];
  const wsTokens: number[] = [];
  const wosPassRates: number[] = [];
  const wosTimeSec: number[] = [];
  const wosTokens: number[] = [];

  for (const run of runs) {
    wsPassRates.push(run.withSkill.grading?.summary.pass_rate ?? 0);
    wsTimeSec.push(run.withSkill.output.duration_ms / 1000);
    wsTokens.push(run.withSkill.output.total_tokens);

    wosPassRates.push(run.withoutSkill.grading?.summary.pass_rate ?? 0);
    wosTimeSec.push(run.withoutSkill.output.duration_ms / 1000);
    wosTokens.push(run.withoutSkill.output.total_tokens);
  }

  const wsStats = {
    pass_rate: computeStats(wsPassRates),
    time_seconds: computeStats(wsTimeSec),
    tokens: computeStats(wsTokens),
  };
  const wosStats = {
    pass_rate: computeStats(wosPassRates),
    time_seconds: computeStats(wosTimeSec),
    tokens: computeStats(wosTokens),
  };

  return {
    run_summary: {
      with_skill: wsStats,
      without_skill: wosStats,
      delta: {
        pass_rate: wsStats.pass_rate.mean - wosStats.pass_rate.mean,
        time_seconds: wsStats.time_seconds.mean - wosStats.time_seconds.mean,
        tokens: wsStats.tokens.mean - wosStats.tokens.mean,
      },
    },
  };
}
