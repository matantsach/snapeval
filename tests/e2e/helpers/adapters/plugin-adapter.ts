import { execFile, execFileSync } from 'node:child_process';
import * as path from 'node:path';
import type { E2ETestAdapter, E2ERunResult, E2ERunOptions } from '../types.js';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..', '..', '..');

function buildPrompt(command: string, skillDir: string, flags?: Record<string, string>): string {
  const workspace = flags?.workspace ? ` Use workspace directory ${flags.workspace}.` : '';
  const oldSkill = flags?.['old-skill'] ? ` Compare against old skill at ${flags['old-skill']}.` : '';
  const extra = workspace + oldSkill;

  switch (command) {
    case 'eval':
      return `Run evals for the skill at ${skillDir}. Run all evals without asking for confirmation.${extra}`;
    case 'review':
      return `Review the skill at ${skillDir}.${extra}`;
    default:
      return '';
  }
}

export class PluginAdapter implements E2ETestAdapter {
  readonly name = 'plugin';

  async isAvailable(): Promise<boolean> {
    try {
      // Copilot CLI must be installed
      execFileSync('copilot', ['--version'], { encoding: 'utf-8', stdio: 'pipe' });
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
    const prompt = buildPrompt(options.command, options.skillDir, options.flags);
    if (!prompt) {
      return { stdout: '', stderr: `Unknown command: ${options.command}`, exitCode: 1 };
    }
    const args = ['-p', prompt, '-s', '--no-ask-user', '--allow-all-tools', '--model', 'gpt-4.1'];

    return new Promise<E2ERunResult>((resolve) => {
      execFile('copilot', args, {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 300_000,
        env: { ...process.env },
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
