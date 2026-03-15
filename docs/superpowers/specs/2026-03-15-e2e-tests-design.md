# E2E Tests for Copilot CLI Flow

## Overview

End-to-end tests that validate snapeval's full pipeline against the real GitHub Copilot CLI. Tests run in CI (GitHub Actions) and locally.

## Prerequisites

### Adapter Migration: `gh copilot` → `@github/copilot`

The `gh copilot` extension is deprecated (EOL Oct 2025). Replace with the standalone `@github/copilot` CLI (GA Feb 2026).

**File**: `src/adapters/skill/copilot-cli.ts`

| Aspect | Old | New |
|---|---|---|
| Binary | `gh` | `copilot` |
| Args | `['copilot', '--', '-p', prompt, '--silent']` | `['-p', prompt, '-s', '--no-ask-user', '--allow-all-tools']` |
| Availability | `execFileSync('gh', ['copilot', '--help'])` | `execFileSync('copilot', ['--version'])`; if missing, install via `npm install -g @github/copilot` |

- Remove all `gh copilot` code entirely (no fallback, no deprecation)
- Keep SKILL.md prepending for direct CLI usage (adapter path, no plugin loaded)

### Auth

- Fine-grained PAT with "Copilot Requests" permission
- Stored as `COPILOT_GITHUB_TOKEN` repo secret
- Locally: developer authenticated via `gh auth login` or `COPILOT_GITHUB_TOKEN` env var

## Test Scenarios

### Test 1: Full Eval Pipeline Passes

**User story**: "As a skill developer, I run snapeval against my skill — capture baselines, check them — and all evaluations pass."

**Setup**:
- Copy `test-skills/greeter/` to temp dir (SKILL.md + evals/evals.json, no snapshots)

**Steps**:
1. Run `npx snapeval capture <temp-dir>` as child process
2. Assert: exit code 0
3. Assert: snapshot files created (scenario-1 through scenario-7)
4. Assert: each snapshot has valid structure (output.raw non-empty, metadata present)
5. Run `npx snapeval check <temp-dir>` as child process
6. Assert: exit code 0 (all pass)
7. Assert: stdout contains pass indicators

### Test 2: Skill Change Triggers Regression

**User story**: "As a skill developer, I modify my skill's behavior and snapeval detects the regression."

**Setup**:
- Copy `test-skills/greeter/` to temp dir (SKILL.md + evals/evals.json, no snapshots)

**Steps**:
1. Run `npx snapeval capture <temp-dir>` — establish baselines
2. Modify SKILL.md drastically (e.g., replace greeter with a joke-teller skill)
3. Run `npx snapeval check <temp-dir>` as child process
4. Assert: exit code 1 (regression detected)
5. Assert: stdout contains regression indicators

### Test 3: Plugin Flow Through Copilot

**User story**: "As a Copilot user, I install the snapeval plugin, ask Copilot to evaluate a skill, and the full pipeline runs end-to-end."

**Setup**:
- Build the project (`npm run build`)
- Install snapeval as a Copilot plugin: `copilot plugin install ./`
- Prepare target skill (greeter) in temp dir with evals

**Steps**:
1. Invoke Copilot non-interactively: `copilot -p "run snapeval check on <temp-dir>" -s --no-ask-user --allow-all-tools`
2. Assert: stdout contains snapeval output (pass/regress verdicts)
3. Assert: result files created in expected locations

**Cleanup**:
- Uninstall plugin: `copilot plugin uninstall snapeval`

## Test Infrastructure

**Location**: `tests/e2e/`

**Runner**: Vitest with separate script: `npm run test:e2e` → `vitest run tests/e2e/`

**Skip logic**: Tests check `copilot --version` before running. If unavailable or unauthenticated, skip via `describe.skipIf`. Works seamlessly locally (developer has copilot) and in CI (secret present).

**Temp directories**: Each test creates isolated temp copy of dummy skill via `fs.mkdtempSync`, cleans up in `afterEach`.

**Timeouts**: 120s per test (multiple real Copilot calls per test).

**Dummy skill**: `test-skills/greeter/` — simple, predictable, 7 eval scenarios covering happy path, edge cases, error handling.

## CI Workflow

**New file**: `.github/workflows/e2e.yml`

```yaml
name: E2E Tests
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  e2e:
    runs-on: ubuntu-latest
    if: ${{ github.event_name == 'push' || !github.event.pull_request.head.repo.fork }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
      - run: npm install -g @github/copilot
      - run: npm run test:e2e
        env:
          COPILOT_GITHUB_TOKEN: ${{ secrets.COPILOT_GITHUB_TOKEN }}
```

- Separate from `ci.yml` (different concerns, different speed)
- Skips on fork PRs (no secret access)
- Single Node version (22)
- Auth via fine-grained PAT with "Copilot Requests" permission

## Approach

- **True black-box e2e**: All tests invoke the CLI as child processes, validating exit codes, stdout, and generated files
- **Real Copilot calls**: No mocking — tests hit the actual Copilot service
- **Adapter migration first**: Update `CopilotCLIAdapter` before writing e2e tests
