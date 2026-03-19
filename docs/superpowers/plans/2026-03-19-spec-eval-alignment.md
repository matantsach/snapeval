# snapeval: Align to agentskills.io Spec — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor snapeval to implement the agentskills.io evaluation spec exactly — harness-agnostic eval runner with with/without skill runs, assertion-based grading, and spec-compliant artifacts.

**Architecture:** Replace snapshot/regression model with the spec's comparative eval model. Three CLI commands (init, eval, review). Harness abstraction is the extension point. Inference layer grades assertions. All artifacts match the spec exactly.

**Tech Stack:** TypeScript (strict, ESM), Vitest, commander, chalk

**Spec:** `docs/superpowers/specs/2026-03-19-spec-eval-alignment-design.md`

---

## File Map

### Files to DELETE
- `src/engine/snapshot.ts`
- `src/engine/budget.ts`
- `src/engine/comparison/pipeline.ts`
- `src/engine/comparison/schema.ts`
- `src/engine/comparison/judge.ts`
- `src/engine/comparison/embedding.ts`
- `src/engine/comparison/variance.ts`
- `src/commands/capture.ts`
- `src/commands/check.ts`
- `src/commands/approve.ts`
- `src/commands/report.ts`
- `src/commands/ideate.ts`
- `tests/engine/snapshot.test.ts`
- `tests/engine/budget.test.ts`
- `tests/engine/comparison/schema.test.ts`
- `tests/engine/comparison/judge.test.ts`
- `tests/engine/comparison/embedding.test.ts`
- `tests/engine/comparison/variance.test.ts`
- `tests/engine/comparison/pipeline.test.ts`
- `tests/commands/check.test.ts`
- `tests/commands/report.test.ts`
- `tests/commands/ideate.test.ts`
- `tests/integration.test.ts` (will be rewritten)
- `tests/e2e/copilot-flow.test.ts` (will be rewritten)
- `tests/e2e/plugin-flow.test.ts` (will be rewritten)

### Files to CREATE
- `src/adapters/harness/copilot-cli.ts` — Copilot CLI harness (migrated from skill adapter)
- `src/adapters/harness/resolve.ts` — Harness resolution
- `src/engine/runner.ts` — Orchestrates with/without skill runs, writes outputs + timing
- `src/engine/grader.ts` — LLM + script assertion grading, writes grading.json
- `src/engine/aggregator.ts` — Computes benchmark.json from grading results
- `src/engine/workspace.ts` — Manages workspace dir structure + iteration numbering
- `src/commands/eval.ts` — The `eval` command (run + grade + aggregate)
- `tests/engine/runner.test.ts`
- `tests/engine/grader.test.ts`
- `tests/engine/aggregator.test.ts`
- `tests/engine/workspace.test.ts`
- `tests/adapters/harness/copilot-cli.test.ts`
- `tests/commands/eval.test.ts`
- `tests/commands/review.test.ts` (rewrite)
- `tests/integration.test.ts` (rewrite)

### Files to MODIFY
- `src/types.ts` — Replace old types with spec-aligned types
- `src/config.ts` — New config shape (harness, inference, workspace, runs)
- `src/errors.ts` — Remove NoBaselineError, add new errors
- `src/engine/generator.ts` — Remove assertions from generation, add slug generation, drop `generated_by`
- `src/adapters/report/terminal.ts` — Adapt to new EvalResults shape
- `src/adapters/report/html.ts` — Rewrite for with/without comparison + pattern analysis
- `src/adapters/report/json.ts` — DELETE (artifacts written directly by engine modules)
- `src/commands/init.ts` — Use new config shape, reference harness instead of adapter
- `src/commands/review.ts` — Rewrite to call eval + HTML report + feedback template
- `bin/snapeval.ts` — Three commands only: init, eval, review

---

## Task 1: Clean Slate — Delete Old Modules and Tests

**Files:**
- Delete: all files listed in "Files to DELETE" above
- Delete: `src/adapters/skill/` directory (replaced by `src/adapters/harness/`)
- Delete: `src/adapters/report/json.ts`

- [ ] **Step 1: Delete old engine modules**

```bash
rm -f src/engine/snapshot.ts src/engine/budget.ts
rm -rf src/engine/comparison/
```

- [ ] **Step 2: Delete old commands**

```bash
rm -f src/commands/capture.ts src/commands/check.ts src/commands/approve.ts src/commands/report.ts src/commands/ideate.ts
```

- [ ] **Step 3: Delete old skill adapter directory and JSON reporter**

```bash
rm -rf src/adapters/skill/
rm -f src/adapters/report/json.ts
```

- [ ] **Step 4: Delete all associated tests**

```bash
rm -f tests/engine/snapshot.test.ts tests/engine/budget.test.ts
rm -rf tests/engine/comparison/
rm -f tests/commands/check.test.ts tests/commands/report.test.ts tests/commands/ideate.test.ts
rm -f tests/integration.test.ts
rm -f tests/e2e/copilot-flow.test.ts tests/e2e/plugin-flow.test.ts
rm -f tests/adapters/copilot-cli.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: delete old snapshot/regression modules and tests

Remove snapshot system, comparison pipeline, budget engine, and old
commands (capture, check, approve, report, ideate) to prepare for
agentskills.io spec alignment."
```

---

## Task 2: Rewrite types.ts — Spec-Aligned Type Definitions

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Write failing test for new types**

Create `tests/types.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type {
  HarnessRunResult,
  Harness,
  EvalCase,
  EvalsFile,
  TimingData,
  AssertionResult,
  GradingSummary,
  GradingResult,
  StatEntry,
  RunStats,
  BenchmarkData,
  FeedbackData,
  EvalRunResult,
  EvalResults,
  SnapevalConfig,
} from '../src/types.js';

describe('type definitions compile correctly', () => {
  it('HarnessRunResult has required fields', () => {
    const result: HarnessRunResult = {
      raw: 'output text',
      files: ['chart.png'],
      total_tokens: 500,
      duration_ms: 3000,
    };
    expect(result.raw).toBe('output text');
    expect(result.transcript).toBeUndefined();
  });

  it('EvalCase matches agentskills.io spec', () => {
    const evalCase: EvalCase = {
      id: 1,
      prompt: 'test prompt',
      expected_output: 'expected result',
    };
    expect(evalCase.files).toBeUndefined();
    expect(evalCase.assertions).toBeUndefined();
    expect(evalCase.slug).toBeUndefined();
  });

  it('EvalsFile has no generated_by field', () => {
    const file: EvalsFile = {
      skill_name: 'test',
      evals: [],
    };
    expect(file).not.toHaveProperty('generated_by');
  });

  it('GradingResult matches spec grading.json', () => {
    const grading: GradingResult = {
      assertion_results: [
        { text: 'Has chart', passed: true, evidence: 'Found chart.png' },
      ],
      summary: { passed: 1, failed: 0, total: 1, pass_rate: 1.0 },
    };
    expect(grading.summary.pass_rate).toBe(1.0);
  });

  it('BenchmarkData matches spec benchmark.json', () => {
    const benchmark: BenchmarkData = {
      run_summary: {
        with_skill: {
          pass_rate: { mean: 0.83, stddev: 0.06 },
          time_seconds: { mean: 45.0, stddev: 12.0 },
          tokens: { mean: 3800, stddev: 400 },
        },
        without_skill: {
          pass_rate: { mean: 0.33, stddev: 0.1 },
          time_seconds: { mean: 32.0, stddev: 8.0 },
          tokens: { mean: 2100, stddev: 300 },
        },
        delta: { pass_rate: 0.5, time_seconds: 13.0, tokens: 1700 },
      },
    };
    expect(benchmark.run_summary.delta.pass_rate).toBe(0.5);
  });

  it('SnapevalConfig has new shape', () => {
    const config: SnapevalConfig = {
      harness: 'copilot-cli',
      inference: 'auto',
      workspace: '../{skill_name}-workspace',
      runs: 1,
    };
    expect(config).not.toHaveProperty('adapter');
    expect(config).not.toHaveProperty('budget');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/types.test.ts`
Expected: FAIL — old types don't match new shape

- [ ] **Step 3: Rewrite types.ts**

Replace `src/types.ts` entirely:

```typescript
// === Harness Interface ===

export interface HarnessRunResult {
  raw: string;
  transcript?: string;
  files: string[];
  total_tokens: number;
  duration_ms: number;
}

export interface Harness {
  name: string;
  run(options: {
    skillPath?: string;
    prompt: string;
    files?: string[];
    outputDir: string;
  }): Promise<HarnessRunResult>;
  isAvailable(): Promise<boolean>;
}

// === Inference Interface ===

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json';
}

export interface InferenceAdapter {
  name: string;
  chat(messages: Message[], options?: ChatOptions): Promise<string>;
}

// === Eval Format (agentskills.io) ===

export interface EvalCase {
  id: number;
  prompt: string;
  expected_output: string;
  slug?: string;
  files?: string[];
  assertions?: string[];
}

export interface EvalsFile {
  skill_name: string;
  evals: EvalCase[];
}

// === Artifact Types (match spec exactly) ===

export interface TimingData {
  total_tokens: number;
  duration_ms: number;
}

export interface AssertionResult {
  text: string;
  passed: boolean;
  evidence: string;
}

export interface GradingSummary {
  passed: number;
  failed: number;
  total: number;
  pass_rate: number;
}

export interface GradingResult {
  assertion_results: AssertionResult[];
  summary: GradingSummary;
}

export interface StatEntry {
  mean: number;
  stddev: number;
}

export interface RunStats {
  pass_rate: StatEntry;
  time_seconds: StatEntry;
  tokens: StatEntry;
}

export interface BenchmarkData {
  run_summary: {
    with_skill: RunStats;
    without_skill: RunStats;
    delta: {
      pass_rate: number;
      time_seconds: number;
      tokens: number;
    };
  };
}

export interface FeedbackData {
  [evalSlug: string]: string;
}

// === Eval Pipeline Results ===

export interface EvalRunResult {
  evalId: number;
  slug: string;
  prompt: string;
  withSkill: {
    output: HarnessRunResult;
    grading?: GradingResult;
  };
  withoutSkill: {
    output: HarnessRunResult;
    grading?: GradingResult;
  };
}

export interface EvalResults {
  skillName: string;
  evalRuns: EvalRunResult[];
  benchmark: BenchmarkData;
  iterationDir: string;
}

// === Report Interface ===

export interface ReportAdapter {
  name: string;
  report(results: EvalResults): Promise<void>;
}

// === Config ===

export interface SnapevalConfig {
  harness: string;
  inference: string;
  workspace: string;
  runs: number;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types.ts tests/types.test.ts && git commit -m "feat: rewrite types.ts for agentskills.io spec alignment

New Harness interface replaces SkillAdapter. All artifact types
(GradingResult, BenchmarkData, TimingData) match the spec exactly.
Config uses harness/inference/workspace/runs."
```

---

## Task 3: Update config.ts and errors.ts

**Files:**
- Modify: `src/config.ts`
- Modify: `src/errors.ts`
- Modify: `tests/config.test.ts`

- [ ] **Step 1: Write failing test for new config**

Update `tests/config.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/config.test.ts`
Expected: FAIL — DEFAULT_CONFIG has old fields

- [ ] **Step 3: Update config.ts**

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SnapevalConfig } from './types.js';

export const DEFAULT_CONFIG: SnapevalConfig = {
  harness: 'copilot-cli',
  inference: 'auto',
  workspace: '../{skill_name}-workspace',
  runs: 1,
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
```

- [ ] **Step 4: Update errors.ts**

Remove `NoBaselineError` (no longer needed). Keep the rest. Add `GradingError`:

```typescript
export class SnapevalError extends Error {
  constructor(message: string, public exitCode: number = 2) {
    super(message);
    this.name = 'SnapevalError';
  }
}

export class AdapterNotAvailableError extends SnapevalError {
  constructor(adapterName: string, installHint: string) {
    super(`${adapterName} is not available. ${installHint}`);
    this.name = 'AdapterNotAvailableError';
  }
}

export class RateLimitError extends SnapevalError {
  constructor(adapterName: string) {
    super(`${adapterName} rate limit exceeded. Try again later or use a different adapter.`);
    this.name = 'RateLimitError';
  }
}

export class TimeoutError extends SnapevalError {
  constructor(evalId: number, timeoutMs: number) {
    super(`Eval ${evalId} timed out after ${timeoutMs}ms.`);
    this.name = 'TimeoutError';
  }
}

export class GradingError extends SnapevalError {
  constructor(evalId: number, detail: string) {
    super(`Grading failed for eval ${evalId}: ${detail}`);
    this.name = 'GradingError';
  }
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/config.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/config.ts src/errors.ts tests/config.test.ts && git commit -m "feat: update config and errors for spec alignment

Config now uses harness/inference/workspace/runs. Remove NoBaselineError,
add GradingError."
```

---

## Task 4: Harness Abstraction — copilot-cli Harness

**Files:**
- Create: `src/adapters/harness/copilot-cli.ts`
- Create: `src/adapters/harness/resolve.ts`
- Create: `tests/adapters/harness/copilot-cli.test.ts`

- [ ] **Step 1: Write failing test for CopilotCLIHarness**

Create `tests/adapters/harness/copilot-cli.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CopilotCLIHarness } from '../../../src/adapters/harness/copilot-cli.js';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
  execFileSync: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  copyFileSync: vi.fn(),
}));

import { execFile, execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

describe('CopilotCLIHarness', () => {
  const harness = new CopilotCLIHarness();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has name copilot-cli', () => {
    expect(harness.name).toBe('copilot-cli');
  });

  it('run with skillPath includes SKILL.md in prompt', async () => {
    vi.mocked(readFile).mockResolvedValue('# My Skill\nDo things');
    vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, cb: any) => {
      cb(null, 'skill output', '');
      return {} as any;
    });
    vi.mocked(execFileSync).mockReturnValue('1.0.0');

    const result = await harness.run({
      skillPath: '/path/to/skill',
      prompt: 'test prompt',
      outputDir: '/tmp/out',
    });

    expect(result.raw).toBe('skill output');
    expect(result.total_tokens).toBe(0);
    expect(result.duration_ms).toBeGreaterThanOrEqual(0);
    expect(result.files).toEqual([]);

    // Verify SKILL.md was included in prompt
    const callArgs = vi.mocked(execFile).mock.calls[0];
    const promptArg = callArgs[1]![callArgs[1]!.length - 1] as string;
    expect(promptArg).toContain('# My Skill');
    expect(promptArg).toContain('test prompt');
  });

  it('run without skillPath does not include SKILL.md', async () => {
    vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, cb: any) => {
      cb(null, 'bare output', '');
      return {} as any;
    });
    vi.mocked(execFileSync).mockReturnValue('1.0.0');

    const result = await harness.run({
      prompt: 'test prompt',
      outputDir: '/tmp/out',
    });

    expect(result.raw).toBe('bare output');
    const callArgs = vi.mocked(execFile).mock.calls[0];
    const promptArg = callArgs[1]![callArgs[1]!.length - 1] as string;
    expect(promptArg).not.toContain('SKILL.md');
  });

  it('isAvailable checks copilot --version', async () => {
    vi.mocked(execFileSync).mockReturnValue('1.0.0');
    expect(await harness.isAvailable()).toBe(true);

    vi.mocked(execFileSync).mockImplementation(() => { throw new Error('not found'); });
    expect(await harness.isAvailable()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/adapters/harness/copilot-cli.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement CopilotCLIHarness**

Create `src/adapters/harness/copilot-cli.ts`:

```typescript
import { execFile, execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Harness, HarnessRunResult } from '../../types.js';

export class CopilotCLIHarness implements Harness {
  readonly name = 'copilot-cli';

  async run(options: {
    skillPath?: string;
    prompt: string;
    files?: string[];
    outputDir: string;
  }): Promise<HarnessRunResult> {
    const startMs = Date.now();
    await this.ensureInstalled();

    fs.mkdirSync(options.outputDir, { recursive: true });

    // Copy input files to output dir
    if (options.files) {
      for (const file of options.files) {
        const dest = path.join(options.outputDir, path.basename(file));
        fs.copyFileSync(file, dest);
      }
    }

    // Build prompt: include SKILL.md if skillPath provided
    let finalPrompt = options.prompt;
    if (options.skillPath) {
      try {
        const skillFile = path.join(options.skillPath, 'SKILL.md');
        const skillMd = await readFile(skillFile, { encoding: 'utf-8' });
        finalPrompt = `${skillMd}\n\n${options.prompt}`;
      } catch {
        // No SKILL.md found — run without skill context
      }
    }

    return new Promise<HarnessRunResult>((resolve, reject) => {
      execFile(
        'copilot',
        ['-s', '--no-ask-user', '--allow-all-tools', '--model', 'gpt-4.1', '-p', finalPrompt],
        { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 },
        (error, stdout, _stderr) => {
          if (error) {
            reject(error);
            return;
          }
          const durationMs = Date.now() - startMs;
          resolve({
            raw: stdout.trim(),
            files: [],
            total_tokens: 0,
            duration_ms: durationMs,
          });
        }
      );
    });
  }

  async isAvailable(): Promise<boolean> {
    try {
      execFileSync('copilot', ['--version'], { encoding: 'utf-8', stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  private async ensureInstalled(): Promise<void> {
    if (await this.isAvailable()) return;
    throw new Error(
      'GitHub Copilot CLI is not available. Install with: npm install -g @github/copilot'
    );
  }
}
```

- [ ] **Step 4: Implement harness resolver**

Create `src/adapters/harness/resolve.ts`:

```typescript
import type { Harness } from '../../types.js';
import { CopilotCLIHarness } from './copilot-cli.js';
import { SnapevalError } from '../../errors.js';

export function resolveHarness(name: string): Harness {
  if (name === 'copilot-cli') {
    return new CopilotCLIHarness();
  }
  throw new SnapevalError(
    `Unknown harness "${name}". Built-in options: copilot-cli.`
  );
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/adapters/harness/copilot-cli.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/adapters/harness/ tests/adapters/harness/ && git commit -m "feat: add Harness abstraction with copilot-cli implementation

Harness interface supports run with/without skill and session isolation.
CopilotCLIHarness wraps gh copilot with separate subprocess per run."
```

---

## Task 5: Workspace Manager

**Files:**
- Create: `src/engine/workspace.ts`
- Create: `tests/engine/workspace.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/engine/workspace.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { WorkspaceManager } from '../../src/engine/workspace.js';

describe('WorkspaceManager', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('resolves workspace path from skill dir', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-'));
    const skillDir = path.join(tmpDir, 'my-skill');
    fs.mkdirSync(skillDir);
    const ws = new WorkspaceManager(skillDir);
    expect(ws.workspaceDir).toBe(path.join(tmpDir, 'my-skill-workspace'));
  });

  it('resolves workspace from custom template', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-'));
    const skillDir = path.join(tmpDir, 'csv-analyzer');
    fs.mkdirSync(skillDir);
    const ws = new WorkspaceManager(skillDir, '/tmp/evals/{skill_name}');
    expect(ws.workspaceDir).toBe('/tmp/evals/csv-analyzer');
  });

  it('creates iteration-1 on first call', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-'));
    const skillDir = path.join(tmpDir, 'skill');
    fs.mkdirSync(skillDir);
    const ws = new WorkspaceManager(skillDir);
    const iterDir = ws.createIteration();
    expect(iterDir).toContain('iteration-1');
    expect(fs.existsSync(iterDir)).toBe(true);
  });

  it('increments iteration number', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-'));
    const skillDir = path.join(tmpDir, 'skill');
    fs.mkdirSync(skillDir);
    const ws = new WorkspaceManager(skillDir);
    ws.createIteration();
    const second = ws.createIteration();
    expect(second).toContain('iteration-2');
  });

  it('creates eval run directory structure', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-'));
    const skillDir = path.join(tmpDir, 'skill');
    fs.mkdirSync(skillDir);
    const ws = new WorkspaceManager(skillDir);
    const iterDir = ws.createIteration();
    const evalDir = ws.createEvalDir(iterDir, 'top-months-chart');
    expect(fs.existsSync(path.join(evalDir, 'with_skill', 'outputs'))).toBe(true);
    expect(fs.existsSync(path.join(evalDir, 'without_skill', 'outputs'))).toBe(true);
  });

  it('creates eval dir with old_skill variant', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-'));
    const skillDir = path.join(tmpDir, 'skill');
    fs.mkdirSync(skillDir);
    const ws = new WorkspaceManager(skillDir);
    const iterDir = ws.createIteration();
    const evalDir = ws.createEvalDir(iterDir, 'test', 'old_skill');
    expect(fs.existsSync(path.join(evalDir, 'with_skill', 'outputs'))).toBe(true);
    expect(fs.existsSync(path.join(evalDir, 'old_skill', 'outputs'))).toBe(true);
  });

  it('getEvalSlug uses slug field or falls back to eval-{id}', () => {
    expect(WorkspaceManager.getEvalSlug({ id: 1, slug: 'top-months' } as any)).toBe('eval-top-months');
    expect(WorkspaceManager.getEvalSlug({ id: 3 } as any)).toBe('eval-3');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/workspace.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement workspace.ts**

Create `src/engine/workspace.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/engine/workspace.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/workspace.ts tests/engine/workspace.test.ts && git commit -m "feat: add WorkspaceManager for spec workspace structure

Creates iteration-N/ directories with eval-{slug}/{with_skill,without_skill}/outputs/
per the agentskills.io spec."
```

---

## Task 6: Runner — Orchestrates Harness Runs

**Files:**
- Create: `src/engine/runner.ts`
- Create: `tests/engine/runner.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/engine/runner.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runEval } from '../../src/engine/runner.js';
import type { Harness, HarnessRunResult, EvalCase } from '../../src/types.js';

describe('runEval', () => {
  let tmpDir: string;

  const mockResult: HarnessRunResult = {
    raw: 'test output',
    files: [],
    total_tokens: 500,
    duration_ms: 2000,
  };

  const mockHarness: Harness = {
    name: 'mock',
    run: vi.fn().mockResolvedValue(mockResult),
    isAvailable: vi.fn().mockResolvedValue(true),
  };

  const evalCase: EvalCase = {
    id: 1,
    prompt: 'Analyze this CSV',
    expected_output: 'A chart with labeled axes',
    slug: 'analyze-csv',
  };

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('runs with_skill and without_skill, writes timing.json', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-'));
    const evalDir = path.join(tmpDir, 'eval-analyze-csv');
    fs.mkdirSync(path.join(evalDir, 'with_skill', 'outputs'), { recursive: true });
    fs.mkdirSync(path.join(evalDir, 'without_skill', 'outputs'), { recursive: true });

    const result = await runEval(evalCase, '/path/to/skill', evalDir, mockHarness);

    // Harness called twice: with skill, without skill
    expect(mockHarness.run).toHaveBeenCalledTimes(2);

    // First call: with skillPath
    expect(vi.mocked(mockHarness.run).mock.calls[0][0].skillPath).toBe('/path/to/skill');

    // Second call: without skillPath
    expect(vi.mocked(mockHarness.run).mock.calls[1][0].skillPath).toBeUndefined();

    // timing.json written for both
    const withTiming = JSON.parse(fs.readFileSync(path.join(evalDir, 'with_skill', 'timing.json'), 'utf-8'));
    expect(withTiming).toEqual({ total_tokens: 500, duration_ms: 2000 });

    const withoutTiming = JSON.parse(fs.readFileSync(path.join(evalDir, 'without_skill', 'timing.json'), 'utf-8'));
    expect(withoutTiming).toEqual({ total_tokens: 500, duration_ms: 2000 });

    // raw output saved
    expect(fs.existsSync(path.join(evalDir, 'with_skill', 'outputs', 'output.txt'))).toBe(true);
    expect(fs.existsSync(path.join(evalDir, 'without_skill', 'outputs', 'output.txt'))).toBe(true);

    expect(result.withSkill.output.raw).toBe('test output');
    expect(result.withoutSkill.output.raw).toBe('test output');
  });

  it('writes transcript.log when transcript is available', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-'));
    const evalDir = path.join(tmpDir, 'eval-test');
    fs.mkdirSync(path.join(evalDir, 'with_skill', 'outputs'), { recursive: true });
    fs.mkdirSync(path.join(evalDir, 'without_skill', 'outputs'), { recursive: true });

    const resultWithTranscript: HarnessRunResult = {
      ...mockResult,
      transcript: 'Step 1: Read file\nStep 2: Generate chart',
    };
    vi.mocked(mockHarness.run).mockResolvedValue(resultWithTranscript);

    await runEval(evalCase, '/path/to/skill', evalDir, mockHarness);

    expect(fs.existsSync(path.join(evalDir, 'with_skill', 'transcript.log'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/runner.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement runner.ts**

Create `src/engine/runner.ts`:

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Harness, HarnessRunResult, EvalCase, TimingData } from '../types.js';

interface RunEvalResult {
  evalId: number;
  slug: string;
  prompt: string;
  withSkill: { output: HarnessRunResult };
  withoutSkill: { output: HarnessRunResult };
}

function writeTiming(dir: string, result: HarnessRunResult): void {
  const timing: TimingData = {
    total_tokens: result.total_tokens,
    duration_ms: result.duration_ms,
  };
  fs.writeFileSync(path.join(dir, 'timing.json'), JSON.stringify(timing, null, 2));
}

function writeOutput(dir: string, result: HarnessRunResult): void {
  fs.writeFileSync(path.join(dir, 'outputs', 'output.txt'), result.raw);
  if (result.transcript) {
    fs.writeFileSync(path.join(dir, 'transcript.log'), result.transcript);
  }
}

export async function runEval(
  evalCase: EvalCase,
  skillPath: string,
  evalDir: string,
  harness: Harness,
  oldSkillPath?: string,
): Promise<RunEvalResult> {
  const withSkillDir = path.join(evalDir, 'with_skill');
  const baselineVariant = oldSkillPath ? 'old_skill' : 'without_skill';
  const baselineDir = path.join(evalDir, baselineVariant);

  // Run with skill
  const withSkillResult = await harness.run({
    skillPath,
    prompt: evalCase.prompt,
    files: evalCase.files,
    outputDir: path.join(withSkillDir, 'outputs'),
  });
  writeTiming(withSkillDir, withSkillResult);
  writeOutput(withSkillDir, withSkillResult);

  // Run without skill (or with old skill)
  const baselineResult = await harness.run({
    skillPath: oldSkillPath,
    prompt: evalCase.prompt,
    files: evalCase.files,
    outputDir: path.join(baselineDir, 'outputs'),
  });
  writeTiming(baselineDir, baselineResult);
  writeOutput(baselineDir, baselineResult);

  return {
    evalId: evalCase.id,
    slug: evalCase.slug ?? `${evalCase.id}`,
    prompt: evalCase.prompt,
    withSkill: { output: withSkillResult },
    withoutSkill: { output: baselineResult },
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/engine/runner.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/runner.ts tests/engine/runner.test.ts && git commit -m "feat: add runner module for with/without skill eval runs

Orchestrates dual harness runs per eval case, writes timing.json,
output.txt, and transcript.log to spec workspace structure."
```

---

## Task 7: Grader — Assertion Evaluation

**Files:**
- Create: `src/engine/grader.ts`
- Create: `tests/engine/grader.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/engine/grader.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { gradeAssertions } from '../../src/engine/grader.js';
import type { InferenceAdapter, HarnessRunResult } from '../../src/types.js';

describe('gradeAssertions', () => {
  let tmpDir: string;

  const mockInference: InferenceAdapter = {
    name: 'mock',
    chat: vi.fn(),
  };

  const output: HarnessRunResult = {
    raw: 'Found chart.png in outputs. Chart has X-axis labeled "Month" and Y-axis labeled "Revenue".',
    files: ['chart.png'],
    total_tokens: 500,
    duration_ms: 2000,
  };

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('returns null when no assertions', async () => {
    const result = await gradeAssertions([], output, '/tmp/out', mockInference);
    expect(result).toBeNull();
  });

  it('grades LLM assertions and writes grading.json', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grader-'));

    vi.mocked(mockInference.chat).mockResolvedValue(JSON.stringify({
      results: [
        { text: 'Chart has labeled axes', passed: true, evidence: 'X-axis: Month, Y-axis: Revenue' },
        { text: 'Chart shows 3 months', passed: false, evidence: 'Cannot determine month count from text output' },
      ],
    }));

    const result = await gradeAssertions(
      ['Chart has labeled axes', 'Chart shows 3 months'],
      output,
      tmpDir,
      mockInference
    );

    expect(result).not.toBeNull();
    expect(result!.summary.passed).toBe(1);
    expect(result!.summary.failed).toBe(1);
    expect(result!.summary.total).toBe(2);
    expect(result!.summary.pass_rate).toBe(0.5);
    expect(result!.assertion_results).toHaveLength(2);

    // Writes grading.json
    const written = JSON.parse(fs.readFileSync(path.join(tmpDir, 'grading.json'), 'utf-8'));
    expect(written.summary.total).toBe(2);
  });

  it('handles script: assertions', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grader-'));
    const scriptsDir = path.join(tmpDir, 'scripts');
    fs.mkdirSync(scriptsDir);
    // Create a simple verification script
    const scriptPath = path.join(scriptsDir, 'check-json.sh');
    fs.writeFileSync(scriptPath, '#!/bin/bash\necho "File is valid JSON"\nexit 0', { mode: 0o755 });

    vi.mocked(mockInference.chat).mockResolvedValue(JSON.stringify({
      results: [
        { text: 'Output mentions chart', passed: true, evidence: 'Found "chart.png" in output' },
      ],
    }));

    const result = await gradeAssertions(
      ['Output mentions chart', 'script:check-json.sh'],
      output,
      tmpDir,
      mockInference,
      scriptsDir
    );

    expect(result).not.toBeNull();
    expect(result!.assertion_results).toHaveLength(2);
    // Script assertion ran and passed
    const scriptResult = result!.assertion_results.find(a => a.text === 'script:check-json.sh');
    expect(scriptResult?.passed).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/grader.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement grader.ts**

Create `src/engine/grader.ts`:

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import type {
  InferenceAdapter,
  HarnessRunResult,
  GradingResult,
  AssertionResult,
} from '../types.js';

function buildGradingPrompt(assertions: string[], output: string, files: string[]): string {
  const fileList = files.length > 0 ? `\nFiles produced: ${files.join(', ')}` : '';
  return `You are a strict eval grader. For each assertion, determine PASS or FAIL based on the output below. Require concrete evidence for a PASS — do not give the benefit of the doubt.

OUTPUT:
---
${output}
---${fileList}

ASSERTIONS TO GRADE:
${assertions.map((a, i) => `${i + 1}. ${a}`).join('\n')}

Respond with JSON only:
{
  "results": [
    {"text": "<assertion text>", "passed": true/false, "evidence": "<quote or reference from output>"}
  ]
}`;
}

function runScript(
  scriptName: string,
  outputDir: string,
  scriptsDir: string
): AssertionResult {
  const scriptPath = path.join(scriptsDir, scriptName);
  if (!fs.existsSync(scriptPath)) {
    return { text: `script:${scriptName}`, passed: false, evidence: `Script not found: ${scriptPath}` };
  }
  try {
    const evidence = execFileSync(scriptPath, [outputDir], { encoding: 'utf-8', timeout: 30000 }).trim();
    return { text: `script:${scriptName}`, passed: true, evidence };
  } catch (err: any) {
    const evidence = err.stdout?.trim() || err.message || 'Script exited with non-zero code';
    return { text: `script:${scriptName}`, passed: false, evidence };
  }
}

function extractJSON(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) return match[1].trim();
  return text.trim();
}

export async function gradeAssertions(
  assertions: string[],
  output: HarnessRunResult,
  runDir: string,
  inference: InferenceAdapter,
  scriptsDir?: string,
): Promise<GradingResult | null> {
  if (assertions.length === 0) return null;

  const scriptAssertions = assertions.filter(a => a.startsWith('script:'));
  const llmAssertions = assertions.filter(a => !a.startsWith('script:'));
  const results: AssertionResult[] = [];

  // Grade script assertions
  for (const assertion of scriptAssertions) {
    const scriptName = assertion.slice('script:'.length);
    const outputDir = path.join(runDir, 'outputs');
    const dir = scriptsDir ?? path.join(runDir, '..', '..', '..', 'evals', 'scripts');
    results.push(runScript(scriptName, outputDir, dir));
  }

  // Grade LLM assertions
  if (llmAssertions.length > 0) {
    const prompt = buildGradingPrompt(llmAssertions, output.raw, output.files);
    const response = await inference.chat(
      [{ role: 'user', content: prompt }],
      { temperature: 0, responseFormat: 'json' }
    );
    const parsed = JSON.parse(extractJSON(response));
    for (const r of parsed.results) {
      results.push({ text: r.text, passed: Boolean(r.passed), evidence: r.evidence });
    }
  }

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  const grading: GradingResult = {
    assertion_results: results,
    summary: { passed, failed, total, pass_rate: total > 0 ? passed / total : 0 },
  };

  // Write grading.json
  fs.writeFileSync(path.join(runDir, 'grading.json'), JSON.stringify(grading, null, 2));

  return grading;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/engine/grader.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/grader.ts tests/engine/grader.test.ts && git commit -m "feat: add assertion grader with LLM and script support

Grades assertions per the agentskills.io spec: LLM-based for semantic
checks, script-based for mechanical checks. Writes grading.json."
```

---

## Task 8: Aggregator — Compute benchmark.json

**Files:**
- Create: `src/engine/aggregator.ts`
- Create: `tests/engine/aggregator.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/engine/aggregator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeBenchmark } from '../../src/engine/aggregator.js';
import type { EvalRunResult } from '../../src/types.js';

describe('computeBenchmark', () => {
  it('computes correct delta between with_skill and without_skill', () => {
    const runs: EvalRunResult[] = [
      {
        evalId: 1, slug: 'test-1', prompt: 'test',
        withSkill: {
          output: { raw: '', files: [], total_tokens: 4000, duration_ms: 50000 },
          grading: { assertion_results: [], summary: { passed: 3, failed: 1, total: 4, pass_rate: 0.75 } },
        },
        withoutSkill: {
          output: { raw: '', files: [], total_tokens: 2000, duration_ms: 30000 },
          grading: { assertion_results: [], summary: { passed: 1, failed: 3, total: 4, pass_rate: 0.25 } },
        },
      },
      {
        evalId: 2, slug: 'test-2', prompt: 'test 2',
        withSkill: {
          output: { raw: '', files: [], total_tokens: 3600, duration_ms: 40000 },
          grading: { assertion_results: [], summary: { passed: 4, failed: 0, total: 4, pass_rate: 1.0 } },
        },
        withoutSkill: {
          output: { raw: '', files: [], total_tokens: 2200, duration_ms: 34000 },
          grading: { assertion_results: [], summary: { passed: 2, failed: 2, total: 4, pass_rate: 0.5 } },
        },
      },
    ];

    const benchmark = computeBenchmark(runs);
    const ws = benchmark.run_summary.with_skill;
    const wos = benchmark.run_summary.without_skill;

    expect(ws.pass_rate.mean).toBeCloseTo(0.875); // (0.75 + 1.0) / 2
    expect(wos.pass_rate.mean).toBeCloseTo(0.375); // (0.25 + 0.5) / 2
    expect(benchmark.run_summary.delta.pass_rate).toBeCloseTo(0.5); // 0.875 - 0.375
    expect(ws.tokens.mean).toBeCloseTo(3800);
    expect(wos.tokens.mean).toBeCloseTo(2100);
  });

  it('handles runs without grading (no assertions)', () => {
    const runs: EvalRunResult[] = [
      {
        evalId: 1, slug: 'test', prompt: 'test',
        withSkill: { output: { raw: '', files: [], total_tokens: 1000, duration_ms: 5000 } },
        withoutSkill: { output: { raw: '', files: [], total_tokens: 800, duration_ms: 3000 } },
      },
    ];

    const benchmark = computeBenchmark(runs);
    // No assertions → pass_rate defaults to 0
    expect(benchmark.run_summary.with_skill.pass_rate.mean).toBe(0);
    expect(benchmark.run_summary.delta.tokens).toBeCloseTo(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/aggregator.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement aggregator.ts**

Create `src/engine/aggregator.ts`:

```typescript
import type { EvalRunResult, BenchmarkData, StatEntry } from '../types.js';

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length <= 1) return 0;
  const avg = mean(values);
  const squareDiffs = values.map(v => (v - avg) ** 2);
  return Math.sqrt(mean(squareDiffs));
}

function computeStats(values: number[]): StatEntry {
  return { mean: mean(values), stddev: stddev(values) };
}

export function computeBenchmark(runs: EvalRunResult[]): BenchmarkData {
  const wsPassRates: number[] = [];
  const wsTimeSec: number[] = [];
  const wsTokens: number[] = [];
  const wosPassRates: number[] = [];
  const wosTimeSec: number[] = [];
  const wosTokens: number[] = [];

  for (const run of runs) {
    wsPassRates.push(run.withSkill.grading?.summary.pass_rate ?? 0);
    wsTimeSec.push(run.withSkill.output.duration_ms / 1000);
    wsTokens.push(run.withSkill.output.total_tokens);

    wosPassRates.push(run.withoutSkill.grading?.summary.pass_rate ?? 0);
    wosTimeSec.push(run.withoutSkill.output.duration_ms / 1000);
    wosTokens.push(run.withoutSkill.output.total_tokens);
  }

  const wsStats = {
    pass_rate: computeStats(wsPassRates),
    time_seconds: computeStats(wsTimeSec),
    tokens: computeStats(wsTokens),
  };
  const wosStats = {
    pass_rate: computeStats(wosPassRates),
    time_seconds: computeStats(wosTimeSec),
    tokens: computeStats(wosTokens),
  };

  return {
    run_summary: {
      with_skill: wsStats,
      without_skill: wosStats,
      delta: {
        pass_rate: wsStats.pass_rate.mean - wosStats.pass_rate.mean,
        time_seconds: wsStats.time_seconds.mean - wosStats.time_seconds.mean,
        tokens: wsStats.tokens.mean - wosStats.tokens.mean,
      },
    },
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/engine/aggregator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/aggregator.ts tests/engine/aggregator.test.ts && git commit -m "feat: add benchmark aggregator matching spec benchmark.json

Computes mean/stddev for pass_rate, time_seconds, tokens across
with_skill and without_skill runs with delta."
```

---

## Task 9: Update Generator — No Assertions, Add Slugs

**Files:**
- Modify: `src/engine/generator.ts`
- Modify: `tests/engine/generator.test.ts`

- [ ] **Step 1: Update test**

Rewrite `tests/engine/generator.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { generateEvals, buildGeneratorPrompt } from '../../src/engine/generator.js';
import type { InferenceAdapter } from '../../src/types.js';

describe('generator', () => {
  it('buildGeneratorPrompt does not ask for assertions', () => {
    const prompt = buildGeneratorPrompt('# My Skill\nDo things');
    expect(prompt).toContain('My Skill');
    expect(prompt).not.toContain('"assertions"');
  });

  it('buildGeneratorPrompt asks for slug field', () => {
    const prompt = buildGeneratorPrompt('# My Skill');
    expect(prompt).toContain('slug');
  });

  it('generateEvals returns EvalsFile without generated_by', async () => {
    const mockInference: InferenceAdapter = {
      name: 'mock',
      chat: vi.fn().mockResolvedValue(JSON.stringify({
        skill_name: 'test-skill',
        evals: [
          { id: 1, prompt: 'do thing', expected_output: 'thing done', slug: 'do-thing' },
        ],
      })),
    };

    const result = await generateEvals('# Test Skill', 'test-skill', mockInference);
    expect(result.skill_name).toBe('test-skill');
    expect(result).not.toHaveProperty('generated_by');
    expect(result.evals[0].slug).toBe('do-thing');
    expect(result.evals[0].assertions).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/generator.test.ts`
Expected: FAIL

- [ ] **Step 3: Rewrite generator.ts**

```typescript
import type { InferenceAdapter, EvalsFile } from '../types.js';

export function buildGeneratorPrompt(skillContent: string): string {
  return `You are a test case generator for AI skills. Read the following skill definition and generate 5-8 realistic test scenarios.

SKILL DEFINITION:
---
${skillContent}
---

Generate test scenarios as JSON with this exact format:
{
  "skill_name": "<name from skill>",
  "evals": [
    {
      "id": 1,
      "prompt": "<realistic user prompt that would trigger this skill>",
      "expected_output": "<human-readable description of expected behavior>",
      "slug": "<2-4 word kebab-case label for this test case>"
    }
  ]
}

Requirements:
- Include happy path scenarios (normal use cases)
- Include edge cases (empty input, malformed input, boundary conditions)
- Include at least one negative test (input the skill should handle gracefully)
- Prompts should be realistic — the way a real user would type them
- Do NOT include assertions — those are added later after reviewing outputs
- The slug should be a short, descriptive label (e.g. "formal-greeting", "missing-input")
- Return ONLY the JSON, no markdown wrapping`;
}

function extractJSON(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) return match[1].trim();
  return text.trim();
}

export async function generateEvals(
  skillContent: string,
  skillName: string,
  inference: InferenceAdapter
): Promise<EvalsFile> {
  const prompt = buildGeneratorPrompt(skillContent);
  const response = await inference.chat(
    [{ role: 'user', content: prompt }],
    { temperature: 0.7, responseFormat: 'json' }
  );
  const parsed = JSON.parse(extractJSON(response));
  return {
    skill_name: parsed.skill_name || skillName,
    evals: parsed.evals.map((e: any, i: number) => ({
      id: e.id || i + 1,
      prompt: e.prompt,
      expected_output: e.expected_output || '',
      slug: e.slug,
      files: e.files,
    })),
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/engine/generator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/generator.ts tests/engine/generator.test.ts && git commit -m "feat: update generator to not produce assertions, add slug

Per spec: init generates prompts and expected_output only. Assertions
are added by user after reviewing first outputs."
```

---

## Task 10: Update Inference Adapters — Remove embed()

**Files:**
- Modify: `src/adapters/inference/copilot.ts`
- Modify: `src/adapters/inference/github-models.ts`
- Modify: `src/adapters/inference/resolve.ts`
- Modify: `tests/adapters/copilot.test.ts`
- Modify: `tests/adapters/github-models.test.ts`
- Modify: `tests/adapters/resolve.test.ts`

- [ ] **Step 1: Update copilot.ts — remove embed() and fallback**

```typescript
import { execFileSync } from 'node:child_process';
import type { InferenceAdapter, Message, ChatOptions } from '../../types.js';

export class CopilotInference implements InferenceAdapter {
  readonly name = 'copilot';

  async chat(messages: Message[], _options?: ChatOptions): Promise<string> {
    const prompt = messages.map((m) => m.content).join('\n');
    const result = execFileSync('copilot', ['-s', '--no-ask-user', '--model', 'gpt-4.1', '-p', prompt], { encoding: 'utf-8' });
    return result.trim();
  }
}
```

- [ ] **Step 2: Update github-models.ts — remove embed() and estimateCost()**

Remove the `embed()` method and `estimateCost()`. Keep only `chat()`.

- [ ] **Step 3: Update resolve.ts — simplify fallback logic**

Remove the embedding fallback logic since `embed()` is gone from the interface. The resolver just needs to return a working chat adapter.

- [ ] **Step 4: Update tests to match new interfaces**

Remove all `embed`/`estimateCost` test cases from adapter tests.

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/adapters/copilot.test.ts tests/adapters/github-models.test.ts tests/adapters/resolve.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/adapters/inference/ tests/adapters/ && git commit -m "refactor: simplify inference adapters — remove embed() and estimateCost()

InferenceAdapter now only needs chat(). Embeddings and cost estimation
are not used in the agentskills.io eval flow."
```

---

## Task 11: Eval Command

**Files:**
- Create: `src/commands/eval.ts`
- Create: `tests/commands/eval.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/commands/eval.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { evalCommand } from '../../src/commands/eval.js';
import type { Harness, HarnessRunResult, InferenceAdapter } from '../../src/types.js';

describe('evalCommand', () => {
  let tmpDir: string;

  const mockResult: HarnessRunResult = {
    raw: 'Good day, Eleanor.',
    files: [],
    total_tokens: 100,
    duration_ms: 2000,
  };

  const mockHarness: Harness = {
    name: 'mock',
    run: vi.fn().mockResolvedValue(mockResult),
    isAvailable: vi.fn().mockResolvedValue(true),
  };

  const mockInference: InferenceAdapter = {
    name: 'mock',
    chat: vi.fn().mockResolvedValue(JSON.stringify({
      results: [
        { text: 'Contains Eleanor', passed: true, evidence: 'Found "Eleanor" in output' },
      ],
    })),
  };

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('creates iteration dir and produces all spec artifacts', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-cmd-'));
    const skillDir = path.join(tmpDir, 'greeter');
    fs.mkdirSync(path.join(skillDir, 'evals'), { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Greeter');
    fs.writeFileSync(path.join(skillDir, 'evals', 'evals.json'), JSON.stringify({
      skill_name: 'greeter',
      evals: [
        { id: 1, prompt: 'Greet Eleanor', expected_output: 'Formal greeting', slug: 'greet-eleanor',
          assertions: ['Contains Eleanor'] },
      ],
    }));

    const results = await evalCommand(skillDir, mockHarness, mockInference, {
      workspace: path.join(tmpDir, 'greeter-workspace'),
      runs: 1,
    });

    // Iteration dir created
    expect(results.iterationDir).toContain('iteration-1');

    // timing.json exists for both variants
    const evalDir = path.join(results.iterationDir, 'eval-greet-eleanor');
    expect(fs.existsSync(path.join(evalDir, 'with_skill', 'timing.json'))).toBe(true);
    expect(fs.existsSync(path.join(evalDir, 'without_skill', 'timing.json'))).toBe(true);

    // grading.json exists (assertions were provided)
    expect(fs.existsSync(path.join(evalDir, 'with_skill', 'grading.json'))).toBe(true);

    // benchmark.json exists at iteration level
    expect(fs.existsSync(path.join(results.iterationDir, 'benchmark.json'))).toBe(true);

    // Results have correct structure
    expect(results.skillName).toBe('greeter');
    expect(results.evalRuns).toHaveLength(1);
    expect(results.benchmark.run_summary.delta).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/commands/eval.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement eval.ts**

Create `src/commands/eval.ts`:

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  Harness,
  InferenceAdapter,
  EvalsFile,
  EvalResults,
  EvalRunResult,
} from '../types.js';
import { WorkspaceManager } from '../engine/workspace.js';
import { runEval } from '../engine/runner.js';
import { gradeAssertions } from '../engine/grader.js';
import { computeBenchmark } from '../engine/aggregator.js';
import { SnapevalError } from '../errors.js';

export async function evalCommand(
  skillPath: string,
  harness: Harness,
  inference: InferenceAdapter,
  options: { workspace?: string; runs?: number; oldSkill?: string }
): Promise<EvalResults> {
  const evalsPath = path.join(skillPath, 'evals', 'evals.json');
  if (!fs.existsSync(evalsPath)) {
    throw new SnapevalError(`No evals.json found at ${evalsPath}. Run \`snapeval init\` first.`);
  }

  const evalsFile: EvalsFile = JSON.parse(fs.readFileSync(evalsPath, 'utf-8'));
  const ws = new WorkspaceManager(skillPath, options.workspace);
  const iterationDir = ws.createIteration();
  const runs = options.runs ?? 1;
  const baselineVariant = options.oldSkill ? 'old_skill' : 'without_skill';
  const scriptsDir = path.join(skillPath, 'evals', 'scripts');

  const evalRuns: EvalRunResult[] = [];

  for (const evalCase of evalsFile.evals) {
    const slug = WorkspaceManager.getEvalSlug(evalCase).replace('eval-', '');
    const evalDir = ws.createEvalDir(iterationDir, slug, baselineVariant);

    // Run N times (for statistical significance)
    // For now, we use the last run's results. Multi-run aggregation is a future enhancement.
    let lastRun: Awaited<ReturnType<typeof runEval>> | null = null;
    for (let i = 0; i < runs; i++) {
      lastRun = await runEval(evalCase, skillPath, evalDir, harness, options.oldSkill);
    }

    if (!lastRun) continue;

    // Grade assertions if present
    const assertions = evalCase.assertions ?? [];
    const withSkillGrading = await gradeAssertions(
      assertions,
      lastRun.withSkill.output,
      path.join(evalDir, 'with_skill'),
      inference,
      fs.existsSync(scriptsDir) ? scriptsDir : undefined,
    );
    const withoutSkillGrading = await gradeAssertions(
      assertions,
      lastRun.withoutSkill.output,
      path.join(evalDir, baselineVariant),
      inference,
      fs.existsSync(scriptsDir) ? scriptsDir : undefined,
    );

    evalRuns.push({
      evalId: evalCase.id,
      slug,
      prompt: evalCase.prompt,
      withSkill: {
        output: lastRun.withSkill.output,
        grading: withSkillGrading ?? undefined,
      },
      withoutSkill: {
        output: lastRun.withoutSkill.output,
        grading: withoutSkillGrading ?? undefined,
      },
    });
  }

  const benchmark = computeBenchmark(evalRuns);

  // Write benchmark.json
  fs.writeFileSync(
    path.join(iterationDir, 'benchmark.json'),
    JSON.stringify(benchmark, null, 2)
  );

  return {
    skillName: evalsFile.skill_name,
    evalRuns,
    benchmark,
    iterationDir,
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/commands/eval.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/commands/eval.ts tests/commands/eval.test.ts && git commit -m "feat: add eval command — run + grade + aggregate pipeline

Core command implementing the agentskills.io eval workflow: dual harness
runs, assertion grading, benchmark aggregation."
```

---

## Task 12: Update Init Command

**Files:**
- Modify: `src/commands/init.ts`
- Modify: `tests/commands/init.test.ts`

- [ ] **Step 1: Update init.ts to use new types**

The init command is mostly the same but references the new generator (no assertions, no `generated_by`). Minimal changes needed:

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { InferenceAdapter } from '../types.js';
import { generateEvals } from '../engine/generator.js';
import { SnapevalError } from '../errors.js';

export async function initCommand(
  skillPath: string,
  inference: InferenceAdapter
): Promise<void> {
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
```

- [ ] **Step 2: Update test**

Update `tests/commands/init.test.ts` to verify no `generated_by` in output and no assertions.

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/commands/init.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/commands/init.ts tests/commands/init.test.ts && git commit -m "refactor: update init command for spec alignment

Uses updated generator that produces no assertions and no generated_by."
```

---

## Task 13: Rewrite Review Command

**Files:**
- Modify: `src/commands/review.ts`
- Modify: `tests/commands/review.test.ts`

- [ ] **Step 1: Write failing test**

Rewrite `tests/commands/review.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { reviewCommand } from '../../src/commands/review.js';
import type { Harness, HarnessRunResult, InferenceAdapter, EvalResults, BenchmarkData } from '../../src/types.js';

// Mock eval command
vi.mock('../../src/commands/eval.js', () => ({
  evalCommand: vi.fn(),
}));

// Mock open browser
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

import { evalCommand } from '../../src/commands/eval.js';

describe('reviewCommand', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('calls eval, generates HTML report, creates feedback template', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-'));
    const iterDir = path.join(tmpDir, 'iteration-1');
    fs.mkdirSync(iterDir, { recursive: true });

    const mockBenchmark: BenchmarkData = {
      run_summary: {
        with_skill: { pass_rate: { mean: 0.75, stddev: 0 }, time_seconds: { mean: 5, stddev: 0 }, tokens: { mean: 500, stddev: 0 } },
        without_skill: { pass_rate: { mean: 0.25, stddev: 0 }, time_seconds: { mean: 3, stddev: 0 }, tokens: { mean: 300, stddev: 0 } },
        delta: { pass_rate: 0.5, time_seconds: 2, tokens: 200 },
      },
    };

    const mockResults: EvalResults = {
      skillName: 'test',
      evalRuns: [{
        evalId: 1, slug: 'test-eval', prompt: 'test',
        withSkill: { output: { raw: 'with', files: [], total_tokens: 500, duration_ms: 5000 } },
        withoutSkill: { output: { raw: 'without', files: [], total_tokens: 300, duration_ms: 3000 } },
      }],
      benchmark: mockBenchmark,
      iterationDir: iterDir,
    };

    vi.mocked(evalCommand).mockResolvedValue(mockResults);

    const mockHarness: Harness = { name: 'mock', run: vi.fn(), isAvailable: vi.fn() };
    const mockInference: InferenceAdapter = { name: 'mock', chat: vi.fn() };

    await reviewCommand('/skill', mockHarness, mockInference, {
      workspace: tmpDir,
      runs: 1,
    });

    // HTML report generated
    expect(fs.existsSync(path.join(iterDir, 'report.html'))).toBe(true);

    // feedback.json template generated
    const feedback = JSON.parse(fs.readFileSync(path.join(iterDir, 'feedback.json'), 'utf-8'));
    expect(feedback['eval-test-eval']).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/commands/review.test.ts`
Expected: FAIL

- [ ] **Step 3: Rewrite review.ts**

```typescript
import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import type { Harness, InferenceAdapter, FeedbackData } from '../types.js';
import { evalCommand } from './eval.js';
import { HTMLReporter } from '../adapters/report/html.js';
import { TerminalReporter } from '../adapters/report/terminal.js';

export async function reviewCommand(
  skillPath: string,
  harness: Harness,
  inference: InferenceAdapter,
  options: { workspace?: string; runs?: number; oldSkill?: string; noOpen?: boolean }
): Promise<void> {
  const results = await evalCommand(skillPath, harness, inference, options);

  // Terminal summary
  const terminal = new TerminalReporter();
  await terminal.report(results);

  // HTML report
  const htmlReporter = new HTMLReporter(results.iterationDir);
  await htmlReporter.report(results);

  // feedback.json template
  const feedback: FeedbackData = {};
  for (const run of results.evalRuns) {
    feedback[`eval-${run.slug}`] = '';
  }
  fs.writeFileSync(
    path.join(results.iterationDir, 'feedback.json'),
    JSON.stringify(feedback, null, 2)
  );

  // Open in browser
  if (!options.noOpen) {
    const reportPath = path.join(results.iterationDir, 'report.html');
    openInBrowser(reportPath);
  }
}

function openInBrowser(filePath: string): void {
  const cmd =
    process.platform === 'darwin' ? 'open' :
    process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args =
    process.platform === 'win32' ? ['/c', 'start', '', filePath] : [filePath];
  execFile(cmd, args, (err) => {
    if (err) console.warn(`Could not open browser: ${err.message}`);
  });
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/commands/review.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/commands/review.ts tests/commands/review.test.ts && git commit -m "feat: rewrite review command — eval + HTML report + feedback template

Review runs the full eval pipeline, generates an HTML report, creates
a template feedback.json, and opens the report in the browser."
```

---

## Task 14: Update Report Adapters (Terminal + HTML)

**Files:**
- Modify: `src/adapters/report/terminal.ts`
- Modify: `src/adapters/report/html.ts`
- Modify: `tests/adapters/terminal.test.ts`
- Modify: `tests/adapters/html.test.ts`

- [ ] **Step 1: Rewrite terminal.ts for new EvalResults shape**

The terminal reporter now shows per-eval pass rates for with_skill vs without_skill, plus the benchmark delta:

```typescript
import chalk from 'chalk';
import type { ReportAdapter, EvalResults } from '../../types.js';

export class TerminalReporter implements ReportAdapter {
  readonly name = 'terminal';

  async report(results: EvalResults): Promise<void> {
    const { skillName, evalRuns, benchmark } = results;

    console.log(chalk.bold(`\nsnapeval — ${skillName}`));
    console.log(chalk.dim('─'.repeat(50)));

    for (const run of evalRuns) {
      const wsRate = run.withSkill.grading?.summary.pass_rate;
      const wosRate = run.withoutSkill.grading?.summary.pass_rate;
      const wsLabel = wsRate !== undefined ? `${(wsRate * 100).toFixed(0)}%` : 'n/a';
      const wosLabel = wosRate !== undefined ? `${(wosRate * 100).toFixed(0)}%` : 'n/a';
      const tokens = run.withSkill.output.total_tokens;
      const durationS = (run.withSkill.output.duration_ms / 1000).toFixed(2);
      console.log(`  ${chalk.cyan(`#${run.evalId}`)} ${run.prompt.slice(0, 60)}`);
      console.log(`    with_skill: ${wsLabel} | without_skill: ${wosLabel} | ${tokens} tokens, ${durationS}s`);
    }

    console.log(chalk.dim('─'.repeat(50)));

    const delta = benchmark.run_summary.delta;
    const deltaColor = delta.pass_rate > 0 ? chalk.green : delta.pass_rate < 0 ? chalk.red : chalk.dim;
    console.log(`Delta: ${deltaColor(`${(delta.pass_rate * 100).toFixed(1)}% pass rate`)} | ${delta.time_seconds.toFixed(1)}s time | ${delta.tokens.toFixed(0)} tokens`);
    console.log(chalk.dim(`with_skill avg: ${(benchmark.run_summary.with_skill.pass_rate.mean * 100).toFixed(1)}% | without_skill avg: ${(benchmark.run_summary.without_skill.pass_rate.mean * 100).toFixed(1)}%`));
  }
}
```

- [ ] **Step 2: Rewrite html.ts for new data model**

The HTML reporter needs to show with_skill vs without_skill comparison, assertion results, and pattern analysis flags. This is a significant rewrite — update `buildViewerData` and `buildHtml` to use `EvalResults` instead of the old types. The HTML structure should show:
- Side-by-side outputs (with_skill vs without_skill)
- Per-eval assertion pass/fail with evidence
- Benchmark delta stats
- Pattern flags (always-pass, always-fail, differentiating)

Remove old `ViewerData`/`ViewerScenario` types from types.ts (they were removed in Task 2).

Update the `HTMLReporter` constructor to take just `outputDir` (no iteration number — it gets that from the path).

- [ ] **Step 3: Update tests**

Update `tests/adapters/terminal.test.ts` and `tests/adapters/html.test.ts` to use new `EvalResults` shape.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/adapters/terminal.test.ts tests/adapters/html.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/adapters/report/ tests/adapters/ && git commit -m "feat: rewrite terminal and HTML reporters for spec data model

Terminal shows per-eval with/without skill rates and benchmark delta.
HTML shows side-by-side outputs, assertion results, and pattern flags."
```

---

## Task 15: Rewrite CLI Entry Point

**Files:**
- Modify: `bin/snapeval.ts`

- [ ] **Step 1: Rewrite bin/snapeval.ts**

Three commands only: `init`, `eval`, `review`.

```typescript
#!/usr/bin/env tsx
import { Command } from 'commander';
import { resolveConfig } from '../src/config.js';
import { resolveInference } from '../src/adapters/inference/resolve.js';
import { resolveHarness } from '../src/adapters/harness/resolve.js';
import { initCommand } from '../src/commands/init.js';
import { evalCommand } from '../src/commands/eval.js';
import { reviewCommand } from '../src/commands/review.js';
import { TerminalReporter } from '../src/adapters/report/terminal.js';
import { SnapevalError } from '../src/errors.js';
import * as path from 'node:path';

const program = new Command();

program
  .name('snapeval')
  .description('Harness-agnostic eval runner for agentskills.io skills')
  .version('2.0.0');

// --- init ---
program
  .command('init')
  .description('Generate evals.json from SKILL.md (prompts + expected outputs, no assertions)')
  .option('--harness <harness>', 'Harness to use')
  .option('--inference <inference>', 'Inference adapter to use')
  .option('--verbose', 'Verbose output')
  .argument('[skill-dir]', 'Path to skill directory', process.cwd())
  .action(async (skillDir: string, opts: Record<string, string | boolean>) => {
    try {
      const skillPath = path.resolve(skillDir);
      const config = resolveConfig(
        { harness: opts.harness as string, inference: opts.inference as string },
        process.cwd(), skillPath
      );
      const inference = resolveInference(config.inference);
      await initCommand(skillPath, inference);
      console.log(`Generated evals at ${path.join(skillPath, 'evals', 'evals.json')}`);
      process.exit(0);
    } catch (err) { handleError(err); }
  });

// --- eval ---
program
  .command('eval')
  .description('Run evals (with/without skill), grade assertions, compute benchmark')
  .option('--harness <harness>', 'Harness to use')
  .option('--inference <inference>', 'Inference adapter to use')
  .option('--workspace <path>', 'Workspace directory')
  .option('--runs <n>', 'Runs per eval for statistical significance', '1')
  .option('--old-skill <path>', 'Compare against old skill version instead of no-skill')
  .option('--verbose', 'Verbose output')
  .argument('[skill-dir]', 'Path to skill directory', process.cwd())
  .action(async (skillDir: string, opts: Record<string, string | boolean>) => {
    try {
      const skillPath = path.resolve(skillDir);
      const config = resolveConfig(
        {
          harness: opts.harness as string,
          inference: opts.inference as string,
          workspace: opts.workspace as string,
          runs: opts.runs ? parseInt(opts.runs as string, 10) : undefined,
        },
        process.cwd(), skillPath
      );
      const harness = resolveHarness(config.harness);
      const inference = resolveInference(config.inference);

      const results = await evalCommand(skillPath, harness, inference, {
        workspace: config.workspace,
        runs: config.runs,
        oldSkill: opts['old-skill'] as string | undefined,
      });

      const terminal = new TerminalReporter();
      await terminal.report(results);
      console.log(`Results at ${results.iterationDir}`);
      process.exit(0);
    } catch (err) { handleError(err); }
  });

// --- review ---
program
  .command('review')
  .description('Run eval + generate HTML report + open in browser')
  .option('--harness <harness>', 'Harness to use')
  .option('--inference <inference>', 'Inference adapter to use')
  .option('--workspace <path>', 'Workspace directory')
  .option('--runs <n>', 'Runs per eval for statistical significance', '1')
  .option('--old-skill <path>', 'Compare against old skill version instead of no-skill')
  .option('--no-open', 'Do not open browser')
  .option('--verbose', 'Verbose output')
  .argument('[skill-dir]', 'Path to skill directory', process.cwd())
  .action(async (skillDir: string, opts: Record<string, string | boolean>) => {
    try {
      const skillPath = path.resolve(skillDir);
      const config = resolveConfig(
        {
          harness: opts.harness as string,
          inference: opts.inference as string,
          workspace: opts.workspace as string,
          runs: opts.runs ? parseInt(opts.runs as string, 10) : undefined,
        },
        process.cwd(), skillPath
      );
      const harness = resolveHarness(config.harness);
      const inference = resolveInference(config.inference);

      await reviewCommand(skillPath, harness, inference, {
        workspace: config.workspace,
        runs: config.runs,
        oldSkill: opts['old-skill'] as string | undefined,
        noOpen: Boolean(opts['no-open']),
      });
      process.exit(0);
    } catch (err) { handleError(err); }
  });

// --- helpers ---

function handleError(err: unknown): never {
  if (err instanceof SnapevalError) {
    console.error(`Error: ${err.message}`);
    process.exit(err.exitCode ?? 2);
  }
  if (err instanceof Error) {
    console.error(`Error: ${err.message}`);
    process.exit(2);
  }
  console.error('An unknown error occurred.');
  process.exit(2);
}

program.parse(process.argv);
```

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add bin/snapeval.ts && git commit -m "feat: rewrite CLI — three commands: init, eval, review

Replaces six old commands with three spec-aligned commands.
init generates evals.json, eval runs the pipeline, review adds
HTML report and feedback template."
```

---

## Task 16: Integration Test

**Files:**
- Create: `tests/integration.test.ts`

- [ ] **Step 1: Write integration test**

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { initCommand } from '../src/commands/init.js';
import { evalCommand } from '../src/commands/eval.js';
import type { Harness, HarnessRunResult, InferenceAdapter } from '../src/types.js';

describe('Full workflow: init → eval', () => {
  let tmpDir: string;

  const mockInference: InferenceAdapter = {
    name: 'mock',
    chat: vi.fn(),
  };

  const mockResult: HarnessRunResult = {
    raw: 'Good day, Eleanor. It is a pleasure to make your acquaintance.',
    files: [],
    total_tokens: 100,
    duration_ms: 2000,
  };

  const mockHarness: Harness = {
    name: 'mock',
    run: vi.fn().mockResolvedValue(mockResult),
    isAvailable: vi.fn().mockResolvedValue(true),
  };

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('init generates evals.json, eval produces all spec artifacts', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapeval-integ-'));
    const skillDir = path.join(tmpDir, 'greeter');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Greeter\nGreets people formally');

    // Mock inference for init
    vi.mocked(mockInference.chat).mockResolvedValueOnce(JSON.stringify({
      skill_name: 'greeter',
      evals: [
        { id: 1, prompt: 'Greet Eleanor formally', expected_output: 'Formal greeting', slug: 'greet-eleanor' },
        { id: 2, prompt: 'Hey there', expected_output: 'Default greeting', slug: 'casual-greeting' },
      ],
    }));

    // Init
    await initCommand(skillDir, mockInference);
    const evalsPath = path.join(skillDir, 'evals', 'evals.json');
    expect(fs.existsSync(evalsPath)).toBe(true);
    const evalsFile = JSON.parse(fs.readFileSync(evalsPath, 'utf-8'));
    expect(evalsFile).not.toHaveProperty('generated_by');
    expect(evalsFile.evals).toHaveLength(2);

    // Add assertions manually (simulating user adding after first run)
    evalsFile.evals[0].assertions = ['Output contains "Eleanor"'];
    fs.writeFileSync(evalsPath, JSON.stringify(evalsFile, null, 2));

    // Mock inference for grading
    vi.mocked(mockInference.chat).mockResolvedValue(JSON.stringify({
      results: [
        { text: 'Output contains "Eleanor"', passed: true, evidence: 'Found "Eleanor" in output' },
      ],
    }));

    // Eval
    const workspaceDir = path.join(tmpDir, 'greeter-workspace');
    const results = await evalCommand(skillDir, mockHarness, mockInference, {
      workspace: workspaceDir,
      runs: 1,
    });

    // Verify workspace structure
    expect(results.iterationDir).toContain('iteration-1');
    expect(fs.existsSync(path.join(results.iterationDir, 'benchmark.json'))).toBe(true);

    // Verify per-eval artifacts
    const evalDir1 = path.join(results.iterationDir, 'eval-greet-eleanor');
    expect(fs.existsSync(path.join(evalDir1, 'with_skill', 'timing.json'))).toBe(true);
    expect(fs.existsSync(path.join(evalDir1, 'without_skill', 'timing.json'))).toBe(true);
    expect(fs.existsSync(path.join(evalDir1, 'with_skill', 'grading.json'))).toBe(true);
    expect(fs.existsSync(path.join(evalDir1, 'with_skill', 'outputs', 'output.txt'))).toBe(true);

    // Verify benchmark
    const benchmark = JSON.parse(fs.readFileSync(path.join(results.iterationDir, 'benchmark.json'), 'utf-8'));
    expect(benchmark.run_summary).toHaveProperty('with_skill');
    expect(benchmark.run_summary).toHaveProperty('without_skill');
    expect(benchmark.run_summary).toHaveProperty('delta');

    // Verify results object
    expect(results.evalRuns).toHaveLength(2);
    expect(results.skillName).toBe('greeter');
    expect(results.evalRuns[0].withSkill.grading?.summary.passed).toBe(1);
  });
});
```

- [ ] **Step 2: Run integration test**

Run: `npx vitest run tests/integration.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/integration.test.ts && git commit -m "test: add integration test for init → eval workflow

Tests the full pipeline: init generates evals.json, user adds assertions,
eval produces all spec artifacts in correct workspace structure."
```

---

## Task 17: Update package.json and CLAUDE.md

**Files:**
- Modify: `package.json`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update package.json description**

Change description to: `"Harness-agnostic eval runner for agentskills.io skills"`. Bump version to `2.0.0`.

- [ ] **Step 2: Update CLAUDE.md**

Update the Architecture section, Core Flow, commands documentation, and module descriptions to reflect the new three-command CLI, harness abstraction, and eval pipeline.

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add package.json CLAUDE.md && git commit -m "docs: update package.json and CLAUDE.md for v2.0.0

New description, version bump, and documentation reflecting the
agentskills.io spec-aligned architecture."
```

---

## Task 18: Clean Up — Remove Dead References

- [ ] **Step 1: Search for any remaining references to deleted modules**

```bash
grep -r "snapshot\|comparePipeline\|schemaCheck\|llmJudge\|BudgetEngine\|NoBaselineError\|captureCommand\|checkCommand\|approveCommand\|reportCommand\|ideateCommand\|SkillAdapter\|SkillOutput\|ViewerData\|ViewerScenario\|ComparisonVerdict\|ComparisonResult\|VarianceEnvelope\|generated_by" src/ bin/ tests/ --include='*.ts' -l
```

- [ ] **Step 2: Fix any remaining references**

Update or remove any imports, type references, or code that still references deleted modules.

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 4: Run TypeScript compilation**

Run: `npm run build`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: clean up dead references to removed modules"
```

---

## Task 19: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: ALL PASS

- [ ] **Step 2: Run TypeScript build**

Run: `npm run build`
Expected: Clean compilation

- [ ] **Step 3: Verify CLI help works**

Run: `npx tsx bin/snapeval.ts --help`
Expected: Shows three commands: init, eval, review

Run: `npx tsx bin/snapeval.ts eval --help`
Expected: Shows --harness, --inference, --workspace, --runs, --old-skill, --verbose flags

- [ ] **Step 4: Verify spec artifact formats**

Manually inspect the test workspace from the integration test to confirm:
- `timing.json` matches `{"total_tokens": N, "duration_ms": N}`
- `grading.json` matches `{"assertion_results": [...], "summary": {...}}`
- `benchmark.json` matches `{"run_summary": {"with_skill": ..., "without_skill": ..., "delta": ...}}`

- [ ] **Step 5: Final commit if needed**

```bash
git add -A && git commit -m "chore: final verification pass"
```
