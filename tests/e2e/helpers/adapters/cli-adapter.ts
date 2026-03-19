import { execFile, execFileSync } from 'node:child_process';
import * as path from 'node:path';
import type { E2ETestAdapter, E2ERunResult, E2ERunOptions } from '../types.js';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..', '..', '..');
const BIN_PATH = path.join(PROJECT_ROOT, 'bin', 'snapeval.ts');

export class CLIAdapter implements E2ETestAdapter {
  readonly name = 'cli';

  async isAvailable(): Promise<boolean> {
    try {
      execFileSync('npx', ['tsx', BIN_PATH, '--version'], {
        encoding: 'utf-8',
        stdio: 'pipe',
        cwd: PROJECT_ROOT,
      });
      // Copilot CLI must be installed and authenticated for the harness to work
      execFileSync('copilot', ['-p', 'say ok', '-s', '--no-ask-user'], {
        encoding: 'utf-8',
        stdio: 'pipe',
        timeout: 30_000,
      });
      return true;
    } catch {
      return false;
    }
  }

  async setup(): Promise<void> {}

  async teardown(): Promise<void> {}

  async run(options: E2ERunOptions): Promise<E2ERunResult> {
    const args = ['tsx', BIN_PATH, options.command, options.skillDir];

    if (options.flags) {
      for (const [key, value] of Object.entries(options.flags)) {
        args.push(`--${key}`, value);
      }
    }

    return new Promise<E2ERunResult>((resolve) => {
      execFile('npx', args, {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 300_000,
        cwd: PROJECT_ROOT,
      }, (error, stdout, stderr) => {
        resolve({
          stdout: stdout ?? '',
          stderr: stderr ?? '',
          exitCode: error ? (error as any).code ?? 1 : 0,
        });
      });
    });
  }
}
