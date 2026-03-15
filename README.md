# snapeval

Semantic snapshot testing for AI skills. Zero assertions. AI-driven. Free inference.

[![CI](https://github.com/matantsach/snapeval/actions/workflows/ci.yml/badge.svg)](https://github.com/matantsach/snapeval/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/snapeval.svg)](https://www.npmjs.com/package/snapeval)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

snapeval evaluates [agentskills.io](https://agentskills.io) skills through semantic snapshot testing. It analyzes your skill's `SKILL.md`, collaborates with you to design a test strategy through an interactive browser-based viewer, then captures baselines and detects regressions — all with zero manual test authoring.

## Why snapeval?

- **Interactive ideation** — AI decomposes your skill into behaviors, dimensions, and failure modes, then opens a visual viewer where you shape the test strategy together.
- **Zero assertions** — No test logic to write. The AI generates realistic, messy prompts that mirror how real users actually type.
- **Semantic comparison** — Tiered pipeline: schema check (free) → LLM judge with order-swap debiasing (when needed). Most checks cost $0.
- **Free inference** — Uses gpt-5-mini via Copilot CLI and GitHub Models API.
- **Platform-agnostic** — Adapter-based architecture. Copilot CLI first, others coming.

## Install

### From the marketplace

The snapeval marketplace is bundled with the repo. Add it once, then install by name:

```bash
copilot plugin marketplace add matantsach/snapeval
copilot plugin install snapeval@snapeval-marketplace
```

### From GitHub directly

```bash
copilot plugin install matantsach/snapeval
```

### Verify installation

```bash
copilot plugin list
```

## Usage

In Copilot CLI, just talk naturally:

```
> evaluate my greeter skill
> test skills/code-reviewer for regressions
> check if I broke anything in my-skill
> approve scenario 3
```

snapeval activates automatically based on your prompt.

### What happens when you evaluate

1. **Analyze** — snapeval reads your SKILL.md and reasons through behaviors, input dimensions, failure modes, and ambiguities
2. **View** — A browser-based viewer opens showing the analysis with proposed scenarios you can toggle, edit, and extend
3. **Confirm** — You review, make changes, and click "Confirm & Run" to export your plan
4. **Capture** — snapeval writes `evals.json` and runs the scenarios against your skill, saving baseline snapshots

After initial setup, use `check` to detect regressions and `approve` to accept intentional changes.

## CLI Reference

The CLI is the headless backend — useful for CI, scripting, and power users.

```
snapeval init [skill-dir]         Generate test cases from SKILL.md
snapeval capture [skill-dir]      Run scenarios and save baseline snapshots
snapeval check [skill-dir]        Compare current output against baselines
snapeval approve [skill-dir]      Approve regressed scenarios as new baselines
snapeval report [skill-dir]       Write results with optional HTML viewer
snapeval ideate [skill-dir]       Open the interactive scenario ideation viewer
```

| Flag | Description | Default |
|------|-------------|---------|
| `--adapter <name>` | Skill adapter | `copilot-cli` |
| `--inference <name>` | Inference adapter | `auto` |
| `--budget <amount>` | Spend cap in USD | `unlimited` |
| `--runs <n>` | Baseline runs per scenario | `1` |
| `--ci` | CI mode: exit 1 on regressions | off |
| `--html` | Generate HTML report viewer | off |
| `--scenario <ids>` | Comma-separated scenario IDs | all |
| `--verbose` | Verbose output | off |

## How It Works

```
SKILL.md → AI analyzes skill → Interactive ideation viewer → Capture baselines
                                                                     ↓
              Modify skill → Re-run scenarios → Compare via tiered pipeline
                                                                     ↓
                                     Schema match? → PASS (free, instant)
                                     LLM Judge agrees? → PASS/REGRESSED
```

### Comparison Pipeline

| Tier | Method | Cost | When Used |
|------|--------|------|-----------|
| 1 | Schema check | Free | Structural skeleton matches |
| 2 | LLM judge (order-swap) | Cheap | Schema differs, needs semantic comparison |

Most stable skills are checked entirely at Tier 1 — $0.00 per run.

## Eval Format

snapeval follows the [agentskills.io evaluation standard](https://agentskills.io/skill-creation/evaluating-skills):

```
my-skill/
├── SKILL.md
└── evals/
    ├── evals.json          ← Test scenarios (AI-generated or from ideation)
    ├── analysis.json       ← Skill analysis (behaviors, dimensions, gaps)
    ├── snapshots/          ← Captured baseline outputs
    └── results/
        └── iteration-N/
            ├── grading.json
            ├── timing.json
            └── benchmark.json
```

## In CI

Commit your `evals.json` and `snapshots/` directory, then add a workflow:

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
      - run: npx snapeval check skills/my-skill --ci
```

## Local Development

```bash
git clone https://github.com/matantsach/snapeval.git
cd snapeval && npm install
npx tsx bin/snapeval.ts check <skill-path>
```

Or load as a local plugin:

```bash
copilot plugin install ./path/to/snapeval
```

## Configuration

Create `snapeval.config.json` in your skill or project root:

```json
{
  "adapter": "copilot-cli",
  "inference": "auto",
  "runs": 3,
  "budget": "unlimited"
}
```

CLI flags override config file values.

## Architecture

Three surfaces over a shared core engine:

- **Plugin** (SKILL.md) — Interactive product. AI handles everything.
- **CLI** (`npx snapeval`) — Headless backend for CI and power users.
- **GitHub Action** — CI wrapper (planned).

Adapter layers for platform independence:

- **SkillAdapter** — How to invoke a skill (Copilot CLI, others planned)
- **InferenceAdapter** — Where to get LLM capabilities (Copilot gpt-5-mini, GitHub Models API)
- **ReportAdapter** — How to present results (terminal, JSON, HTML viewer)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE)
