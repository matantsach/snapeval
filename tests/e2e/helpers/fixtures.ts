import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const GREETER_SKILL_DIR = path.resolve(
  import.meta.dirname, '..', '..', '..', 'test-skills', 'greeter'
);

const trackedDirs: string[] = [];

export function copyGreeterSkill(options?: {
  includeEvals?: boolean;
  skillMdOnly?: boolean;
}): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapeval-e2e-'));
  trackedDirs.push(tmpDir);

  const skillDir = path.join(tmpDir, 'greeter');
  fs.mkdirSync(skillDir, { recursive: true });

  fs.copyFileSync(
    path.join(GREETER_SKILL_DIR, 'SKILL.md'),
    path.join(skillDir, 'SKILL.md')
  );

  if (options?.skillMdOnly) return skillDir;

  if (options?.includeEvals !== false) {
    const srcEvals = path.join(GREETER_SKILL_DIR, 'evals', 'evals.json');
    if (fs.existsSync(srcEvals)) {
      const destDir = path.join(skillDir, 'evals');
      fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(srcEvals, path.join(destDir, 'evals.json'));
    }
  }

  return skillDir;
}

export function addAssertionsToEvals(skillDir: string, assertions: string[]): void {
  const evalsPath = path.join(skillDir, 'evals', 'evals.json');
  const evalsFile = JSON.parse(fs.readFileSync(evalsPath, 'utf-8'));
  for (const evalCase of evalsFile.evals) {
    evalCase.assertions = assertions;
  }
  fs.writeFileSync(evalsPath, JSON.stringify(evalsFile, null, 2));
}

export function writeMinimalEvals(skillDir: string, options?: { withAssertions?: boolean }): void {
  const evalsDir = path.join(skillDir, 'evals');
  fs.mkdirSync(evalsDir, { recursive: true });
  const evals = {
    skill_name: 'greeter',
    evals: [
      {
        id: 1,
        prompt: 'Greet Eleanor formally',
        expected_output: 'A formal greeting with the name Eleanor',
        slug: 'greet-eleanor',
        ...(options?.withAssertions
          ? { assertions: ['Output contains the name Eleanor', 'Output uses a formal tone'] }
          : {}),
      },
    ],
  };
  fs.writeFileSync(path.join(evalsDir, 'evals.json'), JSON.stringify(evals, null, 2));
}

export function createOldSkillVersion(skillDir: string): string {
  const tmpDir = path.dirname(skillDir);
  const oldSkillDir = path.join(tmpDir, 'greeter-old');
  fs.mkdirSync(oldSkillDir, { recursive: true });
  fs.writeFileSync(
    path.join(oldSkillDir, 'SKILL.md'),
    '# Greeter v1\n\nGreets people casually. Always use "hey" as the greeting.'
  );
  return oldSkillDir;
}

export function createEmptyDir(): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapeval-e2e-empty-'));
  trackedDirs.push(tmpDir);
  return tmpDir;
}

export function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

export function cleanupAll(): void {
  for (const dir of trackedDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  trackedDirs.length = 0;
}
