import * as fs from 'node:fs';
import * as path from 'node:path';
import type { EvalCase } from '../types.js';

export class WorkspaceManager {
  readonly workspaceDir: string;

  constructor(skillDir: string, workspaceTemplate?: string) {
    const skillName = path.basename(skillDir);
    if (workspaceTemplate) {
      this.workspaceDir = workspaceTemplate.replace('{skill_name}', skillName);
    } else {
      this.workspaceDir = path.join(path.dirname(skillDir), `${skillName}-workspace`);
    }
  }

  createIteration(): string {
    fs.mkdirSync(this.workspaceDir, { recursive: true });
    const existing = fs.readdirSync(this.workspaceDir)
      .filter((d) => /^iteration-\d+$/.test(d))
      .map((d) => parseInt(d.replace('iteration-', ''), 10))
      .sort((a, b) => a - b);
    const next = existing.length > 0 ? existing[existing.length - 1] + 1 : 1;
    const iterDir = path.join(this.workspaceDir, `iteration-${next}`);
    fs.mkdirSync(iterDir, { recursive: true });
    return iterDir;
  }

  createEvalDir(iterationDir: string, slug: string, baselineVariant: string = 'without_skill'): string {
    const evalDir = path.join(iterationDir, `eval-${slug}`);
    fs.mkdirSync(path.join(evalDir, 'with_skill', 'outputs'), { recursive: true });
    fs.mkdirSync(path.join(evalDir, baselineVariant, 'outputs'), { recursive: true });
    return evalDir;
  }

  static getEvalSlug(evalCase: EvalCase): string {
    if (evalCase.slug) return `eval-${evalCase.slug}`;
    return `eval-${evalCase.id}`;
  }
}
