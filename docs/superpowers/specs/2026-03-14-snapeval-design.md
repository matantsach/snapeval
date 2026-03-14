# snapeval — Design Specification

Semantic snapshot testing for AI skills. Zero assertions. AI-driven. Free inference.

## Problem

AI skills (agentskills.io) have no automated regression detection. When a developer modifies a skill's SKILL.md, they have no way to know if the change broke existing behavior. Existing eval tools (Promptfoo, DeepEval) operate at the prompt/model layer — none evaluate at the skill layer. Anthropic's skill-creator is Claude-only and interactive-only; it cannot run in CI.

42% of developers can't write test automation. 58.8% of prompt+model combinations drift on API updates. Skills need testing that requires zero manual authoring and handles non-determinism.

## Solution

snapeval is an open-source, agentskills.io-conformant evaluation framework that:

1. **Generates test cases automatically** — AI reads a skill's SKILL.md and produces realistic test scenarios
2. **Captures semantic snapshots** — baseline outputs stored as structured snapshots
3. **Detects regressions through tiered comparison** — schema (free) → embedding (cheap) → LLM judge with order-swap debiasing (expensive)
4. **Handles non-determinism** — variance envelope from N baseline runs
5. **Costs nothing** — gpt-5-mini via Copilot CLI is free on paid plans; GitHub Models API is free in CI

## Architecture

### Surfaces

Three ways users interact with snapeval. The plugin is the product; the CLI and Action are infrastructure.

**Plugin (SKILL.md)** — Primary product. A Copilot CLI plugin containing a skill that instructs the AI agent to evaluate other skills interactively. User says `@snapeval evaluate my-skill`, the AI handles everything.

**CLI (`npx snapeval`)** — Headless backend for CI and power users. Commands: `init`, `capture`, `check`, `approve`, `report`. The plugin calls CLI commands under the hood.

**GitHub Action (`snapeval/action@v1`)** — Thin CI wrapper that runs `npx snapeval check` on PR events and posts results as a PR check.

### Core Engine

Four components, each with a single responsibility:

**Test Case Generator** — Given a skill's SKILL.md, uses LLM to generate 5-8 realistic test scenarios covering happy paths, edge cases, and boundary conditions. Produces `evals/evals.json` conforming to agentskills.io format. The human confirms/edits interactively (plugin mode) or accepts as-is (CI mode with `--auto-generate`).

**Snapshot Manager** — Captures skill outputs as structured snapshots in `evals/snapshots/`. Each scenario gets its own `.snap.json` file. Supports variance envelope: captures N runs (default 3) per scenario to establish acceptable output range. Handles `approve` workflow to accept new baselines with audit trail.

**Comparison Pipeline** — Three-tier comparison that minimizes cost:

- **Tier 1 — Schema Check (FREE)**: Compares output structure/shape. If the structural skeleton matches, the output is considered consistent. No API calls needed.
- **Tier 2 — Embedding Similarity (CHEAP)**: Computes cosine similarity between embedding vectors of baseline and new output. If similarity exceeds threshold (default 0.85), passes. One embedding API call per comparison.
- **Tier 3 — LLM Judge (EXPENSIVE)**: Sends both outputs to an LLM with a structured rubric. Uses order-swap debiasing: runs twice with swapped presentation order, only agrees if both orderings produce the same verdict. Two LLM calls per comparison.

Each tier is a gate. If Tier 1 passes, Tier 2 and 3 are skipped. If Tier 2 passes, Tier 3 is skipped. This means most stable scenarios cost nothing to check.

**Budget Engine** — Estimates cost before running evals. Tracks cumulative spend across runs. Enforces configurable budget caps (default: unlimited for free inference, $1.00 for paid models). Reports cost per scenario in results.

### Adapter Layers

Three independent adapter interfaces. Each adapter is a module that implements a defined interface. New adapters can be added without modifying the core engine.

**SkillAdapter** — How to invoke a skill on a given platform.

```typescript
interface SkillAdapter {
  name: string;
  invoke(skillPath: string, prompt: string, files?: string[]): Promise<SkillOutput>;
  isAvailable(): Promise<boolean>;
}
```

```typescript
interface SkillOutput {
  raw: string;                    // Full text output from the skill
  metadata: {
    tokens: number;               // Total tokens consumed
    durationMs: number;           // Wall-clock time
    model: string;                // Model used by the skill platform
    adapter: string;              // Which adapter produced this
  };
}
```

V1 adapters:
- `CopilotCLIAdapter` — Invokes skills through `gh copilot` CLI

**CopilotCLIAdapter invocation mechanism:**
```bash
# Invoke a skill with a prompt, capture stdout
gh copilot -p "<prompt>" --skill <skill-path> 2>/dev/null
```
The adapter spawns `gh copilot` as a child process, passes the test prompt via `-p` flag with `--skill` pointing to the target skill path, captures stdout as `raw`, and parses timing from stderr. If `gh copilot` is not installed or auth fails, `isAvailable()` returns false with a descriptive error message.

**Risk:** If Copilot CLI's programmatic invocation API changes, this adapter breaks. Mitigation: pin to a known-good `gh-copilot` version in docs, and the adapter interface means a fix is isolated to one file.

Future adapters (V2+):
- `ClaudeCodeAdapter` — Invokes skills via `claude --skill <path> -p "<prompt>" --output-format json`
- `GenericAdapter` — Invokes any CLI command with configurable template

**InferenceAdapter** — How to get LLM capabilities for judging, embedding, and test generation.

```typescript
interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatOptions {
  temperature?: number;           // Default: 0.0 for judging, 0.7 for generation
  maxTokens?: number;             // Default: 2048
  responseFormat?: 'text' | 'json'; // Default: 'text'
}

interface InferenceAdapter {
  name: string;
  chat(messages: Message[], options?: ChatOptions): Promise<string>;
  embed(text: string): Promise<number[]>;
  estimateCost(tokens: number): number;
}
```

V1 adapters:
- `CopilotInference` — Uses gpt-5-mini via `gh copilot -p` for chat. For embeddings, falls through to GitHub Models API (Copilot CLI does not expose an embedding endpoint).
- `GitHubModelsInference` — Uses GITHUB_TOKEN with GitHub Models API (free, 150 req/day). Supports both chat (`gpt-5-mini`) and embeddings (`text-embedding-3-small`). CI-primary adapter.

Future adapters (V2+):
- `OllamaInference` — Local models, fully offline

Inference resolution order: Copilot CLI (if available, chat only) → GitHub Models API (if GITHUB_TOKEN set, chat + embeddings) → error with helpful message. Note: Tier 2 (embedding similarity) requires GitHub Models API. If only Copilot CLI is available, Tier 2 is skipped and comparison goes directly from Tier 1 to Tier 3.

**ReportAdapter** — How to present results.

```typescript
interface ReportAdapter {
  name: string;
  report(results: EvalResults): Promise<void>;
}
```

V1 adapters:
- `TerminalReporter` — Pretty-printed terminal output with colors, pass/fail indicators
- `JSONReporter` — Writes grading.json, timing.json, benchmark.json per agentskills.io spec

Future adapters (V2+):
- `PRCommentReporter` — Posts results as GitHub PR comment/check

## Plugin Design

The snapeval Copilot CLI plugin is a directory conforming to the agentskills.io plugin spec:

```
snapeval-plugin/
├── plugin.json                   ← plugin manifest
├── skills/
│   └── snapeval/
│       └── SKILL.md              ← the evaluation skill
└── scripts/
    └── snapeval-cli.sh           ← wrapper that ensures npx snapeval is available
```

### SKILL.md Instructions (summary)

The SKILL.md instructs the AI agent to follow this flow:

1. **Parse user intent** — "evaluate", "check", or "approve" + target skill path
2. **For "evaluate" (first-time capture):**
   - Read the target skill's SKILL.md using the Read tool
   - Analyze its purpose, inputs, expected behaviors, and edge cases
   - Generate 5-8 test scenarios as a numbered list
   - Present to user: "Here are 6 test scenarios. Adjust or confirm?"
   - On confirmation, run `npx snapeval init <skill-path>` to write evals.json
   - Run `npx snapeval capture <skill-path>` to execute and store baselines
   - Report results conversationally
3. **For "check" (regression detection):**
   - Run `npx snapeval check <skill-path>`
   - Parse the JSON output
   - Report results conversationally: which passed, which regressed, what changed
4. **For "approve":**
   - Run `npx snapeval approve <skill-path> [--scenario N]`
   - Confirm to user what was approved

**Decision points where the agent pauses for user input:**
- After generating test scenarios (user can add/edit/remove)
- After detecting regressions (user decides: fix or approve)

**The agent does NOT pause for:**
- Running capture (automatic after confirmation)
- Running check (automatic, reports results)
- Writing evals.json (automatic from confirmed scenarios)

## Snapshot Format

Each `.snap.json` file stores one scenario's baseline:

```json
{
  "scenario_id": 1,
  "prompt": "Review this Python file with a SQL injection vulnerability",
  "output": {
    "raw": "This code contains a SQL injection vulnerability on line 12...",
    "metadata": {
      "tokens": 847,
      "durationMs": 1200,
      "model": "gpt-5-mini",
      "adapter": "copilot-cli"
    }
  },
  "captured_at": "2026-03-14T21:00:00Z",
  "runs": 3,
  "approved_by": null
}
```

The `variance-envelope.json` stores multi-run data for non-determinism handling:

```json
{
  "scenario_id": 1,
  "runs": [
    { "raw": "output from run 1...", "embedding": [0.12, 0.34, ...] },
    { "raw": "output from run 2...", "embedding": [0.13, 0.33, ...] },
    { "raw": "output from run 3...", "embedding": [0.11, 0.35, ...] }
  ],
  "centroid": [0.12, 0.34, ...],
  "radius": 0.08
}
```

### Variance Envelope Algorithm

1. During `capture`, run each scenario N times (default 3)
2. Compute embedding vectors for each run's output (via `InferenceAdapter.embed()`)
3. Compute the centroid (mean of all N embedding vectors)
4. Compute the radius (max cosine distance from centroid to any run's embedding)
5. During `check`, a new output is **within the envelope** if:
   - `cosine_similarity(new_embedding, centroid) >= threshold - radius`
   - Where `threshold` is the configured similarity threshold (default 0.85)
6. At the schema tier: a new output passes if its structural skeleton matches ANY of the N baseline schemas

If embeddings are unavailable (Copilot CLI only, no GitHub Models API), the variance envelope degrades gracefully: only Tier 1 (schema) and Tier 3 (LLM judge) are used, and the LLM judge prompt includes all N baseline outputs for context.

## Approve Workflow

When the user runs `snapeval approve`:

1. **Without `--scenario`**: Approves ALL scenarios that had regressions in the last `check` run
2. **With `--scenario N`**: Approves only scenario N
3. **What happens on approve:**
   - The current output (from the last `check` run) replaces the baseline in `snapshots/scenario-N.snap.json`
   - If variance envelope exists, it is reset — next `capture` will rebuild it
   - An audit entry is appended to `snapshots/.audit-log.jsonl`:
     ```json
     {"scenario_id": 1, "approved_at": "2026-03-14T21:30:00Z", "previous_hash": "abc123", "new_hash": "def456"}
     ```
   - The old snapshot is NOT preserved (git history serves as the archive)
4. **The approved snapshot must be committed to git** for CI to use the new baseline

## Eval Format (agentskills.io conformant)

snapeval follows the agentskills.io evaluation standard exactly. All files live inside the skill's directory under `evals/`.

### Directory Structure

```
my-skill/
├── SKILL.md                        ← the skill under test
├── scripts/
├── references/
└── evals/                          ← snapeval workspace
    ├── evals.json                  ← AI-generated test cases
    ├── files/                      ← input files for test scenarios
    │   ├── vulnerable.py
    │   └── clean-function.ts
    ├── snapshots/                  ← captured baseline outputs
    │   ├── scenario-1.snap.json
    │   ├── scenario-2.snap.json
    │   └── variance-envelope.json  ← N-run variance data
    └── results/
        └── iteration-N/
            ├── grading.json        ← per-assertion PASS/FAIL with evidence
            ├── timing.json         ← tokens & duration
            └── benchmark.json      ← aggregated pass_rate, cost, duration
```

### evals.json

```json
{
  "skill_name": "code-reviewer",
  "generated_by": "snapeval v1.0.0",
  "evals": [
    {
      "id": 1,
      "prompt": "Review this Python file with a SQL injection vulnerability",
      "expected_output": "Identifies the SQL injection, suggests parameterized queries",
      "files": ["evals/files/vulnerable.py"],
      "assertions": [
        "Mentions SQL injection or parameterized queries",
        "Provides a code fix suggestion"
      ]
    }
  ]
}
```

### grading.json

```json
{
  "assertion_results": [
    {
      "text": "Mentions SQL injection or parameterized queries",
      "passed": true,
      "evidence": "Output contains: 'This code is vulnerable to SQL injection. Use parameterized queries instead.'"
    }
  ],
  "summary": {
    "passed": 2,
    "failed": 0,
    "total": 2,
    "pass_rate": 1.0
  }
}
```

### timing.json

```json
{
  "total_tokens": 847,
  "duration_ms": 1200
}
```

### benchmark.json

V1 benchmark tracks snapshot regression stats only. The `with_skill` vs `without_skill` comparison (agentskills.io full format) is a V2 feature that requires running prompts without the skill loaded.

```json
{
  "run_summary": {
    "total_scenarios": 6,
    "passed": 5,
    "regressed": 1,
    "pass_rate": 0.833,
    "total_tokens": 4780,
    "total_cost_usd": 0.00,
    "total_duration_ms": 7100,
    "tier_breakdown": {
      "tier1_schema": 3,
      "tier2_embedding": 2,
      "tier3_llm_judge": 1
    }
  }
}
```

## User Stories

### Local Interactive — Plugin

**First-time setup:**

1. Developer installs the plugin: `gh copilot plugin install snapeval`
2. Developer says: `@snapeval evaluate my code-reviewer skill`
3. AI reads `skills/code-reviewer/SKILL.md`, generates 6 test scenarios
4. Presents scenarios to user for confirmation (can add, edit, remove)
5. User confirms. AI runs each scenario through Copilot CLI, captures outputs as snapshots
6. Reports: "Baseline captured. 6 scenarios. Total cost: $0.00 (gpt-5-mini)"

**Regression check:**

1. Developer modifies the code-reviewer skill
2. Developer says: `@snapeval check my code-reviewer skill`
3. AI re-runs all 6 scenarios, compares to baseline through tiered pipeline
4. Reports: "5/6 consistent. 1 regression: Scenario 3 — skill now skips large files"
5. Developer either fixes or says `@snapeval approve` to accept new baseline

### CI — GitHub Actions

**Setup:**

```yaml
# .github/workflows/skill-eval.yml
name: Skill Evaluation
on: [pull_request]

jobs:
  eval:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: snapeval/action@v1
        with:
          skill-path: skills/code-reviewer
          adapter: copilot-cli
          # Uses GITHUB_TOKEN for GitHub Models API inference — free
```

**PR flow:**

1. Developer pushes PR that modifies `skills/code-reviewer/SKILL.md`
2. GitHub Action runs `npx snapeval check --skill-path skills/code-reviewer --adapter copilot-cli --ci`
3. Reads existing `evals/` directory for test cases and baselines
4. Runs scenarios, compares to snapshots, grades assertions
5. Posts results as PR check (pass/fail with details)
6. If regression detected: check fails, PR blocked until developer fixes or runs `npx snapeval approve --scenario N`
7. Developer pushes updated snapshot, CI re-runs and passes

## CLI Commands

```
snapeval init <skill-path>        Generate evals.json from SKILL.md (AI-assisted)
snapeval capture <skill-path>     Run evals and save baseline snapshots
snapeval check <skill-path>       Run evals, compare to snapshots, exit 0/1
snapeval approve [--scenario N]   Accept current outputs as new baseline
snapeval report <skill-path>      Generate benchmark.json with aggregated stats
```

Flags shared across commands:
```
--adapter <name>       Skill adapter to use (default: copilot-cli)
--inference <name>     Inference adapter (default: auto-detect)
--threshold <float>    Embedding similarity threshold (default: 0.85)
--runs <int>           Number of baseline runs for variance envelope (default: 3)
--budget <amount>      Maximum spend per run (default: unlimited for free models)
--ci                   CI mode: no interactive prompts, JSON output, exit codes
--verbose              Show tier-by-tier comparison details
```

## Configuration

Project-level defaults via `snapeval.config.json` in the skill directory or project root (CLI flags override):

```json
{
  "adapter": "copilot-cli",
  "inference": "auto",
  "threshold": 0.85,
  "runs": 3,
  "budget": "unlimited"
}
```

Config resolution: CLI flags > `snapeval.config.json` in skill dir > `snapeval.config.json` in project root > built-in defaults.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| `gh copilot` not installed | `isAvailable()` returns false. CLI prints: "Copilot CLI not found. Install with: gh extension install github/gh-copilot" |
| `gh copilot` auth failure | Adapter throws with stderr message. CLI prints auth instructions. |
| GitHub Models API rate limit (150/day) | Adapter throws `RateLimitError`. CLI prints remaining quota and suggests `--adapter copilot-cli` for interactive use. |
| Skill invocation timeout (default 30s) | Adapter kills child process, throws `TimeoutError`. Scenario marked as `error` (not `regressed`). |
| Skill returns empty output | Stored as empty snapshot. On `check`, empty-vs-nonempty is always a regression. Empty-vs-empty passes at Tier 1. |
| LLM judge returns unparseable response | Retry once. If still unparseable, mark scenario as `inconclusive` with raw response in grading.json. |
| No `evals/` directory exists | `check` exits with error: "No baselines found. Run `snapeval capture` first." |
| `evals.json` missing or malformed | Exit with descriptive parse error and line number. |
| File system permission error | Exit with OS error message. Do not silently skip. |

All errors include exit code 2 (distinct from exit 1 for regressions and exit 0 for pass).

## Assertions Clarification

The evals.json format includes `assertions` arrays, but these are **AI-generated during `init`, not user-authored.** The "zero assertions" design principle means the user never writes assertion logic — the AI analyzes the skill's SKILL.md and generates appropriate assertions automatically. Users can edit the generated assertions during the interactive confirmation step, but they never start from a blank page.

## Technology Choices

- **Language**: TypeScript — npm ecosystem for CLI distribution (`npx`), GitHub Actions are JS-native, strong typing for adapter interfaces
- **Package manager**: npm — widest reach for developer tooling
- **CLI framework**: Minimal (commander or similar) — the CLI is thin, most logic is in the core engine
- **Testing**: vitest — fast, TypeScript-native, good for the test-case-generating-and-running-tests meta-irony
- **Distribution**: npm package (`npx snapeval`) + Copilot CLI plugin (`gh copilot plugin install snapeval`)

## Build Phases

### V1 — Core + Plugin (Ship It)

- Core comparison engine (3-tier pipeline)
- Snapshot manager (capture, store, diff, approve)
- AI test case generator (SKILL.md → evals.json)
- Copilot CLI skill adapter
- gpt-5-mini inference adapter (Copilot)
- GitHub Models inference adapter (CI fallback)
- SKILL.md plugin for Copilot CLI
- CLI (init, capture, check, approve, report)
- Terminal reporter
- JSON reporter (agentskills.io format)
- Copilot CLI plugin packaging

### V2 — CI + Adapters (Scale It)

- GitHub Action wrapper (`snapeval/action@v1`)
- PR comment reporter
- Claude Code skill adapter
- Ollama inference adapter (local/offline)
- Budget enforcement with warnings
- Iteration loop: auto-suggest skill improvements from failed assertions

### V3 — Ecosystem (Grow It)

- Generic CLI adapter (any tool)
- Interactive `--debug` mode
- Eval marketplace / shared test scenarios
- VS Code extension
- Multi-skill orchestration (test skill dependencies)

## Design Decisions

**Why snapshot testing over assertion-first?** Assertion-first requires users to define expected behavior upfront. 42% of devs can't write test automation. Snapshot testing captures "what the skill does now" and alerts on changes. The user decides if a change is a regression or improvement. Zero authoring burden.

**Why tiered comparison?** Most skill output changes are either structural (caught by free schema check) or clearly similar/different (caught by cheap embedding). Only ambiguous cases need expensive LLM judge. This means most checks cost $0.00.

**Why order-swap debiasing?** LLM judges have position bias — they tend to favor whichever output is presented first. Running twice with swapped order and requiring agreement eliminates this bias. Costs 2x but the accuracy improvement is worth it for the Tier 3 edge cases.

**Why variance envelope?** AI outputs are non-deterministic. A single baseline snapshot would trigger false regressions constantly. Capturing N baselines establishes the "normal range" of variation. Only outputs outside this range are flagged.

**Why gpt-5-mini?** It's free on Copilot paid plans (0x multiplier). GitHub Models API also provides it for free in CI (GITHUB_TOKEN, 150 req/day). Zero cost barrier to adoption.

**Why TypeScript?** npm distribution (`npx`) gives instant access without install steps. GitHub Actions are JS-native. Copilot CLI plugins are language-agnostic but JS/TS has the best tooling ecosystem. Strong typing aligns with the adapter pattern.

**Why not contribute to Promptfoo?** Promptfoo is now OpenAI-owned. Skill-level evaluation is architecturally different from prompt evaluation — skills have manifests, tool-use contracts, multi-turn behavior, and platform adapters. The zero-assertion snapshot approach is a fundamentally different testing paradigm. snapeval creates a new category, it doesn't compete with prompt eval tools.
