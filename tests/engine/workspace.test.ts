import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { WorkspaceManager } from '../../src/engine/workspace.js';

describe('WorkspaceManager', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('resolves workspace path from skill dir', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-'));
    const skillDir = path.join(tmpDir, 'my-skill');
    fs.mkdirSync(skillDir);
    const ws = new WorkspaceManager(skillDir);
    expect(ws.workspaceDir).toBe(path.join(tmpDir, 'my-skill-workspace'));
  });

  it('resolves workspace from custom template', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-'));
    const skillDir = path.join(tmpDir, 'csv-analyzer');
    fs.mkdirSync(skillDir);
    const ws = new WorkspaceManager(skillDir, '/tmp/evals/{skill_name}');
    expect(ws.workspaceDir).toBe('/tmp/evals/csv-analyzer');
  });

  it('creates iteration-1 on first call', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-'));
    const skillDir = path.join(tmpDir, 'skill');
    fs.mkdirSync(skillDir);
    const ws = new WorkspaceManager(skillDir);
    const iterDir = ws.createIteration();
    expect(iterDir).toContain('iteration-1');
    expect(fs.existsSync(iterDir)).toBe(true);
  });

  it('increments iteration number', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-'));
    const skillDir = path.join(tmpDir, 'skill');
    fs.mkdirSync(skillDir);
    const ws = new WorkspaceManager(skillDir);
    ws.createIteration();
    const second = ws.createIteration();
    expect(second).toContain('iteration-2');
  });

  it('creates eval run directory structure', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-'));
    const skillDir = path.join(tmpDir, 'skill');
    fs.mkdirSync(skillDir);
    const ws = new WorkspaceManager(skillDir);
    const iterDir = ws.createIteration();
    const evalDir = ws.createEvalDir(iterDir, 'top-months-chart');
    expect(fs.existsSync(path.join(evalDir, 'with_skill', 'outputs'))).toBe(true);
    expect(fs.existsSync(path.join(evalDir, 'without_skill', 'outputs'))).toBe(true);
  });

  it('creates eval dir with old_skill variant', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-'));
    const skillDir = path.join(tmpDir, 'skill');
    fs.mkdirSync(skillDir);
    const ws = new WorkspaceManager(skillDir);
    const iterDir = ws.createIteration();
    const evalDir = ws.createEvalDir(iterDir, 'test', 'old_skill');
    expect(fs.existsSync(path.join(evalDir, 'with_skill', 'outputs'))).toBe(true);
    expect(fs.existsSync(path.join(evalDir, 'old_skill', 'outputs'))).toBe(true);
  });

  it('getEvalSlug uses slug field or falls back to eval-{id}', () => {
    expect(WorkspaceManager.getEvalSlug({ id: 1, slug: 'top-months', prompt: '', expected_output: '' })).toBe('eval-top-months');
    expect(WorkspaceManager.getEvalSlug({ id: 3, prompt: '', expected_output: '' })).toBe('eval-3');
  });
});
