import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { reviewCommand } from '../../src/commands/review.js';
import type { SkillAdapter, InferenceAdapter, SkillOutput, EvalsFile } from '../../src/types.js';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

function makeOutput(raw: string): SkillOutput {
  return { raw, metadata: { tokens: 50, durationMs: 200, model: 'copilot', adapter: 'copilot-cli' } };
}

function writeEvalsAndSnapshot(tmpDir: string): void {
  const evalsDir = path.join(tmpDir, 'evals');
  fs.mkdirSync(path.join(evalsDir, 'snapshots'), { recursive: true });

  const evalsFile: EvalsFile = {
    skill_name: 'test-skill',
    generated_by: 'test',
    evals: [
      { id: 1, prompt: 'test prompt', expected_output: 'some output', files: [], assertions: [] },
    ],
  };
  fs.writeFileSync(path.join(evalsDir, 'evals.json'), JSON.stringify(evalsFile), 'utf-8');

  const snapshot = {
    scenario_id: 1,
    prompt: 'test prompt',
    output: makeOutput('baseline output'),
    captured_at: new Date().toISOString(),
    runs: 1,
    approved_by: null,
  };
  fs.writeFileSync(
    path.join(evalsDir, 'snapshots', 'scenario-1.snap.json'),
    JSON.stringify(snapshot),
    'utf-8'
  );
}

describe('reviewCommand', () => {
  let tmpDir: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  const mockSkillAdapter: SkillAdapter = {
    name: 'mock',
    invoke: vi.fn().mockResolvedValue(makeOutput('baseline output')),
    isAvailable: vi.fn().mockResolvedValue(true),
  };

  const mockInference: InferenceAdapter = {
    name: 'mock',
    chat: vi.fn(),
    embed: vi.fn(),
    estimateCost: vi.fn().mockReturnValue(0),
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapeval-review-test-'));
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    consoleSpy.mockRestore();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('runs check and generates HTML report', async () => {
    writeEvalsAndSnapshot(tmpDir);

    const { iterationDir, hasRegressions } = await reviewCommand(
      tmpDir,
      mockSkillAdapter,
      mockInference,
      { budget: 'unlimited' }
    );

    expect(hasRegressions).toBe(false);
    expect(fs.existsSync(path.join(iterationDir, 'report.html'))).toBe(true);
    expect(fs.existsSync(path.join(iterationDir, 'viewer-data.json'))).toBe(true);
    expect(fs.existsSync(path.join(iterationDir, 'benchmark.json'))).toBe(true);
  });

  it('calls execFile to open browser', async () => {
    vi.stubEnv('CI', '');
    writeEvalsAndSnapshot(tmpDir);
    const { execFile } = await import('node:child_process');

    await reviewCommand(tmpDir, mockSkillAdapter, mockInference, { budget: 'unlimited' });

    expect(execFile).toHaveBeenCalledTimes(1);
    const call = vi.mocked(execFile).mock.calls[0] as unknown as [string, string[]];
    const args = call[1];
    expect(args[args.length - 1]).toContain('report.html');
  });

  it('writes iteration directory under evals/results/', async () => {
    writeEvalsAndSnapshot(tmpDir);

    const { iterationDir } = await reviewCommand(
      tmpDir,
      mockSkillAdapter,
      mockInference,
      { budget: 'unlimited' }
    );

    expect(iterationDir).toContain('iteration-1');
    expect(iterationDir).toContain(path.join('evals', 'results'));
  });

  it('propagates error when no evals.json exists', async () => {
    await expect(
      reviewCommand(tmpDir, mockSkillAdapter, mockInference, { budget: 'unlimited' })
    ).rejects.toThrow();
  });
});
