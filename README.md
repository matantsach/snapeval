# snapeval

Harness-agnostic eval runner for [agentskills.io](https://agentskills.io) skills.

[![CI](https://github.com/matantsach/snapeval/actions/workflows/ci.yml/badge.svg)](https://github.com/matantsach/snapeval/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/snapeval.svg)](https://www.npmjs.com/package/snapeval)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

snapeval runs every eval case **with and without** your skill, grades assertions, and computes a benchmark delta — so you can see exactly what value your skill adds.

```
snapeval — greeter
Baseline = without SKILL.md (raw AI response)
────────────────────────────────────────────────────────────
  #1 formal greeting for Eleanor
    Skill: 100% | Baseline: 33% | 5.2s
  #2 casual greeting for Marcus
    Skill: 100% ↑ was 67% | Baseline: 67% | 2.7s
  #3 pirate greeting for Zoe
    Skill: 100% | Baseline: 67% | 2.5s
────────────────────────────────────────────────────────────
Summary:
  Skill pass rate:    100.0%
  Baseline pass rate: 55.6%
  Improvement:        +44.4%
```

## How it works

1. You write a `SKILL.md` and an `evals.json` with test cases and assertions
2. snapeval runs each eval **twice** — once with your skill loaded, once without (baseline)
3. Assertions are graded by an LLM judge (semantic) and/or shell scripts (deterministic)
4. A benchmark shows where your skill adds value vs. where the raw AI already handles it

## Quick start

### As a Copilot plugin

```bash
copilot plugin install matantsach/snapeval
```

Then in Copilot CLI, just say `evaluate my skill` — the snapeval skill handles the rest.

### Standalone CLI

```bash
git clone https://github.com/matantsach/snapeval.git
cd snapeval && npm install
npx tsx bin/snapeval.ts eval <skill-dir>
```

## Eval format

```
my-skill/
├── SKILL.md
└── evals/
    ├── evals.json
    └── scripts/         ← optional deterministic checks
        └── validate.sh
```

**evals.json:**

```json
{
  "skill_name": "greeter",
  "evals": [
    {
      "id": 1,
      "label": "formal greeting for Eleanor",
      "prompt": "Can you give me a formal greeting for Eleanor?",
      "expected_output": "Returns the formal greeting addressed to Eleanor.",
      "assertions": [
        "Output contains the name Eleanor",
        "Output uses a formal tone",
        "script:validate.sh"
      ]
    }
  ]
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Unique numeric identifier |
| `prompt` | yes | The user prompt sent to the harness |
| `expected_output` | yes | Human description of the expected behavior |
| `label` | no | Human-readable name shown in terminal output |
| `slug` | no | Filesystem-safe name for the eval directory |
| `assertions` | no | List of assertions to grade (LLM semantic or `script:` prefixed) |
| `files` | no | Input files to attach to the prompt |

### Assertions

**Semantic** — graded by an LLM. Write specific, verifiable statements:

```
"Output contains a YAML block with an 'id' field for each issue"
"Response declines because the pipeline already has unclaimed issues"
```

**Script** — prefix with `script:`. Scripts live in `evals/scripts/`, receive the output directory as `$1`, and pass on exit code 0:

```
"script:validate-json-structure.sh"
```

## CLI reference

### `eval`

Run evals, grade assertions, compute benchmark.

```bash
npx snapeval eval [skill-dir] [options]
```

| Flag | Description | Default |
|------|-------------|---------|
| `--harness <name>` | Harness adapter | `copilot-sdk` |
| `--inference <name>` | Inference adapter for grading | `auto` |
| `--workspace <path>` | Output directory | `../{skill_name}-workspace` |
| `--runs <n>` | Harness invocations per eval for statistical averaging | `1` |
| `--concurrency <n>` | Parallel eval cases (1-10) | `1` |
| `--only <ids>` | Run specific eval IDs (e.g. `--only 1,3,5`) | all |
| `--threshold <rate>` | Minimum pass rate 0-1 for exit code 0 | none |
| `--old-skill <path>` | Compare against old skill version | none |
| `--verbose` | Verbose output | off |

### `review`

Run eval + generate HTML report + open in browser.

```bash
npx snapeval review [skill-dir] [options]
```

Same flags as `eval`, plus `--no-open` to skip opening the browser.

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Threshold not met (eval ran but pass rate below `--threshold`) |
| 2 | Config/input error (bad JSON, missing fields, invalid flags) |
| 3 | File not found (missing skill dir, evals.json, or script) |
| 4 | Runtime error (harness failure, grading failure, timeout) |

## Output artifacts

Each run creates an iteration directory:

```
workspace/
└── iteration-1/
    ├── benchmark.json       ← aggregate stats with delta
    ├── SKILL.md.snapshot    ← copy of skill used
    └── eval-{slug}/
        ├── with_skill/
        │   ├── outputs/output.txt
        │   ├── timing.json
        │   ├── grading.json
        │   └── transcript.log
        └── without_skill/
            ├── outputs/output.txt
            ├── timing.json
            └── grading.json
```

**benchmark.json** includes metadata: `eval_count`, `eval_ids`, `skill_name`, `runs_per_eval`, `timestamp`.

## CI integration

```yaml
name: Skill Evaluation
on: [pull_request]

jobs:
  eval:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npx snapeval eval skills/my-skill --threshold 0.8 --runs 3
```

Exit code 1 when pass rate falls below threshold — blocks the PR.

## Configuration

Create `snapeval.config.json` in your skill or project root:

```json
{
  "harness": "copilot-sdk",
  "inference": "auto",
  "workspace": "../{skill_name}-workspace",
  "runs": 1,
  "concurrency": 1
}
```

Resolution order: defaults → project config → skill-dir config → CLI flags.

## Harness adapters

| Adapter | Description | Default |
|---------|-------------|---------|
| `copilot-sdk` | Programmatic via `@github/copilot-sdk` with native skill loading | yes |
| `copilot-cli` | Shells out to `copilot` CLI binary | no |

The SDK harness loads skills natively via `skillDirectories`, captures full transcripts, and extracts real token counts from `assistant.usage` events.

## Inference adapters

| Adapter | Description |
|---------|-------------|
| `auto` | Copilot CLI if available, else GitHub Models API |
| `copilot` | Copilot CLI (`copilot` binary) |
| `copilot-sdk` | `@github/copilot-sdk` programmatic |
| `github-models` | GitHub Models API (requires `GITHUB_TOKEN`) |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
