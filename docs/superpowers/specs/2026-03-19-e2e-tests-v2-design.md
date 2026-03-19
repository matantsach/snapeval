# E2E Tests V2: Adapter-Extensible User Story Testing

## Problem

The current E2E tests (`tests/e2e/eval-pipeline.test.ts`) mock both adapters (harness and inference). They verify engine orchestration and artifact production but never invoke a real harness or real LLM. They're integration tests labeled as E2E.

Additionally, tests verify isolated phases rather than connected user journeys. A user doesn't run "gradeAssertions with a mock inference" — they run `snapeval init`, review generated evals, add assertions, run `snapeval capture`, then `snapeval check`. None of that flow is tested end-to-end.

The project has three invocation surfaces — direct CLI, Copilot plugin, and Copilot SDK — each needing coverage. A fourth (Claude Code) is anticipated.

## Goals

1. **Real adapters, no mocks** — E2E tests hit actual Copilot CLI / SDK / plugin
2. **User journey testing** — Connected flows matching how users actually experience the tool
3. **Extensible** — Adding a new adapter surface means implementing one interface and one test file
4. **Three surfaces** — CLI (`npx snapeval`), Plugin (Copilot with plugin installed), SDK (`@github/copilot-sdk`)

## Supersedes

This spec supersedes:
- `2026-03-15-e2e-tests-design.md` (CLI-only E2E)
- `2026-03-15-plugin-e2e-tests-design.md` (Plugin-only E2E)

Both are consolidated here under a unified adapter-extensible design.

## Design

### E2E Test Adapter Contract

Every test surface implements this interface. This is the single extensibility point — adding a new adapter means implementing this contract.

```typescript
// tests/e2e/helpers/types.ts

interface E2ETestAdapter {
  /** Human-readable name for test descriptions */
  name: string;

  /** Check if this adapter is available (installed, authenticated) */
  isAvailable(): Promise<boolean>;

  /** One-time setup (e.g., plugin install, SDK client start) */
  setup(): Promise<void>;

  /** One-time teardown (e.g., plugin uninstall, SDK client stop) */
  teardown(): Promise<void>;

  /**
   * Run a snapeval command against a skill directory.
   * Each adapter translates this into its own invocation method.
   */
  run(options: {
    command: 'init' | 'capture' | 'check' | 'review' | 'approve';
    skillDir: string;
    flags?: Record<string, string>;
  }): Promise<E2ERunResult>;
}

interface E2ERunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null; // null when not available (e.g., Copilot wrapper)
}
```

#### Adapter Implementations

| Adapter | `run()` implementation | `isAvailable()` check |
|---------|----------------------|----------------------|
| `CLIAdapter` | `execFile('npx', ['snapeval', command, skillDir, ...flags])` | `execFileSync('npx', ['snapeval', '--version'])` succeeds |
| `PluginAdapter` | `execFile('copilot', ['-p', naturalLanguagePrompt, '-s', '--no-ask-user', ...])` | `copilot --version` + `copilot plugin list` includes snapeval |
| `SDKAdapter` | Creates SDK session, sends prompt via `sendAndWait()`, returns response | `isSDKInstalled()` from `copilot-sdk-client.ts` |
| Future `ClaudeCodeAdapter` | `execFile('claude', ['-p', prompt, '--skill', skillDir, ...])` | `claude --version` succeeds |

The `PluginAdapter` translates structured commands to natural language prompts:
- `init` → `"Evaluate the skill at {path}. Run all scenarios without asking for confirmation."`
- `check` → `"Check the skill at {path} for regressions"`
- `review` → `"Check the skill at {path} and generate an HTML report"`
- `approve` → `"Approve all scenarios for the skill at {path}"`

### User Stories as Reusable Functions

Stories are pure orchestration — they call the adapter and return results. They don't assert. Test files handle assertions.

```
tests/e2e/helpers/stories/
  evaluate-skill.ts    # US1: init + capture from scratch
  regression-check.ts  # US2 (pass) + US2b (fail)
  report-flow.ts       # US3: review with HTML report
  approve-flow.ts      # US4: approve regressed scenarios
  error-paths.ts       # US-ERR1 (no SKILL.md) + US-ERR2 (no baselines)
```

#### US1: Evaluate Skill (First-Time Setup)
User has a skill with SKILL.md, no evals, no snapshots. Runs init to generate test scenarios, then capture to establish baselines.

Returns: `{ initResult, captureResult }` — both `E2ERunResult`.

**Primary assertions (file artifacts):**
- `evals/evals.json` created, valid JSON, has `evals` array with ≥1 entry
- At least one eval contains a greeter-domain keyword (greeting, formal, casual, pirate, greeter)
- Snapshot files created with `output.raw` (non-empty) and `metadata.adapter`

#### US2: Regression Check — Pass
User has a skill with matching baselines. Check should pass.

Returns: `E2ERunResult`.

**Primary assertions:**
- Skill directory unchanged (no corruption)
- Stdout contains verdict patterns (`/pass/i`, `/scenario/i`)

#### US2b: Regression Check — Fail
Same as US2 but baselines tampered with structurally different content.

Returns: `E2ERunResult`.

**Primary assertions:**
- Stdout mentions regression/regressed

#### US3: Report Flow
User runs review to get HTML report after a check.

Returns: `E2ERunResult`.

**Primary assertions:**
- Iteration directory exists
- `report.html` and `viewer-data.json` exist
- HTML is non-trivial (> 1KB, contains `<!DOCTYPE html>`)

#### US4: Approve Flow
User approves regressed scenarios to update baselines.

Returns: `E2ERunResult`.

**Primary assertions:**
- Snapshot file contents changed (before/after comparison)
- `.audit-log.jsonl` exists with approval entries

#### US-ERR1: No SKILL.md
User points at a directory with no SKILL.md.

**Primary assertions:**
- No evals or snapshots created
- Stdout contains error mentioning SKILL.md or "not found"

#### US-ERR2: No Baselines
User runs check on a skill that hasn't been captured yet.

**Primary assertions:**
- No corrupt state created
- Stdout explains baselines needed / suggests capture

### Shared Assertions

Reusable validators for agentskills.io spec artifacts. Every adapter must produce these same artifacts.

```typescript
// tests/e2e/helpers/assertions.ts

assertEvalsJson(skillDir)         // evals.json exists, valid, has entries
assertEvalsRelevance(skillDir, keywords)  // at least one eval contains domain keyword
assertSnapshots(skillDir)         // snapshot files with valid structure
assertBenchmark(skillDir, iteration?)     // benchmark.json with run_summary
assertGrading(runDir)             // grading.json with assertion_results + summary
assertTiming(runDir)              // timing.json with total_tokens + duration_ms
assertFeedback(skillDir, iteration?)      // feedback.json with eval slug keys
assertReport(skillDir, iteration?)        // report.html non-trivial
assertCleanState(dir)             // no artifacts created
assertStdoutContains(result, pattern)     // regex match on stdout
```

### Shared Fixtures

```typescript
// tests/e2e/helpers/fixtures.ts

copyGreeterSkill(options?: {
  includeEvals?: boolean;     // default true
  includeSnapshots?: boolean; // default true
  skillMdOnly?: boolean;      // just SKILL.md
}): string                    // returns temp dir path

tamperBaselines(skillDir): void
recordSnapshotState(skillDir): Map<string, string>
removeSnapshots(skillDir): void
createEmptyDir(): string
cleanup(dir): void
```

All fixtures use `test-skills/greeter/` as source. Temp directories tracked and cleaned in `afterEach`.

### Test Files

Each surface file imports stories + shared assertions, then adds surface-specific tests.

```
tests/e2e/
  helpers/
    types.ts
    assertions.ts
    fixtures.ts
    adapters/
      cli-adapter.ts
      plugin-adapter.ts
      sdk-adapter.ts
    stories/
      evaluate-skill.ts
      regression-check.ts
      report-flow.ts
      approve-flow.ts
      error-paths.ts
  cli-flow.test.ts
  plugin-flow.test.ts
  sdk-flow.test.ts
```

**`cli-flow.test.ts`** — All user stories + CLI-specific:
- Exit code assertions (0 for success, 1 for regression, non-zero for errors)
- Stderr content on errors
- Flag passthrough (`--adapter`, `--workspace`, etc.)

**`plugin-flow.test.ts`** — All user stories + plugin-specific:
- Plugin install/uninstall lifecycle in `beforeAll`/`afterAll`
- Natural language prompt → correct command translation
- Skip if plugin SKILL.md missing report section (US3)

**`sdk-flow.test.ts`** — All user stories + SDK-specific:
- Session lifecycle (create/disconnect per run)
- Real token counts in timing.json (not estimated)
- SDK client start/stop in `beforeAll`/`afterAll`

### Assertion Tiers

| Tier | What | Reliability | Usage |
|------|------|-------------|-------|
| Primary | File artifacts (existence, structure, content) | Deterministic | Hard assertions in all tests |
| Secondary | Stdout patterns (regex) | Semi-reliable (AI may rephrase) | Soft assertions, don't fail-fast |
| Tertiary | Exit codes | Best-effort through Copilot wrapper | CLI only; plugin/SDK use null |

### CI Workflow

Update `.github/workflows/e2e.yml` to three parallel jobs:

```yaml
jobs:
  e2e-cli:
    name: E2E (CLI)
    runs-on: ubuntu-latest
    if: ${{ github.event_name == 'push' || !github.event.pull_request.head.repo.fork }}
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with: { node-version: 22, cache: npm }
      - run: npm ci && npm run build
      - run: npm install -g @github/copilot
      - run: npx vitest run --config vitest.e2e.config.ts tests/e2e/cli-flow.test.ts
        env:
          COPILOT_GITHUB_TOKEN: ${{ secrets.COPILOT_GITHUB_TOKEN }}

  e2e-plugin:
    name: E2E (Plugin)
    runs-on: ubuntu-latest
    if: ${{ github.event_name == 'push' || !github.event.pull_request.head.repo.fork }}
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with: { node-version: 22, cache: npm }
      - run: npm ci && npm run build
      - run: npm install -g @github/copilot
      - run: copilot plugin install ./
      - run: npx vitest run --config vitest.e2e.config.ts tests/e2e/plugin-flow.test.ts
        env:
          COPILOT_GITHUB_TOKEN: ${{ secrets.COPILOT_GITHUB_TOKEN }}

  e2e-sdk:
    name: E2E (SDK)
    runs-on: ubuntu-latest
    if: ${{ github.event_name == 'push' || !github.event.pull_request.head.repo.fork }}
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with: { node-version: 22, cache: npm }
      - run: npm ci && npm run build
      - run: npm install -g @github/copilot
      - run: npm install @github/copilot-sdk
      - run: npx vitest run --config vitest.e2e.config.ts tests/e2e/sdk-flow.test.ts
        env:
          COPILOT_GITHUB_TOKEN: ${{ secrets.COPILOT_GITHUB_TOKEN }}
```

Skip logic: Each test file checks `adapter.isAvailable()` and auto-skips if not ready. CI ensures dependencies are installed. Locally, developers run whichever surface they have available.

### Timeouts

- Per-test: 300s in `vitest.e2e.config.ts` (real Copilot calls are slow)
- Plugin flow may need longer for multi-roundtrip stories

### Adding a Future Adapter (e.g., Claude Code)

1. Create `tests/e2e/helpers/adapters/claude-code-adapter.ts` implementing `E2ETestAdapter`
2. Create `tests/e2e/claude-code-flow.test.ts` importing stories + shared assertions + Claude-Code-specific tests
3. Add `e2e-claude-code` job to `.github/workflows/e2e.yml`
4. All user stories run automatically against the new surface

### What This Replaces

The mocked `tests/e2e/eval-pipeline.test.ts` on branch `feat/e2e-tests-v2` should be deleted. Its artifact-structure tests are valuable but belong in unit/integration tests (which already exist under `tests/engine/` and `tests/integration.test.ts`), not in E2E.
