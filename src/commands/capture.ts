import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SkillAdapter, EvalsFile } from '../types.js';
import { SnapshotManager } from '../engine/snapshot.js';
import { SnapevalError } from '../errors.js';

export async function captureCommand(
  skillPath: string,
  skillAdapter: SkillAdapter,
  options: { runs?: number } = {}
): Promise<void> {
  const evalsPath = path.join(skillPath, 'evals', 'evals.json');
  if (!fs.existsSync(evalsPath)) {
    throw new SnapevalError(`No evals.json found at ${evalsPath}. Run \`snapeval init\` first.`);
  }

  const evalsFile: EvalsFile = JSON.parse(fs.readFileSync(evalsPath, 'utf-8'));
  const manager = new SnapshotManager(path.join(skillPath, 'evals'));
  const runs = options.runs ?? 1;

  for (const evalCase of evalsFile.evals) {
    const output = await skillAdapter.invoke(skillPath, evalCase.prompt, evalCase.files);
    manager.saveSnapshot(evalCase.id, evalCase.prompt, output, runs);
  }
}
