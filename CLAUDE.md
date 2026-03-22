# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm test              # Run all tests (vitest run)
npm run test:watch    # Watch mode (vitest)
npx vitest run tests/engine/grader.test.ts  # Run a single test file
npm run build         # Compile TypeScript (tsc → dist/)
npm run dev           # Run CLI in dev mode (tsx bin/snapeval.ts)
npx tsx bin/snapeval.ts <command> <skill-path>  # Run any CLI command locally
```

## Architecture

**snapeval** is a harness-agnostic eval runner implementing the [agentskills.io evaluation spec](https://agentskills.io/skill-creation/evaluating-skills). Users bring their own harness (Claude Code, Copilot CLI, Copilot SDK, etc.) — snapeval orchestrates the eval workflow and produces spec-compliant artifacts.

### Core Flow

`eval` (run with/without skill, grade assertions, compute benchmark). Use `--feedback` to generate a `feedback.json` template for human review.

### Two Adapter Layers

Each layer is an interface in `src/types.ts` with implementations in `src/adapters/`:

- **Harness** (`src/adapters/harness/`) — How to invoke a skill. Implements `run()` with and without SKILL.md. Built-in: `CopilotSDKHarness` (default, uses `@github/copilot-sdk` with native skill loading via `skillDirectories`), `CopilotCLIHarness` (fallback, shells out to `copilot` CLI). Session isolation required per run.
- **InferenceAdapter** (`src/adapters/inference/`) — LLM for grading assertions. `CopilotSDKInference` and `GitHubModelsInference` with auto-resolution in `resolve.ts`.

### Engine Modules (`src/engine/`)

- `workspace.ts` — `WorkspaceManager`: creates `iteration-N/eval-{slug}/{with_skill,without_skill}/outputs/` directory structure
- `runner.ts` — `runEval()`: orchestrates dual harness runs (with/without skill), writes `timing.json` and `output.txt` per run
- `grader.ts` — `gradeAssertions()`: LLM-based grading for semantic assertions, script-based for `script:` prefixed assertions. Writes `grading.json`
- `aggregator.ts` — `computeBenchmark()`: computes `benchmark.json` with mean/stddev/delta across with_skill vs without_skill

### Other Key Modules

- `src/config.ts` — Config resolution: defaults → project `snapeval.config.json` → skill-dir config → CLI flags
- `src/errors.ts` — Custom error hierarchy (`SnapevalError` base) with exit codes

### CLI Entry Point

`bin/snapeval.ts` uses `commander` to wire one command (`eval`) in `src/commands/`. The command resolves config, instantiates adapters, and delegates to engine modules.

### Artifact Formats (agentskills.io spec)

- `timing.json` — `{total_tokens, duration_ms}` per run
- `grading.json` — `{assertion_results[], summary: {passed, failed, total, pass_rate}}` per run
- `benchmark.json` — `{run_summary: {with_skill, without_skill, delta}, metadata: {eval_count, eval_ids, skill_name, runs_per_eval, timestamp}}` per iteration
- `feedback.json` — `{[evalSlug]: string}` template for human review

## Testing

- Vitest with globals enabled. Tests mirror source structure under `tests/`.
- Adapters and inference are mocked via `vi.mock()` / `vi.mocked()`.
- Integration tests (`tests/integration.test.ts`) exercise the eval workflow with mocked adapters.
- Tests use `fs.mkdtempSync` for temp directories, cleaned up in `afterEach`.

## TypeScript

- Strict mode, ES2022 target, ESNext modules with bundler resolution.
- ESM package (`"type": "module"` in package.json). Use `.js` extensions in imports.

## Git & Release Discipline

### Never push to main

Every change goes through branch → PR → CI → merge. No exceptions for "quick fixes" or follow-ups.

### Conventional commits for release-please

| Change type | Prefix | Release |
|---|---|---|
| New feature | `feat:` | minor bump |
| Breaking change (removed command, changed API) | `feat!:` | major bump |
| Bug fix | `fix:` | patch bump |
| Docs, tests, refactoring, cleanup | `chore:` | **no release** |

Pick the prefix that matches the change semantics. Removing a CLI command is `feat!:`, not `chore:`.

## Pre-PR Checklist

Before creating a PR, verify ALL consumers of changed/removed features are updated. Grep broadly — not just code imports:

- [ ] `skills/create-evals/SKILL.md` — onboarding skill references correct commands, flags, and workflows
- [ ] `skills/run-evals/SKILL.md` — eval runner skill references correct commands, flags, and workflows
- [ ] `CLAUDE.md` — architecture docs, core flow, command counts
- [ ] `bin/snapeval.ts` — CLI entry point
- [ ] Error messages in `src/` — no references to removed commands
- [ ] E2E test helpers (`tests/e2e/helpers/`) — types, adapters, stories
- [ ] `plugin.json`, `.claude-plugin/plugin.json` — plugin metadata if applicable
