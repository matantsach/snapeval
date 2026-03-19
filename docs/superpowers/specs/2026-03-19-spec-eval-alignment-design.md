# snapeval: Align to agentskills.io Evaluation Spec

**Date:** 2026-03-19
**Status:** Draft

## Goal

Refactor snapeval to implement the [agentskills.io evaluation spec](https://agentskills.io/skill-creation/evaluating-skills) exactly. snapeval becomes a harness-agnostic eval runner — users bring their own harness (Claude Code, Copilot CLI, Copilot SDK, etc.), snapeval orchestrates the eval workflow and produces the spec's artifacts.

No backward compatibility. Everything not in the spec gets removed.

## CLI Commands

Three commands mapping to the spec's workflow phases:

### `snapeval init <skill-dir>`

Generates `evals/evals.json` from SKILL.md using an LLM. The user reviews and edits the file, then optionally adds assertions after seeing first outputs.

**Flags:** `--harness`, `--inference`, `--verbose`

### `snapeval eval <skill-dir>`

The core automated pipeline. For each eval case in `evals.json`:

1. **Run with skill** — invoke the harness with SKILL.md loaded, save outputs + timing
2. **Run without skill** — invoke the harness without SKILL.md, save outputs + timing
3. **Grade assertions** — if assertions exist, evaluate each against outputs using the inference LLM, produce grading.json per run
4. **Aggregate** — compute benchmark.json with `{with_skill, without_skill, delta}` stats

Creates a new `iteration-N/` directory in the workspace for each invocation.

**Flags:** `--harness`, `--inference`, `--workspace`, `--verbose`

**Comparing skill versions:** When `--old-skill <path>` is provided, the baseline run uses the old skill instead of running without a skill. Outputs go to `old_skill/` instead of `without_skill/`.

### `snapeval review <skill-dir>`

Runs `eval` then generates an HTML report and opens it in the browser. The user reviews results and optionally authors `feedback.json` by hand.

**Flags:** same as `eval` plus `--no-open`

## Harness Abstraction

The single extension point. A harness implements two operations:

1. **Run with skill** — start an agent session with SKILL.md loaded, execute the prompt, capture outputs
2. **Run without skill** — start an agent session without SKILL.md, execute the same prompt, capture outputs

Each run returns:
- `raw`: the agent's text output
- `files`: any files produced (paths relative to outputs/)
- `total_tokens`: token count for the session
- `duration_ms`: wall-clock time

Built-in harness: `copilot-cli` (uses `gh copilot`).

Selected via `--harness` flag or `snapeval.config.json`. The interface is public so users can implement custom harnesses.

## Inference Layer

Separate from the harness. Used for:
- Generating evals.json from SKILL.md (`init`)
- Grading assertions against outputs (`eval`)

Built-in: `copilot` (free via Copilot CLI), `github-models` (free via GITHUB_TOKEN). Auto-resolution with fallback chaining.

## Workspace Structure

Exactly per the agentskills.io spec. Workspace is a sibling directory `{skill-name}-workspace/` by default, configurable via `--workspace`.

```
skill-dir/
├── SKILL.md
└── evals/
    └── evals.json

skill-dir-workspace/
└── iteration-1/
    ├── eval-{slug}/
    │   ├── with_skill/
    │   │   ├── outputs/
    │   │   ├── timing.json
    │   │   └── grading.json
    │   └── without_skill/
    │       ├── outputs/
    │       ├── timing.json
    │       └── grading.json
    ├── benchmark.json
    └── feedback.json
```

Eval directory slug is derived from the eval prompt (first ~40 chars, kebab-cased).

## Artifact Formats

All formats match the agentskills.io spec exactly.

### timing.json

```json
{
  "total_tokens": 84852,
  "duration_ms": 23332
}
```

### grading.json

```json
{
  "assertion_results": [
    {
      "text": "The output includes a bar chart image file",
      "passed": true,
      "evidence": "Found chart.png (45KB) in outputs directory"
    }
  ],
  "summary": {
    "passed": 3,
    "failed": 1,
    "total": 4,
    "pass_rate": 0.75
  }
}
```

### benchmark.json

```json
{
  "run_summary": {
    "with_skill": {
      "pass_rate": { "mean": 0.83, "stddev": 0.06 },
      "time_seconds": { "mean": 45.0, "stddev": 12.0 },
      "tokens": { "mean": 3800, "stddev": 400 }
    },
    "without_skill": {
      "pass_rate": { "mean": 0.33, "stddev": 0.10 },
      "time_seconds": { "mean": 32.0, "stddev": 8.0 },
      "tokens": { "mean": 2100, "stddev": 300 }
    },
    "delta": {
      "pass_rate": 0.50,
      "time_seconds": 13.0,
      "tokens": 1700
    }
  }
}
```

### feedback.json

Authored by hand after human review:

```json
{
  "eval-top-months-chart": "The chart is missing axis labels and the months are in alphabetical order instead of chronological.",
  "eval-clean-missing-emails": ""
}
```

## What Gets Removed

- Snapshot system (`engine/snapshot.ts`, `commands/approve.ts`, `commands/capture.ts`)
- Comparison pipeline (`engine/comparison/` — schema check, LLM judge, embedding, variance)
- `commands/check.ts`, `commands/report.ts`, `commands/ideate.ts`
- Budget engine (`engine/budget.ts`)
- All associated tests

## What Stays (adapted)

- **Harness layer** (renamed from SkillAdapter) — `copilot-cli` adapter, extended to support with/without skill runs
- **Inference layer** — copilot + github-models adapters with auto-resolution
- **Generator** (`engine/generator.ts`) — generates evals.json from SKILL.md
- **Config resolution** (`config.ts`) — defaults → project config → skill-dir config → CLI flags
- **Error hierarchy** (`errors.ts`)
- **Report layer** — terminal + HTML reporters, adapted for new data model. JSON reporter replaced by direct artifact writes (the artifacts themselves are the JSON output).

## Config

`snapeval.config.json`:

```json
{
  "harness": "copilot-cli",
  "inference": "auto",
  "workspace": "../{skill_name}-workspace"
}
```

## HTML Report (optional enhancement)

Interactive single-file HTML viewer showing:
- Per-eval assertion results (with/without skill side by side)
- Benchmark delta visualization
- Output diffs between with_skill and without_skill runs

Not part of the agentskills.io spec but adds review value. Generated by `review` command.
