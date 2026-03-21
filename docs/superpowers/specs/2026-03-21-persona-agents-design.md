# Persona Agents — Design Specification

Self-dogfooding framework for snapeval. Three simulated users exercise snapeval's full workflow to surface friction, bugs, and gaps.

## Problem

snapeval has no structured way to test its own UX and end-to-end workflows from a real user's perspective. Unit tests validate engine internals, but nobody is asking: "Does this actually make sense to a first-time user? Does the output help a senior engineer trust the results? Can a DevOps person wire this into CI without hacks?"

## Solution

Three persona agents — each a Claude Code agent inhabiting a distinct user archetype — run snapeval against pre-built test skills and produce structured feedback targeting snapeval itself. This is Phase 1 of a 3-phase self-improvement loop:

- **Phase 1** (this spec): Create test skills + persona profiles + agent prompts
- **Phase 2**: Orchestration skill that kicks off all personas in one command
- **Phase 3**: Loop — run personas → collect feedback → improve snapeval → repeat

## Deliverables

### Part A: Test Skills (Fixtures)

Three pre-built skills with SKILL.md, evals.json, and optional scripts. These are the material personas run snapeval against — they are not the thing being tested.

#### `git-commit-msg` (Simple)

**Purpose:** Given a git diff, generate a conventional commit message.

- Single text input (diff), single text output (commit message)
- 4 eval cases: happy path, empty diff, large diff, merge commit
- LLM assertions only (no scripts)
- SKILL-v2.md adds: scope prefix support, breaking change detection

Example evals.json entry:
```json
{
  "id": 1,
  "prompt": "Generate a commit message for this diff:\n```diff\n- const x = 1;\n+ const x = 2;\n```",
  "expected_output": "A conventional commit message like 'fix: update constant value'",
  "files": [],
  "assertions": [
    "Output starts with a conventional commit prefix (feat:, fix:, chore:, refactor:, docs:, test:)",
    "Output is a single line under 72 characters",
    "Output does not include the diff itself"
  ]
}
```

#### `code-reviewer` (Complex)

**Purpose:** Analyze PR files, identify bugs and style issues, output structured feedback with severity.

- Multi-file input, structured JSON output
- 6 eval cases: clean code, obvious bug, style-only issues, empty PR, binary files, mixed languages
- Mix of LLM assertions and `script:` assertions (validate JSON structure, check severity enum values)
- SKILL-v2.md adds: severity levels (critical/warning/info) to output format

Example evals.json entry with script assertion:
```json
{
  "id": 1,
  "prompt": "Review this code for bugs:\n```js\nfunction add(a, b) { return a - b; }\n```",
  "expected_output": "Identifies the subtraction bug in the add function",
  "files": [],
  "assertions": [
    "Output identifies that the function uses subtraction (-) instead of addition (+)",
    "Output includes a suggested fix",
    "script:validate-json-structure.sh"
  ]
}
```

#### `api-doc-generator` (Medium)

**Purpose:** Given an OpenAPI spec, generate human-readable markdown API docs.

- Structured input (OpenAPI JSON), formatted markdown output
- 5 eval cases: simple CRUD API, nested schemas, auth endpoints, empty spec, webhook endpoints
- Mix of LLM assertions and `script:` assertions (validate markdown headers, check endpoint coverage)
- SKILL-v2.md adds: example request/response blocks in generated docs

Example evals.json entry with script assertion:
```json
{
  "id": 1,
  "prompt": "Generate API docs for this OpenAPI spec:\n{\"openapi\":\"3.0.0\",\"paths\":{\"/users\":{\"get\":{\"summary\":\"List users\"}}}}",
  "expected_output": "Markdown documentation with a heading for /users GET endpoint",
  "files": [],
  "assertions": [
    "Output contains a markdown heading for the /users endpoint",
    "Output includes the 'List users' summary text",
    "script:validate-markdown-headers.sh"
  ]
}
```

### evals.json Format Reference

All evals.json files must conform to the `EvalsFile` schema from `src/types.ts`:

```json
{
  "skill_name": "<skill-name>",
  "evals": [
    {
      "id": 1,
      "prompt": "The user's input",
      "expected_output": "Description of what correct output looks like",
      "files": [],
      "assertions": [
        "Plain English assertion (graded by LLM)",
        "script:my-validator.sh"
      ]
    }
  ]
}
```

**Field notes:**
- `expected_output` (required): Human-readable description of what correct output looks like. Not used by the grader — assertions are the actual test. This field exists for human readability when reviewing evals.json and appears in the review report. Write it as a brief description, not a literal expected string. See `test-skills/greeter/evals/evals.json` for examples.

**Assertion conventions:**
- **LLM assertions:** Plain English strings. Must be concrete and verifiable — "Output contains a YAML block with an 'id' field" not "Output is correct."
- **Script assertions:** Prefixed with `script:`. The filename is relative to `<skill-dir>/evals/scripts/`. The script receives the output directory as its first argument and passes on exit code 0. Scripts must be executable (`chmod +x`). If not executable, the grader reports `passed: false` with a misleading "non-zero exit code" message — there is no setup-time diagnostic.

### Part B: Persona Agents

Each persona has two files: PROFILE.md (who they are) and AGENT_PROMPT.md (executable agent instructions).

#### Alex — Junior Developer, First-Time User

**Assigned skill:** `git-commit-msg`

**Profile:**
- Junior frontend dev, 1 year experience. Built their first skill, wants to know if it works.
- Never used snapeval before. Doesn't fully understand assertions or dual-run comparison.
- Reads docs loosely, tries things, gets confused by jargon. Expects things to "just work."
- Frustration triggers: cryptic errors, unclear next steps, having to understand engine internals.
- Success criteria: "I ran it, I see pass/fail, I know what to do next."

**What Alex surfaces:** First-time UX friction, confusing output, missing guardrails, error message clarity.

#### Jordan — Senior Engineer, Iterating on Shipped Skill

**Assigned skill:** `code-reviewer`

**Profile:**
- 8 years experience, full-stack. Maintains a code-review skill used by their team.
- Comfortable with CLI, reads source when docs are unclear. Thinks carefully about eval coverage.
- Wants fast iteration: run evals, see deltas, trust results. Will question grading accuracy.
- Frustration triggers: false positives/negatives, slow iteration, can't tell what regressed and why.
- Success criteria: "I see exactly what regressed, the evidence is convincing, my fix worked."

**What Jordan surfaces:** Grading accuracy, iteration speed, benchmark trustworthiness, evidence quality.

#### Sam — DevOps/QA, CI Pipeline Setup

**Assigned skill:** `api-doc-generator`

**Profile:**
- 5 years in DevOps/platform engineering. Sets up quality gates for the team's skill portfolio.
- Thinks in pipelines: exit codes, parseable artifacts, deterministic behavior.
- Reads docs thoroughly. Wants scriptable, headless operation. Hates interactive prompts.
- Frustration triggers: ambiguous exit codes, unparseable output, flaky results, missing CI docs.
- Success criteria: "GitHub Action runs evals on skill PRs, blocks merge on regression, posts summary."

**What Sam surfaces:** CI integration gaps, exit code semantics, artifact parseability, grading determinism.

### Workflow Stages (All Personas)

Each persona executes 3 stages against their assigned skill. The skill and evals are pre-built — personas focus on the snapeval experience.

All commands run from the repo root using `npx tsx bin/snapeval.ts` (dev invocation — the package is not globally installed). All stages use the explicit skill path.

**Stage 1 — First Eval Run**
- Run `npx tsx bin/snapeval.ts eval personas/skills/<skill>` on the pre-built skill
- Examine all output artifacts (grading.json, benchmark.json, terminal output)
- Report on: Was the output clear? Did they understand what happened? Any errors?

**Stage 2 — Re-check After Skill Change**
- Copy SKILL-v2.md over SKILL.md (`cp personas/skills/<skill>/SKILL-v2.md personas/skills/<skill>/SKILL.md`)
- Re-run `npx tsx bin/snapeval.ts eval personas/skills/<skill>`
- Compare new pass rate against Stage 1 results
- Report on: Was the change in results clear? Is grading evidence trustworthy? Any false positives/negatives?
- Note: SKILL.md is overwritten. Re-running Stage 1 requires restoring the original via `git checkout`.

**Stage 3 — Add New Evals**
- Edit evals.json in place — append a new eval case relevant to their skill domain
- Re-run `npx tsx bin/snapeval.ts eval personas/skills/<skill>`
- Report on: Was extending evals smooth? Did the new case integrate cleanly? Any issues?

**Persona-specific bonus stages:**
- Jordan (Stage 4): Dig into benchmark.json numbers, question stddev, run with `--runs 3`. Note: current `--runs` implementation only retains the last run's grading per eval case — stddev in benchmark.json comes from variance across eval cases, not repeated measurements. This is a known gap that Jordan should surface as `category: "missing_feature"`, `severity: "slows_down"`.
- Sam (Stage 4): Parse artifacts programmatically, test exit codes on failure, validate headless operation. Output artifacts land in a workspace directory (default: `<skill-name>-workspace/` relative to CWD). The workspace contains `iteration-N/eval-{slug}/{with_skill,without_skill}/` subdirectories. The `eval` command prints the iteration directory path to stdout. Sam should discover and parse artifacts from this path.

### Feedback Format

After each stage, the agent produces structured feedback:

```json
{
  "persona": "alex",
  "stage": 1,
  "actions": ["ran npx snapeval eval personas/skills/git-commit-msg"],
  "worked": ["eval completed", "grading.json was produced"],
  "issues": [
    {
      "description": "Terminal output says 'pass_rate: 0.75' but doesn't say which assertions failed",
      "severity": "blocks_workflow",
      "category": "ux",
      "suggested_fix": "Print failed assertions with their evidence inline"
    }
  ]
}
```

**Severity levels:**
- `blocks_workflow` — Can't proceed without fixing this
- `slows_down` — Workaround exists but it's painful
- `minor_annoyance` — Noticed it, doesn't block anything

**Categories:**
- `ux` — Output clarity, error messages, terminal formatting
- `bug` — Something broke or produced wrong results
- `missing_feature` — Expected capability that doesn't exist
- `grading` — Assertion grading accuracy issues
- `docs` — Documentation gaps or inaccuracies

## File Structure

```
personas/
├── skills/
│   ├── git-commit-msg/
│   │   ├── SKILL.md
│   │   ├── SKILL-v2.md
│   │   └── evals/
│   │       └── evals.json
│   ├── code-reviewer/
│   │   ├── SKILL.md
│   │   ├── SKILL-v2.md
│   │   └── evals/
│   │       ├── evals.json
│   │       └── scripts/
│   │           ├── validate-json-structure.sh
│   │           └── check-severity-values.sh
│   └── api-doc-generator/
│       ├── SKILL.md
│       ├── SKILL-v2.md
│       └── evals/
│           ├── evals.json
│           └── scripts/
│               ├── validate-markdown-headers.sh
│               └── check-endpoint-coverage.sh
├── alex/
│   ├── PROFILE.md
│   └── AGENT_PROMPT.md
├── jordan/
│   ├── PROFILE.md
│   └── AGENT_PROMPT.md
└── sam/
    ├── PROFILE.md
    └── AGENT_PROMPT.md
```

## Environment Prerequisites

- **CLI invocation:** Use `npx tsx bin/snapeval.ts` (dev mode) from the repo root. The package is not globally installed.
- **Harness:** `copilot-cli` (default). Copilot CLI must be installed and authenticated (`npm install -g @github/copilot`). Alternatively, pass `--harness <other>` if another harness is available.
- **Inference:** `auto` (default). Resolves to Copilot CLI or GitHub Models API via `GITHUB_TOKEN`. No additional config needed if Copilot CLI is installed.
- **Script permissions:** All files in `evals/scripts/` must be executable (`chmod +x`). The implementation must set this during file creation.
- No `snapeval.config.json` is needed in the persona skill directories — CLI defaults are sufficient for the dogfooding workflow.

## Non-Goals

- Not testing the skills themselves — skills are fixtures
- Not replacing unit/integration tests — this tests UX and end-to-end workflow
- Phase 2 (orchestration) and Phase 3 (feedback loop) are out of scope for this spec
