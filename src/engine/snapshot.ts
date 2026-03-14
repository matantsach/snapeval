import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { SkillOutput, Snapshot } from '../types.js';

export class SnapshotManager {
  private snapshotsDir: string;
  constructor(private evalsDir: string) {
    this.snapshotsDir = path.join(evalsDir, 'snapshots');
  }

  private snapshotPath(scenarioId: number): string {
    return path.join(this.snapshotsDir, `scenario-${scenarioId}.snap.json`);
  }

  saveSnapshot(scenarioId: number, prompt: string, output: SkillOutput, runs: number = 1): void {
    const snapshot: Snapshot = {
      scenario_id: scenarioId, prompt, output,
      captured_at: new Date().toISOString(), runs, approved_by: null,
    };
    fs.mkdirSync(this.snapshotsDir, { recursive: true });
    fs.writeFileSync(this.snapshotPath(scenarioId), JSON.stringify(snapshot, null, 2));
  }

  loadSnapshot(scenarioId: number): Snapshot | null {
    const p = this.snapshotPath(scenarioId);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  }

  approve(scenarioId: number, prompt: string, newOutput: SkillOutput): void {
    const old = this.loadSnapshot(scenarioId);
    const previousHash = old ? crypto.createHash('sha256').update(old.output.raw).digest('hex').slice(0, 8) : 'none';
    const newHash = crypto.createHash('sha256').update(newOutput.raw).digest('hex').slice(0, 8);
    this.saveSnapshot(scenarioId, prompt, newOutput);
    const auditEntry = { scenario_id: scenarioId, approved_at: new Date().toISOString(), previous_hash: previousHash, new_hash: newHash };
    const auditPath = path.join(this.snapshotsDir, '.audit-log.jsonl');
    fs.appendFileSync(auditPath, JSON.stringify(auditEntry) + '\n');
  }

  listSnapshotIds(): number[] {
    if (!fs.existsSync(this.snapshotsDir)) return [];
    return fs.readdirSync(this.snapshotsDir)
      .filter((f) => f.match(/^scenario-\d+\.snap\.json$/))
      .map((f) => parseInt(f.match(/scenario-(\d+)/)![1]))
      .sort((a, b) => a - b);
  }
}
