import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { initCommand } from '../src/commands/init.js';
import { checkCommand } from '../src/commands/check.js';
import { SnapshotManager } from '../src/engine/snapshot.js';
import type { SkillAdapter, InferenceAdapter, SkillOutput } from '../src/types.js';

describe('Full workflow integration', () => {
  let tmpDir: string;

  const mockInference: InferenceAdapter = {
    name: 'mock',
    chat: vi.fn(),
    embed: vi.fn().mockResolvedValue([1, 0, 0]),
    estimateCost: () => 0,
  };

  const baseOutput: SkillOutput = {
    raw: '## Review\n\n1. SQL injection found\n\n## Recommendations\n\n- Use parameterized queries',
    metadata: { tokens: 100, durationMs: 500, model: 'gpt-5-mini', adapter: 'mock' },
  };

  const mockSkillAdapter: SkillAdapter = {
    name: 'mock',
    invoke: vi.fn().mockResolvedValue(baseOutput),
    isAvailable: async () => true,
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapeval-integration-'));
    fs.writeFileSync(path.join(tmpDir, 'SKILL.md'), '# Code Reviewer\n\nReviews code for security issues');
    vi.mocked(mockInference.chat).mockResolvedValue(JSON.stringify({
      skill_name: 'code-reviewer',
      evals: [
        { id: 1, prompt: 'Review this vulnerable file', expected_output: 'Finds SQL injection', assertions: ['Mentions SQL injection'] },
        { id: 2, prompt: 'Review clean code', expected_output: 'No issues', assertions: ['Says no issues'] },
      ],
    }));
  });

  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  it('init → capture → check (no regression) → full pass', async () => {
    // Init generates evals.json
    await initCommand(tmpDir, mockInference);
    expect(fs.existsSync(path.join(tmpDir, 'evals', 'evals.json'))).toBe(true);

    // Capture baselines (manual via SnapshotManager since we mock adapters)
    const manager = new SnapshotManager(path.join(tmpDir, 'evals'));
    manager.saveSnapshot(1, 'Review this vulnerable file', baseOutput);
    manager.saveSnapshot(2, 'Review clean code', baseOutput);

    // Reset mocks: skill returns same baseOutput
    vi.mocked(mockSkillAdapter.invoke).mockResolvedValue(baseOutput);

    // Check — same output → pass at Tier 1 (schema match)
    const results = await checkCommand(tmpDir, mockSkillAdapter, mockInference, {
      budget: 'unlimited',
    });
    expect(results.summary.passed).toBe(2);
    expect(results.summary.regressed).toBe(0);
  });

  it('detects regression when output changes', async () => {
    await initCommand(tmpDir, mockInference);
    const manager = new SnapshotManager(path.join(tmpDir, 'evals'));
    manager.saveSnapshot(1, 'Review this vulnerable file', baseOutput);
    manager.saveSnapshot(2, 'Review clean code', baseOutput);

    // Scenario 1 changes output, scenario 2 stays same
    const changedOutput: SkillOutput = {
      raw: 'File too large, skipping review.',
      metadata: { tokens: 20, durationMs: 100, model: 'gpt-5-mini', adapter: 'mock' },
    };
    vi.mocked(mockSkillAdapter.invoke)
      .mockResolvedValueOnce(changedOutput)
      .mockResolvedValueOnce(baseOutput);

    // LLM judge: both forward and reverse calls return "different" → regressed
    vi.mocked(mockInference.chat).mockResolvedValue(JSON.stringify({ verdict: 'different' }));

    const results = await checkCommand(tmpDir, mockSkillAdapter, mockInference, {
      budget: 'unlimited',
    });
    expect(results.summary.regressed).toBeGreaterThanOrEqual(1);
  });

  it('approve updates baseline', async () => {
    await initCommand(tmpDir, mockInference);
    const manager = new SnapshotManager(path.join(tmpDir, 'evals'));
    manager.saveSnapshot(1, 'test', baseOutput);

    const newOutput: SkillOutput = {
      raw: 'New behavior',
      metadata: { tokens: 50, durationMs: 200, model: 'gpt-5-mini', adapter: 'mock' },
    };

    // Approve scenario 1 with newOutput directly via SnapshotManager
    manager.approve(1, 'test', newOutput);

    const updated = manager.loadSnapshot(1);
    expect(updated!.output.raw).toBe('New behavior');
  });
});
