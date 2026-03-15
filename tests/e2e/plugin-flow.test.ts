import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '../..');
const GREETER_SRC = path.resolve(PROJECT_ROOT, 'test-skills/greeter');
const PLUGIN_SKILL_MD = path.resolve(PROJECT_ROOT, 'plugin/skills/snapeval/SKILL.md');

// --- Helpers ---

function isCopilotAvailable(): boolean {
  try {
    execFileSync('copilot', ['--version'], { encoding: 'utf-8', stdio: 'pipe' });
    execFileSync('copilot', ['-s', '--no-ask-user', '--model', 'gpt-4.1', '-p', 'hi'], {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 30_000,
    });
    return true;
  } catch {
    return false;
  }
}

function isPluginInstalled(): boolean {
  try {
    const output = execFileSync('copilot', ['plugin', 'list'], {
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    return output.includes('snapeval');
  } catch {
    return false;
  }
}

function invokeCopilotWithPlugin(
  prompt: string,
  options: { timeout?: number; cwd?: string } = {},
): { stdout: string; exitCode: number } {
  const timeout = options.timeout ?? 180_000;
  try {
    const stdout = execFileSync(
      'copilot',
      ['-p', prompt, '-s', '--no-ask-user', '--allow-all-tools', '--model', 'gpt-4.1'],
      {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        maxBuffer: 10 * 1024 * 1024,
        timeout,
        cwd: options.cwd,
      },
    );
    return { stdout, exitCode: 0 };
  } catch (err: unknown) {
    const error = err as { status?: number; stdout?: string; stderr?: string };
    return {
      stdout: (error.stdout ?? '') + (error.stderr ?? ''),
      exitCode: error.status ?? 2,
    };
  }
}

/** Minimal evals with 2 deterministic scenarios. */
const MINIMAL_EVALS = {
  skill_name: 'greeter',
  generated_by: 'snapeval e2e',
  evals: [
    {
      id: 1,
      prompt: 'Can you give me a formal greeting for Eleanor?',
      expected_output: 'Returns the formal greeting addressed to Eleanor.',
      files: [],
      assertions: ['Output contains "Eleanor"'],
    },
    {
      id: 2,
      prompt: 'Give me a pirate greeting for Zoe',
      expected_output: 'Returns the pirate-style greeting addressed to Zoe.',
      files: [],
      assertions: ['Output contains "Zoe"'],
    },
  ],
};

/** A snapshot baseline matching the greeter skill's expected output. */
function makeSnapshot(id: number, prompt: string, raw: string) {
  return {
    scenario_id: id,
    prompt,
    output: {
      raw,
      metadata: { tokens: 0, durationMs: 1000, model: 'copilot', adapter: 'copilot-cli' },
    },
    captured_at: new Date().toISOString(),
    runs: 1,
    approved_by: null,
  };
}

/** Copy only SKILL.md — clean slate, no evals or snapshots. */
function copySkillOnly(destDir: string): void {
  fs.copyFileSync(path.join(GREETER_SRC, 'SKILL.md'), path.join(destDir, 'SKILL.md'));
}

/**
 * Set up a skill dir with SKILL.md, evals.json, and synthetic baselines.
 * The greeter evals/snapshots are git-ignored, so we create them inline.
 */
function setupWithBaselines(destDir: string): void {
  fs.copyFileSync(path.join(GREETER_SRC, 'SKILL.md'), path.join(destDir, 'SKILL.md'));

  const evalsDir = path.join(destDir, 'evals');
  const snapshotsDir = path.join(evalsDir, 'snapshots');
  fs.mkdirSync(snapshotsDir, { recursive: true });
  fs.writeFileSync(path.join(evalsDir, 'evals.json'), JSON.stringify(MINIMAL_EVALS, null, 2));

  // Write baselines that match what the greeter skill would produce
  fs.writeFileSync(
    path.join(snapshotsDir, 'scenario-1.snap.json'),
    JSON.stringify(
      makeSnapshot(1, MINIMAL_EVALS.evals[0].prompt,
        'Good day, Eleanor. It is a pleasure to make your acquaintance.'),
      null, 2,
    ),
  );
  fs.writeFileSync(
    path.join(snapshotsDir, 'scenario-2.snap.json'),
    JSON.stringify(
      makeSnapshot(2, MINIMAL_EVALS.evals[1].prompt,
        'Ahoy, Zoe! Welcome aboard, ye scurvy dog!'),
      null, 2,
    ),
  );
}

/** Tamper ALL snapshot baselines with structurally different content. */
function tamperAllBaselines(skillDir: string): void {
  const snapshotsDir = path.join(skillDir, 'evals', 'snapshots');
  const snapFiles = fs.readdirSync(snapshotsDir).filter((f) => f.endsWith('.snap.json'));
  const fakeContent = [
    '## Analysis Report',
    '',
    'The following items were identified:',
    '',
    '- Item alpha: critical',
    '- Item beta: warning',
    '- Item gamma: info',
    '',
    '### Recommendations',
    '',
    '1. Address critical items first',
    '2. Review warning items',
  ].join('\n');

  for (const file of snapFiles) {
    const snapPath = path.join(snapshotsDir, file);
    const snap = JSON.parse(fs.readFileSync(snapPath, 'utf-8'));
    snap.output.raw = fakeContent;
    fs.writeFileSync(snapPath, JSON.stringify(snap, null, 2));
  }
}

/** Check if plugin SKILL.md has the report section. */
function pluginHasReportSection(): boolean {
  try {
    const content = fs.readFileSync(PLUGIN_SKILL_MD, 'utf-8');
    return content.includes('report') && content.includes('--html');
  } catch {
    return false;
  }
}

/** List all files in a directory recursively (for debug logging). */
function listDirRecursive(dir: string, prefix = ''): string[] {
  const results: string[] = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        results.push(...listDirRecursive(path.join(dir, entry.name), rel));
      } else {
        results.push(rel);
      }
    }
  } catch { /* dir doesn't exist */ }
  return results;
}

const copilotAvailable = isCopilotAvailable();

describe('E2E: Plugin user stories', () => {
  const tmpDirs: string[] = [];
  let pluginInstalled = false;

  function makeTmpDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapeval-e2e-plugin-'));
    tmpDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  describe.skipIf(!copilotAvailable)('with real Copilot CLI', () => {
    beforeAll(() => {
      if (!isPluginInstalled()) {
        try {
          execFileSync('copilot', ['plugin', 'install', PROJECT_ROOT], {
            encoding: 'utf-8',
            stdio: 'pipe',
            timeout: 30_000,
          });
          pluginInstalled = true;
        } catch (err) {
          console.warn('Failed to install snapeval plugin:', (err as Error).message);
        }
      } else {
        pluginInstalled = true;
      }
    });

    afterAll(() => {
      if (pluginInstalled) {
        try {
          execFileSync('copilot', ['plugin', 'uninstall', 'snapeval'], {
            encoding: 'utf-8',
            stdio: 'pipe',
            timeout: 15_000,
          });
        } catch {
          // best-effort cleanup
        }
      }
    });

    // --- User Story Tests ---

    it('US1: evaluate — generates evals and captures baselines', () => {
      if (!pluginInstalled) throw new Error('Plugin not installed');

      const skillDir = makeTmpDir();
      copySkillOnly(skillDir);

      const result = invokeCopilotWithPlugin(
        `Evaluate the skill at ${skillDir}. Run all scenarios without asking for confirmation.`,
        { timeout: 300_000 },
      );

      // Debug: log what Copilot said and what files exist
      const us1Debug = [
        `[US1] Exit code: ${result.exitCode}`,
        `[US1] Copilot stdout:\n${result.stdout.slice(0, 3000)}`,
        `[US1] Skill dir contents: ${JSON.stringify(listDirRecursive(skillDir))}`,
      ].join('\n');
      process.stderr.write(us1Debug + '\n');

      // Primary: evals.json created with valid structure
      const evalsPath = path.join(skillDir, 'evals', 'evals.json');
      expect(fs.existsSync(evalsPath)).toBe(true);
      const evalsFile = JSON.parse(fs.readFileSync(evalsPath, 'utf-8'));
      expect(evalsFile.evals).toBeInstanceOf(Array);
      expect(evalsFile.evals.length).toBeGreaterThanOrEqual(1);

      // Primary: at least one eval is related to the greeter skill
      const greeterKeywords = /greeting|formal|casual|pirate|greeter/i;
      const evalsJson = JSON.stringify(evalsFile.evals);
      expect(evalsJson).toMatch(greeterKeywords);

      // Primary: snapshot files created with valid structure
      const snapshotsDir = path.join(skillDir, 'evals', 'snapshots');
      expect(fs.existsSync(snapshotsDir)).toBe(true);
      const snapFiles = fs.readdirSync(snapshotsDir).filter((f) => f.endsWith('.snap.json'));
      expect(snapFiles.length).toBeGreaterThanOrEqual(1);

      for (const file of snapFiles) {
        const snap = JSON.parse(fs.readFileSync(path.join(snapshotsDir, file), 'utf-8'));
        expect(snap.output.raw).toBeTruthy();
        expect(snap.output.metadata.adapter).toBeTruthy();
      }

      // Secondary: stdout references skill or results
      const output = result.stdout.toLowerCase();
      expect(
        output.includes('greeter') ||
        output.includes('scenario') ||
        output.includes('captured') ||
        output.includes('baseline'),
      ).toBe(true);
    });

    it('US2: check — passes when baselines match', () => {
      if (!pluginInstalled) throw new Error('Plugin not installed');

      const skillDir = makeTmpDir();
      setupWithBaselines(skillDir);

      // Record snapshot contents before check to verify no corruption
      const snapshotsDir = path.join(skillDir, 'evals', 'snapshots');
      const snapFiles = fs.readdirSync(snapshotsDir).filter((f) => f.endsWith('.snap.json'));
      const beforeContents = new Map<string, string>();
      for (const file of snapFiles) {
        beforeContents.set(file, fs.readFileSync(path.join(snapshotsDir, file), 'utf-8'));
      }

      const result = invokeCopilotWithPlugin(
        `Check the skill at ${skillDir} for regressions.`,
      );

      // Primary: skill directory unchanged — no corruption
      for (const file of snapFiles) {
        const afterContent = fs.readFileSync(path.join(snapshotsDir, file), 'utf-8');
        expect(afterContent).toBe(beforeContents.get(file));
      }

      // Tertiary: pipeline completed without error (exit != 2)
      expect(result.exitCode).not.toBe(2);

      // Secondary: output contains verdict patterns
      const output = result.stdout.toLowerCase();
      expect(
        output.includes('pass') || output.includes('scenario') || output.includes('check'),
      ).toBe(true);
    });

    it('US2b: check — detects regressions with tampered baselines', () => {
      if (!pluginInstalled) throw new Error('Plugin not installed');

      const skillDir = makeTmpDir();
      setupWithBaselines(skillDir);
      tamperAllBaselines(skillDir);

      const result = invokeCopilotWithPlugin(
        `Check the skill at ${skillDir} for regressions.`,
      );

      // Secondary: output mentions regression
      const output = result.stdout.toLowerCase();
      expect(
        output.includes('regress') || output.includes('different') || output.includes('changed'),
      ).toBe(true);

      // Tertiary: exit code suggests regression (best-effort, Copilot may not propagate)
      if (result.exitCode !== 0) {
        expect(result.exitCode).toBe(1);
      }
    });

    it.skipIf(!pluginHasReportSection())('US3: report — generates HTML report', () => {
      if (!pluginInstalled) throw new Error('Plugin not installed');

      const skillDir = makeTmpDir();
      setupWithBaselines(skillDir);

      invokeCopilotWithPlugin(
        `Check the skill at ${skillDir} and generate an HTML report.`,
        { timeout: 300_000 },
      );

      // Primary: iteration directory created
      const resultsDir = path.join(skillDir, 'evals', 'results');
      expect(fs.existsSync(resultsDir)).toBe(true);

      const iterationDirs = fs.readdirSync(resultsDir).filter((d) => d.startsWith('iteration-'));
      expect(iterationDirs.length).toBeGreaterThanOrEqual(1);

      const latestIteration = path.join(resultsDir, iterationDirs[iterationDirs.length - 1]);

      // Primary: report.html exists and is non-trivial
      const htmlPath = path.join(latestIteration, 'report.html');
      expect(fs.existsSync(htmlPath)).toBe(true);
      const html = fs.readFileSync(htmlPath, 'utf-8');
      expect(html.length).toBeGreaterThan(1024);
      expect(html).toContain('<!DOCTYPE html>');

      // Primary: viewer-data.json exists
      const viewerPath = path.join(latestIteration, 'viewer-data.json');
      expect(fs.existsSync(viewerPath)).toBe(true);
      const viewerData = JSON.parse(fs.readFileSync(viewerPath, 'utf-8'));
      expect(viewerData).toHaveProperty('skillName');
    });

    it('US4: approve — updates baselines after regression', () => {
      if (!pluginInstalled) throw new Error('Plugin not installed');

      const skillDir = makeTmpDir();
      setupWithBaselines(skillDir);
      tamperAllBaselines(skillDir);

      // Record snapshot contents before approval
      const snapshotsDir = path.join(skillDir, 'evals', 'snapshots');
      const snapFiles = fs.readdirSync(snapshotsDir).filter((f) => f.endsWith('.snap.json'));
      const beforeContents = new Map<string, string>();
      for (const file of snapFiles) {
        beforeContents.set(file, fs.readFileSync(path.join(snapshotsDir, file), 'utf-8'));
      }

      const result = invokeCopilotWithPlugin(
        `Approve all scenarios for the skill at ${skillDir}.`,
        { timeout: 300_000 },
      );

      // Debug: log what Copilot said and what files exist
      const us4Debug = [
        `[US4] Exit code: ${result.exitCode}`,
        `[US4] Copilot stdout:\n${result.stdout.slice(0, 3000)}`,
        `[US4] Skill dir contents: ${JSON.stringify(listDirRecursive(skillDir))}`,
      ].join('\n');
      process.stderr.write(us4Debug + '\n');

      // Primary: snapshot content changed
      let changedCount = 0;
      for (const file of snapFiles) {
        const afterContent = fs.readFileSync(path.join(snapshotsDir, file), 'utf-8');
        if (afterContent !== beforeContents.get(file)) {
          changedCount++;
        }
      }
      expect(changedCount).toBeGreaterThanOrEqual(1);

      // Primary: audit log exists
      const auditLogPath = path.join(snapshotsDir, '.audit-log.jsonl');
      expect(fs.existsSync(auditLogPath)).toBe(true);
      const auditContent = fs.readFileSync(auditLogPath, 'utf-8').trim();
      expect(auditContent.length).toBeGreaterThan(0);
    });

    // --- Error Path Tests ---

    it('US-ERR1: evaluate with no SKILL.md — reports error', () => {
      if (!pluginInstalled) throw new Error('Plugin not installed');

      const skillDir = makeTmpDir();
      // Empty directory — no SKILL.md

      const result = invokeCopilotWithPlugin(
        `Evaluate the skill at ${skillDir}.`,
      );

      // Primary: no evals or snapshots created
      expect(fs.existsSync(path.join(skillDir, 'evals', 'evals.json'))).toBe(false);
      expect(fs.existsSync(path.join(skillDir, 'evals', 'snapshots'))).toBe(false);

      // Secondary: output mentions error
      const output = result.stdout.toLowerCase();
      expect(
        output.includes('skill.md') ||
        output.includes('not found') ||
        output.includes('error') ||
        output.includes('no skill') ||
        output.includes('missing'),
      ).toBe(true);
    });

    it('US-ERR2: check with no baselines — reports error', () => {
      if (!pluginInstalled) throw new Error('Plugin not installed');

      const skillDir = makeTmpDir();
      copySkillOnly(skillDir);

      // Add evals.json but NO snapshots
      const evalsDir = path.join(skillDir, 'evals');
      fs.mkdirSync(evalsDir, { recursive: true });
      fs.writeFileSync(
        path.join(evalsDir, 'evals.json'),
        JSON.stringify({
          skill_name: 'greeter',
          generated_by: 'snapeval e2e',
          evals: [{ id: 1, prompt: 'test', expected_output: 'test', files: [], assertions: [] }],
        }),
      );

      const result = invokeCopilotWithPlugin(
        `Check the skill at ${skillDir} for regressions.`,
      );

      // Primary: no corrupt state created
      const snapshotsDir = path.join(skillDir, 'evals', 'snapshots');
      if (fs.existsSync(snapshotsDir)) {
        const files = fs.readdirSync(snapshotsDir);
        const snapFiles = files.filter((f) => f.endsWith('.snap.json'));
        expect(snapFiles.length).toBe(0);
      }

      // Secondary: output mentions baselines/capture needed
      const output = result.stdout.toLowerCase();
      expect(
        output.includes('baseline') ||
        output.includes('capture') ||
        output.includes('no snapshot') ||
        output.includes('not found') ||
        output.includes('first'),
      ).toBe(true);
    });
  });
});
