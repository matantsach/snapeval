# Interactive Scenario Ideation — Design Specification

Replace snapeval's single-shot test case generation with a multi-phase, interactive ideation process. The intelligence lives in the SKILL.md instructions, not in engine code. The presentation is visual (browser-based), not terminal-based.

## Problem

The current scenario generation is a single LLM call with a generic prompt (`generator.ts:buildGeneratorPrompt`). It produces surface-level test cases — "happy path", "edge case", "negative test" — without genuine understanding of what the skill does or what would actually catch a regression.

Anthropic's skill-creator solves this through interactive human-in-the-loop iteration, but it's tightly coupled to Claude Code subagents and Python infrastructure. snapeval needs the same depth of thinking, adapted for the Copilot CLI plugin model.

### What's wrong with the current approach

1. **No analysis phase** — the LLM doesn't reason about the skill before generating scenarios. It pattern-matches on SKILL.md keywords.
2. **Generic categories** — "happy path / edge case / negative" is not a test strategy. It tells you nothing about which input dimensions matter or where the skill is fragile.
3. **Flat prompts** — generated prompts are sanitized and lab-like. Real users type messily with context, typos, and ambiguity.
4. **No coverage reasoning** — no way to see what's covered and what's not. 7 scenarios could all test the same dimension.
5. **Confirm-or-run is not collaboration** — the user sees a numbered list and says "run." They have no meaningful way to shape the test strategy.

## Design

### Core Principle

The SKILL.md IS the prompt engineering. Copilot is already an LLM — the skill instructions guide it to analyze, reason, and collaborate. There's no need for a separate `buildGeneratorPrompt` → inference adapter round-trip for ideation. The engine provides thin infrastructure: an HTML template for visualization and a serializer for writing `evals.json`.

### The Evaluate Flow

#### Phase 0 — Validation (automated, instant)

Before any analysis, validate that:
- The target skill directory exists
- It contains a `SKILL.md` or `skill.md`
- snapeval is initialized (or can be)

Fail fast with a clear message if any of these are missing. This prevents Copilot from producing an analysis of a nonexistent skill.

#### Phase 1 — Skill Analysis (automated, conversational)

The SKILL.md instructs Copilot to read the target skill and reason through it systematically. This is not a summary — it's a decomposition.

Copilot reads:
- The target SKILL.md (required)
- Any bundled resources referenced in it: `scripts/`, `references/`, `assets/` (if they exist and are referenced)

Copilot produces a structured analysis as JSON:

```json
{
  "skill_name": "greeter",
  "behaviors": [
    { "name": "formal-greeting", "description": "Greets with formal style when requested" },
    { "name": "casual-greeting", "description": "Default greeting style when none specified" },
    { "name": "pirate-greeting", "description": "Fun pirate-themed greeting" },
    { "name": "unknown-style-rejection", "description": "Gracefully handles unsupported styles" }
  ],
  "dimensions": [
    { "name": "style", "values": ["formal", "casual", "pirate", "unknown", "missing"] },
    { "name": "name", "values": ["provided", "missing", "special-chars", "very-long"] },
    { "name": "phrasing", "values": ["explicit", "implicit", "ambiguous"] }
  ],
  "failure_modes": [
    { "description": "Multiple styles requested in one prompt", "severity": "medium" },
    { "description": "Style name is misspelled or uses a synonym", "severity": "low" }
  ],
  "ambiguities": [
    { "description": "Case sensitivity of style names", "why_it_matters": "User might type 'Formal' or 'FORMAL' — unclear if this matches", "in_scope": null },
    { "description": "What happens if user asks for two styles", "why_it_matters": "SKILL.md doesn't specify behavior for conflicting style requests", "in_scope": null }
  ],
  "scenarios": [
    {
      "id": 1,
      "prompt": "hey can you greet my colleague eleanor? make it formal, she's kind of old school",
      "expected_behavior": "Returns a formal greeting using the name Eleanor",
      "covers": ["style:formal", "name:provided", "phrasing:casual"],
      "why": "Tests that formal style works even when the request itself is casual",
      "enabled": true
    }
  ]
}
```

Copilot gives a brief terminal summary: "I've analyzed your skill — found N behaviors, N dimensions, and N potential gaps. Opening the analysis viewer."

**Key guidance in SKILL.md:**
- Behaviors should be discrete capabilities, not summaries
- Dimensions should capture what varies across invocations — not categories
- Failure modes should be specific to the skill, not generic ("error handling")
- Ambiguities should be things the SKILL.md genuinely doesn't specify, not nitpicks
- Scenarios should be 5-8, selected to maximize coverage across dimensions

#### Phase 2 — Visual Presentation (browser-based)

Copilot writes the analysis JSON to the skill's eval directory, then invokes a CLI command to render and open the viewer:

```bash
npx snapeval ideate <skill-path>
```

The `ideate` command:
1. Reads `evals/analysis.json` from the skill directory
2. Injects the JSON into a shipped HTML template (`assets/ideation-viewer.html`)
3. Writes the rendered HTML to `evals/ideation.html`
4. Opens it with the platform's default browser (`open` on macOS, `xdg-open` on Linux)

The viewer shows:

**Skill Map**
- Behaviors as cards with short descriptions
- Input dimensions as labeled tags with values

**Gaps & Ambiguities**
- Each gap shown as a card with:
  - What's ambiguous
  - Why it matters for testing ("if this is underspecified, different LLM runs might handle it differently → flaky tests")
  - Toggle: "In scope" / "Out of scope" (user decides what to test)

**Coverage Matrix**
- A table: rows = scenarios, columns = dimensions
- Cells show which dimension:value each scenario covers
- Color-coded: covered (green), not covered (gray)
- Derived from each scenario's `covers` array — no separate data model

**Proposed Scenarios**
- Cards showing:
  - The realistic, messy user prompt
  - Tags for which dimensions/behaviors it covers
  - A "Why this matters" line explaining what regression it would catch
  - Expected behavior (human-readable)
- Each card has toggle on/off, inline edit for prompt and expected behavior

**User Actions**
- Toggle scenarios on/off
- Edit any scenario inline (prompt, expected behavior)
- Add a custom scenario (free-form prompt + what it should test)
- Mark ambiguities as in-scope or out-of-scope
- Add notes or context for the AI to consider
- "Confirm & Run" button → triggers download of `scenario_plan.json`

**Design system:** Matches the eval viewer spec — same colors, fonts, and layout language. Background `#faf9f6`, accent `#2563eb`, all CSS/JS inline, zero external dependencies.

#### Phase 2→3 Handoff — Conversation Resume

After opening the viewer, Copilot tells the user:

> "I've opened the analysis viewer in your browser. Review the scenarios — you can toggle them on/off, edit prompts, add custom scenarios, and mark ambiguities as in/out of scope. When you're done, click 'Confirm & Run' to export your plan. Come back here and tell me when you're ready."

The user interacts with the viewer in their browser. When done, they click "Confirm & Run", which downloads `scenario_plan.json` to their default downloads folder.

The user returns to the conversation and says something like "done", "ready", "go", or provides the file path.

Copilot then looks for the exported file:
1. Check `~/Downloads/scenario_plan.json` (most common)
2. Check `~/Downloads/scenario_plan (1).json`, `~/Downloads/scenario_plan (2).json` (browser duplicate naming)
3. If not found, ask the user: "I couldn't find scenario_plan.json in your Downloads folder. Can you paste the path?"

This matches Anthropic's skill-creator pattern for their `eval_review.html` export flow.

#### Phase 3 — Feedback Ingestion (back to conversation)

Copilot reads `scenario_plan.json` and acknowledges the user's decisions:

- Scenarios toggled off → "Removed N scenarios"
- Custom scenarios added → "Added N custom scenarios"
- Ambiguities marked in-scope → Copilot may generate additional scenarios for them
- Edits to prompts → acknowledged, used as-is
- User notes → incorporated into scenario refinement

If the user marked ambiguities as in-scope, Copilot generates additional scenarios to cover them, presents them briefly, and asks for a quick confirmation before proceeding.

#### Phase 4 — Write & Run (infrastructure)

Copilot writes the finalized scenarios to `evals/evals.json`. The mapping from `scenario_plan.json` to `evals.json`:

| scenario_plan field | evals.json field |
|---|---|
| `confirmed_scenarios[].id` | `evals[].id` |
| `confirmed_scenarios[].prompt` | `evals[].prompt` |
| `confirmed_scenarios[].expected_behavior` | `evals[].expected_output` |
| `confirmed_scenarios[].covers` | not persisted (ideation metadata, not eval data) |
| `custom_scenarios[]` | appended to `evals[]` with auto-assigned IDs |

The `covers` and `why` fields are ideation metadata — they help the user understand the test strategy during ideation but don't need to persist into the eval runtime. The `assertions` field in `evals.json` stays empty — the comparison pipeline (schema → judge) handles semantic comparison without assertions.

Copilot then runs capture:

```bash
npx snapeval capture <skill-path>
```

Results flow to the existing eval viewer (separate from the ideation viewer).

### Error Handling

| Error | Handling |
|---|---|
| Target skill directory doesn't exist | Fail with: "Skill directory not found at `<path>`. Check the path and try again." |
| No SKILL.md in target directory | Fail with: "No SKILL.md found in `<path>`. This tool evaluates skills that follow the agentskills.io standard." |
| Copilot produces malformed analysis JSON | SKILL.md instructs Copilot to validate JSON before writing. If it still fails, the `ideate` CLI command reports a parse error and Copilot retries. |
| `ideate` CLI command fails to open browser | Print the file path and tell the user to open it manually. |
| User never clicks "Confirm & Run" | No timeout. When user returns to conversation, Copilot asks if they want to continue or start over. |
| `scenario_plan.json` is empty or malformed | Copilot reports what it found and asks the user to re-export from the viewer. |
| `scenario_plan.json` not found in Downloads | Copilot asks user for the file path (see Phase 2→3 handoff). |

## What Changes

### SKILL.md (major rewrite)

The `evaluate / test` section is replaced with the multi-phase flow. The SKILL.md teaches Copilot:
- How to decompose a skill into behaviors, dimensions, failure modes, ambiguities
- How to build a coverage strategy by crossing dimensions
- How to craft realistic prompts (with good/bad examples)
- How to write the analysis JSON and invoke `npx snapeval ideate`
- How to find and read `scenario_plan.json` from the user's Downloads
- How to map the plan to `evals.json` and run capture

The SKILL.md does NOT contain the HTML template — that's shipped as an asset.

### Realistic Prompt Guidance (in SKILL.md)

Adapted from Anthropic's skill-creator:

> Prompts should be realistic — the way a real user would actually type them. Not abstract requests, but specific and concrete with detail.
>
> **Bad:** "Please provide a formal greeting for Eleanor"
> **Good:** "hey can you greet my colleague eleanor? make it formal, she's kind of old school"
>
> **Bad:** "Handle an unknown style gracefully"
> **Good:** "greet me in shakespearean english plz"
>
> **Bad:** "Test empty input"
> **Good:** "" (literally empty) or "hey" (with no clear intent)
>
> Vary the style across scenarios: some terse, some with backstory, some with typos or abbreviations, some polite, some casual. Mix lengths. Include personal context, file paths, company names where relevant. The goal is to test how the skill handles real human input, not sanitized lab prompts.
>
> For should-not-trigger queries, the most valuable ones are near-misses — queries that share keywords with the skill but actually need something different. "Write a fibonacci function" is too easy. A hard negative for a greeter skill would be "what's the formal way to start a business email?" — adjacent domain, shared vocabulary, different intent.

### New CLI command: `ideate`

```
npx snapeval ideate <skill-path>
```

Reads `evals/analysis.json`, injects into the shipped HTML template, writes `evals/ideation.html`, opens in browser.

This command is infrastructure — the SKILL.md calls it, the user never invokes it directly.

### New asset: `assets/ideation-viewer.html`

A self-contained HTML template with a `__ANALYSIS_DATA_PLACEHOLDER__` that gets replaced with the analysis JSON. Ships with the npm package. Follows the same design system as the eval viewer.

### generator.ts (simplified for interactive path)

The existing `buildGeneratorPrompt` and `generateEvals` functions stay for the CI/headless fallback. No changes needed — they're just no longer the primary path.

A new export is added:

```ts
export function writeEvalsJson(
  skillName: string,
  scenarios: Array<{
    id: number;
    prompt: string;
    expected_output: string;
  }>
): EvalsFile {
  return {
    skill_name: skillName,
    generated_by: 'snapeval interactive',
    evals: scenarios.map(s => ({
      id: s.id,
      prompt: s.prompt,
      expected_output: s.expected_output,
      files: [],
      assertions: [],
    })),
  };
}
```

### init command

No changes. `init` remains for CI/headless use. For the interactive path, the SKILL.md writes `evals.json` directly (Copilot has filesystem access via tools).

## What Stays the Same

- Comparison pipeline (`schema.ts` → `judge.ts`) — untouched
- Check/approve/report CLI commands — untouched
- Existing HTML report viewer (eval viewer spec) — untouched, separate concern
- SnapshotManager, BudgetEngine, config resolution — untouched
- All adapter interfaces (SkillAdapter, InferenceAdapter, ReportAdapter) — untouched
- `EvalCase` type in `types.ts` — untouched (no new fields needed in the runtime type)
- CI/headless path via `init` → `capture` → `check` — untouched

## Relationship to Eval Viewer

This spec and the eval viewer spec describe two different viewers for two different stages:

| | Ideation Viewer (this spec) | Eval Viewer (eval viewer spec) |
|---|---|---|
| **When** | Before running evals | After running evals |
| **Purpose** | Design test strategy | Review results |
| **Input** | `analysis.json` (Copilot-generated) | `viewer-data.json` (pipeline-generated) |
| **Output** | `scenario_plan.json` (user decisions) | `feedback.json` (user feedback) |
| **Shows** | Behaviors, dimensions, coverage matrix, proposed scenarios | Baseline vs current, judge reasoning, benchmark stats |

They share a design system (colors, fonts, layout patterns) but are separate HTML files with separate data schemas. A user sees the ideation viewer once (when setting up evals) and the eval viewer repeatedly (after each check).

## Schemas

### analysis.json (written by Copilot, read by `ideate` CLI)

```json
{
  "version": 1,
  "skill_name": "greeter",
  "behaviors": [
    { "name": "formal-greeting", "description": "Greets with formal style when requested" }
  ],
  "dimensions": [
    { "name": "style", "values": ["formal", "casual", "pirate", "unknown", "missing"] },
    { "name": "name", "values": ["provided", "missing", "special-chars", "very-long"] }
  ],
  "failure_modes": [
    { "description": "Multiple styles requested in one prompt", "severity": "medium" }
  ],
  "ambiguities": [
    { "description": "Case sensitivity of style names", "why_it_matters": "User might type 'Formal' or 'FORMAL'", "in_scope": null }
  ],
  "scenarios": [
    {
      "id": 1,
      "prompt": "hey can you greet my colleague eleanor? make it formal, she's kind of old school",
      "expected_behavior": "Returns a formal greeting using the name Eleanor",
      "covers": ["style:formal", "name:provided", "phrasing:casual"],
      "why": "Tests that formal style works even when the request itself is casual",
      "enabled": true
    }
  ]
}
```

### scenario_plan.json (exported by viewer, read by Copilot)

```json
{
  "version": 1,
  "confirmed_scenarios": [
    {
      "id": 1,
      "prompt": "hey can you greet my colleague eleanor? ...",
      "expected_behavior": "Returns a formal greeting using the name Eleanor",
      "covers": ["style:formal", "name:provided", "phrasing:casual"],
      "why": "Tests that formal style works even when the request itself is casual"
    }
  ],
  "custom_scenarios": [
    {
      "prompt": "user-typed custom prompt",
      "expected_behavior": "user-typed expected behavior"
    }
  ],
  "ambiguity_decisions": [
    { "description": "Case sensitivity of style names", "decision": "in_scope" }
  ],
  "user_notes": "Any free-text context the user added"
}
```

### evals.json (final output, existing schema — unchanged)

```json
{
  "skill_name": "greeter",
  "generated_by": "snapeval interactive",
  "evals": [
    {
      "id": 1,
      "prompt": "hey can you greet my colleague eleanor? make it formal, she's kind of old school",
      "expected_output": "Returns a formal greeting using the name Eleanor",
      "files": [],
      "assertions": []
    }
  ]
}
```

## File Changes Summary

| File | Change |
|---|---|
| `skills/snapeval/SKILL.md` | Major rewrite: multi-phase evaluate flow with analysis, viewer handoff, feedback ingestion |
| `plugin/skills/snapeval/SKILL.md` | Same rewrite (plugin copy) |
| `assets/ideation-viewer.html` | **NEW** — shipped HTML template for the analysis viewer |
| `src/commands/ideate.ts` | **NEW** — CLI command: reads analysis.json, injects into template, writes ideation.html, opens browser |
| `bin/snapeval.ts` | Add `ideate` command |
| `src/engine/generator.ts` | Add `writeEvalsJson` utility. Existing functions unchanged. |

## CI/Headless Fallback

When no conversation is possible (CI, GitHub Actions), the existing `init` command with `generateEvals` stays as the fallback. The interactive ideation path is the primary experience through the Copilot plugin; the single-shot path is infrastructure for automation.

Future improvement: backport the analysis reasoning (behaviors, dimensions, coverage strategy) into `buildGeneratorPrompt` to improve single-shot quality. This is out of scope for this design.

## Testing Strategy

1. **`ideate` command unit tests:** Given a valid `analysis.json`, verify HTML output is written with embedded data and contains expected placeholder replacement.
2. **`writeEvalsJson` unit test:** Given scenario plan data, verify correct `EvalsFile` output.
3. **Template rendering test:** Verify the HTML template with sample data produces valid HTML that a headless browser can parse.
4. **Integration test:** Full flow with mocked Copilot conversation — analysis.json → ideate → scenario_plan.json → evals.json. Verify the data transformations are correct.
5. **Manual verification:** Open ideation viewer in browser, verify all interactive elements work (toggle, edit, add, export).
