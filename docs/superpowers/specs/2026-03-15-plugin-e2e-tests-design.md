# Plugin E2E Tests: User Story Coverage

## Problem

The existing e2e tests (`copilot-flow.test.ts`, `plugin-flow.test.ts`) test infrastructure (CLI commands) and have one weak plugin smoke test. None of the actual user stories — the paths a real user takes when interacting with snapeval through Copilot — are covered.

If someone ships a broken SKILL.md, a broken plugin.json, or a CLI change that breaks the plugin's command invocations, nothing catches it.

## Prerequisites

**SKILL.md sync:** The `plugin/skills/snapeval/SKILL.md` (what users actually get) is missing the `### report (visual review)` section that exists in `skills/snapeval/SKILL.md`. This is a shipping bug — users asking for a report get undefined behavior. This must be synced before US3 is meaningful. If it hasn't been synced when tests run, US3 should skip gracefully.

## User Stories to Cover

These are the interactions a user has with snapeval, all through Copilot with the plugin loaded:

### US1: "Evaluate my skill" (first-time setup)
User asks Copilot to evaluate a skill. Copilot should:
1. Read the target skill's SKILL.md
2. Generate test scenarios
3. Present them for confirmation
4. Run `snapeval init` + `snapeval capture`
5. Report captured baselines

Note: In e2e tests we tell Copilot to skip confirmation ("Run all scenarios without asking for confirmation") since `--no-ask-user` suppresses the interactive step. This is an acceptable deviation — but see "Approach B priorities" below.

**What to assert (priority order):**
- **Primary (file artifacts):** `evals/evals.json` is created, is valid JSON, has `evals` array with at least 1 entry
- **Primary (file artifacts):** At least one eval in `evals.json` contains a greeter-domain keyword (greeting, formal, casual, pirate, greeter) — catches garbage scenario generation where AI ignores the target skill
- **Primary (file artifacts):** `evals/snapshots/` contains `.snap.json` files, each with `output.raw` (non-empty) and `metadata.adapter`
- **Secondary (stdout):** Output references the skill name or scenario results

### US2: "Did I break anything?" (regression check — pass)
User asks Copilot to check a skill that already has baselines.

**What to assert:**
- **Primary (file artifacts):** Skill directory unchanged (no corruption)
- **Secondary (stdout):** Output contains verdict-like patterns (`/pass/i`, `/scenario/i`)
- **Tertiary (exit code, best-effort):** Pipeline completes without error. Note: Copilot wraps the CLI, so exit codes may not propagate reliably. Check exit != 2 (error) but don't hard-assert on 0 vs 1.

### US2b: "Did I break anything?" (regression detected)
Same as US2 but baselines are tampered with structurally different content.

**What to assert:**
- **Secondary (stdout):** Output mentions regression/regressed
- **Tertiary (exit code, best-effort):** If exit code is available, expect 1. Don't fail the test solely on exit code through the Copilot wrapper.

### US3: "Show me the report" (visual review)
User asks for an HTML report after a check.

Skips if `plugin/skills/snapeval/SKILL.md` doesn't contain the report section (see Prerequisites).

**What to assert:**
- **Primary (file artifacts):** `evals/results/iteration-1/` directory exists
- **Primary (file artifacts):** `report.html` and `viewer-data.json` exist in iteration dir
- **Primary (file artifacts):** HTML file is non-trivial (> 1KB, contains `<!DOCTYPE html>`)

### US4: "Accept the new behavior" (approve)
User asks Copilot to approve regressed scenarios.

Each test sets up its own state from scratch (tampered baselines). No dependency on US2 running first. The `approveCommand` re-invokes the skill adapter to get fresh output, so no prior check is needed.

**What to assert:**
- **Primary (file artifacts):** Snapshot files have different content after approval (compare before/after)
- **Primary (file artifacts):** `.audit-log.jsonl` exists with approval entries

### Error paths

#### US-ERR1: No SKILL.md at target path
User points Copilot at a directory with no SKILL.md.

**What to assert:**
- Pipeline does NOT produce evals or snapshots (primary)
- **Secondary (stdout):** Output contains an error message mentioning SKILL.md or "not found"

#### US-ERR2: No baselines (check without capture)
User runs check on a skill that hasn't been captured yet.

**What to assert:**
- Pipeline does NOT produce corrupt state (primary)
- **Secondary (stdout):** Output explains that baselines are needed / suggests running capture

## Design

### Test structure

```
tests/e2e/
  copilot-flow.test.ts    # CLI infrastructure smoke tests (keep as-is)
                           # Tests the CLI directly — "does the plumbing work?"
  plugin-flow.test.ts     # User story coverage through plugin (rewrite)
                           # Tests what users experience — "does the product work?"
```

These are complementary, not redundant. `copilot-flow` catches broken CLI internals. `plugin-flow` catches broken user experiences. Both can pass independently.

### Helper: `invokeCopilotWithPlugin`

Shared helper that:
1. Invokes `copilot -p <prompt> -s --no-ask-user --allow-all-tools --model gpt-4.1`
2. Captures stdout + stderr (merged on failure, like existing pattern)
3. Returns `{ stdout, exitCode }`
4. Has configurable timeout (default 180s)
5. Accepts optional `cwd` for working directory

Model is pinned to `gpt-4.1` to prevent flakiness from default model changes (matches existing convention in `copilot-flow.test.ts`).

### Test flow

Each test uses a fresh temp directory with a copy of `test-skills/greeter/`.

**Test: US1 — Evaluate flow**
1. Copy greeter SKILL.md only to temp dir (no evals, no snapshots)
2. Invoke Copilot: "Evaluate the skill at {path}. Run all scenarios without asking for confirmation."
3. Assert evals.json created, valid, has entries (primary)
4. Assert at least one eval contains greeter-domain keyword (primary)
5. Assert snapshot files created (primary)
6. Assert stdout references skill name or results (secondary)

**Test: US2 — Check flow (pass)**
1. Copy full greeter fixture (SKILL.md + evals/ + snapshots/) to temp dir
2. Invoke Copilot: "Check the skill at {path} for regressions"
3. Assert exit != 2 (tertiary, best-effort)
4. Assert stdout contains verdict patterns (secondary)

**Test: US2b — Check flow (regression detected)**
1. Copy full greeter fixture, tamper ALL baselines with structurally different content
2. Invoke Copilot: "Check the skill at {path}"
3. Assert stdout mentions regression (secondary)

**Test: US3 — Report flow**
1. Skip if plugin SKILL.md doesn't have the report section
2. Copy full greeter fixture to temp dir
3. Invoke Copilot: "Check the skill at {path} and generate an HTML report"
4. Assert iteration directory created (primary)
5. Assert report.html and viewer-data.json exist (primary)
6. Assert HTML is non-trivial (primary)

**Test: US4 — Approve flow**
1. Copy full greeter fixture, tamper baselines
2. Record snapshot file contents before approval
3. Invoke Copilot: "Approve all scenarios for the skill at {path}"
4. Assert snapshot content changed (primary)
5. Assert audit log exists (primary)

**Test: US-ERR1 — No SKILL.md**
1. Create empty temp dir (no SKILL.md)
2. Invoke Copilot: "Evaluate the skill at {path}"
3. Assert no evals.json or snapshots created (primary)
4. Assert stdout mentions error (secondary)

**Test: US-ERR2 — No baselines**
1. Copy greeter SKILL.md + evals.json but NO snapshots
2. Invoke Copilot: "Check the skill at {path}"
3. Assert no corrupt files created (primary)
4. Assert stdout mentions baselines/capture (secondary)

### Assertion strategy

Tiered by reliability:
- **Primary (file artifacts):** Deterministic. Did the right files get created/modified with valid structure? This is the main regression signal.
- **Secondary (stdout patterns):** Semi-reliable. Does stdout contain verdict-like patterns? Use regex (`/\d+ pass/i`, `/regress/i`) not loose keyword matching. These may break if Copilot rephrases, but catch gross failures.
- **Tertiary (exit codes):** Best-effort only through the Copilot wrapper. Copilot may not propagate underlying CLI exit codes. Use only as soft checks (expect not-2, not hard 0-vs-1).

### Shared fixtures

Pre-captured baselines exist at `test-skills/greeter/evals/snapshots/` (7 scenarios). Tests that need baselines copy the entire `test-skills/greeter/` directory tree. Tests that need a clean slate copy only `SKILL.md`.

### Skip logic

Same as existing: `describe.skipIf(!copilotAvailable)`. Tests auto-skip when Copilot isn't installed or authenticated.

### Plugin lifecycle

- `beforeAll`: Install plugin from project root (idempotent — check `copilot plugin list` first)
- `afterAll`: Uninstall plugin (best-effort, wrapped in try/catch)
- `afterEach`: Clean up temp directories

### Timeouts

- Per-test: 300s (Copilot calls are slow, evaluate flow makes multiple calls)
- E2E config: already set to 300s in `vitest.e2e.config.ts`

## What this does NOT cover (deferred to Approach B)

**#1 priority for Approach B: Scenario presentation and confirmation.** This is the core product differentiator — the AI generates scenarios, presents them as a numbered list, and waits for user confirmation before running. It's the "zero-authoring" promise. US1 skips this with `--no-ask-user`. If this interaction breaks, the product is fundamentally broken. This is the single most important thing to test in the next phase.

Other Approach B items:
- Whether the SKILL.md prompt causes correct AI behavior (scenario quality, conversational tone)
- Whether the AI reads the target SKILL.md before generating scenarios (US1 has a lightweight keyword check, but doesn't verify the AI actually reads the file)
- Semantic quality of generated test scenarios

These require a "skill simulation" test layer that tests the SKILL.md as a prompt contract.
