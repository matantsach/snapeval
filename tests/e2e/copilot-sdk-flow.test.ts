import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const CLI = path.resolve(import.meta.dirname, '../../bin/snapeval.ts');
const GREETER_SRC = path.resolve(import.meta.dirname, '../../test-skills/greeter');

/**
 * Minimal evals for e2e: only 2 scenarios to keep Copilot call count low.
 */
const MINIMAL_EVALS = {
  skill_name: 'greeter',
  generated_by: 'snapeval e2e (sdk)',
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

function isCopilotSDKAvailable(): boolean {
  try {
    // Check that the SDK module resolves
    execFileSync('node', ['-e', "require.resolve('@github/copilot-sdk')"], {
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    // Check that Copilot CLI is available (SDK needs it as the backend)
    execFileSync('copilot', ['--version'], { encoding: 'utf-8', stdio: 'pipe' });
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

const sdkAvailable = isCopilotSDKAvailable();

describe('E2E: Copilot SDK flow', () => {
  const tmpDirs: string[] = [];

  function makeTmpDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapeval-e2e-sdk-'));
    tmpDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  describe.skipIf(!sdkAvailable)('with real Copilot SDK', () => {
    it('Test 1: capture baselines via SDK adapter', () => {
      const skillDir = makeTmpDir();
      setupSkill(skillDir);

      const capture = runSnapeval(['capture', '--adapter', 'copilot-sdk', skillDir]);
      expect(capture.exitCode).toBe(0);

      // Verify snapshot files were created with SDK adapter metadata
      const snapshotsDir = path.join(skillDir, 'evals', 'snapshots');
      expect(fs.existsSync(snapshotsDir)).toBe(true);

      const snapFiles = fs.readdirSync(snapshotsDir).filter(f => f.endsWith('.snap.json'));
      expect(snapFiles.length).toBe(2);

      for (const file of snapFiles) {
        const snap = JSON.parse(fs.readFileSync(path.join(snapshotsDir, file), 'utf-8'));
        expect(snap.output.raw).toBeTruthy();
        expect(snap.output.metadata.adapter).toBe('copilot-sdk');
        expect(snap.scenario_id).toBeTypeOf('number');
      }
    });

    it('Test 2: full pipeline — capture + check via SDK adapter', () => {
      const skillDir = makeTmpDir();
      setupSkill(skillDir);

      // Capture baselines
      const capture = runSnapeval(['capture', '--adapter', 'copilot-sdk', skillDir]);
      expect(capture.exitCode).toBe(0);

      // Check — comparing against just-captured baselines
      const check = runSnapeval(['check', '--adapter', 'copilot-sdk', '--inference', 'copilot-sdk', skillDir]);
      // Exit 0 = all pass, Exit 1 = some regressed. Both are valid with LLM variance.
      // Exit 2 = error — that would be a failure.
      expect(check.exitCode).toBeLessThanOrEqual(1);

      const output = check.stdout.toLowerCase();
      expect(
        output.includes('pass') || output.includes('regress') || output.includes('scenario'),
      ).toBe(true);
    });

    it('Test 3: SDK-captured baselines differ structurally from fake content → regression', () => {
      const skillDir = makeTmpDir();
      setupSkill(skillDir);

      // Capture baselines with SDK
      const capture = runSnapeval(['capture', '--adapter', 'copilot-sdk', skillDir]);
      expect(capture.exitCode).toBe(0);

      // Replace baselines with structurally different content
      const snapshotsDir = path.join(skillDir, 'evals', 'snapshots');
      const snapFiles = fs.readdirSync(snapshotsDir).filter(f => f.endsWith('.snap.json'));

      const fakeBaseline = [
        '## Analysis Report',
        '',
        'The following items were identified:',
        '',
        '- Item alpha: critical',
        '- Item beta: warning',
        '',
        '### Recommendations',
        '',
        '1. Address critical items first',
      ].join('\n');

      for (const file of snapFiles) {
        const snapPath = path.join(snapshotsDir, file);
        const snap = JSON.parse(fs.readFileSync(snapPath, 'utf-8'));
        snap.output.raw = fakeBaseline;
        fs.writeFileSync(snapPath, JSON.stringify(snap, null, 2));
      }

      // Check with SDK — current output (greetings) vs fake baselines = regression
      const check = runSnapeval(['check', '--adapter', 'copilot-sdk', '--inference', 'copilot-sdk', skillDir]);
      expect(check.exitCode).toBe(1);
    });
  });

  describe('without SDK installed', () => {
    it('gracefully errors when using copilot-sdk adapter without SDK installed', () => {
      // This test runs regardless of SDK availability — it tests the error path
      // by checking that the adapter name is recognized (not "unknown adapter")
      const skillDir = makeTmpDir();
      setupSkill(skillDir);

      // If SDK is available, skip this test — it only makes sense when SDK is missing
      if (sdkAvailable) return;

      const result = runSnapeval(['capture', '--adapter', 'copilot-sdk', skillDir]);
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toContain('copilot-sdk');
    });
  });
});
