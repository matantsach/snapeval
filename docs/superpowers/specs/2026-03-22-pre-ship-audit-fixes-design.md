# Pre-Ship Audit Fixes Design

**Date:** 2026-03-22
**Status:** Implemented
**Scope:** Fix all 42 issues found in the pre-ship codebase audit

## Context

A full codebase audit identified 42 issues across 4 categories: broken functionality (10), stale references (13), misleading behavior (7), and test coverage gaps (12). This spec defines the fix strategy across two PRs, separated by breaking-change boundary.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| `review` command | Remove; fold `feedback.json` into `eval --feedback` | Only real value-add is one `writeFileSync` call; HTML report never existed |
| `--verbose` flag | Remove | Dead flag, never consumed anywhere |
| `CopilotInference` (CLI-based inference) | Remove | Blocks event loop, drops `ChatOptions`, SDK does everything better |
| `auto` inference resolution | SDK first: SDK → GitHub Models → error | SDK is always available (required dep), supports all `ChatOptions` fields |
| Test backfill scope | Critical gaps + E2E hardening | Cover the code paths most likely to break silently; harden E2E to detect behavioral differentiation |
| PR strategy | Two PRs: breaking changes, then bug fixes + cleanup | Clean git history; bug fixes can ship independently |

## PR 1: Breaking Changes (`feat!:`)

### 1.1 Remove `review` command

- Delete `src/commands/review.ts` (includes the local `openInBrowser` function defined in that file)
- Delete `tests/commands/review.test.ts`
- Remove `review` command definition from `bin/snapeval.ts`
- Keep `FeedbackData` type in `src/types.ts` — reuse it in `eval.ts` for the `--feedback` flag

### 1.2 Add `--feedback` flag to `eval`

- New flag: `.option('--feedback', 'Write feedback.json template for human review')`
- In `src/commands/eval.ts`, after benchmark is written: if `options.feedback`, write `feedback.json` to the iteration directory
- Format: `{ "eval-{slug}": "" }` per eval — same as current `review.ts` logic
- No browser open

### 1.3 Remove `--verbose` from `eval`

- Delete the `.option('--verbose', ...)` line from `bin/snapeval.ts`

### 1.4 Remove `CopilotInference` adapter

- Delete `src/adapters/inference/copilot.ts`
- Delete `tests/adapters/copilot.test.ts`
- Remove `copilot` case from `src/adapters/inference/resolve.ts`
- Add a descriptive error for `--inference copilot`: "copilot CLI inference adapter was removed, use copilot-sdk"

### 1.5 Update `auto` inference resolution

- `auto` resolves to `CopilotSDKInference` unconditionally (always available since SDK is a required dependency). No fallback chain needed — if the SDK import fails, the package itself is corrupted.
- Named options: `copilot-sdk` → `CopilotSDKInference`, `github-models` → `GitHubModelsInference` (requires `GITHUB_TOKEN`)
- Remove the `isCopilotAvailable()` helper function from `inference/resolve.ts` — all its callers are deleted with `CopilotInference`

### 1.6 Fix `bin` field for npm

- Change `package.json` `bin` to `"./dist/bin/snapeval.js"`
- `tsconfig.json` already includes `bin/**/*` in its `include` array with `outDir: "dist"`, so `bin/` already compiles to `dist/bin/` — no tsconfig change needed
- Change shebang in `bin/snapeval.ts` from `#!/usr/bin/env tsx` to `#!/usr/bin/env node` so the compiled output works without tsx
- Dev mode continues using tsx via `npm run dev` (`npx tsx bin/snapeval.ts`)

### 1.7 Documentation updates (all in PR 1)

- **README.md**: Remove `review` section, update flag tables and examples, remove `--verbose`, add `--feedback`, fix "same flags as eval" claim
- **CLAUDE.md**: Remove `review` from core flow, update command list, remove `CopilotInference` from adapter list, update `benchmark.json` artifact format to include `metadata` field, reflect single `eval` command with `--feedback`
- **skills/create-evals/SKILL.md**: Remove `review` references, remove `--verbose`, add `--feedback`, attribute flags correctly to `eval` only
- **skills/run-evals/SKILL.md**: Same updates as create-evals
- **plugin.json** and **.claude-plugin/plugin.json**: Reconcile format (further cleanup in PR 2)

## PR 2: Bug Fixes + Cleanup (`fix:`)

### 2.1 SDK Harness bugs

**`skillDirectories` fix** (`src/adapters/harness/copilot-sdk.ts:34`):
- Change `skillDirectories: [options.skillPath]` to `skillDirectories: [path.dirname(options.skillPath)]`

**Transcript `tool.execution_complete` fix** (line 101):
- Change `event.data?.result ?? ''` to `event.data?.result?.content ?? ''`

**Token count fix** (lines 114-121):
- `assistant.usage` events are ephemeral (`ephemeral: true` in SDK type definitions) and excluded from `getMessages()`, which only returns persisted events
- Remove the dead `extractTokenCount` function that searches `getMessages()` for usage events
- Replace with `total_tokens: 0` and a code comment: `// SDK assistant.usage events are ephemeral and not available via getMessages()`
- This is the same situation as the CLI harness (hardcoded `0`) — neither harness can currently report token counts

**CLI harness token count documentation** (`src/adapters/harness/copilot-cli.ts:47`):
- Add code comment above `total_tokens: 0`: `// CLI harness cannot extract token usage from stdout`

### 2.2 Dead code cleanup

**Remove `isSDKInstalled()`:**
- Delete from `src/adapters/copilot-sdk-client.ts`
- Remove all callers in `harness/resolve.ts` and `inference/resolve.ts`

**Replace dynamic `import()` with static `import`:**
- `src/adapters/copilot-sdk-client.ts`, `harness/copilot-sdk.ts`, `inference/copilot-sdk.ts`
- Remove `@ts-ignore` directives and "optional dep" comments

**Remove `TimeoutError` and `GradingError`:**
- Delete from `src/errors.ts`

**Fix `RateLimitError` exit code:**
- Change constructor from `super(message)` (inherits default exit code `2`) to `super(message, 4)` (runtime error, per the exit code definitions in the file header)

**Remove dead E2E exports:**
- `tests/e2e/helpers/assertions.ts`: 7 unused exports
- `tests/e2e/helpers/fixtures.ts`: 2 unused exports

### 2.3 Wire `ChatOptions` through `CopilotSDKInference`

- Remove `_options` underscore prefix, rename to `options`
- Pass `options.temperature` and `options.responseFormat` to the SDK — exact SDK property names need to be verified against the SDK's `SessionConfig` or `sendAndWait` types at implementation time (the SDK may use `response_format` vs `responseFormat`)
- If the SDK does not support these options on inference sessions, document the limitation with a code comment rather than silently dropping them

### 2.4 `GitHubModelsInference` robustness

- Add bounds check: guard `data.choices[0]` access with a fallback — if `choices` is empty or undefined, throw a descriptive error rather than a cryptic `TypeError`

### 2.5 Packaging cleanup

**Fix CLI version:**
- Read version from `package.json` dynamically instead of hardcoding `'2.0.0'`

**Clean `files` field:**
- Remove `assets/` (orphaned `ideation-viewer.html`)

**Clean stale `dist/`:**
- Add `rm -rf dist` before `tsc` in the `build` script

**Reconcile plugin manifests:**
- Canonical `author` format: `{ "name": "Matan Tsach" }` in both files
- Add `version` and `license` to `.claude-plugin/plugin.json`

**Remove stale keyword:**
- Remove `copilot-cli` from `package.json` keywords

**Gitignore:**
- Add `debug-copilot.sh` pattern or delete the file

### 2.6 Test backfill

**New test files:**
- `tests/adapters/harness/resolve.test.ts` — `copilot-sdk` → `CopilotSDKHarness`, `copilot-cli` → `CopilotCLIHarness`, unknown → throws
- `tests/errors.test.ts` — each error class has correct `exitCode`, `name`, message format

**Existing test file additions:**

`tests/commands/eval.test.ts`:
- `validateEvalsFile`: missing `skill_name`, missing `evals`, missing `id`/`prompt`/`expected_output`, non-array `assertions`
- `--only`: subset selection, no matching IDs error
- `--threshold`: pass (no error), fail (throws `ThresholdError` with results)
- `--feedback`: writes `feedback.json` when set, skips when not
- `FileNotFoundError` for missing `evals.json`
- `averageGradings` / `--runs N`: multi-run averaging produces correct mean pass rates, single-run case returns results unchanged

`tests/engine/grader.test.ts`:
- `gradeExactMatch`: exact match passes, mismatch fails, whitespace handling
- `extractJSON`: markdown fence, bare fence, first-`{` fallback, ANSI-stripped input

`tests/engine/runner.test.ts`:
- `oldSkillPath` branch: baseline dir named `old_skill`, harness receives old skill path

`tests/adapters/inference/resolve.test.ts`:
- `auto` returns `CopilotSDKInference`
- `copilot` name throws descriptive removal error
- Remove tests for deleted `CopilotInference`

### 2.7 E2E hardening

**New assertion: `assertSkillDifferentiation(iterationDir)`:**
- Read `with_skill/outputs/output.txt` and `without_skill/outputs/output.txt`
- Assert they are not identical
- Read both `grading.json` files
- Assert with-skill pass rate >= without-skill pass rate

Wire into US2 (eval with assertions) story across CLI and SDK flows. This would have caught the `skillDirectories` bug immediately.

**E2E cleanup:**
- Remove 9 dead exports from assertion/fixture helpers
- Document plugin adapter `exitCode: null` with code comment

## Audit Issue Coverage

Every issue from the audit is addressed:

| Issue # | Category | Resolution | PR |
|---|---|---|---|
| 1 | Broken | Fix `skillDirectories` path | 2 |
| 2 | Broken | Fix or document token count (ephemeral events) | 2 |
| 3 | Broken | Fix `result.content` access | 2 |
| 4 | Broken | Remove `--verbose` | 1 |
| 5 | Broken | Remove `review` command | 1 |
| 6 | Broken | Read version from `package.json` | 2 |
| 7 | Broken | Fix `bin` to compiled JS | 1 |
| 8 | Broken | SDK first in `auto` resolution | 1 |
| 9 | Broken | Remove `CopilotInference` | 1 |
| 10 | Broken | Wire `ChatOptions` through `CopilotSDKInference` | 2 |
| 11 | Stale | Update README flag table | 1 |
| 12 | Stale | Remove `review` from README/CLAUDE.md | 1 |
| 13 | Stale | Fix SKILL.md flag lists | 1 |
| 14 | Stale | Add `metadata` to CLAUDE.md artifact docs | 1 (consolidated into 1.7) |
| 15 | Stale | Remove `isSDKInstalled()` | 2 |
| 16 | Stale | Remove `@ts-ignore` + optional dep comments | 2 |
| 17 | Stale | Add `rm -rf dist` to build script | 2 |
| 18 | Stale | Remove `assets/` from `files` | 2 |
| 19 | Stale | Reconcile plugin manifests | 2 |
| 20 | Stale | Remove `TimeoutError`/`GradingError` | 2 |
| 21 | Stale | `isAvailable()` stays on interface (used internally by CLI harness) | N/A |
| 22 | Stale | Remove dead E2E exports | 2 |
| 23 | Stale | Remove `copilot-cli` keyword | 2 |
| 24 | Misleading | Remove `review` (no more raw JSON open) | 1 |
| 25 | Misleading | `--only`/`--threshold` only exist on `eval` — no confusion | 1 |
| 26 | Misleading | Add code comment documenting `total_tokens: 0` in CLI harness (section 2.1) | 2 |
| 27 | Misleading | Fix `RateLimitError` exit code to 4 | 2 |
| 28 | Misleading | Remove `CopilotInference` (role flattening gone) | 1 |
| 29 | Misleading | Add bounds check on `choices` (section 2.4) | 2 |
| 30 | Misleading | Gitignore or delete `debug-copilot.sh` | 2 |
| 31 | Tests | `resolveHarness()` tests (section 2.6) | 2 |
| 32 | Tests | `validateEvalsFile()` tests (section 2.6) | 2 |
| 33 | Tests | `--threshold` / `ThresholdError` tests (section 2.6) | 2 |
| 34 | Tests | `--only` filtering tests (section 2.6) | 2 |
| 35 | Tests | `gradeExactMatch` tests (section 2.6) | 2 |
| 36 | Tests | `extractJSON` branch tests (section 2.6) | 2 |
| 37 | Tests | `averageGradings` / multi-run tests (section 2.6) | 2 |
| 38 | Tests | `errors.ts` exit code tests (section 2.6) | 2 |
| 39 | Tests | `copilot-sdk-client.ts` — no dedicated test (accepted risk; dead code removed in 2.2) | N/A |
| 40 | Tests | `eval.test.ts` expanded coverage (section 2.6) | 2 |
| 41 | Tests | E2E error stories — `assertSkillDifferentiation` (section 2.7) | 2 |
| 42 | Tests | Plugin adapter `exitCode: null` documented (section 2.7) | 2 |
