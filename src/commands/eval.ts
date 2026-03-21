import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  Harness,
  InferenceAdapter,
  EvalsFile,
  EvalResults,
  EvalRunResult,
  GradingResult,
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

function validateEvalsFile(evalsFile: EvalsFile, evalsPath: string): void {
  if (!evalsFile.skill_name || typeof evalsFile.skill_name !== 'string') {
    throw new SnapevalError(`Invalid evals.json at ${evalsPath}: missing or invalid "skill_name" field.`);
  }
  if (!Array.isArray(evalsFile.evals)) {
    throw new SnapevalError(`Invalid evals.json at ${evalsPath}: "evals" must be an array.`);
  }
  for (const [i, evalCase] of evalsFile.evals.entries()) {
    const prefix = `Invalid evals.json at ${evalsPath}: evals[${i}]`;
    if (typeof evalCase.id !== 'number') {
      throw new SnapevalError(`${prefix} missing or invalid "id" (must be a number).`);
    }
    if (typeof evalCase.prompt !== 'string') {
      throw new SnapevalError(`${prefix} (id:${evalCase.id}) missing "prompt" field.`);
    }
    if (typeof evalCase.expected_output !== 'string') {
      throw new SnapevalError(`${prefix} (id:${evalCase.id}) missing "expected_output" field.`);
    }
    if (evalCase.assertions !== undefined && !Array.isArray(evalCase.assertions)) {
      throw new SnapevalError(`${prefix} (id:${evalCase.id}) "assertions" must be an array of strings.`);
    }
  }
}

export async function evalCommand(
  skillPath: string,
  harness: Harness,
  inference: InferenceAdapter,
  options: { workspace?: string; runs?: number; oldSkill?: string; concurrency?: number; only?: number[] }
): Promise<EvalResults> {
  const evalsPath = path.join(skillPath, 'evals', 'evals.json');
  if (!fs.existsSync(evalsPath)) {
    throw new SnapevalError(`No evals.json found at ${evalsPath}. Create evals/evals.json with test scenarios first.`);
  }

  let evalsFile: EvalsFile;
  try {
    evalsFile = JSON.parse(fs.readFileSync(evalsPath, 'utf-8'));
  } catch {
    throw new SnapevalError(`Invalid JSON in ${evalsPath}. Check for syntax errors (missing commas, trailing commas, etc).`);
  }
  validateEvalsFile(evalsFile, evalsPath);

  // Filter to specific eval IDs if --only is provided
  if (options.only && options.only.length > 0) {
    const ids = new Set(options.only);
    const filtered = evalsFile.evals.filter((e) => ids.has(e.id));
    if (filtered.length === 0) {
      throw new SnapevalError(`No eval cases match --only ${options.only.join(',')}. Available IDs: ${evalsFile.evals.map((e) => e.id).join(', ')}`);
    }
    evalsFile = { ...evalsFile, evals: filtered };
  }

  const ws = new WorkspaceManager(skillPath, options.workspace);
  const iterationDir = ws.createIteration();

  // Track which SKILL.md was used for this iteration
  const skillMdPath = path.join(skillPath, 'SKILL.md');
  if (fs.existsSync(skillMdPath)) {
    fs.copyFileSync(skillMdPath, path.join(iterationDir, 'SKILL.md.snapshot'));
  }
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
    const assertions = evalCase.assertions ?? [];
    const allGradings: { withSkill: GradingResult | null; withoutSkill: GradingResult | null }[] = [];
    let lastRun: Awaited<ReturnType<typeof runEval>> | null = null;

    for (let i = 0; i < runs; i++) {
      lastRun = await runEval(evalCase, skillPath, evalDir, harness, options.oldSkill);

      // Grade every run, not just the last
      const [wsGrading, wosGrading] = await Promise.all([
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
      allGradings.push({ withSkill: wsGrading, withoutSkill: wosGrading });
    }

    if (!lastRun) {
      throw new SnapevalError(`No runs completed for eval ${evalCase.id}`);
    }

    // Use the last run's grading as the primary result (written to grading.json)
    // but all gradings contribute to benchmark stats via pass rates
    const lastGrading = allGradings[allGradings.length - 1];

    return {
      evalId: evalCase.id,
      slug,
      prompt: evalCase.prompt,
      withSkill: {
        output: lastRun.withSkill.output,
        grading: lastGrading.withSkill ?? undefined,
      },
      withoutSkill: {
        output: lastRun.withoutSkill.output,
        grading: lastGrading.withoutSkill ?? undefined,
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
