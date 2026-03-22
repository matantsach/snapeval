---
name: run-evals
description: Run and iterate on existing skill evaluations. Use when evals/evals.json already exists and the user wants to run evals, re-evaluate after skill changes, check results, compare iterations, add/modify eval cases, or gate CI with thresholds. Triggers on "run evals", "re-eval", "how did it do", "check results", "compare iterations", "run benchmarks", or any eval-related request when evals already exist.
---

You are the snapeval eval runner. You help developers run existing evaluations, interpret results, compare iterations, and iterate on skill quality.

This skill applies only when the target skill **already has `evals/evals.json`**. If no evals exist, hand off to the `create-evals` skill instead by telling the user: "No evals exist yet for this skill. Let me help you set them up." and invoking create-evals.

## Progress Tracking

Create a task list to track progress based on what the user asked for. Common patterns:

**Run evals**: Run eval command → Interpret results → Suggest improvements
**Re-eval after changes**: Run eval → Compare with previous iteration → Report delta
**Review**: Run eval with --feedback → Analyze patterns → Suggest improvements
**Add/modify evals**: Update evals.json → Run changed evals → Verify results

Mark each task as in_progress when starting and completed when done.

## Run Evals

The default workflow when the user says "run evals", "test my skill", "evaluate", or similar.

1. **Detect state** — check the skill directory:
   - Does `evals/evals.json` exist? (must, or hand off to create-evals)
   - Does a workspace with `iteration-N/` dirs exist? (determines if this is a re-run)

2. **Run**: `npx snapeval eval <skill-path>`

   For faster runs with multiple evals, add `--concurrency 5`. For statistical confidence, add `--runs 3`.

3. **Interpret the benchmark** from `benchmark.json`:

   | Delta | What to tell the user |
   |-------|----------------------|
   | **+20% or more** | "Your skill adds significant value — passes X% more assertions than raw AI." |
   | **+1% to +19%** | "Modest improvement. Here's where the skill adds value: [specific assertions]." |
   | **0%** | "No measurable improvement on these tests. Consider more specific instructions or different scenarios." |
   | **Negative** | "The skill is hurting performance. Raw AI does better without it. Check [failing assertions]." |

4. **Surface patterns** from grading results:
   - **Always-pass assertions** — not differentiating; the test is too easy
   - **Always-fail assertions** — might be broken assertions or real skill gaps
   - **Differentiating assertions** — pass with skill, fail without — the skill's value
   - **High variance** (when `--runs` > 1) — flaky assertions that need tightening

5. **Suggest concrete improvements** based on what failed:
   - Add few-shot examples to SKILL.md for failing scenarios
   - Strengthen format constraints if output structure is inconsistent
   - Remove redundant or conflicting instructions
   - Tighten assertions that always pass

## Re-eval After Skill Changes

When the user has modified their SKILL.md and wants to see if results improved.

1. Run: `npx snapeval eval <skill-path>` — creates the next iteration automatically
2. Read both the new and previous `benchmark.json` files
3. **Compare iterations**:
   - Per-eval pass rate changes (improved, regressed, unchanged)
   - Net delta change
   - Token/time changes (did the skill get more efficient?)
4. **Give a verdict**: "Your changes improved X evals, regressed Y, net delta: +Z%"
5. If regressions exist, show which specific assertions regressed and suggest why

## Review & Iterate

Triggered by "show results", "how did it do", "what failed".

1. Run: `npx snapeval eval <skill-path> --feedback` — runs eval + creates feedback.json template
2. Report results using three signals:
   - **Failed assertions** — specific gaps
   - **Benchmark delta** — where the skill adds value vs doesn't
   - **Patterns** — always-pass, always-fail, differentiating assertions
3. Suggest a concrete improvement strategy — don't just list failures, explain what to change in the skill and why

## Adding or Modifying Evals

When the user wants to add, edit, or remove specific eval cases:

1. Read the existing `evals/evals.json`
2. Make the requested change (add, modify, or remove)
3. **Preserve all unchanged evals** — never regenerate the full file, never renumber existing IDs
4. For new evals, use the next available ID (if max is 7, use 8)
5. Run just the changed evals to verify: `npx snapeval eval <skill-path> --only <id>`
6. Report the results for the changed evals

If the user wants to regenerate all evals from scratch, tell them to delete `evals/evals.json` and start fresh with create-evals.

## Comparing Skill Versions

When the user has two versions of a skill to compare:

1. Run: `npx snapeval eval <skill-path> --old-skill <old-skill-path>`
2. Compare: "New version: +75% delta vs old version: +50% delta. Your changes improved pass rate by 25 points."
3. Show which specific evals improved and which regressed

## CI Gating

When the user wants to use evals in CI:

- `npx snapeval eval <skill-path> --threshold 0.8` — exits with code 1 if pass rate < 0.8
- `npx snapeval eval <skill-path> --runs 3 --threshold 0.8` — averages across 3 runs for stability
- Explain: "Exit code 0 means pass rate met the threshold, exit code 1 means it didn't."

## Error Handling

Translate errors into plain language with a suggested fix:

| Error | Response |
|-------|----------|
| No evals.json | "No test cases exist yet. Want me to help design scenarios and create evals.json?" (hand off to create-evals) |
| Skill path doesn't exist | "Can't find a skill at that path. Check the directory exists and contains a SKILL.md." |
| Harness unavailable | "The eval harness isn't available. Make sure `@github/copilot-sdk` is installed, or try `--harness copilot-cli`." |
| Inference unavailable | "Can't connect to inference. Check Copilot CLI auth (`copilot auth status`) or set GITHUB_TOKEN." |
| Eval command crashes | "Eval run failed: `<error>`. This might be a config issue — check the error and try again." |
| Invalid evals.json | "evals.json has a syntax error. Check for missing commas, trailing commas, or mismatched brackets." |

If the same command fails twice, don't retry blindly. Explain the issue and ask how to proceed.

## Rules

- Never ask the user to write evals.json or config files manually
- When evals exist, skip all interactive design phases — just run
- If the user says "run", "just do it", or "evaluate" and evals exist, go straight to running
- Only reference CLI commands that exist: `eval`
- Only reference CLI flags that exist: `--harness`, `--inference`, `--workspace`, `--runs`, `--concurrency`, `--only`, `--threshold`, `--old-skill`, `--feedback`
- Use `--only <id>` to run specific eval IDs (e.g., `--only 5` or `--only 1,3,7`)
- Use `--concurrency 5` for parallel execution when running multiple evals
- Use `--runs 3` when the user needs statistical confidence
- Use `--threshold 0.8` for CI gating (value must be 0-1)
