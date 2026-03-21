import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  Harness,
  InferenceAdapter,
  EvalsFile,
  EvalResults,
  EvalRunResult,
} from '../types.js';
import { WorkspaceManager } from '../engine/workspace.js';
import { runEval } from '../engine/runner.js';
import { gradeAssertions } from '../engine/grader.js';
import { computeBenchmark } from '../engine/aggregator.js';
import { SnapevalError } from '../errors.js';

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let index = 0;
  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

const MAX_CONCURRENCY = 10;

export async function evalCommand(
  skillPath: string,
  harness: Harness,
  inference: InferenceAdapter,
  options: { workspace?: string; runs?: number; oldSkill?: string; concurrency?: number }
): Promise<EvalResults> {
  const evalsPath = path.join(skillPath, 'evals', 'evals.json');
  if (!fs.existsSync(evalsPath)) {
    throw new SnapevalError(`No evals.json found at ${evalsPath}. Create evals/evals.json with test scenarios first.`);
  }

  const evalsFile: EvalsFile = JSON.parse(fs.readFileSync(evalsPath, 'utf-8'));
  const ws = new WorkspaceManager(skillPath, options.workspace);
  const iterationDir = ws.createIteration();
  const runs = options.runs ?? 1;
  const concurrency = Math.min(Math.max(options.concurrency ?? 1, 1), MAX_CONCURRENCY);
  const baselineVariant = options.oldSkill ? 'old_skill' : 'without_skill';
  const scriptsDir = path.join(skillPath, 'evals', 'scripts');

  // Pre-create eval directories sequentially (filesystem setup)
  const evalDirs = evalsFile.evals.map((evalCase) => {
    const slug = WorkspaceManager.getEvalSlug(evalCase).replace('eval-', '');
    return { evalCase, slug, evalDir: ws.createEvalDir(iterationDir, slug, baselineVariant) };
  });

  const tasks = evalDirs.map(({ evalCase, slug, evalDir }) => async (): Promise<EvalRunResult> => {
    let lastRun: Awaited<ReturnType<typeof runEval>> | null = null;
    for (let i = 0; i < runs; i++) {
      lastRun = await runEval(evalCase, skillPath, evalDir, harness, options.oldSkill);
    }

    if (!lastRun) {
      throw new SnapevalError(`No runs completed for eval ${evalCase.id}`);
    }

    const assertions = evalCase.assertions ?? [];
    const [withSkillGrading, withoutSkillGrading] = await Promise.all([
      gradeAssertions(
        assertions,
        lastRun.withSkill.output,
        path.join(evalDir, 'with_skill'),
        inference,
        fs.existsSync(scriptsDir) ? scriptsDir : undefined,
      ),
      gradeAssertions(
        assertions,
        lastRun.withoutSkill.output,
        path.join(evalDir, baselineVariant),
        inference,
        fs.existsSync(scriptsDir) ? scriptsDir : undefined,
      ),
    ]);

    return {
      evalId: evalCase.id,
      slug,
      prompt: evalCase.prompt,
      withSkill: {
        output: lastRun.withSkill.output,
        grading: withSkillGrading ?? undefined,
      },
      withoutSkill: {
        output: lastRun.withoutSkill.output,
        grading: withoutSkillGrading ?? undefined,
      },
    };
  });

  const evalRuns = await runWithConcurrency(tasks, concurrency);
  const benchmark = computeBenchmark(evalRuns);

  fs.writeFileSync(
    path.join(iterationDir, 'benchmark.json'),
    JSON.stringify(benchmark, null, 2)
  );

  return {
    skillName: evalsFile.skill_name,
    evalRuns,
    benchmark,
    iterationDir,
  };
}
