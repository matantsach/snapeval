import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SnapevalConfig } from './types.js';

export const DEFAULT_CONFIG: SnapevalConfig = {
  harness: 'copilot-cli',
  inference: 'auto',
  workspace: '../{skill_name}-workspace',
  runs: 1,
  concurrency: 1,
};

function loadConfigFile(dirPath: string): Partial<SnapevalConfig> | null {
  const configPath = path.join(dirPath, 'snapeval.config.json');
  if (!fs.existsSync(configPath)) return null;
  const raw = fs.readFileSync(configPath, 'utf-8');
  return JSON.parse(raw);
}

export function resolveConfig(
  cliFlags: Partial<SnapevalConfig>,
  projectRoot: string,
  skillDir?: string
): SnapevalConfig {
  const skillDirConfig = skillDir ? loadConfigFile(skillDir) : null;
  const projectConfig = loadConfigFile(projectRoot);
  return {
    ...DEFAULT_CONFIG,
    ...(projectConfig ?? {}),
    ...(skillDirConfig ?? {}),
    ...stripUndefined(cliFlags),
  };
}

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}
