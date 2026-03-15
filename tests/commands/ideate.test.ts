import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ideateCommand } from '../../src/commands/ideate.js';

// Mock child_process.execSync to prevent actually opening a browser
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

const VALID_ANALYSIS = {
  version: 1,
  skill_name: 'greeter',
  behaviors: [
    { name: 'formal-greeting', description: 'Greets formally' },
  ],
  dimensions: [
    { name: 'style', values: ['formal', 'casual'] },
  ],
  failure_modes: [],
  ambiguities: [],
  scenarios: [
    {
      id: 1,
      prompt: 'greet me formally',
      expected_behavior: 'Formal greeting',
      covers: ['style:formal'],
      why: 'Baseline happy path',
      enabled: true,
    },
  ],
};

describe('ideateCommand', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapeval-ideate-'));
    fs.mkdirSync(path.join(tmpDir, 'evals'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reads analysis.json and writes ideation.html', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'evals', 'analysis.json'),
      JSON.stringify(VALID_ANALYSIS)
    );

    await ideateCommand(tmpDir);

    const htmlPath = path.join(tmpDir, 'evals', 'ideation.html');
    expect(fs.existsSync(htmlPath)).toBe(true);

    const html = fs.readFileSync(htmlPath, 'utf-8');
    expect(html).toContain('greeter');
    expect(html).toContain('formal-greeting');
    expect(html).not.toContain('__ANALYSIS_DATA_PLACEHOLDER__');
  });

  it('throws when analysis.json is missing', async () => {
    await expect(ideateCommand(tmpDir)).rejects.toThrow('analysis.json');
  });

  it('throws when analysis.json is malformed', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'evals', 'analysis.json'),
      'not json'
    );

    await expect(ideateCommand(tmpDir)).rejects.toThrow();
  });

  it('throws when analysis.json is missing required fields', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'evals', 'analysis.json'),
      JSON.stringify({ version: 1 })
    );

    await expect(ideateCommand(tmpDir)).rejects.toThrow();
  });

  it('embeds the analysis data in the HTML', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'evals', 'analysis.json'),
      JSON.stringify(VALID_ANALYSIS)
    );

    await ideateCommand(tmpDir);

    const html = fs.readFileSync(
      path.join(tmpDir, 'evals', 'ideation.html'),
      'utf-8'
    );
    // The JSON should be embedded as a JS variable
    expect(html).toContain(JSON.stringify(VALID_ANALYSIS));
  });

  it('attempts to open the browser', async () => {
    const { execSync } = await import('node:child_process');

    fs.writeFileSync(
      path.join(tmpDir, 'evals', 'analysis.json'),
      JSON.stringify(VALID_ANALYSIS)
    );

    await ideateCommand(tmpDir);

    expect(execSync).toHaveBeenCalled();
  });
});
