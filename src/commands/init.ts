import * as fs from 'node:fs';
import * as path from 'node:path';
import type { InferenceAdapter } from '../types.js';
import { generateEvals } from '../engine/generator.js';
import { SnapevalError } from '../errors.js';

export async function initCommand(
  skillPath: string,
  inference: InferenceAdapter
): Promise<void> {
  // Locate the skill definition file (SKILL.md or skill.md)
  const candidates = ['SKILL.md', 'skill.md'];
  let skillFilePath: string | null = null;
  for (const name of candidates) {
    const candidate = path.join(skillPath, name);
    if (fs.existsSync(candidate)) {
      skillFilePath = candidate;
      break;
    }
  }

  if (!skillFilePath) {
    throw new SnapevalError(
      `No SKILL.md found at ${skillPath}. Create a SKILL.md file to describe your skill.`
    );
  }

  const skillContent = fs.readFileSync(skillFilePath, 'utf-8');
  const skillName = path.basename(skillPath);

  const evalsFile = await generateEvals(skillContent, skillName, inference);

  const evalsDir = path.join(skillPath, 'evals');
  fs.mkdirSync(evalsDir, { recursive: true });

  const evalsPath = path.join(evalsDir, 'evals.json');
  fs.writeFileSync(evalsPath, JSON.stringify(evalsFile, null, 2), 'utf-8');
}
