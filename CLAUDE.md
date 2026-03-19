# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm test              # Run all tests (vitest run)
npm run test:watch    # Watch mode (vitest)
npx vitest run tests/engine/comparison/schema.test.ts  # Run a single test file
npm run build         # Compile TypeScript (tsc → dist/)
npm run dev           # Run CLI in dev mode (tsx bin/snapeval.ts)
npx tsx bin/snapeval.ts <command> <skill-path>  # Run any CLI command locally
```

## Architecture

**snapeval** is a semantic snapshot testing tool for AI skills following the [agentskills.io](https://agentskills.io) standard. It generates test cases from a skill's `SKILL.md`, captures baseline outputs, and detects regressions through a tiered comparison pipeline.

### Core Flow

`init` (AI generates evals.json from SKILL.md) → `capture` (run skill, save baseline snapshots) → `review` (re-run, compare, generate HTML report, open in browser) → `approve` (accept regressions)

Lower-level commands: `check` (compare only, terminal output) · `report` (write iteration results to disk)

### Three Adapter Layers

Each layer is an interface in `src/types.ts` with implementations in `src/adapters/`:

- **SkillAdapter** (`src/adapters/skill/`) — How to invoke a skill. Currently: `CopilotCLIAdapter` (runs `gh copilot`).
- **InferenceAdapter** (`src/adapters/inference/`) — LLM capabilities for judging and generation. `CopilotInference` and `GitHubModelsInference` with auto-resolution and fallback chaining in `resolve.ts`.
- **ReportAdapter** (`src/adapters/report/`) — Result output. Terminal (colored), JSON (three files), HTML (interactive viewer).

### Tiered Comparison Pipeline (`src/engine/comparison/`)

Located in `pipeline.ts`, orchestrates:
1. **Tier 1 — Schema check** (`schema.ts`): Free structural comparison of markdown skeleton. Most stable skills pass here.
2. **Tier 2 — LLM Judge** (`judge.ts`): Bidirectional (forward + reverse) semantic comparison to detect order-swap bias. Returns pass/regressed/inconclusive.

Embedding similarity (`embedding.ts`) and variance envelopes (`variance.ts`) exist but are not yet wired into the pipeline.

### Other Key Modules

- `src/engine/generator.ts` — Builds prompts for AI test case generation, parses JSON responses
- `src/engine/snapshot.ts` — `SnapshotManager` class: save/load/approve snapshots with SHA-256 audit trail
- `src/engine/budget.ts` — `BudgetEngine` tracks cumulative spend against a configurable cap
- `src/config.ts` — Config resolution: defaults → project `snapeval.config.json` → skill-dir config → CLI flags
- `src/errors.ts` — Custom error hierarchy (`SnapevalError` base) with exit codes

### CLI Entry Point

`bin/snapeval.ts` uses `commander` to wire six commands, each in `src/commands/`. Commands resolve config, instantiate adapters, and delegate to engine modules.

## Testing

- Vitest with globals enabled. Tests mirror source structure under `tests/`.
- Adapters and inference are mocked via `vi.mock()` / `vi.mocked()`.
- Integration tests (`tests/integration.test.ts`) exercise the full init → capture → check workflow with mocked adapters.
- Tests use `fs.mkdtempSync` for temp directories, cleaned up in `afterEach`.

## TypeScript

- Strict mode, ES2022 target, ESNext modules with bundler resolution.
- ESM package (`"type": "module"` in package.json). Use `.js` extensions in imports.
