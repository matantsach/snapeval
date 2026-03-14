import { execFile, execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { SkillAdapter, SkillOutput } from '../../types.js';

export class CopilotCLIAdapter implements SkillAdapter {
  readonly name = 'copilot-cli';

  async invoke(skillPath: string, prompt: string, _files?: string[]): Promise<SkillOutput> {
    const startMs = Date.now();

    // Try to include SKILL.md content as context if present
    let skillMd = '';
    try {
      const skillFile = path.join(skillPath, 'SKILL.md');
      skillMd = await readFile(skillFile, { encoding: 'utf-8' });
    } catch {
      // ignore missing SKILL.md
    }

    const finalPrompt = skillMd ? `${skillMd}\n\n${prompt}` : prompt;

    return new Promise<SkillOutput>((resolve, reject) => {
      // Use gh copilot and pass flags after `--` so gh doesn't consume them.
      // Use --silent to limit output to the model's response only.
      execFile(
        'gh',
        ['copilot', '--', '-p', finalPrompt, '--silent'],
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
      // Use gh copilot --help as a lightweight availability check
      execFileSync('gh', ['copilot', '--help'], { encoding: 'utf-8', stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }
}
