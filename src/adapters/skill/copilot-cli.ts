import { execFile, execFileSync } from 'node:child_process';
import type { SkillAdapter, SkillOutput } from '../../types.js';

export class CopilotCLIAdapter implements SkillAdapter {
  readonly name = 'copilot-cli';

  async invoke(skillPath: string, prompt: string, _files?: string[]): Promise<SkillOutput> {
    const startMs = Date.now();

    return new Promise<SkillOutput>((resolve, reject) => {
      execFile(
        'gh',
        ['copilot', '-p', prompt, '--skill', skillPath],
        { encoding: 'utf-8' },
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
      execFileSync('gh', ['copilot', '--version'], { encoding: 'utf-8', stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }
}
