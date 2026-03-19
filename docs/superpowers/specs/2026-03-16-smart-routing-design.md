# Smart Routing: Onboard + Quick Check in Existing Skill

## Problem

The current `@snapeval` skill has one entry point that always starts with the full 4-phase ideation flow. This creates two gaps:

1. **Cold start** — Users with no baselines get the full evaluation ceremony when they just need a fast setup. High friction kills adoption.
2. **Quick check** — Users with baselines who just want "did I break anything?" get routed through the same heavy skill, when all they need is a pass/fail.

## Design

### Smart Phase 0: Detect State + Route

Phase 0 expands from "validate skill path" to "validate + detect state + route to the right flow":

```
@snapeval invoked
    ↓
Phase 0: Validate skill path
    ↓
Has evals/snapshots/?
    ├── NO  → Quick Onboard flow
    └── YES → What's the user's intent?
               ├── check/regression → Quick Check flow
               ├── review           → Review flow (existing)
               ├── approve          → Approve flow (existing)
               └── evaluate/test    → Full Ideation flow (existing)
```

### Quick Onboard Flow (new)

Triggers when: user invokes `@snapeval` on a skill with no `evals/snapshots/` directory.

1. Read SKILL.md completely
2. Generate 3-5 scenarios inline (not 5-8 — fewer for speed, covering core behaviors only)
3. Present scenarios in chat: "Here's what I'd test for your skill. Look good?"
4. On user confirmation, write `evals/evals.json` and run `npx snapeval capture <skill-path>`
5. Report: "Baselines captured. You now have regression detection — say 'did I break anything?' anytime to check."
6. If user wants more thorough coverage, suggest: "Want to expand coverage? Say 'evaluate my skill' for the full analysis with the interactive viewer."

**What it skips:** No `analysis.json`, no browser viewer, no Phase 2/3 (visual presentation + feedback ingestion). This is a fast path — not a lesser path.

**Scenario generation:** Same Prompt Realism rules as the full flow. Fewer scenarios, same quality. Focus on covering distinct behaviors rather than dimensional exhaustiveness.

### Quick Check Flow (enhancement to existing)

Not new — the existing `check` command already works. The change is in routing: Phase 0 now detects check-intent phrases ("did I break anything?", "quick check", "run my tests", "check for regressions") and skips directly to the check flow without any ideation preamble.

The existing check command (lines 108-118 of SKILL.md) is unchanged.

### Changes to SKILL.md

1. **Phase 0** — Rewrite to include state detection (baselines exist?) and intent detection
2. **New section: Quick Onboard** — Between Phase 0 and Phase 1, triggered when no baselines
3. **Check command** — Add note that Phase 0 routes directly to check on regression-intent phrases
4. **Description frontmatter** — Add onboarding triggers ("set up evals", "I have a new skill")

### No code changes

This is a SKILL.md-only change. All CLI commands (`init`, `capture`, `check`, `review`, `approve`, `ideate`) already exist.
