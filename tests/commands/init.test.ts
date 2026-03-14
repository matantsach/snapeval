import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initCommand } from '../../src/commands/init.js';
import type { InferenceAdapter } from '../../src/types.js';

function makeMockInference(skillName = 'test-skill'): InferenceAdapter {
  const response = JSON.stringify({
    skill_name: skillName,
    evals: [
      {
        id: 1,
        prompt: 'Hello world',
        expected_output: 'A greeting',
        assertions: ['Contains a greeting'],
      },
      {
        id: 2,
        prompt: 'Edge case: empty string',
        expected_output: 'Handles gracefully',
        assertions: ['Does not throw an error'],
      },
    ],
  });
  return {
    name: 'mock',
    chat: vi.fn().mockResolvedValue(response),
    embed: vi.fn().mockResolvedValue([]),
    estimateCost: vi.fn().mockReturnValue(0),
  };
}

describe('initCommand', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapeval-init-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reads SKILL.md and writes evals/evals.json', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'SKILL.md'),
      '# My Skill\n\nThis skill does useful things.'
    );
    const inference = makeMockInference('my-skill');

    await initCommand(tmpDir, inference);

    const evalsPath = path.join(tmpDir, 'evals', 'evals.json');
    expect(fs.existsSync(evalsPath)).toBe(true);

    const evalsFile = JSON.parse(fs.readFileSync(evalsPath, 'utf-8'));
    expect(evalsFile.skill_name).toBe('my-skill');
    expect(evalsFile.generated_by).toBe('snapeval v0.1.0');
    expect(evalsFile.evals).toHaveLength(2);
  });

  it('also accepts skill.md (lowercase)', async () => {
    fs.writeFileSync(path.join(tmpDir, 'skill.md'), '# Lower Skill');
    const inference = makeMockInference('lower-skill');

    await initCommand(tmpDir, inference);

    const evalsPath = path.join(tmpDir, 'evals', 'evals.json');
    expect(fs.existsSync(evalsPath)).toBe(true);
  });

  it('uses the skill directory basename as fallback skill name', async () => {
    // When the LLM response omits skill_name, the dir basename is used
    const noNameResponse = JSON.stringify({
      evals: [{ id: 1, prompt: 'test', expected_output: 'ok', assertions: [] }],
    });
    const inference: InferenceAdapter = {
      name: 'mock',
      chat: vi.fn().mockResolvedValue(noNameResponse),
      embed: vi.fn().mockResolvedValue([]),
      estimateCost: vi.fn().mockReturnValue(0),
    };
    fs.writeFileSync(path.join(tmpDir, 'SKILL.md'), '# Skill');

    await initCommand(tmpDir, inference);

    const evalsFile = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'evals', 'evals.json'), 'utf-8')
    );
    // skill_name should be the dirname (tmpDir basename) as fallback
    expect(evalsFile.skill_name).toBe(path.basename(tmpDir));
  });

  it('passes skill content to inference.chat', async () => {
    const skillContent = '# Weather Skill\n\nReturns current weather for a given city.';
    fs.writeFileSync(path.join(tmpDir, 'SKILL.md'), skillContent);
    const inference = makeMockInference('weather-skill');

    await initCommand(tmpDir, inference);

    expect(inference.chat).toHaveBeenCalledOnce();
    const [messages] = (inference.chat as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(messages[0].content).toContain(skillContent);
  });

  it('creates the evals directory if it does not exist', async () => {
    fs.writeFileSync(path.join(tmpDir, 'SKILL.md'), '# Skill');
    const inference = makeMockInference();

    const evalsDir = path.join(tmpDir, 'evals');
    expect(fs.existsSync(evalsDir)).toBe(false);

    await initCommand(tmpDir, inference);

    expect(fs.existsSync(evalsDir)).toBe(true);
  });

  it('throws SnapevalError when no SKILL.md is found', async () => {
    const inference = makeMockInference();

    await expect(initCommand(tmpDir, inference)).rejects.toThrow('No SKILL.md found');
  });

  it('writes valid JSON that can be parsed back', async () => {
    fs.writeFileSync(path.join(tmpDir, 'SKILL.md'), '# Skill');
    const inference = makeMockInference('skill');

    await initCommand(tmpDir, inference);

    const raw = fs.readFileSync(path.join(tmpDir, 'evals', 'evals.json'), 'utf-8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('overwrites existing evals.json on re-run', async () => {
    fs.writeFileSync(path.join(tmpDir, 'SKILL.md'), '# Skill');
    fs.mkdirSync(path.join(tmpDir, 'evals'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'evals', 'evals.json'),
      JSON.stringify({ old: true }),
      'utf-8'
    );

    const inference = makeMockInference('skill');
    await initCommand(tmpDir, inference);

    const content = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'evals', 'evals.json'), 'utf-8')
    );
    expect(content.old).toBeUndefined();
    expect(content.skill_name).toBeDefined();
  });
});
