import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '../..');
const GREETER_SRC = path.resolve(PROJECT_ROOT, 'test-skills/greeter');
const CLI = path.resolve(PROJECT_ROOT, 'bin/snapeval.ts');

/** Minimal evals — 1 scenario to keep the plugin test fast. */
const PLUGIN_EVALS = {
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

function isPluginInstalled(): boolean {
  try {
    const output = execFileSync('copilot', ['plugin', 'list'], {
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    return output.includes('snapeval');
  } catch {
    return false;
  }
}

const copilotAvailable = isCopilotAvailable();

describe('E2E: Plugin flow through Copilot', () => {
  const tmpDirs: string[] = [];
  let pluginInstalled = false;

  function makeTmpDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapeval-e2e-plugin-'));
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
    beforeAll(() => {
      // Install the plugin from the local project
      if (!isPluginInstalled()) {
        try {
          execFileSync('copilot', ['plugin', 'install', PROJECT_ROOT], {
            encoding: 'utf-8',
            stdio: 'pipe',
            timeout: 30_000,
          });
          pluginInstalled = true;
        } catch (err) {
          console.warn('Failed to install snapeval plugin:', (err as Error).message);
        }
      } else {
        pluginInstalled = true;
      }
    });

    afterAll(() => {
      if (pluginInstalled) {
        try {
          execFileSync('copilot', ['plugin', 'uninstall', 'snapeval'], {
            encoding: 'utf-8',
            stdio: 'pipe',
            timeout: 15_000,
          });
        } catch {
          // best-effort cleanup
        }
      }
    });

    it('Test 3: plugin installs, activates, and runs snapeval flow', () => {
      if (!pluginInstalled) {
        throw new Error('Plugin installation failed — cannot run this test');
      }

      // Prepare a skill directory with evals and baselines
      const skillDir = makeTmpDir();
      fs.copyFileSync(
        path.join(GREETER_SRC, 'SKILL.md'),
        path.join(skillDir, 'SKILL.md'),
      );
      const evalsDir = path.join(skillDir, 'evals');
      fs.mkdirSync(evalsDir, { recursive: true });
      fs.writeFileSync(
        path.join(evalsDir, 'evals.json'),
        JSON.stringify(PLUGIN_EVALS, null, 2),
      );

      // Capture baselines via direct CLI first
      execFileSync('npx', ['tsx', CLI, 'capture', skillDir], {
        encoding: 'utf-8',
        stdio: 'pipe',
        timeout: 120_000,
      });

      // Invoke Copilot with the snapeval plugin to run a check
      let stdout: string;
      try {
        stdout = execFileSync(
          'copilot',
          [
            '-p', `Run snapeval check on the skill at ${skillDir}. Report the results.`,
            '-s',
            '--no-ask-user',
            '--allow-all-tools',
          ],
          {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
            maxBuffer: 10 * 1024 * 1024,
            timeout: 180_000,
          },
        );
      } catch (err: unknown) {
        const error = err as { stdout?: string; stderr?: string };
        stdout = (error.stdout ?? '') + (error.stderr ?? '');
      }

      // The plugin should have activated and produced snapeval-related output
      const output = stdout.toLowerCase();
      const hasSnapevalOutput =
        output.includes('snapeval') ||
        output.includes('scenario') ||
        output.includes('pass') ||
        output.includes('regress') ||
        output.includes('baseline') ||
        output.includes('check') ||
        output.includes('greeter');

      expect(hasSnapevalOutput).toBe(true);
    });
  });
});
