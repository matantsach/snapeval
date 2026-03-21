# E2E Tests V2: Adapter-Extensible User Story Testing

## Problem

The current E2E tests (`tests/e2e/eval-pipeline.test.ts`) mock both adapters (harness and inference). They verify engine orchestration and artifact production but never invoke a real harness or real LLM. They're integration tests labeled as E2E.

Additionally, tests verify isolated phases rather than connected user journeys. A user doesn't run "gradeAssertions with a mock inference" — they run `snapeval init`, review generated evals, add assertions, then run `snapeval eval` to get a benchmark. None of that flow is tested end-to-end.

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

## Current Architecture

Commands: `init`, `eval`, `review` (defined in `bin/snapeval.ts`).

Artifact model (agentskills.io spec, dual-run benchmarking):
```
{workspace}/iteration-N/
  eval-{slug}/
    with_skill/
      outputs/output.txt
      timing.json          # {total_tokens, duration_ms}
      grading.json         # {assertion_results[], summary} (if assertions)
    without_skill/         # (or old_skill/ with --old-skill flag)
      outputs/output.txt
      timing.json
      grading.json
  benchmark.json           # {run_summary: {with_skill, without_skill, delta}}
  feedback.json            # {[evalSlug]: ""} (review command only)
```

Adapter layers:
- **Harness** (`src/adapters/harness/`) — `Harness` interface with `run()`. Built-in: `CopilotCLIHarness`.
- **Inference** (`src/adapters/inference/`) — `InferenceAdapter` interface with `chat()`. Used for grading assertions and generating evals. Built-in: `CopilotInference`, `CopilotSDKInference`, `GitHubModelsInference`.

## Design

### E2E Test Adapter Contract

Every test surface implements this interface. This is the single extensibility point — adding a new adapter means implementing this contract.

Note: This `E2ETestAdapter` is a **test-layer abstraction** that wraps CLI/plugin/SDK invocations for E2E testing. It is unrelated to the production `Harness` and `InferenceAdapter` interfaces in `src/types.ts`.

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
    command: 'init' | 'eval' | 'review';
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
| `CLIAdapter` | `execFile('npx', ['tsx', 'bin/snapeval.ts', command, skillDir, ...flags])` | `npx tsx bin/snapeval.ts --version` succeeds |
| `PluginAdapter` | `execFile('copilot', ['-p', naturalLanguagePrompt, '-s', '--no-ask-user', '--allow-all-tools', '--model', 'gpt-4.1'])` | `copilot --version` succeeds + `copilot plugin list` includes snapeval |
| `SDKAdapter` | Creates SDK session via `getClient()`, sends prompt via `sendAndWait()`, returns response | `isSDKInstalled()` from `copilot-sdk-client.ts` |
| Future `ClaudeCodeAdapter` | `execFile('claude', ['-p', prompt, '--skill', skillDir, ...])` | `claude --version` succeeds |

The `PluginAdapter` translates structured commands to natural language prompts:
- `init` → `"Generate eval test cases for the skill at {path}. Run without asking for confirmation."`
- `eval` → `"Run evals for the skill at {path}. Run all evals without asking for confirmation."`
- `review` → `"Run evals for the skill at {path} and generate a review with feedback template."`

### User Stories as Reusable Functions

Stories are pure orchestration — they call the adapter and return results. They don't assert. Test files handle assertions.

```
tests/e2e/helpers/stories/
  generate-evals.ts       # US1: init generates evals.json from SKILL.md
  eval-with-assertions.ts # US2: full eval pipeline with assertions and benchmark
  eval-without-assertions.ts # US3: eval with no assertions (timing only, no grading)
  eval-old-skill.ts       # US4: eval with --old-skill flag for version comparison
  review-flow.ts          # US5: review produces feedback.json template
  multi-iteration.ts      # US6: consecutive evals produce iteration-1, iteration-2, ...
  error-paths.ts          # US-ERR1 (no SKILL.md) + US-ERR2 (no evals.json)
```

#### US1: Generate Evals (First-Time Setup)
User has a skill with SKILL.md only — no evals directory. Runs `snapeval init` to generate test scenarios.

Returns: `{ initResult: E2ERunResult }`.

**Primary assertions (file artifacts):**
- `evals/evals.json` created, valid JSON, has `evals` array with ≥1 entry
- Each eval has `id`, `prompt`, `expected_output`, `slug`
- At least one eval contains a greeter-domain keyword (greeting, formal, casual, pirate, greeter) — catches garbage generation where AI ignores the target skill
- No `assertions` field in generated evals (user adds these manually)

#### US2: Full Eval Pipeline (With Assertions)
User has a skill with SKILL.md and `evals/evals.json` including assertions. Runs `snapeval eval` to get benchmark.

The story function:
1. Calls `adapter.run({ command: 'init', skillDir })` to generate evals
2. Adds assertions to the generated `evals.json` (programmatic file edit)
3. Calls `adapter.run({ command: 'eval', skillDir })` to run the full pipeline

Returns: `{ initResult, evalResult }` — both `E2ERunResult`.

**Primary assertions (file artifacts):**
- Iteration directory exists: `{workspace}/iteration-1/`
- For each eval slug, both `with_skill/` and `without_skill/` directories exist
- `timing.json` per variant with `total_tokens` (number > 0) and `duration_ms` (number > 0)
- `output.txt` per variant in `outputs/` subdirectory (non-empty)
- `grading.json` per variant with `assertion_results[]` and `summary` containing `passed`, `failed`, `total`, `pass_rate`
- `benchmark.json` at iteration level with `run_summary.with_skill`, `run_summary.without_skill`, `run_summary.delta`

**Secondary assertions (stdout):**
- Output references the skill name or benchmark results

#### US3: Eval Without Assertions
User has evals.json but no assertions field. Only timing artifacts should be produced, no grading.

Returns: `E2ERunResult`.

**Primary assertions:**
- `timing.json` written per variant
- `output.txt` written per variant
- `grading.json` NOT written (no assertions = no grading)
- `benchmark.json` written with `pass_rate.mean` of 0

#### US4: Eval With Old Skill Comparison
User runs eval with `--old-skill <path>` to compare current skill against a previous version instead of no-skill baseline.

Returns: `E2ERunResult`.

**Primary assertions:**
- `old_skill/` directory created instead of `without_skill/`
- Both `with_skill/` and `old_skill/` have `timing.json` and `output.txt`
- `benchmark.json` computed from with_skill vs old_skill comparison

#### US5: Review Flow
User runs `snapeval review` to get eval results plus a feedback template.

Returns: `E2ERunResult`.

**Primary assertions:**
- All eval artifacts produced (same as US2)
- `feedback.json` exists at iteration level with eval slugs as keys and empty string values

#### US6: Multiple Iterations
User runs `snapeval eval` consecutively. Each run creates a new numbered iteration directory.

The story function runs `adapter.run({ command: 'eval', skillDir })` three times.

Returns: `{ results: E2ERunResult[] }`.

**Primary assertions:**
- `iteration-1/`, `iteration-2/`, `iteration-3/` all exist
- Each has its own `benchmark.json`

#### US-ERR1: No SKILL.md
User points at a directory with no SKILL.md.

**Primary assertions:**
- No `evals/` directory created
- Stdout/stderr contains error mentioning SKILL.md or "not found"

#### US-ERR2: No evals.json (Eval Without Init)
User runs `snapeval eval` on a skill that hasn't been initialized yet (no evals.json).

**Primary assertions:**
- No iteration directory created
- Stdout/stderr explains that evals.json is needed / suggests running init

### Shared Assertions

Reusable validators for agentskills.io spec artifacts. Every adapter must produce these same artifacts.

```typescript
// tests/e2e/helpers/assertions.ts

assertEvalsJson(skillDir)                    // evals/evals.json exists, valid JSON, has evals array with entries
assertEvalsRelevance(skillDir, keywords)     // at least one eval contains a domain keyword
assertEvalsNoAssertions(skillDir)            // no assertions field in generated evals
assertIterationDir(workspace, n)             // iteration-N/ directory exists
assertDualRunDirs(evalDir)                   // with_skill/ and without_skill/ both exist
assertOldSkillDir(evalDir)                   // old_skill/ exists instead of without_skill/
assertTiming(runDir)                         // timing.json with total_tokens (>0) and duration_ms (>0)
assertOutput(runDir)                         // outputs/output.txt exists and is non-empty
assertGrading(runDir)                        // grading.json with assertion_results[] and summary
assertNoGrading(runDir)                      // grading.json does NOT exist
assertBenchmark(iterationDir)                // benchmark.json with run_summary.{with_skill, without_skill, delta}
assertFeedback(iterationDir)                 // feedback.json with eval slug keys
assertCleanState(dir)                        // no evals/, no iteration dirs created
assertStdoutContains(result, pattern)        // regex match on stdout
assertStderrContains(result, pattern)        // regex match on stderr
```

### Shared Fixtures

```typescript
// tests/e2e/helpers/fixtures.ts

/** Copy test-skills/greeter/ to temp dir. Returns path. */
copyGreeterSkill(options?: {
  includeEvals?: boolean;     // default true — copies evals/evals.json
  skillMdOnly?: boolean;      // just SKILL.md, nothing else
}): string

/** Add assertions to evals.json in a skill dir (for US2) */
addAssertionsToEvals(skillDir: string, assertions: string[]): void

/** Create a modified SKILL.md for old-skill comparison (for US4) */
createOldSkillVersion(skillDir: string): string  // returns path to old skill dir

/** Create empty temp directory (for US-ERR1) */
createEmptyDir(): string

/** Cleanup temp directory */
cleanup(dir: string): void
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
      generate-evals.ts
      eval-with-assertions.ts
      eval-without-assertions.ts
      eval-old-skill.ts
      review-flow.ts
      multi-iteration.ts
      error-paths.ts
  cli-flow.test.ts
  plugin-flow.test.ts
  sdk-flow.test.ts
```

**`cli-flow.test.ts`** — All user stories + CLI-specific:
- Exit code assertions (0 for success, non-zero for errors)
- Stderr content on errors
- Flag passthrough (`--harness`, `--inference`, `--workspace`, `--runs`, `--old-skill`)

**`plugin-flow.test.ts`** — All user stories + plugin-specific:
- Plugin install/uninstall lifecycle in `beforeAll`/`afterAll`
- Natural language prompt → correct command execution
- Model pinned to `gpt-4.1` to prevent flakiness

**`sdk-flow.test.ts`** — All user stories + SDK-specific:
- Session lifecycle (create/disconnect per run)
- Real token counts in timing.json (not estimated from output length)
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

- Per-test: 300s in `vitest.e2e.config.ts` (already configured)
- Plugin flow may need longer for multi-roundtrip stories

### Adding a Future Adapter (e.g., Claude Code)

1. Create `tests/e2e/helpers/adapters/claude-code-adapter.ts` implementing `E2ETestAdapter`
2. Create `tests/e2e/claude-code-flow.test.ts` importing stories + shared assertions + Claude-Code-specific tests
3. Add `e2e-claude-code` job to `.github/workflows/e2e.yml`
4. All user stories run automatically against the new surface

### What This Replaces

The mocked `tests/e2e/eval-pipeline.test.ts` on branch `feat/e2e-tests-v2` should be deleted. Its artifact-structure tests are valuable but belong in unit/integration tests (which already exist under `tests/engine/` and `tests/integration.test.ts`), not in E2E.
