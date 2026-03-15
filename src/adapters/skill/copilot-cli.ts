import { execFile, execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { SkillAdapter, SkillOutput } from '../../types.js';

export class CopilotCLIAdapter implements SkillAdapter {
  readonly name = 'copilot-cli';

  async invoke(skillPath: string, prompt: string, _files?: string[]): Promise<SkillOutput> {
    const startMs = Date.now();

    await this.ensureInstalled();

    // Include SKILL.md content as context when invoked directly (not via plugin)
    let skillMd = '';
    try {
      const skillFile = path.join(skillPath, 'SKILL.md');
      skillMd = await readFile(skillFile, { encoding: 'utf-8' });
    } catch {
      // ignore missing SKILL.md
    }

    const finalPrompt = skillMd ? `${skillMd}\n\n${prompt}` : prompt;

    return new Promise<SkillOutput>((resolve, reject) => {
      execFile(
        'copilot',
        ['-s', '--no-ask-user', '--allow-all-tools', '--model', 'gpt-4.1', '-p', finalPrompt],
        { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 },
        (error, stdout, _stderr) => {
          if (error) {
            reject(error);
            return;
          }
          const durationMs = Date.now() - startMs;
          const raw = stdout.trim();
          resolve({
            raw,
            metadata: {
              tokens: 0,
              durationMs,
              model: 'copilot',
              adapter: this.name,
            },
          });
        }
      );
    });
  }

  async isAvailable(): Promise<boolean> {
    try {
      execFileSync('copilot', ['--version'], { encoding: 'utf-8', stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  private async ensureInstalled(): Promise<void> {
    if (await this.isAvailable()) return;

    try {
      execFileSync('npm', ['install', '-g', '@github/copilot'], {
        encoding: 'utf-8',
        stdio: 'pipe',
      });
    } catch (err) {
      throw new Error(
        `Failed to install @github/copilot. Install manually: npm install -g @github/copilot\n${err}`
      );
    }
  }
}
