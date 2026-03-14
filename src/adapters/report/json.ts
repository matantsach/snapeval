import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  ReportAdapter,
  EvalResults,
  GradingFile,
  AssertionResult,
  GradingSummary,
} from '../../types.js';

function buildGradingFile(results: EvalResults): GradingFile {
  const allAssertions: AssertionResult[] = [];

  for (const scenario of results.scenarios) {
    if (scenario.grading) {
      allAssertions.push(...scenario.grading.assertion_results);
    }
  }

  const passed = allAssertions.filter((a) => a.passed).length;
  const failed = allAssertions.filter((a) => !a.passed).length;
  const total = allAssertions.length;
  const pass_rate = total > 0 ? passed / total : 0;

  const summary: GradingSummary = { passed, failed, total, pass_rate };
  return { assertion_results: allAssertions, summary };
}

export class JSONReporter implements ReportAdapter {
  readonly name = 'json';

  constructor(private readonly outputDir: string) {}

  async report(results: EvalResults): Promise<void> {
    fs.mkdirSync(this.outputDir, { recursive: true });

    // grading.json
    const gradingFile = buildGradingFile(results);
    fs.writeFileSync(
      path.join(this.outputDir, 'grading.json'),
      JSON.stringify(gradingFile, null, 2),
      'utf-8'
    );

    // timing.json
    const timingData = {
      total_tokens: results.timing.total_tokens,
      duration_ms: results.timing.duration_ms,
    };
    fs.writeFileSync(
      path.join(this.outputDir, 'timing.json'),
      JSON.stringify(timingData, null, 2),
      'utf-8'
    );

    // benchmark.json
    const benchmarkData = { run_summary: results.summary };
    fs.writeFileSync(
      path.join(this.outputDir, 'benchmark.json'),
      JSON.stringify(benchmarkData, null, 2),
      'utf-8'
    );
  }
}
