import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { DEFAULT_CONFIG, resolveConfig } from '../src/config.js';

describe('config', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('DEFAULT_CONFIG has spec-aligned fields', () => {
    expect(DEFAULT_CONFIG).toEqual({
      harness: 'copilot-cli',
      inference: 'auto',
      workspace: '../{skill_name}-workspace',
      runs: 1,
    });
  });

  it('merges project config → skill config → CLI flags', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapeval-config-'));
    const skillDir = path.join(tmpDir, 'skill');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'snapeval.config.json'),
      JSON.stringify({ inference: 'github-models' })
    );
    fs.writeFileSync(
      path.join(skillDir, 'snapeval.config.json'),
      JSON.stringify({ runs: 3 })
    );
    const config = resolveConfig({ harness: 'custom' }, tmpDir, skillDir);
    expect(config.harness).toBe('custom');
    expect(config.inference).toBe('github-models');
    expect(config.runs).toBe(3);
    expect(config.workspace).toBe('../{skill_name}-workspace');
  });
});
