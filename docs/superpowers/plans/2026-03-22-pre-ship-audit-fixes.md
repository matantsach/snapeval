# Pre-Ship Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 42 issues identified in the pre-ship codebase audit, delivered as two PRs: breaking changes (`feat!:`) then bug fixes (`fix:`).

**Architecture:** Two-PR strategy separated by semver boundary. PR 1 removes the `review` command, `--verbose` flag, and `CopilotInference` adapter while fixing the `bin` entry point. PR 2 fixes SDK harness bugs, cleans dead code, backfills tests, and hardens E2E.

**Tech Stack:** TypeScript, Vitest, Commander, @github/copilot-sdk

**Spec:** `docs/superpowers/specs/2026-03-22-pre-ship-audit-fixes-design.md`

---

## PR 1: Breaking Changes

### Task 1: Remove `review` command and add `--feedback` to `eval`

**Files:**
- Delete: `src/commands/review.ts`
- Delete: `tests/commands/review.test.ts`
- Modify: `bin/snapeval.ts`
- Modify: `src/commands/eval.ts`

- [ ] **Step 1: Delete `src/commands/review.ts` and `tests/commands/review.test.ts`**

```bash
rm src/commands/review.ts tests/commands/review.test.ts
```

- [ ] **Step 2: Remove review command from `bin/snapeval.ts`**

Remove lines 16 (`import { reviewCommand }`), and the entire `// --- review ---` block (lines 90-128). Also remove `--verbose` from the eval command (line 41).

The eval command block (lines 29-88) stays. The file should have these imports after cleanup:

```typescript
import { Command } from 'commander';
import { resolveConfig } from '../src/config.js';
import { resolveInference } from '../src/adapters/inference/resolve.js';
import { resolveHarness } from '../src/adapters/harness/resolve.js';
import { evalCommand } from '../src/commands/eval.js';
import { TerminalReporter } from '../src/adapters/report/terminal.js';
import { SnapevalError } from '../src/errors.js';
import { stopClient } from '../src/adapters/copilot-sdk-client.js';
import * as path from 'node:path';
```

- [ ] **Step 3: Add `--feedback` flag to eval command in `bin/snapeval.ts`**

Add after `--old-skill` option (line 40):

```typescript
.option('--feedback', 'Write feedback.json template for human review')
```

Pass it to `evalCommand`:

```typescript
const results = await evalCommand(skillPath, harness, inference, {
  workspace: config.workspace,
  runs: config.runs,
  concurrency: config.concurrency,
  only,
  threshold,
  oldSkill: opts.oldSkill as string | undefined,
  feedback: opts.feedback as boolean | undefined,
});
```

- [ ] **Step 4: Add feedback.json logic to `src/commands/eval.ts`**

Add `FeedbackData` to the import from `../types.js`:

```typescript
import type {
  Harness,
  InferenceAdapter,
  EvalsFile,
  EvalResults,
  EvalRunResult,
  GradingResult,
  FeedbackData,
} from '../types.js';
```

Add `feedback?: boolean` to the options parameter of `evalCommand` (line 89).

After the benchmark is written (after line 225), add:

```typescript
  // Write feedback template if requested
  if (options.feedback) {
    const feedback: FeedbackData = {};
    for (const run of evalRuns) {
      feedback[`eval-${run.slug}`] = '';
    }
    fs.writeFileSync(
      path.join(iterationDir, 'feedback.json'),
      JSON.stringify(feedback, null, 2)
    );
  }
```

- [ ] **Step 5: Run tests to verify nothing broke**

Run: `npm test`
Expected: All existing tests pass (review.test.ts is deleted so its tests are gone).

- [ ] **Step 6: Commit**

```bash
git add -u src/commands/review.ts tests/commands/review.test.ts bin/snapeval.ts src/commands/eval.ts
git commit -m "feat!: remove review command, add --feedback flag to eval

BREAKING CHANGE: The review command has been removed. Use eval --feedback
to generate a feedback.json template for human review."
```

---

### Task 2: Remove `CopilotInference` adapter and update inference resolution

**Files:**
- Delete: `src/adapters/inference/copilot.ts`
- Delete: `tests/adapters/copilot.test.ts`
- Modify: `src/adapters/inference/resolve.ts`

- [ ] **Step 1: Delete CLI-based inference adapter and its test**

```bash
rm src/adapters/inference/copilot.ts tests/adapters/copilot.test.ts
```

- [ ] **Step 2: Rewrite `src/adapters/inference/resolve.ts`**

Replace the entire file with:

```typescript
import type { InferenceAdapter } from '../../types.js';
import { AdapterNotAvailableError } from '../../errors.js';
import { GitHubModelsInference } from './github-models.js';
import { CopilotSDKInference } from './copilot-sdk.js';

function isGitHubTokenAvailable(): boolean {
  return Boolean(process.env.GITHUB_TOKEN);
}

export function resolveInference(preference: string): InferenceAdapter {
  if (preference === 'auto') {
    return new CopilotSDKInference();
  }

  if (preference === 'copilot') {
    throw new AdapterNotAvailableError(
      'copilot',
      'The copilot CLI inference adapter has been removed. Use --inference copilot-sdk instead.'
    );
  }

  if (preference === 'copilot-sdk') {
    return new CopilotSDKInference();
  }

  if (preference === 'github-models') {
    if (!isGitHubTokenAvailable()) {
      throw new AdapterNotAvailableError(
        'github-models',
        'GITHUB_TOKEN environment variable is not set.'
      );
    }
    return new GitHubModelsInference();
  }

  throw new AdapterNotAvailableError(
    preference,
    `Unknown inference adapter "${preference}". Valid options: auto, copilot-sdk, github-models.`
  );
}
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: `tests/adapters/resolve.test.ts` will FAIL because it tests `CopilotInference` and `isCopilotAvailable`. That's expected — Task 4 (next task, still in PR 1) rewrites these tests.

- [ ] **Step 4: Commit**

```bash
git add -u src/adapters/inference/copilot.ts tests/adapters/copilot.test.ts src/adapters/inference/resolve.ts
git commit -m "feat!: remove CopilotInference, make SDK the default inference adapter

BREAKING CHANGE: --inference copilot is no longer supported. Use copilot-sdk (now the default)."
```

---

### Task 3: Fix `bin` field and CLI version

**Files:**
- Modify: `package.json`
- Modify: `bin/snapeval.ts`

- [ ] **Step 1: Change shebang in `bin/snapeval.ts`**

Change line 1 from:
```
#!/usr/bin/env tsx
```
to:
```
#!/usr/bin/env node
```

- [ ] **Step 2: Read version dynamically in `bin/snapeval.ts`**

Replace the hardcoded version (line 27) `.version('2.0.0')`. Use `../package.json` relative path, which works from both `bin/` (dev mode) and `dist/bin/` (compiled) because the build script copies `package.json` into `dist/`:

```typescript
import { readFileSync } from 'node:fs';
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
```

- From `bin/snapeval.ts`: `../package.json` → `evaluator/package.json` ✓
- From `dist/bin/snapeval.js`: `../package.json` → `dist/package.json` ✓ (copied by build script)

Add the import near the top (merge `readFileSync` into the existing `node:fs` import if present), then use:
```typescript
.version(pkg.version);
```

- [ ] **Step 3: Fix `bin` field in `package.json`**

Change:
```json
"bin": {
  "snapeval": "./bin/snapeval.ts"
}
```
to:
```json
"bin": {
  "snapeval": "./dist/bin/snapeval.js"
}
```

- [ ] **Step 4: Build and verify**

Run: `npm run build && node dist/bin/snapeval.js --version`
Expected: Prints the version from package.json (currently `2.2.0`)

- [ ] **Step 5: Commit**

```bash
git add bin/snapeval.ts package.json
git commit -m "fix: point bin to compiled JS and read version from package.json"
```

---

### Task 4: Update resolve.test.ts for new inference resolution

**Files:**
- Modify: `tests/adapters/resolve.test.ts`

- [ ] **Step 1: Rewrite `tests/adapters/resolve.test.ts`**

The old tests test `CopilotInference` and `isCopilotAvailable` which no longer exist. Replace with:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AdapterNotAvailableError } from '../../src/errors.js';

// No need to mock child_process or isSDKInstalled — SDK is always available,
// auto resolves unconditionally to CopilotSDKInference.
const { resolveInference } = await import('../../src/adapters/inference/resolve.js');

function withEnv(key: string, value: string | undefined, fn: () => void): void {
  const original = process.env[key];
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
  try {
    fn();
  } finally {
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
}

describe('resolveInference', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  describe('preference: "auto"', () => {
    it('returns CopilotSDKInference unconditionally', () => {
      const adapter = resolveInference('auto');
      expect(adapter.name).toBe('copilot-sdk');
    });
  });

  describe('preference: "copilot"', () => {
    it('throws AdapterNotAvailableError with migration message', () => {
      expect(() => resolveInference('copilot')).toThrow(AdapterNotAvailableError);
      try {
        resolveInference('copilot');
      } catch (e) {
        expect((e as Error).message).toContain('removed');
        expect((e as Error).message).toContain('copilot-sdk');
      }
    });
  });

  describe('preference: "copilot-sdk"', () => {
    it('returns CopilotSDKInference', () => {
      const adapter = resolveInference('copilot-sdk');
      expect(adapter.name).toBe('copilot-sdk');
    });
  });

  describe('preference: "github-models"', () => {
    it('returns GitHubModelsInference when GITHUB_TOKEN is set', () => {
      withEnv('GITHUB_TOKEN', 'token-abc', () => {
        const adapter = resolveInference('github-models');
        expect(adapter.name).toBe('github-models');
      });
    });

    it('throws AdapterNotAvailableError when GITHUB_TOKEN is not set', () => {
      withEnv('GITHUB_TOKEN', undefined, () => {
        expect(() => resolveInference('github-models')).toThrow(AdapterNotAvailableError);
      });
    });
  });

  describe('unknown preference', () => {
    it('throws AdapterNotAvailableError for unknown adapter name', () => {
      expect(() => resolveInference('unknown-adapter')).toThrow(AdapterNotAvailableError);
    });

    it('error message mentions the unknown adapter name', () => {
      try {
        resolveInference('my-custom-adapter');
      } catch (e) {
        expect((e as Error).message).toContain('my-custom-adapter');
      }
    });
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/adapters/resolve.test.ts
git commit -m "test: update inference resolve tests for SDK-first resolution"
```

---

### Task 5: Update documentation (README, CLAUDE.md, SKILL.md files)

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `skills/create-evals/SKILL.md`
- Modify: `skills/run-evals/SKILL.md`

- [ ] **Step 1: Update README.md**

Key changes:
- Remove the `review` command section entirely
- Remove `--verbose` from the eval flag table
- Add `--feedback` to the eval flag table
- Remove "same flags as eval" claim about review
- Remove the review artifact tree
- Update inference adapter descriptions: remove `copilot` CLI adapter, note `auto` now uses SDK

- [ ] **Step 2: Update CLAUDE.md**

Key changes:
- Core Flow: change `eval` → `review` (eval + HTML report + feedback template)` to just `eval` (run with/without skill, grade assertions, compute benchmark, optional `--feedback` for human review template)
- Remove `CopilotInference` from the InferenceAdapter descriptions
- Update `benchmark.json` artifact format to include `metadata` field: `{run_summary: {...}, metadata: {eval_count, eval_ids, skill_name, runs_per_eval, timestamp}}`

- [ ] **Step 3: Update both SKILL.md files**

In both `skills/create-evals/SKILL.md` and `skills/run-evals/SKILL.md`:
- Remove all references to the `review` command
- Remove `--verbose` from any flag lists
- Add `--feedback` to the `eval` flag list
- Remove `--no-open` from any flag lists (it was review-only)
- Make clear which flags belong to `eval`: `--harness`, `--inference`, `--workspace`, `--runs`, `--concurrency`, `--only`, `--threshold`, `--old-skill`, `--feedback`

- [ ] **Step 4: Verify build still works**

Run: `npm run build && npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add README.md CLAUDE.md skills/create-evals/SKILL.md skills/run-evals/SKILL.md
git commit -m "docs: update all documentation for review removal and new flags"
```

---

### Task 6: Update E2E tests for review removal

**Files:**
- Delete: `tests/e2e/helpers/stories/review-flow.ts`
- Modify: `tests/e2e/cli-flow.test.ts`
- Modify: `tests/e2e/sdk-flow.test.ts`

- [ ] **Step 1: Delete the review-flow story**

```bash
rm tests/e2e/helpers/stories/review-flow.ts
```

- [ ] **Step 2: Remove review imports and tests from `cli-flow.test.ts` and `sdk-flow.test.ts`**

Remove:
- `import { reviewFlow } from './helpers/stories/review-flow.js';`
- `assertFeedback` from the assertions import (no longer used after US5 removal)
- Any `it` or `describe` blocks that test the `review` command (search for `reviewFlow` and `US5`)
- In `plugin-flow.test.ts`: remove the stale comment `// US5 (review produces feedback.json) is covered by CLI and SDK E2E tests.`

- [ ] **Step 3: Commit**

```bash
git add -u tests/e2e/
git commit -m "test: remove E2E tests for deleted review command"
```

---

## PR 2: Bug Fixes + Cleanup

### Task 7: Fix SDK harness bugs (skillDirectories, transcript, token count)

**Files:**
- Modify: `src/adapters/harness/copilot-sdk.ts`
- Modify: `src/adapters/harness/copilot-cli.ts`

- [ ] **Step 1: Fix `skillDirectories` path**

In `src/adapters/harness/copilot-sdk.ts` line 34, change:
```typescript
sessionConfig.skillDirectories = [options.skillPath];
```
to:
```typescript
sessionConfig.skillDirectories = [path.dirname(options.skillPath)];
```

- [ ] **Step 2: Fix `tool.execution_complete` result access**

In `src/adapters/harness/copilot-sdk.ts` line 101, change:
```typescript
lines.push(`[tool:done] ${event.data?.toolName ?? 'unknown'} → ${truncate(event.data?.result ?? '', 200)}`);
```
to:
```typescript
lines.push(`[tool:done] ${event.data?.toolName ?? 'unknown'} → ${truncate(event.data?.result?.content ?? '', 200)}`);
```

- [ ] **Step 3: Replace dead `extractTokenCount` with documented zero**

Remove the `extractTokenCount` function (lines 114-122). In the `run` method, replace:
```typescript
const totalTokens = extractTokenCount(events);
```
with:
```typescript
// SDK assistant.usage events are ephemeral and not available via getMessages()
const totalTokens = 0;
```

And in the return object, change `total_tokens: totalTokens` to `total_tokens: 0` (or keep the variable, either way).

- [ ] **Step 4: Document CLI harness token count**

In `src/adapters/harness/copilot-cli.ts` line 47, add a comment:
```typescript
// CLI harness cannot extract token usage from stdout
resolve({ raw: stdout.trim(), files: [], total_tokens: 0, duration_ms: durationMs });
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/adapters/harness/copilot-sdk.ts src/adapters/harness/copilot-cli.ts
git commit -m "fix: correct skillDirectories path, transcript result access, and token count"
```

---

### Task 8: Dead code cleanup

**Files:**
- Modify: `src/adapters/copilot-sdk-client.ts`
- Modify: `src/adapters/harness/resolve.ts`
- Modify: `src/adapters/harness/copilot-sdk.ts`
- Modify: `src/adapters/inference/copilot-sdk.ts`
- Modify: `src/errors.ts`

- [ ] **Step 1: Remove `isSDKInstalled` from `copilot-sdk-client.ts`**

Delete the entire `isSDKInstalled` function (lines 52-64) and its `export`. Also remove the "optional dep" comments (lines 5, 12, 21) and the `@ts-ignore` directive (line 21). Replace the dynamic import with a static one:

Replace the top of the file:
```typescript
/**
 * Shared lazy CopilotClient singleton.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { CopilotClient } from '@github/copilot-sdk';
```

Replace `getClient()` to use static import — but we still need the lazy init pattern since the client must be started once. Keep the singleton pattern but remove the dynamic import:

```typescript
let clientInstance: CopilotClient | null = null;
let clientStarted = false;

export async function getClient(): Promise<CopilotClient> {
  if (clientInstance && clientStarted) return clientInstance;

  const env = { ...process.env, NODE_OPTIONS: [process.env.NODE_OPTIONS, '--no-warnings'].filter(Boolean).join(' ') };
  clientInstance = new CopilotClient({ logLevel: 'none', env });
  await clientInstance.start();
  clientStarted = true;
  return clientInstance;
}
```

Note: If the static import of `CopilotClient` fails at compile time (the SDK may use a different export structure), keep the dynamic import approach but remove the `@ts-ignore` and the "optional dep" comment. Verify with `npm run build`.

- [ ] **Step 2: Remove `isSDKInstalled` from `harness/resolve.ts`**

Remove import of `isSDKInstalled` (line 5) and the `if (!isSDKInstalled())` guard (lines 9-14). The `copilot-sdk` case becomes:

```typescript
if (name === 'copilot-sdk') {
  return new CopilotSDKHarness();
}
```

- [ ] **Step 3: Remove `@ts-ignore` and optional dep comment from `harness/copilot-sdk.ts`**

Remove import of `isSDKInstalled` (line 4). Remove `@ts-ignore` comment (line 21). Update `isAvailable()` (line 82-84) to return `true` always since SDK is a required dependency:

```typescript
async isAvailable(): Promise<boolean> {
  return true;
}
```

- [ ] **Step 4: Remove `@ts-ignore` and optional dep comment from `inference/copilot-sdk.ts`**

Remove `@ts-ignore` comment (line 10).

- [ ] **Step 5: Remove `TimeoutError` and `GradingError` from `src/errors.ts`**

Delete lines 43-55 (both classes). Fix `RateLimitError` exit code — change the constructor:

```typescript
export class RateLimitError extends SnapevalError {
  constructor(adapterName: string) {
    super(`${adapterName} rate limit exceeded. Try again later or use a different adapter.`, 4);
    this.name = 'RateLimitError';
  }
}
```

- [ ] **Step 6: Build and test**

Run: `npm run build && npm test`
Expected: PASS. If static import fails, adjust to use dynamic import without `@ts-ignore`.

- [ ] **Step 7: Commit**

```bash
git add src/adapters/copilot-sdk-client.ts src/adapters/harness/resolve.ts src/adapters/harness/copilot-sdk.ts src/adapters/inference/copilot-sdk.ts src/errors.ts
git commit -m "fix: remove dead isSDKInstalled checks, unused error classes, and stale comments"
```

---

### Task 9: Wire ChatOptions through CopilotSDKInference and harden GitHubModelsInference

**Files:**
- Modify: `src/adapters/inference/copilot-sdk.ts`
- Modify: `src/adapters/inference/github-models.ts`

- [ ] **Step 1: Wire ChatOptions in `CopilotSDKInference`**

In `src/adapters/inference/copilot-sdk.ts`, rename `_options` to `options` (line 7). The SDK's `sendAndWait` doesn't directly support `temperature` or `responseFormat` — these are session-level configs. Add a comment documenting this limitation:

```typescript
async chat(messages: Message[], options?: ChatOptions): Promise<string> {
  const client = await getClient();

  const { approveAll } = await import('@github/copilot-sdk');

  const systemMessages = messages.filter((m) => m.role === 'system');
  const nonSystemMessages = messages.filter((m) => m.role !== 'system');
  const systemContent = systemMessages.map((m) => m.content).join('\n');
  const userPrompt = nonSystemMessages.map((m) => m.content).join('\n');

  const session = await client.createSession({
    model: 'gpt-4.1',
    ...(systemContent
      ? { systemMessage: { content: systemContent } }
      : {}),
    onPermissionRequest: approveAll,
    infiniteSessions: { enabled: false },
    // Note: ChatOptions (temperature, responseFormat) are not supported by the
    // SDK's session config. The SDK controls these at the server level.
  });

  try {
    const response = await session.sendAndWait({ prompt: userPrompt });
    return (response?.data?.content ?? '').trim();
  } finally {
    await session.disconnect();
  }
}
```

- [ ] **Step 2: Add bounds check in `GitHubModelsInference`**

In `src/adapters/inference/github-models.ts` line 43, replace:
```typescript
return data.choices[0].message.content;
```
with:
```typescript
if (!data.choices?.length) {
  throw new Error('GitHub Models API returned no choices');
}
return data.choices[0].message.content;
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/adapters/inference/copilot-sdk.ts src/adapters/inference/github-models.ts
git commit -m "fix: document ChatOptions limitation in SDK inference, add choices guard"
```

---

### Task 10: Packaging cleanup

**Files:**
- Modify: `package.json`
- Modify: `plugin.json`
- Modify: `.claude-plugin/plugin.json`
- Modify: `.gitignore`

- [ ] **Step 1: Clean `package.json`**

Remove `assets/` from `files` array. Remove `copilot-cli` from `keywords`. Update the build script to clean stale dist and copy `package.json` into `dist/` (needed for dynamic version reading from the compiled binary):

```json
"build": "rm -rf dist && tsc && cp package.json dist/",
```

- [ ] **Step 2: Reconcile plugin manifests**

Update `plugin.json` to use object author format:
```json
{
  "name": "snapeval",
  "version": "2.2.0",
  "description": "Eval runner for AI skills. Design test scenarios, run with/without skill comparisons, grade assertions, iterate on quality.",
  "author": {
    "name": "Matan Tsach"
  },
  "license": "MIT",
  "skills": [
    "skills/create-evals",
    "skills/run-evals"
  ],
  "scripts": [
    "scripts/snapeval-cli.sh"
  ]
}
```

Add `version` and `license` to `.claude-plugin/plugin.json`:
```json
{
  "name": "snapeval",
  "version": "2.2.0",
  "description": "Eval runner for AI skills. Design test scenarios, run with/without skill comparisons, grade assertions, iterate on quality.",
  "author": {
    "name": "Matan Tsach"
  },
  "license": "MIT",
  "skills": [
    "skills/create-evals",
    "skills/run-evals"
  ],
  "scripts": [
    "scripts/snapeval-cli.sh"
  ]
}
```

- [ ] **Step 3: Add `debug-copilot.sh` to `.gitignore`**

Add at the end of `.gitignore`:
```
debug-copilot.sh
```

- [ ] **Step 4: Commit**

```bash
git add package.json plugin.json .claude-plugin/plugin.json .gitignore
git commit -m "fix: clean packaging (files, keywords, manifests, build script)"
```

---

### Task 11: Test backfill — errors.ts

**Files:**
- Create: `tests/errors.test.ts`

- [ ] **Step 1: Write test**

```typescript
import { describe, it, expect } from 'vitest';
import {
  SnapevalError,
  FileNotFoundError,
  ThresholdError,
  AdapterNotAvailableError,
  RateLimitError,
} from '../src/errors.js';

describe('error classes', () => {
  it('SnapevalError defaults to exit code 2', () => {
    const err = new SnapevalError('test');
    expect(err.exitCode).toBe(2);
    expect(err.name).toBe('SnapevalError');
    expect(err.message).toBe('test');
  });

  it('FileNotFoundError uses exit code 3', () => {
    const err = new FileNotFoundError('/missing/file', 'check path');
    expect(err.exitCode).toBe(3);
    expect(err.name).toBe('FileNotFoundError');
    expect(err.message).toContain('/missing/file');
    expect(err.message).toContain('check path');
  });

  it('ThresholdError uses exit code 1', () => {
    const err = new ThresholdError(0.5, 0.8);
    expect(err.exitCode).toBe(1);
    expect(err.name).toBe('ThresholdError');
    expect(err.message).toContain('50.0%');
    expect(err.message).toContain('80.0%');
  });

  it('AdapterNotAvailableError uses exit code 4', () => {
    const err = new AdapterNotAvailableError('test-adapter', 'Install it');
    expect(err.exitCode).toBe(4);
    expect(err.name).toBe('AdapterNotAvailableError');
    expect(err.message).toContain('test-adapter');
  });

  it('RateLimitError uses exit code 4', () => {
    const err = new RateLimitError('github-models');
    expect(err.exitCode).toBe(4);
    expect(err.name).toBe('RateLimitError');
  });
});
```

- [ ] **Step 2: Run test**

Run: `npx vitest run tests/errors.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/errors.test.ts
git commit -m "test: add error class exit code and message tests"
```

---

### Task 12: Test backfill — resolveHarness

**Files:**
- Create: `tests/adapters/harness/resolve.test.ts`

- [ ] **Step 1: Write test**

```typescript
import { describe, it, expect } from 'vitest';
import { resolveHarness } from '../../../src/adapters/harness/resolve.js';
import { SnapevalError } from '../../../src/errors.js';

describe('resolveHarness', () => {
  it('returns CopilotSDKHarness for copilot-sdk', () => {
    const harness = resolveHarness('copilot-sdk');
    expect(harness.name).toBe('copilot-sdk');
  });

  it('returns CopilotCLIHarness for copilot-cli', () => {
    const harness = resolveHarness('copilot-cli');
    expect(harness.name).toBe('copilot-cli');
  });

  it('throws SnapevalError for unknown harness name', () => {
    expect(() => resolveHarness('unknown')).toThrow(SnapevalError);
    expect(() => resolveHarness('unknown')).toThrow(/Unknown harness/);
  });
});
```

- [ ] **Step 2: Run test**

Run: `npx vitest run tests/adapters/harness/resolve.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/adapters/harness/resolve.test.ts
git commit -m "test: add resolveHarness tests"
```

---

### Task 13: Test backfill — evalCommand (validateEvalsFile, --only, --threshold, --feedback, averageGradings)

**Files:**
- Modify: `tests/commands/eval.test.ts`

- [ ] **Step 1: Add validation tests**

Add new `describe` blocks after the existing happy-path test. Use the same `tmpDir`, `mockHarness`, and `mockInference` setup:

```typescript
describe('validateEvalsFile', () => {
  it('throws on missing skill_name', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-cmd-'));
    const skillDir = path.join(tmpDir, 'test-skill');
    fs.mkdirSync(path.join(skillDir, 'evals'), { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'evals', 'evals.json'), JSON.stringify({
      evals: [{ id: 1, prompt: 'test', expected_output: 'test' }],
    }));

    await expect(evalCommand(skillDir, mockHarness, mockInference, {
      workspace: path.join(tmpDir, 'ws'),
    })).rejects.toThrow(/missing or invalid "skill_name"/);
  });

  it('throws on non-array evals', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-cmd-'));
    const skillDir = path.join(tmpDir, 'test-skill');
    fs.mkdirSync(path.join(skillDir, 'evals'), { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'evals', 'evals.json'), JSON.stringify({
      skill_name: 'test', evals: 'not-an-array',
    }));

    await expect(evalCommand(skillDir, mockHarness, mockInference, {
      workspace: path.join(tmpDir, 'ws'),
    })).rejects.toThrow(/"evals" must be an array/);
  });

  it('throws on missing eval id', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-cmd-'));
    const skillDir = path.join(tmpDir, 'test-skill');
    fs.mkdirSync(path.join(skillDir, 'evals'), { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'evals', 'evals.json'), JSON.stringify({
      skill_name: 'test',
      evals: [{ prompt: 'test', expected_output: 'test' }],
    }));

    await expect(evalCommand(skillDir, mockHarness, mockInference, {
      workspace: path.join(tmpDir, 'ws'),
    })).rejects.toThrow(/missing or invalid "id"/);
  });

  it('throws on missing evals.json', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-cmd-'));
    const skillDir = path.join(tmpDir, 'test-skill');
    fs.mkdirSync(skillDir, { recursive: true });

    await expect(evalCommand(skillDir, mockHarness, mockInference, {
      workspace: path.join(tmpDir, 'ws'),
    })).rejects.toThrow(/File not found/);
  });
});
```

- [ ] **Step 2: Add --only filter tests**

```typescript
describe('--only filtering', () => {
  it('filters to specified eval IDs', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-cmd-'));
    const skillDir = path.join(tmpDir, 'test-skill');
    fs.mkdirSync(path.join(skillDir, 'evals'), { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'evals', 'evals.json'), JSON.stringify({
      skill_name: 'test',
      evals: [
        { id: 1, prompt: 'first', expected_output: 'one' },
        { id: 2, prompt: 'second', expected_output: 'two' },
        { id: 3, prompt: 'third', expected_output: 'three' },
      ],
    }));

    const results = await evalCommand(skillDir, mockHarness, mockInference, {
      workspace: path.join(tmpDir, 'ws'), only: [1, 3],
    });
    expect(results.evalRuns).toHaveLength(2);
    expect(results.evalRuns.map(r => r.evalId)).toEqual([1, 3]);
  });

  it('throws when no eval IDs match', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-cmd-'));
    const skillDir = path.join(tmpDir, 'test-skill');
    fs.mkdirSync(path.join(skillDir, 'evals'), { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'evals', 'evals.json'), JSON.stringify({
      skill_name: 'test',
      evals: [{ id: 1, prompt: 'test', expected_output: 'test' }],
    }));

    await expect(evalCommand(skillDir, mockHarness, mockInference, {
      workspace: path.join(tmpDir, 'ws'), only: [99],
    })).rejects.toThrow(/No eval cases match/);
  });
});
```

- [ ] **Step 3: Add --threshold tests**

```typescript
describe('--threshold', () => {
  it('throws ThresholdError when pass rate is below threshold', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-cmd-'));
    const skillDir = path.join(tmpDir, 'test-skill');
    fs.mkdirSync(path.join(skillDir, 'evals'), { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'evals', 'evals.json'), JSON.stringify({
      skill_name: 'test',
      evals: [{ id: 1, prompt: 'test', expected_output: 'test',
        assertions: ['always fails'] }],
    }));

    // Mock grading to return 0% pass rate
    vi.mocked(mockInference.chat).mockResolvedValue(JSON.stringify({
      results: [{ text: 'always fails', passed: false, evidence: 'nope' }],
    }));

    await expect(evalCommand(skillDir, mockHarness, mockInference, {
      workspace: path.join(tmpDir, 'ws'), threshold: 0.8,
    })).rejects.toThrow(/below threshold/);
  });

  it('succeeds when pass rate meets threshold', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-cmd-'));
    const skillDir = path.join(tmpDir, 'test-skill');
    fs.mkdirSync(path.join(skillDir, 'evals'), { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'evals', 'evals.json'), JSON.stringify({
      skill_name: 'test',
      evals: [{ id: 1, prompt: 'test', expected_output: 'test',
        assertions: ['passes'] }],
    }));

    vi.mocked(mockInference.chat).mockResolvedValue(JSON.stringify({
      results: [{ text: 'passes', passed: true, evidence: 'yes' }],
    }));

    const results = await evalCommand(skillDir, mockHarness, mockInference, {
      workspace: path.join(tmpDir, 'ws'), threshold: 0.5,
    });
    expect(results.evalRuns).toHaveLength(1);
  });

  it('throws on invalid threshold value', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-cmd-'));
    const skillDir = path.join(tmpDir, 'test-skill');
    fs.mkdirSync(path.join(skillDir, 'evals'), { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'evals', 'evals.json'), JSON.stringify({
      skill_name: 'test',
      evals: [{ id: 1, prompt: 'test', expected_output: 'test' }],
    }));

    await expect(evalCommand(skillDir, mockHarness, mockInference, {
      workspace: path.join(tmpDir, 'ws'), threshold: 1.5,
    })).rejects.toThrow(/Threshold must be between/);
  });
});
```

- [ ] **Step 4: Add --feedback test**

```typescript
describe('--feedback', () => {
  it('writes feedback.json when flag is set', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-cmd-'));
    const skillDir = path.join(tmpDir, 'test-skill');
    fs.mkdirSync(path.join(skillDir, 'evals'), { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'evals', 'evals.json'), JSON.stringify({
      skill_name: 'test',
      evals: [{ id: 1, prompt: 'test', expected_output: 'test', slug: 'test-eval' }],
    }));

    const results = await evalCommand(skillDir, mockHarness, mockInference, {
      workspace: path.join(tmpDir, 'ws'), feedback: true,
    });

    const feedbackPath = path.join(results.iterationDir, 'feedback.json');
    expect(fs.existsSync(feedbackPath)).toBe(true);
    const feedback = JSON.parse(fs.readFileSync(feedbackPath, 'utf-8'));
    expect(feedback['eval-test-eval']).toBe('');
  });

  it('does not write feedback.json when flag is not set', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-cmd-'));
    const skillDir = path.join(tmpDir, 'test-skill');
    fs.mkdirSync(path.join(skillDir, 'evals'), { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'evals', 'evals.json'), JSON.stringify({
      skill_name: 'test',
      evals: [{ id: 1, prompt: 'test', expected_output: 'test' }],
    }));

    const results = await evalCommand(skillDir, mockHarness, mockInference, {
      workspace: path.join(tmpDir, 'ws'),
    });

    const feedbackPath = path.join(results.iterationDir, 'feedback.json');
    expect(fs.existsSync(feedbackPath)).toBe(false);
  });
});
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/commands/eval.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add tests/commands/eval.test.ts
git commit -m "test: add evalCommand tests for validation, --only, --threshold, --feedback"
```

---

### Task 14: Test backfill — grader (exactMatch, extractJSON)

**Files:**
- Modify: `tests/engine/grader.test.ts`

- [ ] **Step 1: Add exact match tests**

Add these `describe` blocks **inside** the existing `describe('gradeAssertions', ...)` block (after the last `it` block), so they share the `tmpDir`, `mockInference`, `output`, and `afterEach` setup:

```typescript
describe('gradeExactMatch', () => {
  it('passes when output matches exactly', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grader-'));
    const exactOutput: HarnessRunResult = {
      raw: 'Hello, World!',
      files: [],
      total_tokens: 0,
      duration_ms: 0,
    };

    const result = await gradeAssertions(
      ['Output equals exactly: "Hello, World!"'],
      exactOutput, tmpDir, mockInference
    );

    expect(result).not.toBeNull();
    expect(result!.assertion_results[0].passed).toBe(true);
    expect(mockInference.chat).not.toHaveBeenCalled(); // No LLM call for exact match
  });

  it('fails when output does not match', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grader-'));
    const exactOutput: HarnessRunResult = {
      raw: 'Hello, World!',
      files: [],
      total_tokens: 0,
      duration_ms: 0,
    };

    const result = await gradeAssertions(
      ['Output equals exactly: "Goodbye, World!"'],
      exactOutput, tmpDir, mockInference
    );

    expect(result).not.toBeNull();
    expect(result!.assertion_results[0].passed).toBe(false);
    expect(result!.assertion_results[0].evidence).toContain('Expected');
  });
});
```

- [ ] **Step 2: Add extractJSON tests**

The `extractJSON` function is not exported, so test it indirectly through `gradeAssertions` by varying the LLM response format. Add tests where the mock returns JSON in different wrapings:

```typescript
describe('extractJSON from various formats', () => {
  it('handles JSON wrapped in markdown code fence', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grader-'));
    vi.mocked(mockInference.chat).mockResolvedValue(
      '```json\n{"results": [{"text": "check", "passed": true, "evidence": "ok"}]}\n```'
    );

    const result = await gradeAssertions(['check'], output, tmpDir, mockInference);
    expect(result!.assertion_results[0].passed).toBe(true);
  });

  it('handles JSON wrapped in bare code fence', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grader-'));
    vi.mocked(mockInference.chat).mockResolvedValue(
      '```\n{"results": [{"text": "check", "passed": true, "evidence": "ok"}]}\n```'
    );

    const result = await gradeAssertions(['check'], output, tmpDir, mockInference);
    expect(result!.assertion_results[0].passed).toBe(true);
  });

  it('handles raw JSON with leading text', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grader-'));
    vi.mocked(mockInference.chat).mockResolvedValue(
      'Here is the result:\n{"results": [{"text": "check", "passed": true, "evidence": "ok"}]}'
    );

    const result = await gradeAssertions(['check'], output, tmpDir, mockInference);
    expect(result!.assertion_results[0].passed).toBe(true);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/engine/grader.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add tests/engine/grader.test.ts
git commit -m "test: add exact match and extractJSON format tests for grader"
```

---

### Task 15: Test backfill — runner (oldSkillPath)

**Files:**
- Modify: `tests/engine/runner.test.ts`

- [ ] **Step 1: Add oldSkillPath test**

```typescript
it('uses old_skill directory when oldSkillPath is provided', async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-'));
  const evalDir = path.join(tmpDir, 'eval-test');
  fs.mkdirSync(path.join(evalDir, 'with_skill', 'outputs'), { recursive: true });
  fs.mkdirSync(path.join(evalDir, 'old_skill', 'outputs'), { recursive: true });

  const result = await runEval(evalCase, '/path/to/skill', evalDir, mockHarness, '/path/to/old-skill');

  expect(mockHarness.run).toHaveBeenCalledTimes(2);
  // First call: with current skill
  expect(vi.mocked(mockHarness.run).mock.calls[0][0].skillPath).toBe('/path/to/skill');
  // Second call: with old skill path
  expect(vi.mocked(mockHarness.run).mock.calls[1][0].skillPath).toBe('/path/to/old-skill');

  // Artifacts written to old_skill/ not without_skill/
  expect(fs.existsSync(path.join(evalDir, 'old_skill', 'timing.json'))).toBe(true);
  expect(fs.existsSync(path.join(evalDir, 'old_skill', 'outputs', 'output.txt'))).toBe(true);
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run tests/engine/runner.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/engine/runner.test.ts
git commit -m "test: add runner test for oldSkillPath branch"
```

---

### Task 16: E2E hardening and dead export cleanup

**Files:**
- Modify: `tests/e2e/helpers/assertions.ts`
- Modify: `tests/e2e/helpers/fixtures.ts`
- Modify: `tests/e2e/cli-flow.test.ts`
- Modify: `tests/e2e/sdk-flow.test.ts`
- Modify: `tests/e2e/helpers/adapters/plugin-adapter.ts` (if exists)

- [ ] **Step 1: Remove dead exports from `assertions.ts`**

Remove these unused exported functions:
- `assertEvalsJson` (lines 6-21)
- `assertEvalsRelevance` (lines 23-29)
- `assertEvalsNoAssertions` (lines 31-37)
- `assertCleanState` (lines 116-122)
- `assertStdoutContains` (lines 124-126)
- `assertStderrContains` (lines 128-130)
- `findWorkspaceDir` (lines 132-136)

- [ ] **Step 2: Remove dead exports from `fixtures.ts`**

Remove these unused exported functions:
- `addAssertionsToEvals` (lines 40-47)
- `cleanup` (lines 96-98)

- [ ] **Step 3: Add `assertSkillDifferentiation` to `assertions.ts`**

```typescript
export function assertSkillDifferentiation(evalDir: string): void {
  const wsOutput = fs.readFileSync(path.join(evalDir, 'with_skill', 'outputs', 'output.txt'), 'utf-8');
  const wosOutput = fs.readFileSync(path.join(evalDir, 'without_skill', 'outputs', 'output.txt'), 'utf-8');
  expect(wsOutput).not.toBe(wosOutput);
}
```

- [ ] **Step 4: Wire `assertSkillDifferentiation` into US2 story assertions in `cli-flow.test.ts` and `sdk-flow.test.ts`**

In the US2 test block (eval with assertions), after the existing assertions, add:

```typescript
import { assertSkillDifferentiation } from './helpers/assertions.js';

// Inside the US2 test, after existing assertions:
for (const evalDir of listEvalDirs(iterationDir)) {
  assertSkillDifferentiation(evalDir);
}
```

- [ ] **Step 5: Document plugin adapter `exitCode: null`**

In `tests/e2e/helpers/adapters/plugin-adapter.ts`, add a comment above the `exitCode: null` line:

```typescript
// Plugin adapter cannot capture exit codes from `copilot -p` subprocess
exitCode: null,
```

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/
git commit -m "test: harden E2E with skill differentiation assertion, remove dead exports"
```

---

### Task 17: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: Clean build with no errors.

- [ ] **Step 3: Verify CLI works**

Run: `node dist/bin/snapeval.js --version`
Expected: `2.2.0`

Run: `node dist/bin/snapeval.js --help`
Expected: Shows `eval` command only (no `review`). Eval shows `--feedback` but not `--verbose`.

- [ ] **Step 4: Verify dev mode still works**

Run: `npx tsx bin/snapeval.ts --help`
Expected: Same output as above.
