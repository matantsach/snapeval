# Eval Viewer & Report Visualization — Design Spec

**Date:** 2026-03-15
**Status:** Draft
**Context:** snapeval v1.0.1 ships with a solid three-tier comparison engine but no visual output beyond a terminal table. Anthropic's skill-creator has an HTML eval viewer with feedback collection and benchmark dashboard. promptfoo has a full web UI with charts and comparison tools. This spec closes the visualization gap.

## Problem

After `snapeval check`, the developer sees:

```
  ✓ Scenario 1 [tier1] — 0 tokens, 9.95s (copilot-cli)
  ✗ Scenario 3 [tier3] — 0 tokens, 12.00s (copilot-cli)
```

This tells *what* regressed but not *why*. The developer cannot:
- See the baseline vs current output side-by-side
- See the embedding similarity score or LLM judge reasoning
- Track how their skill's quality changes across iterations
- Provide structured feedback that feeds back into improvement

## Goals

1. **Eval viewer** — Browse scenario results one at a time with full comparison detail
2. **Benchmark dashboard** — Visual summary of pass rates, tier breakdown, timing, cost
3. **Iteration comparison** — Show deltas between current and previous iteration
4. **Feedback collection** — Per-scenario feedback that exports to JSON for the improvement loop
5. **Zero infrastructure** — Single self-contained HTML file, no server required

## Non-Goals

- Full promptfoo-style multi-prompt/multi-model comparison matrix
- Persistent database or server process
- Description optimization (separate feature, different scope)
- Wiring assertions/grading (existing dead code; separate effort)

## Design

### 1. Data Model Changes

#### `types.ts` — Enrich `ScenarioResult`

```ts
// Add to ScenarioResult:
baselineOutput: SkillOutput;  // baseline we compared against

// Add to ComparisonResult:
judgeReasoning?: {
  forward: string;   // raw LLM response (baseline first)
  reverse: string;   // raw LLM response (current first)
};
similarity?: number; // already exists, ensure always populated for tier 2
```

#### `types.ts` — Add `ViewerData`

```ts
export interface ViewerData {
  skillName: string;
  generatedAt: string;
  iteration: number;
  scenarios: ViewerScenario[];
  summary: BenchmarkSummary;  // pass_rate = passed / total; inconclusive counts as non-passing
  previousIteration?: {
    summary: BenchmarkSummary;
    scenarios: ViewerScenario[];
  };
}

export interface ViewerScenario {
  scenarioId: number;
  prompt: string;
  baselineOutput: string;   // mapped from ScenarioResult.baselineOutput.raw
  currentOutput: string;    // mapped from ScenarioResult.newOutput.raw
  verdict: ComparisonVerdict;
  tier: 1 | 2 | 3;
  similarity?: number;      // only present when Tier 2 passes
  details: string;          // tier-agnostic: "Schema match" / "Embedding similarity: 0.92" / judge details
  judgeReasoning?: { forward: string; reverse: string };  // only present for Tier 3
  timing: TimingData;
  feedback?: string;
}
```

### 2. Pipeline Changes

#### `check.ts` — Include baseline in results

```ts
// Line ~53, after loading baseline:
scenarios.push({
  scenarioId: evalCase.id,
  prompt: evalCase.prompt,
  comparison,
  timing: { ... },
  newOutput,
  baselineOutput: baseline.output,  // NEW: carry the baseline through
});
```

#### `judge.ts` — Return structured reasoning

Refactor `runJudgePair` to return raw LLM responses alongside parsed verdicts:

```ts
// runJudgePair return type changes:
async function runJudgePair(...): Promise<{
  forward: string | null;
  reverse: string | null;
  rawForward: string;   // NEW: raw LLM response string
  rawReverse: string;   // NEW: raw LLM response string
}> {
  const [forwardResp, reverseResp] = await Promise.all([...]);
  return {
    forward: parseJudgeResponse(forwardResp),
    reverse: parseJudgeResponse(reverseResp),
    rawForward: forwardResp,
    rawReverse: reverseResp,
  };
}

// Extend JudgeResult:
interface JudgeResult {
  verdict: ComparisonVerdict;
  details: string;
  reasoning?: { forward: string; reverse: string };  // raw LLM responses
}
```

`llmJudge` passes the raw strings through: `reasoning: { forward: rawForward, reverse: rawReverse }`.

#### `pipeline.ts` — Pass reasoning through

```ts
// Tier 3 result includes judge reasoning:
return {
  scenarioId: 0,
  verdict: judgeResult.verdict,
  tier: 3,
  details: judgeResult.details,
  judgeReasoning: judgeResult.reasoning,
};
```

Note: When Tier 2 runs but fails the threshold, the similarity score is lost (falls through to Tier 3). Similarity is only available when Tier 2 passes — `ViewerScenario.similarity` is truly optional.

### 3. HTML Reporter

New file: `src/adapters/report/html.ts`

Constructor takes `outputDir: string` and `iterationNumber: number` (both provided by `reportCommand`).

Implements `ReportAdapter`. On `report()`:

1. Transforms `EvalResults` into `ViewerData`:
   - `scenario.baselineOutput.raw` → `ViewerScenario.baselineOutput`
   - `scenario.newOutput.raw` → `ViewerScenario.currentOutput`
   - `scenario.comparison.details` → `ViewerScenario.details`
   - `scenario.comparison.judgeReasoning` → `ViewerScenario.judgeReasoning`
   - `iterationNumber` → `ViewerData.iteration`
2. Loads previous iteration's data (if exists) from `evals/results/iteration-{N-1}/viewer-data.json`
3. Embeds `ViewerData` as JSON into a self-contained HTML template
4. Writes `report.html` and `viewer-data.json` to the iteration directory

#### HTML Structure

```
┌─────────────────────────────────────────────────┐
│  snapeval — {skill-name}     Iteration {N}      │
│  [Outputs]  [Benchmark]                         │
├─────────────────────────────────────────────────┤
│                                                 │
│  Scenario {id} — {verdict badge}    {1 of N}    │
│                                                 │
│  Prompt                                         │
│  ┌─────────────────────────────────────────┐    │
│  │ {eval prompt text}                      │    │
│  └─────────────────────────────────────────┘    │
│                                                 │
│  Comparison                                     │
│  ┌──────────────────┬──────────────────────┐    │
│  │ Baseline         │ Current              │    │
│  │                  │                      │    │
│  │ {baseline output}│ {current output}     │    │
│  │                  │                      │    │
│  └──────────────────┴──────────────────────┘    │
│                                                 │
│  Analysis                                       │
│  Resolved at: Tier {N} — {tier name}            │
│  Similarity: {score} (if tier 2)                │
│  Judge reasoning: {details} (if tier 3)         │
│                                                 │
│  ▸ Previous iteration output (collapsed)        │
│                                                 │
│  Feedback                                       │
│  ┌─────────────────────────────────────────┐    │
│  │ {textarea}                              │    │
│  └─────────────────────────────────────────┘    │
│                                                 │
├─────────────────────────────────────────────────┤
│  [← Prev]              [Export Feedback]  [Next →] │
└─────────────────────────────────────────────────┘
```

#### Benchmark Tab

```
┌─────────────────────────────────────────────────┐
│  Summary                                        │
│  ┌────────────┐  ┌─────────────────────────┐    │
│  │  Pass Rate  │  │  Tier Breakdown         │    │
│  │   donut     │  │  ████ Schema: 4         │    │
│  │   chart     │  │  ██ Embedding: 1        │    │
│  │   86%       │  │  ███ LLM Judge: 2       │    │
│  └────────────┘  └─────────────────────────┘    │
│                                                 │
│  ┌─────────────────────────────────────────┐    │
│  │ Duration: 45.2s  |  Tokens: 0           │    │
│  │ Cost: $0.0000    |  Scenarios: 7         │    │
│  └─────────────────────────────────────────┘    │
│                                                 │
│  Delta from previous iteration (if exists)      │
│  Pass rate: 86% → 71% (▼ -15%)                  │
│  New regressions: Scenario 3, Scenario 5        │
│  Newly passing: Scenario 2                      │
│                                                 │
│  Per-Scenario Breakdown                         │
│  ┌─────┬──────────┬──────┬────────┬────────┐    │
│  │ ID  │ Verdict  │ Tier │ Time   │ Delta  │    │
│  ├─────┼──────────┼──────┼────────┼────────┤    │
│  │ 1   │ ✓ pass   │ T1   │ 9.95s  │ =      │    │
│  │ 2   │ ✓ pass   │ T2   │ 8.20s  │ NEW ✓  │    │
│  │ 3   │ ✗ regr   │ T3   │ 12.0s  │ NEW ✗  │    │
│  └─────┴──────────┴──────┴────────┴────────┘    │
└─────────────────────────────────────────────────┘
```

#### Design System

Matches snapeval's identity, not generic AI aesthetics:
- Background: `#faf9f6` (warm off-white)
- Accent: `#2563eb` (blue — distinguishes from skill-creator's rust/terracotta)
- Pass: `#16a34a` (green)
- Fail: `#dc2626` (red)
- Inconclusive: `#ca8a04` (amber)
- Monospace for all code/output blocks
- System font stack for UI text
- No external dependencies — CSS and JS inline in the single HTML file

#### Interactions

- **Navigation:** Prev/Next buttons + Left/Right arrow keys
- **Feedback:** Textarea per scenario, persisted to localStorage keyed by `{skillName}-{iteration}-{scenarioId}`
- **Export feedback:** Button generates `feedback.json` download:
  ```json
  {
    "skill_name": "my-skill",
    "iteration": 2,
    "reviews": [
      { "scenario_id": 1, "feedback": "Output is too verbose", "timestamp": "..." },
      { "scenario_id": 3, "feedback": "", "timestamp": "..." }
    ]
  }
  ```
- **Keyboard:** Arrow keys for nav, `Esc` to clear search (future)

### 4. CLI Integration

#### New `--html` flag on `report` command

```ts
// bin/snapeval.ts — report command
.option('--html', 'Generate HTML report viewer')
```

When `--html` is passed, `reportCommand` signature changes to accept `{ verbose?: boolean; html?: boolean }`. It instantiates `HTMLReporter(iterationDir, nextIteration)` in addition to `JSONReporter`. Output:

```
evals/results/iteration-2/
  grading.json
  timing.json
  benchmark.json
  viewer-data.json    # NEW: structured data for the viewer
  report.html         # NEW: self-contained HTML viewer
```

The CLI prints the path:
```
Report written to evals/results/iteration-2/report.html
```

#### Default behavior change

`snapeval report` (without `--html`) continues to work as before — JSON only.
`snapeval report --html` adds the HTML viewer.

Future consideration: make `--html` the default once stable.

### 5. SKILL.md Integration

Update `skills/snapeval/SKILL.md` to instruct the AI:

After running `snapeval check`:
1. Run `npx snapeval report --html <skill-dir>`
2. Tell the user: "Report generated at `<path>/report.html` — open it in your browser to review results side-by-side"
3. If the user provides feedback (either verbally or via exported `feedback.json`), use it to guide skill improvements

### 6. Previous Iteration Loading

When generating the HTML report for iteration N (where N > 1):

1. Check if `evals/results/iteration-{N-1}/viewer-data.json` exists
2. If yes, load it and include as `previousIteration` in `ViewerData`
3. The HTML template uses this to:
   - Show delta badges in the benchmark tab
   - Show collapsible "Previous output" in the scenario view
   - Highlight newly regressed / newly passing scenarios

## File Changes Summary

| File | Change |
|---|---|
| `src/types.ts` | Add `baselineOutput` to `ScenarioResult`, `judgeReasoning` to `ComparisonResult`, add `ViewerData` and `ViewerScenario` types |
| `src/commands/check.ts` | Include baseline output in `ScenarioResult` |
| `src/engine/comparison/judge.ts` | Return raw LLM responses in `JudgeResult` |
| `src/engine/comparison/pipeline.ts` | Pass `judgeReasoning` through to `ComparisonResult` |
| `src/adapters/report/html.ts` | **NEW** — `HTMLReporter` implementing `ReportAdapter` |
| `src/commands/report.ts` | Accept `--html` option, instantiate `HTMLReporter`, save `viewer-data.json` |
| `bin/snapeval.ts` | Add `--html` flag to `report` command |
| `skills/snapeval/SKILL.md` | Add instructions for AI to generate and recommend HTML report |

## Testing Strategy

1. **Unit tests for HTMLReporter:** Given known `EvalResults`, verify HTML output contains expected elements (scenario data, benchmark stats, embedded JSON)
2. **Unit tests for enriched data:** Verify `checkCommand` returns `baselineOutput`, `judge.ts` returns reasoning
3. **Integration test:** Full `init → capture → check → report --html` flow, verify `report.html` is written and contains valid HTML with embedded data
4. **Manual verification:** Open generated `report.html` in browser, verify navigation, feedback, and benchmark tab work
