# snapeval

Semantic snapshot testing for AI skills. Zero assertions. AI-driven. Free inference.

[![CI](https://github.com/matantsach/snapeval/actions/workflows/ci.yml/badge.svg)](https://github.com/matantsach/snapeval/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/snapeval.svg)](https://www.npmjs.com/package/snapeval)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

snapeval evaluates [agentskills.io](https://agentskills.io) skills through semantic snapshot testing. It generates test cases from your skill's `SKILL.md`, captures baseline outputs, and detects regressions through a tiered comparison pipeline — all with zero manual test authoring.

## Why snapeval?

- **Zero assertions** — AI generates test cases from your SKILL.md. You never write test logic.
- **Semantic comparison** — Three-tier pipeline: schema check (free) → embedding similarity (cheap) → LLM judge with order-swap debiasing (expensive). Most checks cost $0.
- **Free inference** — Uses gpt-5-mini via Copilot CLI (0x multiplier on paid plans) and GitHub Models API (free with GITHUB_TOKEN).
- **Non-determinism handling** — Variance envelope from N baseline runs prevents false regressions.
- **Platform-agnostic** — Adapter-based architecture. Copilot CLI first, Claude Code and others coming.

## Quick Start

### As a Copilot CLI Plugin

Install directly from the GitHub repo:

```bash
gh copilot -- plugin install matantsach/snapeval
```

Or register the marketplace first, then install by name:

```bash
gh copilot -- plugin marketplace add matantsach/snapeval
gh copilot -- plugin install snapeval@snapeval-marketplace
```

Then in Copilot CLI interactive mode, just ask naturally:

```
> evaluate my code-reviewer skill
> check skills/code-reviewer for regressions
> approve scenario 3
```

The agent will use the snapeval skill automatically based on your prompt.

### As a CLI

```bash
npx snapeval init <skill-path>       # AI generates test cases from SKILL.md
npx snapeval capture <skill-path>    # Run tests, save baseline snapshots
npx snapeval check <skill-path>      # Compare current output to baselines
npx snapeval approve [--scenario N]  # Accept new behavior as baseline
npx snapeval report <skill-path>     # Generate benchmark.json
```

### Local Development

For development without `npx`, clone and use `tsx` directly:

```bash
git clone https://github.com/matantsach/snapeval.git
cd snapeval && npm install
npx tsx bin/snapeval.ts init <skill-path>
```

Or load as a local plugin during development:

```bash
gh copilot -- --plugin-dir /path/to/snapeval
```

### In CI

Commit your `evals.json` and `snapshots/` directory, then add a workflow:

```yaml
# .github/workflows/skill-eval.yml
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
      - run: npx tsx bin/snapeval.ts check skills/my-skill --ci --skip-embedding
```

> **Note:** The `--skip-embedding` flag runs Tier 1 (schema) and Tier 3 (LLM judge) only, skipping Tier 2 which requires the GitHub Models embedding API. For Tier 1-only checks (fastest, free, no API needed), committed baselines with stable output structures will pass without any inference calls.

## How It Works

```
SKILL.md → AI generates test scenarios → Capture baseline snapshots
                                                    ↓
         Modify skill → Re-run scenarios → Compare via tiered pipeline
                                                    ↓
                              Schema match? → PASS (free, instant)
                              Embedding > 0.85? → PASS (cheap)
                              LLM Judge agrees? → PASS/REGRESSED (expensive)
```

### Comparison Pipeline

| Tier | Method | Cost | When Used |
|------|--------|------|-----------|
| 1 | Schema check | Free | Structural skeleton matches |
| 2 | Embedding similarity | Cheap | Schema differs but meaning similar |
| 3 | LLM judge (order-swap) | Expensive | Ambiguous cases only |

Most stable skills are checked entirely at Tier 1 — $0.00 per run.

## Eval Format

snapeval follows the [agentskills.io evaluation standard](https://agentskills.io/skill-creation/evaluating-skills):

```
my-skill/
├── SKILL.md
└── evals/
    ├── evals.json          ← AI-generated test cases
    ├── snapshots/          ← Captured baseline outputs
    └── results/
        └── iteration-N/
            ├── grading.json
            ├── timing.json
            └── benchmark.json
```

## Configuration

Create `snapeval.config.json` in your skill or project root:

```json
{
  "adapter": "copilot-cli",
  "inference": "auto",
  "threshold": 0.85,
  "runs": 3,
  "budget": "unlimited"
}
```

CLI flags override config file values.

## CLI Reference

```
snapeval init [skill-dir]         Generate test cases from SKILL.md using AI
snapeval capture [skill-dir]      Run skill against all scenarios, save baselines
snapeval check [skill-dir]        Compare current output against baselines
snapeval approve [skill-dir]      Approve regressed scenarios as new baselines
snapeval report [skill-dir]       Write results to evals/results/iteration-N/
```

**Common flags:**

| Flag | Description | Default |
|------|-------------|---------|
| `--adapter <name>` | Skill adapter | `copilot-cli` |
| `--inference <name>` | Inference adapter | `auto` |
| `--threshold <n>` | Embedding similarity threshold | `0.85` |
| `--budget <amount>` | Spend cap in USD | `unlimited` |
| `--runs <n>` | Baseline runs per scenario | `1` |
| `--ci` | CI mode: exit 1 on regressions | off |
| `--skip-embedding` | Skip Tier 2 (embedding) | off |
| `--scenario <ids>` | Comma-separated scenario IDs | all |
| `--verbose` | Verbose output | off |

## Architecture

Three surfaces over a shared core engine:

- **Plugin** (SKILL.md) — Interactive product. AI handles everything.
- **CLI** (`npx snapeval`) — Headless backend for CI and power users.
- **GitHub Action** — CI wrapper (coming in v2).

Three adapter layers for platform independence:

- **SkillAdapter** — How to invoke a skill (Copilot CLI, Claude Code, generic)
- **InferenceAdapter** — Where to get LLM capabilities (Copilot gpt-5-mini, GitHub Models API)
- **ReportAdapter** — How to present results (terminal, JSON, PR comment)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE)
