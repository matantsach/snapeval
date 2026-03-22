import * as fs from 'node:fs';
import * as path from 'node:path';
import { expect } from 'vitest';

export function assertIterationDir(workspace: string, n: number): void {
  const iterDir = path.join(workspace, `iteration-${n}`);
  expect(fs.existsSync(iterDir), `iteration-${n}/ should exist at ${workspace}`).toBe(true);
}

export function assertDualRunDirs(evalDir: string): void {
  expect(fs.existsSync(path.join(evalDir, 'with_skill')), 'with_skill/ should exist').toBe(true);
  expect(fs.existsSync(path.join(evalDir, 'without_skill')), 'without_skill/ should exist').toBe(true);
}

export function assertOldSkillDir(evalDir: string): void {
  expect(fs.existsSync(path.join(evalDir, 'with_skill')), 'with_skill/ should exist').toBe(true);
  expect(fs.existsSync(path.join(evalDir, 'old_skill')), 'old_skill/ should exist').toBe(true);
  expect(fs.existsSync(path.join(evalDir, 'without_skill')), 'without_skill/ should NOT exist').toBe(false);
}

export function assertTiming(runDir: string): void {
  const timingPath = path.join(runDir, 'timing.json');
  expect(fs.existsSync(timingPath), `timing.json should exist at ${runDir}`).toBe(true);

  const timing = JSON.parse(fs.readFileSync(timingPath, 'utf-8'));
  expect(typeof timing.total_tokens).toBe('number');
  expect(timing.total_tokens).toBeGreaterThanOrEqual(0);
  expect(typeof timing.duration_ms).toBe('number');
  expect(timing.duration_ms).toBeGreaterThan(0);
}

export function assertOutput(runDir: string): void {
  const outputPath = path.join(runDir, 'outputs', 'output.txt');
  expect(fs.existsSync(outputPath), `output.txt should exist at ${runDir}/outputs/`).toBe(true);

  const content = fs.readFileSync(outputPath, 'utf-8');
  expect(content.length).toBeGreaterThan(0);
}

export function assertGrading(runDir: string): void {
  const gradingPath = path.join(runDir, 'grading.json');
  expect(fs.existsSync(gradingPath), `grading.json should exist at ${runDir}`).toBe(true);

  const grading = JSON.parse(fs.readFileSync(gradingPath, 'utf-8'));
  expect(Array.isArray(grading.assertion_results)).toBe(true);
  expect(grading.summary).toBeDefined();
  expect(typeof grading.summary.passed).toBe('number');
  expect(typeof grading.summary.failed).toBe('number');
  expect(typeof grading.summary.total).toBe('number');
  expect(typeof grading.summary.pass_rate).toBe('number');
}

export function assertNoGrading(runDir: string): void {
  const gradingPath = path.join(runDir, 'grading.json');
  expect(fs.existsSync(gradingPath), `grading.json should NOT exist at ${runDir}`).toBe(false);
}

export function assertBenchmark(iterationDir: string): void {
  const benchPath = path.join(iterationDir, 'benchmark.json');
  expect(fs.existsSync(benchPath), `benchmark.json should exist at ${iterationDir}`).toBe(true);

  const benchmark = JSON.parse(fs.readFileSync(benchPath, 'utf-8'));
  expect(benchmark.run_summary).toBeDefined();
  expect(benchmark.run_summary.with_skill).toBeDefined();
  expect(benchmark.run_summary.without_skill).toBeDefined();
  expect(benchmark.run_summary.delta).toBeDefined();
}

export function assertFeedback(iterationDir: string): void {
  const feedbackPath = path.join(iterationDir, 'feedback.json');
  expect(fs.existsSync(feedbackPath), `feedback.json should exist at ${iterationDir}`).toBe(true);

  const feedback = JSON.parse(fs.readFileSync(feedbackPath, 'utf-8'));
  const keys = Object.keys(feedback);
  expect(keys.length).toBeGreaterThan(0);
  for (const key of keys) {
    expect(key).toMatch(/^eval-/);
    expect(feedback[key]).toBe('');
  }
}

export function assertSkillDifferentiation(evalDir: string): void {
  const wsOutput = fs.readFileSync(path.join(evalDir, 'with_skill', 'outputs', 'output.txt'), 'utf-8');
  const wosOutput = fs.readFileSync(path.join(evalDir, 'without_skill', 'outputs', 'output.txt'), 'utf-8');
  expect(wsOutput).not.toBe(wosOutput);
}

export function listEvalDirs(iterationDir: string): string[] {
  if (!fs.existsSync(iterationDir)) return [];
  return fs.readdirSync(iterationDir)
    .filter((d) => d.startsWith('eval-'))
    .map((d) => path.join(iterationDir, d));
}
