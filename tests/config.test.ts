import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveConfig, DEFAULT_CONFIG } from '../src/config.js';
import * as fs from 'node:fs';

vi.mock('node:fs');

describe('resolveConfig', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns defaults when no config file or flags', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const config = resolveConfig({}, '/project');
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it('merges config file values over defaults', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ threshold: 0.9 }));
    const config = resolveConfig({}, '/project');
    expect(config.threshold).toBe(0.9);
    expect(config.adapter).toBe('copilot-cli');
  });

  it('CLI flags override config file', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ threshold: 0.9 }));
    const config = resolveConfig({ threshold: 0.7 }, '/project');
    expect(config.threshold).toBe(0.7);
  });

  it('checks skill dir config before project root', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) =>
      String(p).includes('skill-dir') ? true : false
    );
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ runs: 5 }));
    const config = resolveConfig({}, '/project', '/project/skill-dir');
    expect(config.runs).toBe(5);
  });
});
