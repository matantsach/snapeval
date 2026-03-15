import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { SnapevalError } from '../errors.js';

interface AnalysisData {
  version: number;
  skill_name: string;
  behaviors: Array<{ name: string; description: string }>;
  dimensions: Array<{ name: string; values: string[] }>;
  failure_modes: Array<{ description: string; severity: string }>;
  ambiguities: Array<{ description: string; why_it_matters: string; in_scope: boolean | null }>;
  scenarios: Array<{
    id: number;
    prompt: string;
    expected_behavior: string;
    covers: string[];
    why: string;
    enabled: boolean;
  }>;
}

function validateAnalysis(data: unknown): asserts data is AnalysisData {
  if (!data || typeof data !== 'object') {
    throw new SnapevalError('analysis.json must be a JSON object.');
  }
  const obj = data as Record<string, unknown>;
  if (!obj.skill_name || !Array.isArray(obj.behaviors) || !Array.isArray(obj.scenarios)) {
    throw new SnapevalError(
      'analysis.json is missing required fields (skill_name, behaviors, scenarios).'
    );
  }
}

function getTemplatePath(): string {
  // Resolve template relative to this module's location
  // In dev (tsx): src/commands/ideate.ts → ../../assets/ideation-viewer.html
  // In compiled: dist/src/commands/ideate.js → ../../../assets/ideation-viewer.html
  const moduleDir = path.dirname(new URL(import.meta.url).pathname);
  const candidates = [
    path.resolve(moduleDir, '../../assets/ideation-viewer.html'),
    path.resolve(moduleDir, '../../../assets/ideation-viewer.html'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new SnapevalError(
    'Could not find ideation-viewer.html template. Ensure the assets/ directory is present.'
  );
}

function openInBrowser(filePath: string): void {
  const platform = process.platform;
  try {
    if (platform === 'darwin') {
      execSync(`open "${filePath}"`);
    } else if (platform === 'linux') {
      execSync(`xdg-open "${filePath}"`);
    } else if (platform === 'win32') {
      execSync(`start "" "${filePath}"`);
    }
  } catch {
    // Browser open is best-effort — don't fail the command
    console.log(`Could not open browser automatically. Open this file manually:\n${filePath}`);
  }
}

export async function ideateCommand(skillPath: string): Promise<string> {
  const analysisPath = path.join(skillPath, 'evals', 'analysis.json');

  if (!fs.existsSync(analysisPath)) {
    throw new SnapevalError(
      `No analysis.json found at ${analysisPath}. ` +
      'The snapeval skill generates this file during the analysis phase.'
    );
  }

  let analysisData: unknown;
  try {
    analysisData = JSON.parse(fs.readFileSync(analysisPath, 'utf-8'));
  } catch {
    throw new SnapevalError(`Failed to parse ${analysisPath}. Ensure it contains valid JSON.`);
  }

  validateAnalysis(analysisData);

  const template = fs.readFileSync(getTemplatePath(), 'utf-8');
  const html = template.replace(
    '__ANALYSIS_DATA_PLACEHOLDER__',
    JSON.stringify(analysisData)
  );

  const outputPath = path.join(skillPath, 'evals', 'ideation.html');
  fs.writeFileSync(outputPath, html, 'utf-8');

  openInBrowser(outputPath);

  return outputPath;
}
