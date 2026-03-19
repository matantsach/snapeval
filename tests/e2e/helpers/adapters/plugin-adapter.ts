import { execFile, execFileSync } from 'node:child_process';
import * as path from 'node:path';
import type { E2ETestAdapter, E2ERunResult, E2ERunOptions } from '../types.js';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..', '..', '..');

const COMMAND_PROMPTS: Record<string, (skillDir: string) => string> = {
  init: (dir) => `Generate eval test cases for the skill at ${dir}. Run without asking for confirmation.`,
  eval: (dir) => `Run evals for the skill at ${dir}. Run all evals without asking for confirmation.`,
  review: (dir) => `Run evals for the skill at ${dir} and generate a review with feedback template.`,
};

export class PluginAdapter implements E2ETestAdapter {
  readonly name = 'plugin';

  async isAvailable(): Promise<boolean> {
    try {
      // Copilot CLI must be installed and authenticated
      execFileSync('copilot', ['--version'], { encoding: 'utf-8', stdio: 'pipe' });
      // Auth token required for plugin to function
      if (!process.env.COPILOT_GITHUB_TOKEN) return false;
      return true;
    } catch {
      return false;
    }
  }

  async setup(): Promise<void> {
    try {
      const output = execFileSync('copilot', ['plugin', 'list'], {
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      if (output.includes('snapeval')) return;
    } catch {}

    execFileSync('copilot', ['plugin', 'install', PROJECT_ROOT], {
      encoding: 'utf-8',
      stdio: 'pipe',
    });
  }

  async teardown(): Promise<void> {
    try {
      execFileSync('copilot', ['plugin', 'uninstall', 'snapeval'], {
        encoding: 'utf-8',
        stdio: 'pipe',
      });
    } catch {}
  }

  async run(options: E2ERunOptions): Promise<E2ERunResult> {
    const promptFn = COMMAND_PROMPTS[options.command];
    if (!promptFn) {
      return { stdout: '', stderr: `Unknown command: ${options.command}`, exitCode: 1 };
    }

    const prompt = promptFn(options.skillDir);
    const args = ['-p', prompt, '-s', '--no-ask-user', '--allow-all-tools', '--model', 'gpt-4.1'];

    return new Promise<E2ERunResult>((resolve) => {
      execFile('copilot', args, {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 300_000,
      }, (error, stdout, stderr) => {
        resolve({
          stdout: stdout ?? '',
          stderr: stderr ?? '',
          exitCode: null,
        });
      });
    });
  }
}
