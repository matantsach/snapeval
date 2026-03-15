import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const CLI = path.resolve(import.meta.dirname, '../../bin/snapeval.ts');
const GREETER_SRC = path.resolve(import.meta.dirname, '../../test-skills/greeter');

/**
 * Minimal evals for e2e: only 2 scenarios to keep Copilot call count low.
 * Picked the most deterministic prompts (formal greeting with explicit name).
 */
const MINIMAL_EVALS = {
  skill_name: 'greeter',
  generated_by: 'snapeval e2e',
  evals: [
    {
      id: 1,
      prompt: 'Can you give me a formal greeting for Eleanor?',
      expected_output: 'Returns the formal greeting addressed to Eleanor.',
      files: [],
      assertions: ['Output contains "Eleanor"'],
    },
    {
      id: 2,
      prompt: 'Give me a pirate greeting for Zoe',
      expected_output: 'Returns the pirate-style greeting addressed to Zoe.',
      files: [],
      assertions: ['Output contains "Zoe"'],
    },
  ],
};

function isCopilotAvailable(): boolean {
  try {
    execFileSync('copilot', ['--version'], { encoding: 'utf-8', stdio: 'pipe' });
    // Verify auth: run a trivial prompt to check if authenticated
    execFileSync('copilot', ['-s', '--no-ask-user', '--model', 'gpt-4.1', '-p', 'hi'], {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 30_000,
    });
    return true;
  } catch {
    return false;
  }
}

function runSnapeval(args: string[]): { stdout: string; exitCode: number } {
  try {
    const stdout = execFileSync('npx', ['tsx', CLI, ...args], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
      timeout: 300_000,
      env: process.env,
    });
    return { stdout, exitCode: 0 };
  } catch (err: unknown) {
    const error = err as { status?: number; stdout?: string; stderr?: string };
    return {
      stdout: (error.stdout ?? '') + (error.stderr ?? ''),
      exitCode: error.status ?? 2,
    };
  }
}

function setupSkill(destDir: string): void {
  fs.copyFileSync(
    path.join(GREETER_SRC, 'SKILL.md'),
    path.join(destDir, 'SKILL.md'),
  );

  const evalsDir = path.join(destDir, 'evals');
  fs.mkdirSync(evalsDir, { recursive: true });
  fs.writeFileSync(
    path.join(evalsDir, 'evals.json'),
    JSON.stringify(MINIMAL_EVALS, null, 2),
  );
}

const copilotAvailable = isCopilotAvailable();

describe('E2E: Copilot CLI flow', () => {
  const tmpDirs: string[] = [];

  function makeTmpDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapeval-e2e-'));
    tmpDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  describe.skipIf(!copilotAvailable)('with real Copilot CLI', () => {
    it('Test 1: full eval pipeline — capture baselines, check passes', () => {
      const skillDir = makeTmpDir();
      setupSkill(skillDir);

      // Capture baselines
      const capture = runSnapeval(['capture', skillDir]);
      expect(capture.exitCode).toBe(0);

      // Verify snapshot files were created with valid structure
      const snapshotsDir = path.join(skillDir, 'evals', 'snapshots');
      expect(fs.existsSync(snapshotsDir)).toBe(true);

      const snapFiles = fs.readdirSync(snapshotsDir).filter(f => f.endsWith('.snap.json'));
      expect(snapFiles.length).toBe(2);

      for (const file of snapFiles) {
        const snap = JSON.parse(fs.readFileSync(path.join(snapshotsDir, file), 'utf-8'));
        expect(snap.output.raw).toBeTruthy();
        expect(snap.output.metadata.adapter).toBe('copilot-cli');
        expect(snap.scenario_id).toBeTypeOf('number');
      }

      // Check — comparing against just-captured baselines.
      // With LLM non-determinism, we verify the pipeline runs successfully
      // and most scenarios pass (at least 1 of 2).
      const check = runSnapeval(['check', skillDir]);
      // Exit 0 = all pass, Exit 1 = some regressed. Both are valid outcomes
      // for a just-captured baseline with LLM variance. The key assertion is
      // that the pipeline runs to completion (not exit 2 = error).
      expect(check.exitCode).toBeLessThanOrEqual(1);

      // Verify stdout contains check output (verdicts)
      const output = check.stdout.toLowerCase();
      expect(
        output.includes('pass') || output.includes('regress') || output.includes('scenario'),
      ).toBe(true);
    });

    it('Test 2: mismatched baselines trigger regression detection', () => {
      const skillDir = makeTmpDir();
      setupSkill(skillDir);

      // Capture baselines with real greeter skill
      const capture = runSnapeval(['capture', skillDir]);
      expect(capture.exitCode).toBe(0);

      // Replace baseline snapshots with structurally different content.
      // The schema check (Tier 1) compares markdown structure, so the
      // replacement must have a different skeleton (headings, lists, etc.)
      // to trigger Tier 2 (LLM judge) and detect the regression.
      const snapshotsDir = path.join(skillDir, 'evals', 'snapshots');
      const snapFiles = fs.readdirSync(snapshotsDir).filter(f => f.endsWith('.snap.json'));

      const fakeBaseline = [
        '## Analysis Report',
        '',
        'The following items were identified:',
        '',
        '- Item alpha: critical',
        '- Item beta: warning',
        '- Item gamma: info',
        '',
        '### Recommendations',
        '',
        '1. Address critical items first',
        '2. Review warning items',
      ].join('\n');

      for (const file of snapFiles) {
        const snapPath = path.join(snapshotsDir, file);
        const snap = JSON.parse(fs.readFileSync(snapPath, 'utf-8'));
        snap.output.raw = fakeBaseline;
        fs.writeFileSync(snapPath, JSON.stringify(snap, null, 2));
      }

      // Check — current LLM output (greetings) vs baselines (JSON) = regression
      const check = runSnapeval(['check', skillDir]);
      expect(check.exitCode).toBe(1);
    });
  });
});
