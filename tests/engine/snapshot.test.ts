import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SnapshotManager } from '../../src/engine/snapshot.js';
import type { SkillOutput } from '../../src/types.js';

function makeOutput(raw: string): SkillOutput {
  return {
    raw,
    metadata: { tokens: 100, durationMs: 50, model: 'gpt-4o', adapter: 'copilot' },
  };
}

describe('SnapshotManager', () => {
  let tmpDir: string;
  let manager: SnapshotManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapeval-test-'));
    manager = new SnapshotManager(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('saves and loads a snapshot correctly', () => {
    const output = makeOutput('Hello, world!');
    manager.saveSnapshot(1, 'Say hello', output);

    const loaded = manager.loadSnapshot(1);
    expect(loaded).not.toBeNull();
    expect(loaded!.scenario_id).toBe(1);
    expect(loaded!.prompt).toBe('Say hello');
    expect(loaded!.output.raw).toBe('Hello, world!');
    expect(loaded!.output.metadata.tokens).toBe(100);
    expect(loaded!.runs).toBe(1);
    expect(loaded!.approved_by).toBeNull();
    expect(loaded!.captured_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('accepts a custom runs value', () => {
    const output = makeOutput('result');
    manager.saveSnapshot(2, 'prompt', output, 5);

    const loaded = manager.loadSnapshot(2);
    expect(loaded!.runs).toBe(5);
  });

  it('returns null for a missing snapshot', () => {
    const result = manager.loadSnapshot(999);
    expect(result).toBeNull();
  });

  it('creates snapshot directory if it does not exist', () => {
    const snapshotsDir = path.join(tmpDir, 'snapshots');
    expect(fs.existsSync(snapshotsDir)).toBe(false);

    manager.saveSnapshot(1, 'prompt', makeOutput('output'));

    expect(fs.existsSync(snapshotsDir)).toBe(true);
  });

  it('overwrites an existing snapshot on saveSnapshot', () => {
    manager.saveSnapshot(1, 'original prompt', makeOutput('original'));
    manager.saveSnapshot(1, 'updated prompt', makeOutput('updated'));

    const loaded = manager.loadSnapshot(1);
    expect(loaded!.prompt).toBe('updated prompt');
    expect(loaded!.output.raw).toBe('updated');
  });

  it('approves a snapshot and writes audit trail', () => {
    const oldOutput = makeOutput('old output');
    const newOutput = makeOutput('new output');

    manager.saveSnapshot(3, 'prompt', oldOutput);
    manager.approve(3, 'prompt', newOutput);

    const loaded = manager.loadSnapshot(3);
    expect(loaded!.output.raw).toBe('new output');

    const auditPath = path.join(tmpDir, 'snapshots', '.audit-log.jsonl');
    expect(fs.existsSync(auditPath)).toBe(true);

    const lines = fs.readFileSync(auditPath, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(1);

    const entry = JSON.parse(lines[0]);
    expect(entry.scenario_id).toBe(3);
    expect(entry.approved_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(entry.previous_hash).toHaveLength(8);
    expect(entry.new_hash).toHaveLength(8);
    expect(entry.previous_hash).not.toBe(entry.new_hash);
  });

  it('approves a snapshot with no prior baseline (previous_hash = "none")', () => {
    const newOutput = makeOutput('brand new');
    manager.approve(5, 'prompt', newOutput);

    const auditPath = path.join(tmpDir, 'snapshots', '.audit-log.jsonl');
    const lines = fs.readFileSync(auditPath, 'utf-8').trim().split('\n');
    const entry = JSON.parse(lines[0]);
    expect(entry.previous_hash).toBe('none');
    expect(entry.new_hash).toHaveLength(8);
  });

  it('appends multiple audit entries across approvals', () => {
    manager.approve(1, 'p', makeOutput('v1'));
    manager.approve(1, 'p', makeOutput('v2'));
    manager.approve(2, 'p', makeOutput('v1'));

    const auditPath = path.join(tmpDir, 'snapshots', '.audit-log.jsonl');
    const lines = fs.readFileSync(auditPath, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(3);
  });

  it('lists all snapshot IDs in sorted order', () => {
    manager.saveSnapshot(3, 'p', makeOutput('a'));
    manager.saveSnapshot(1, 'p', makeOutput('b'));
    manager.saveSnapshot(10, 'p', makeOutput('c'));
    manager.saveSnapshot(2, 'p', makeOutput('d'));

    const ids = manager.listSnapshotIds();
    expect(ids).toEqual([1, 2, 3, 10]);
  });

  it('returns empty array when snapshots directory does not exist', () => {
    const ids = manager.listSnapshotIds();
    expect(ids).toEqual([]);
  });

  it('does not include audit log in listSnapshotIds', () => {
    manager.saveSnapshot(1, 'p', makeOutput('a'));
    manager.approve(1, 'p', makeOutput('b'));

    const ids = manager.listSnapshotIds();
    expect(ids).toEqual([1]);
  });
});
