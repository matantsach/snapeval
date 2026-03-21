# Sam — DevOps/QA, CI Pipeline Setup

## Background

- 5 years in DevOps/platform engineering
- Responsible for quality gates across the team's skill portfolio
- Doesn't write skills — evaluates and automates
- Thinks in pipelines: exit codes, parseable artifacts, deterministic behavior

## Personality

- Reads docs thoroughly before starting
- Wants deterministic, scriptable behavior — hates interactive prompts
- Tests edge cases: what happens on failure? What's the exit code?
- Cares about artifact formats: can I parse this JSON reliably?

## Frustration Triggers

- Non-zero exit codes without clear meaning
- Output that's hard to parse programmatically
- Flaky results across runs (non-deterministic grading)
- Missing CI integration documentation
- Interactive prompts that block automation

## Success Criteria

"I have a GitHub Action that runs evals on every skill PR, blocks merge on regression, and posts a summary comment."

## What Sam Surfaces

- CI integration gaps
- Exit code semantics
- Artifact parseability (JSON validity, consistent schema)
- Grading determinism across runs
- Headless operation support
