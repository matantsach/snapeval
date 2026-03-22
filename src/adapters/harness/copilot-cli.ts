import { execFile, execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Harness, HarnessRunResult } from '../../types.js';

export class CopilotCLIHarness implements Harness {
  readonly name = 'copilot-cli';

  async run(options: {
    skillPath?: string;
    prompt: string;
    files?: string[];
    outputDir: string;
  }): Promise<HarnessRunResult> {
    const startMs = Date.now();
    await this.ensureInstalled();

    fs.mkdirSync(options.outputDir, { recursive: true });

    if (options.files) {
      for (const file of options.files) {
        const dest = path.join(options.outputDir, path.basename(file));
        fs.copyFileSync(file, dest);
      }
    }

    let finalPrompt = options.prompt;
    if (options.skillPath) {
      try {
        const skillFile = path.join(options.skillPath, 'SKILL.md');
        const skillMd = await readFile(skillFile, { encoding: 'utf-8' });
        finalPrompt = `${skillMd}\n\n${options.prompt}`;
      } catch {
        // No SKILL.md found
      }
    }

    return new Promise<HarnessRunResult>((resolve, reject) => {
      execFile(
        'copilot',
        ['-s', '--no-ask-user', '--allow-all-tools', '--model', 'gpt-4.1', '-p', finalPrompt],
        { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 },
        (error, stdout, _stderr) => {
          if (error) { reject(error); return; }
          const durationMs = Date.now() - startMs;
          // CLI harness cannot extract token usage from stdout
          resolve({ raw: stdout.trim(), files: [], total_tokens: 0, duration_ms: durationMs });
        }
      );
    });
  }

  async isAvailable(): Promise<boolean> {
    try {
      execFileSync('copilot', ['--version'], { encoding: 'utf-8', stdio: 'pipe' });
      return true;
    } catch { return false; }
  }

  private async ensureInstalled(): Promise<void> {
    if (await this.isAvailable()) return;
    throw new Error('GitHub Copilot CLI is not available. Install with: npm install -g @github/copilot');
  }
}
