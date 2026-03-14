import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SkillAdapter, EvalsFile, EvalResults } from '../types.js';
import { SnapshotManager } from '../engine/snapshot.js';
import { SnapevalError } from '../errors.js';

export async function approveCommand(
  skillPath: string,
  skillAdapter: SkillAdapter,
  options: { scenarioIds?: number[] } = {}
): Promise<void> {
  const evalsPath = path.join(skillPath, 'evals', 'evals.json');
  if (!fs.existsSync(evalsPath)) {
    throw new SnapevalError(`No evals.json found at ${evalsPath}. Run \`snapeval init\` first.`);
  }

  const evalsFile: EvalsFile = JSON.parse(fs.readFileSync(evalsPath, 'utf-8'));
  const manager = new SnapshotManager(path.join(skillPath, 'evals'));

  // Determine which scenarios to approve
  const targetCases = options.scenarioIds && options.scenarioIds.length > 0
    ? evalsFile.evals.filter((e) => options.scenarioIds!.includes(e.id))
    : evalsFile.evals;

  for (const evalCase of targetCases) {
    const newOutput = await skillAdapter.invoke(skillPath, evalCase.prompt, evalCase.files);
    manager.approve(evalCase.id, evalCase.prompt, newOutput);
  }
}

export function approveFromResults(
  skillPath: string,
  results: EvalResults,
  scenarioIds?: number[]
): void {
  const evalsPath = path.join(skillPath, 'evals', 'evals.json');
  if (!fs.existsSync(evalsPath)) {
    throw new SnapevalError(`No evals.json found at ${evalsPath}.`);
  }

  const evalsFile: EvalsFile = JSON.parse(fs.readFileSync(evalsPath, 'utf-8'));
  const manager = new SnapshotManager(path.join(skillPath, 'evals'));

  // Find regressed scenarios from results
  const regressedResults = results.scenarios.filter(
    (s) => s.comparison.verdict === 'regressed'
  );

  const toApprove = scenarioIds && scenarioIds.length > 0
    ? regressedResults.filter((s) => scenarioIds.includes(s.scenarioId))
    : regressedResults;

  for (const scenario of toApprove) {
    const evalCase = evalsFile.evals.find((e) => e.id === scenario.scenarioId);
    if (!evalCase) continue;
    manager.approve(scenario.scenarioId, evalCase.prompt, scenario.newOutput);
  }
}
