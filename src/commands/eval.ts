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

export async function evalCommand(
  skillPath: string,
  harness: Harness,
  inference: InferenceAdapter,
  options: { workspace?: string; runs?: number; oldSkill?: string }
): Promise<EvalResults> {
  const evalsPath = path.join(skillPath, 'evals', 'evals.json');
  if (!fs.existsSync(evalsPath)) {
    throw new SnapevalError(`No evals.json found at ${evalsPath}. Create evals/evals.json with test scenarios first.`);
  }

  const evalsFile: EvalsFile = JSON.parse(fs.readFileSync(evalsPath, 'utf-8'));
  const ws = new WorkspaceManager(skillPath, options.workspace);
  const iterationDir = ws.createIteration();
  const runs = options.runs ?? 1;
  const baselineVariant = options.oldSkill ? 'old_skill' : 'without_skill';
  const scriptsDir = path.join(skillPath, 'evals', 'scripts');

  const evalRuns: EvalRunResult[] = [];

  for (const evalCase of evalsFile.evals) {
    const slug = WorkspaceManager.getEvalSlug(evalCase).replace('eval-', '');
    const evalDir = ws.createEvalDir(iterationDir, slug, baselineVariant);

    let lastRun: Awaited<ReturnType<typeof runEval>> | null = null;
    for (let i = 0; i < runs; i++) {
      lastRun = await runEval(evalCase, skillPath, evalDir, harness, options.oldSkill);
    }

    if (!lastRun) continue;

    const assertions = evalCase.assertions ?? [];
    const withSkillGrading = await gradeAssertions(
      assertions,
      lastRun.withSkill.output,
      path.join(evalDir, 'with_skill'),
      inference,
      fs.existsSync(scriptsDir) ? scriptsDir : undefined,
    );
    const withoutSkillGrading = await gradeAssertions(
      assertions,
      lastRun.withoutSkill.output,
      path.join(evalDir, baselineVariant),
      inference,
      fs.existsSync(scriptsDir) ? scriptsDir : undefined,
    );

    evalRuns.push({
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
    });
  }

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
