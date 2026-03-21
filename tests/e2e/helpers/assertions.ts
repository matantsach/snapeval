import * as fs from 'node:fs';
import * as path from 'node:path';
import { expect } from 'vitest';
import type { E2ERunResult } from './types.js';

export function assertEvalsJson(skillDir: string): void {
  const evalsPath = path.join(skillDir, 'evals', 'evals.json');
  expect(fs.existsSync(evalsPath), `evals.json should exist at ${evalsPath}`).toBe(true);

  const content = JSON.parse(fs.readFileSync(evalsPath, 'utf-8'));
  expect(content.evals).toBeDefined();
  expect(Array.isArray(content.evals)).toBe(true);
  expect(content.evals.length).toBeGreaterThan(0);

  for (const evalCase of content.evals) {
    expect(evalCase.id).toBeDefined();
    expect(evalCase.prompt).toBeDefined();
    expect(evalCase.expected_output).toBeDefined();
    expect(evalCase.slug).toBeDefined();
  }
}

export function assertEvalsRelevance(skillDir: string, keywords: string[]): void {
  const evalsPath = path.join(skillDir, 'evals', 'evals.json');
  const content = JSON.parse(fs.readFileSync(evalsPath, 'utf-8'));
  const allText = JSON.stringify(content).toLowerCase();
  const found = keywords.some((kw) => allText.includes(kw.toLowerCase()));
  expect(found, `At least one eval should contain a keyword from [${keywords.join(', ')}]`).toBe(true);
}

export function assertEvalsNoAssertions(skillDir: string): void {
  const evalsPath = path.join(skillDir, 'evals', 'evals.json');
  const content = JSON.parse(fs.readFileSync(evalsPath, 'utf-8'));
  for (const evalCase of content.evals) {
    expect(evalCase.assertions, `Eval ${evalCase.id} should not have assertions`).toBeUndefined();
  }
}

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

export function assertCleanState(dir: string): void {
  const evalsDir = path.join(dir, 'evals');
  if (fs.existsSync(evalsDir)) {
    expect(fs.existsSync(path.join(evalsDir, 'evals.json')),
      'evals.json should not have been created').toBe(false);
  }
}

export function assertStdoutContains(result: E2ERunResult, pattern: RegExp): void {
  expect(result.stdout).toMatch(pattern);
}

export function assertStderrContains(result: E2ERunResult, pattern: RegExp): void {
  expect(result.stderr).toMatch(pattern);
}

export function findWorkspaceDir(skillDir: string): string {
  const skillName = path.basename(skillDir);
  const workspace = path.join(path.dirname(skillDir), `${skillName}-workspace`);
  return workspace;
}

export function listEvalDirs(iterationDir: string): string[] {
  if (!fs.existsSync(iterationDir)) return [];
  return fs.readdirSync(iterationDir)
    .filter((d) => d.startsWith('eval-'))
    .map((d) => path.join(iterationDir, d));
}
