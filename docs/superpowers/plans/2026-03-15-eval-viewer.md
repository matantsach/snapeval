# Eval Viewer Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an HTML eval viewer to snapeval that shows side-by-side output comparison, benchmark dashboard, iteration deltas, and feedback collection — closing the visualization gap with skill-creator.

**Architecture:** Enrich the existing data pipeline to carry baseline outputs and judge reasoning through `ScenarioResult`. Add a new `HTMLReporter` adapter that transforms `EvalResults` into a self-contained HTML file with embedded JSON data. Wire it into the CLI via `--html` flag on the `report` command.

**Tech Stack:** TypeScript, Vitest, Commander.js (existing CLI), inline HTML/CSS/JS (no build step for viewer)

**Spec:** `docs/superpowers/specs/2026-03-15-eval-viewer-design.md`

---

## Chunk 1: Enrich Data Pipeline

### Task 1: Add `baselineOutput` to `ScenarioResult` type

> **Note:** Steps 1-3 must be applied as a group before the project will compile. Adding the required `baselineOutput` field to `ScenarioResult` in Step 1 will cause type errors until Steps 2 and 3 update all call sites and test helpers.

**Files:**
- Modify: `src/types.ts:137-144`
- Test: `tests/commands/check.test.ts`

- [ ] **Step 1: Update the type definition**

In `src/types.ts`, add `baselineOutput` to the `ScenarioResult` interface:

```ts
export interface ScenarioResult {
  scenarioId: number;
  prompt: string;
  comparison: ComparisonResult;
  grading?: GradingFile;
  timing: TimingData;
  newOutput: SkillOutput;
  baselineOutput: SkillOutput;  // NEW
}
```

- [ ] **Step 2: Fix the type error in check.ts**

In `src/commands/check.ts`, line ~53, add `baselineOutput: baseline.output` to the `scenarios.push()` call:

```ts
scenarios.push({
  scenarioId: evalCase.id,
  prompt: evalCase.prompt,
  comparison,
  timing: {
    total_tokens: newOutput.metadata.tokens,
    duration_ms: newOutput.metadata.durationMs,
  },
  newOutput,
  baselineOutput: baseline.output,  // NEW
});
```

- [ ] **Step 3: Fix existing test helpers that construct ScenarioResult**

The existing test helpers in `tests/adapters/json.test.ts`, `tests/adapters/terminal.test.ts` build `ScenarioResult` objects without `baselineOutput`. Add the field to each `makeScenario` helper.

In `tests/adapters/json.test.ts` `makeScenario` function (line ~8), add after the `newOutput` block:

```ts
baselineOutput: {
  raw: 'baseline output',
  metadata: {
    tokens: 50,
    durationMs: 200,
    model: 'copilot',
    adapter: 'copilot-cli',
  },
},
```

In `tests/adapters/terminal.test.ts` `makeScenario` function (line ~5), add after the `newOutput` block:

```ts
baselineOutput: {
  raw: 'baseline output',
  metadata: {
    tokens: 100,
    durationMs: 1500,
    model: 'copilot',
    adapter: 'copilot-cli',
  },
},
```

- [ ] **Step 4: Write test for baseline output in check results**

In `tests/commands/check.test.ts`, add a new test:

```ts
it('includes baselineOutput in each scenario result', async () => {
  writeEvals();
  writeBaselines({ 1: 'baseline text 1', 2: 'baseline text 2' });

  const results = await checkCommand(
    tmpDir,
    makeSkillAdapter('new output'),
    makeInference(),
    { threshold: 0.85, budget: 'unlimited' }
  );

  for (const scenario of results.scenarios) {
    expect(scenario.baselineOutput).toBeDefined();
    expect(scenario.baselineOutput.raw).toBeTruthy();
  }
  expect(results.scenarios[0].baselineOutput.raw).toBe('baseline text 1');
});
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run`
Expected: All tests pass (existing + new).

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/commands/check.ts tests/commands/check.test.ts tests/adapters/json.test.ts tests/adapters/terminal.test.ts
git commit -m "feat: include baseline output in ScenarioResult"
```

---

### Task 2: Add `judgeReasoning` to comparison pipeline

**Files:**
- Modify: `src/types.ts:88-94`
- Modify: `src/engine/comparison/judge.ts`
- Modify: `src/engine/comparison/pipeline.ts`
- Test: `tests/engine/comparison/judge.test.ts`
- Test: `tests/engine/comparison/pipeline.test.ts`

- [ ] **Step 1: Add `judgeReasoning` to `ComparisonResult` type**

In `src/types.ts`, add to `ComparisonResult`:

```ts
export interface ComparisonResult {
  scenarioId: number;
  verdict: ComparisonVerdict;
  tier: 1 | 2 | 3;
  similarity?: number;
  details: string;
  judgeReasoning?: { forward: string; reverse: string };  // NEW
}
```

- [ ] **Step 2: Refactor `runJudgePair` to return raw responses**

In `src/engine/comparison/judge.ts`, change the return type of `runJudgePair` and its body:

```ts
async function runJudgePair(
  baseline: string,
  current: string,
  inference: InferenceAdapter
): Promise<{ forward: string | null; reverse: string | null; rawForward: string; rawReverse: string }> {
  const [forwardResp, reverseResp] = await Promise.all([
    inference.chat([{ role: 'user', content: buildJudgePrompt(baseline, current) }], {
      temperature: 0,
      responseFormat: 'json',
    }),
    inference.chat([{ role: 'user', content: buildJudgePrompt(current, baseline) }], {
      temperature: 0,
      responseFormat: 'json',
    }),
  ]);
  return {
    forward: parseJudgeResponse(forwardResp),
    reverse: parseJudgeResponse(reverseResp),
    rawForward: forwardResp,
    rawReverse: reverseResp,
  };
}
```

- [ ] **Step 3: Update `JudgeResult` and `llmJudge` to carry reasoning**

In `src/engine/comparison/judge.ts`, change `JudgeResult`:

```ts
interface JudgeResult {
  verdict: ComparisonVerdict;
  details: string;
  reasoning?: { forward: string; reverse: string };  // NEW
}
```

In `llmJudge`, destructure the new fields and include them in every return:

```ts
export async function llmJudge(
  baseline: string,
  current: string,
  inference: InferenceAdapter
): Promise<JudgeResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { forward, reverse, rawForward, rawReverse } = await runJudgePair(baseline, current, inference);
    const reasoning = { forward: rawForward, reverse: rawReverse };
    if (forward === null || reverse === null) {
      if (attempt === 0) continue;
      return {
        verdict: 'inconclusive',
        details: 'LLM judge returned unparseable response after retry',
        reasoning,
      };
    }
    if (forward === reverse) {
      return {
        verdict: forward === 'consistent' ? 'pass' : 'regressed',
        details: `LLM Judge: both orderings agree — ${forward}`,
        reasoning,
      };
    }
    return {
      verdict: 'inconclusive',
      details: `LLM Judge: orderings disagree (forward=${forward}, reverse=${reverse})`,
      reasoning,
    };
  }
  return { verdict: 'inconclusive', details: 'LLM judge exhausted retries', reasoning: undefined };
}
```

- [ ] **Step 4: Update pipeline to pass reasoning through**

In `src/engine/comparison/pipeline.ts`, line ~41-42, change the Tier 3 return:

```ts
// Tier 3: LLM Judge (EXPENSIVE)
const judgeResult = await llmJudge(baseline, current, inference);
return {
  scenarioId: 0,
  verdict: judgeResult.verdict,
  tier: 3,
  details: judgeResult.details,
  judgeReasoning: judgeResult.reasoning,
};
```

- [ ] **Step 5: Write test for reasoning in judge results**

In `tests/engine/comparison/judge.test.ts`, add to the `llmJudge` describe block:

```ts
it('returns reasoning with raw LLM responses', async () => {
  const consistent = JSON.stringify({ verdict: 'consistent' });
  const adapter = makeMockAdapter([consistent, consistent]);
  const result = await llmJudge('baseline text', 'current text', adapter);
  expect(result.reasoning).toBeDefined();
  expect(result.reasoning!.forward).toBe(consistent);
  expect(result.reasoning!.reverse).toBe(consistent);
});

it('returns reasoning even on inconclusive verdict', async () => {
  const consistent = JSON.stringify({ verdict: 'consistent' });
  const different = JSON.stringify({ verdict: 'different' });
  const adapter = makeMockAdapter([consistent, different]);
  const result = await llmJudge('baseline', 'current', adapter);
  expect(result.verdict).toBe('inconclusive');
  expect(result.reasoning).toBeDefined();
  expect(result.reasoning!.forward).toBe(consistent);
  expect(result.reasoning!.reverse).toBe(different);
});
```

- [ ] **Step 6: Write test for reasoning in pipeline results**

In `tests/engine/comparison/pipeline.test.ts`, add to the `Tier 3` describe block:

```ts
it('includes judgeReasoning in Tier 3 results', async () => {
  const consistent = JSON.stringify({ verdict: 'consistent' });
  let callCount = 0;
  const adapter = makeMockAdapter({
    embedFn: () => (callCount++ === 0 ? [1, 0] : [0, 1]),
    chatResponses: [consistent, consistent],
  });

  const result = await comparePipeline(DIFF_SCHEMA_A, DIFF_SCHEMA_B, adapter, {
    threshold: 0.85,
  });

  expect(result.tier).toBe(3);
  expect(result.judgeReasoning).toBeDefined();
  expect(result.judgeReasoning!.forward).toBe(consistent);
});

it('does not include judgeReasoning in Tier 1 results', async () => {
  const adapter = makeMockAdapter({});
  const result = await comparePipeline(SAME_SCHEMA_A, SAME_SCHEMA_B, adapter, {
    threshold: 0.85,
  });

  expect(result.tier).toBe(1);
  expect(result.judgeReasoning).toBeUndefined();
});
```

- [ ] **Step 7: Run tests**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/types.ts src/engine/comparison/judge.ts src/engine/comparison/pipeline.ts tests/engine/comparison/judge.test.ts tests/engine/comparison/pipeline.test.ts
git commit -m "feat: include LLM judge reasoning in comparison results"
```

---

### Task 3: Add `ViewerData` and `ViewerScenario` types

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add the viewer types at the end of types.ts**

Append to `src/types.ts` (before the closing `Config` section or at end of file):

```ts
// === Viewer Data ===
export interface ViewerData {
  skillName: string;
  generatedAt: string;
  iteration: number;
  scenarios: ViewerScenario[];
  summary: BenchmarkSummary;
  previousIteration?: {
    summary: BenchmarkSummary;
    scenarios: ViewerScenario[];
  };
}

export interface ViewerScenario {
  scenarioId: number;
  prompt: string;
  baselineOutput: string;
  currentOutput: string;
  verdict: ComparisonVerdict;
  tier: 1 | 2 | 3;
  similarity?: number;
  details: string;
  judgeReasoning?: { forward: string; reverse: string };
  timing: TimingData;
  feedback?: string;
}
```

- [ ] **Step 2: Run tests to verify no regressions**

Run: `npx vitest run`
Expected: All pass (type-only change, no runtime impact).

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add ViewerData and ViewerScenario types"
```

---

## Chunk 2: HTML Reporter

### Task 4: Create HTMLReporter

**Files:**
- Create: `src/adapters/report/html.ts`
- Test: `tests/adapters/html.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/adapters/html.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { HTMLReporter } from '../../src/adapters/report/html.js';
import type { EvalResults, ScenarioResult, SkillOutput } from '../../src/types.js';

function makeOutput(raw: string): SkillOutput {
  return {
    raw,
    metadata: { tokens: 50, durationMs: 200, model: 'copilot', adapter: 'copilot-cli' },
  };
}

function makeScenario(
  id: number,
  verdict: 'pass' | 'regressed' | 'inconclusive',
  tier: 1 | 2 | 3 = 1
): ScenarioResult {
  return {
    scenarioId: id,
    prompt: `test prompt ${id}`,
    comparison: {
      scenarioId: id,
      verdict,
      tier,
      details: `verdict: ${verdict}`,
      ...(tier === 3 ? { judgeReasoning: { forward: '{"verdict":"consistent"}', reverse: '{"verdict":"consistent"}' } } : {}),
      ...(tier === 2 ? { similarity: 0.92 } : {}),
    },
    timing: { total_tokens: 50, duration_ms: 200 },
    newOutput: makeOutput(`current output ${id}`),
    baselineOutput: makeOutput(`baseline output ${id}`),
  };
}

function makeResults(scenarios: ScenarioResult[]): EvalResults {
  const passed = scenarios.filter((s) => s.comparison.verdict === 'pass').length;
  const regressed = scenarios.filter((s) => s.comparison.verdict === 'regressed').length;
  return {
    skillName: 'test-skill',
    scenarios,
    summary: {
      total_scenarios: scenarios.length,
      passed,
      regressed,
      pass_rate: scenarios.length > 0 ? passed / scenarios.length : 0,
      total_tokens: 150,
      total_cost_usd: 0,
      total_duration_ms: 600,
      tier_breakdown: { tier1_schema: 1, tier2_embedding: 1, tier3_llm_judge: 1 },
    },
    timing: { total_tokens: 150, duration_ms: 600 },
  };
}

describe('HTMLReporter', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapeval-html-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('name is "html"', () => {
    const reporter = new HTMLReporter(tmpDir, 1);
    expect(reporter.name).toBe('html');
  });

  it('creates report.html', async () => {
    const reporter = new HTMLReporter(tmpDir, 1);
    await reporter.report(makeResults([makeScenario(1, 'pass')]));
    expect(fs.existsSync(path.join(tmpDir, 'report.html'))).toBe(true);
  });

  it('creates viewer-data.json', async () => {
    const reporter = new HTMLReporter(tmpDir, 1);
    await reporter.report(makeResults([makeScenario(1, 'pass')]));
    expect(fs.existsSync(path.join(tmpDir, 'viewer-data.json'))).toBe(true);
  });

  it('creates output directory if it does not exist', async () => {
    const nestedDir = path.join(tmpDir, 'nested', 'deep');
    const reporter = new HTMLReporter(nestedDir, 1);
    await reporter.report(makeResults([makeScenario(1, 'pass')]));
    expect(fs.existsSync(path.join(nestedDir, 'report.html'))).toBe(true);
  });

  it('embeds scenario data in HTML', async () => {
    const reporter = new HTMLReporter(tmpDir, 1);
    await reporter.report(makeResults([makeScenario(1, 'pass'), makeScenario(2, 'regressed')]));
    const html = fs.readFileSync(path.join(tmpDir, 'report.html'), 'utf-8');
    expect(html).toContain('test-skill');
    expect(html).toContain('baseline output 1');
    expect(html).toContain('current output 1');
    expect(html).toContain('test prompt 1');
  });

  it('viewer-data.json has correct structure', async () => {
    const reporter = new HTMLReporter(tmpDir, 1);
    await reporter.report(makeResults([makeScenario(1, 'pass', 2), makeScenario(2, 'regressed', 3)]));
    const data = JSON.parse(fs.readFileSync(path.join(tmpDir, 'viewer-data.json'), 'utf-8'));
    expect(data.skillName).toBe('test-skill');
    expect(data.iteration).toBe(1);
    expect(data.scenarios).toHaveLength(2);
    expect(data.scenarios[0].baselineOutput).toBe('baseline output 1');
    expect(data.scenarios[0].currentOutput).toBe('current output 1');
    expect(data.scenarios[0].verdict).toBe('pass');
    expect(data.scenarios[0].tier).toBe(2);
    expect(data.scenarios[0].similarity).toBe(0.92);
    expect(data.scenarios[1].judgeReasoning).toBeDefined();
  });

  it('HTML is a complete self-contained document', async () => {
    const reporter = new HTMLReporter(tmpDir, 1);
    await reporter.report(makeResults([makeScenario(1, 'pass')]));
    const html = fs.readFileSync(path.join(tmpDir, 'report.html'), 'utf-8');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
    expect(html).toContain('<style>');
    expect(html).toContain('<script>');
  });

  it('includes benchmark summary in HTML', async () => {
    const reporter = new HTMLReporter(tmpDir, 1);
    await reporter.report(makeResults([makeScenario(1, 'pass'), makeScenario(2, 'regressed')]));
    const html = fs.readFileSync(path.join(tmpDir, 'report.html'), 'utf-8');
    // Benchmark data is embedded in the JSON
    expect(html).toContain('tier1_schema');
  });

  it('loads previous iteration data when available', async () => {
    // Write iteration 1 data
    const prevDir = path.join(tmpDir, '..', 'iteration-1');
    fs.mkdirSync(prevDir, { recursive: true });
    const prevData = {
      skillName: 'test-skill',
      generatedAt: '2026-03-14T00:00:00Z',
      iteration: 1,
      scenarios: [{ scenarioId: 1, prompt: 'p', baselineOutput: 'old baseline', currentOutput: 'old current', verdict: 'pass', tier: 1, details: '', timing: { total_tokens: 0, duration_ms: 0 } }],
      summary: { total_scenarios: 1, passed: 1, regressed: 0, pass_rate: 1, total_tokens: 0, total_cost_usd: 0, total_duration_ms: 0, tier_breakdown: { tier1_schema: 1, tier2_embedding: 0, tier3_llm_judge: 0 } },
    };
    fs.writeFileSync(path.join(prevDir, 'viewer-data.json'), JSON.stringify(prevData), 'utf-8');

    // Write iteration 2 — the reporter for iteration 2 should find iteration 1
    const iter2Dir = path.join(tmpDir, '..', 'iteration-2');
    fs.mkdirSync(iter2Dir, { recursive: true });
    const reporter = new HTMLReporter(iter2Dir, 2);
    await reporter.report(makeResults([makeScenario(1, 'regressed', 3)]));

    const data = JSON.parse(fs.readFileSync(path.join(iter2Dir, 'viewer-data.json'), 'utf-8'));
    expect(data.previousIteration).toBeDefined();
    expect(data.previousIteration.summary.passed).toBe(1);
  });

  it('handles missing previous iteration gracefully', async () => {
    const reporter = new HTMLReporter(tmpDir, 5);
    await reporter.report(makeResults([makeScenario(1, 'pass')]));
    const data = JSON.parse(fs.readFileSync(path.join(tmpDir, 'viewer-data.json'), 'utf-8'));
    expect(data.previousIteration).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/adapters/html.test.ts`
Expected: FAIL — `HTMLReporter` does not exist yet.

- [ ] **Step 3: Create the HTMLReporter**

Create `src/adapters/report/html.ts`:

```ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  ReportAdapter,
  EvalResults,
  ViewerData,
  ViewerScenario,
} from '../../types.js';

function toViewerScenarios(results: EvalResults): ViewerScenario[] {
  return results.scenarios.map((s) => ({
    scenarioId: s.scenarioId,
    prompt: s.prompt,
    baselineOutput: s.baselineOutput.raw,
    currentOutput: s.newOutput.raw,
    verdict: s.comparison.verdict,
    tier: s.comparison.tier,
    similarity: s.comparison.similarity,
    details: s.comparison.details,
    judgeReasoning: s.comparison.judgeReasoning,
    timing: s.timing,
  }));
}

function loadPreviousIteration(outputDir: string, iteration: number): ViewerData | undefined {
  if (iteration <= 1) return undefined;
  const prevPath = path.join(path.dirname(outputDir), `iteration-${iteration - 1}`, 'viewer-data.json');
  if (!fs.existsSync(prevPath)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(prevPath, 'utf-8'));
  } catch {
    return undefined;
  }
}

function buildViewerData(results: EvalResults, iteration: number, outputDir: string): ViewerData {
  const previous = loadPreviousIteration(outputDir, iteration);
  return {
    skillName: results.skillName,
    generatedAt: new Date().toISOString(),
    iteration,
    scenarios: toViewerScenarios(results),
    summary: results.summary,
    ...(previous ? { previousIteration: { summary: previous.summary, scenarios: previous.scenarios } } : {}),
  };
}

function generateHTML(data: ViewerData): string {
  const json = JSON.stringify(data);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>snapeval — ${data.skillName}</title>
<style>
:root {
  --bg: #faf9f6;
  --surface: #ffffff;
  --border: #e5e5e5;
  --text: #1a1a1a;
  --text-dim: #666;
  --accent: #2563eb;
  --pass: #16a34a;
  --fail: #dc2626;
  --warn: #ca8a04;
  --mono: 'SF Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace;
  --sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: var(--sans); background: var(--bg); color: var(--text); line-height: 1.5; }
.header { padding: 16px 24px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; background: var(--surface); }
.header h1 { font-size: 18px; font-weight: 600; }
.header .iter { font-size: 14px; color: var(--text-dim); }
.tabs { display: flex; gap: 0; border-bottom: 1px solid var(--border); background: var(--surface); }
.tab { padding: 10px 20px; cursor: pointer; border-bottom: 2px solid transparent; font-size: 14px; color: var(--text-dim); }
.tab.active { border-bottom-color: var(--accent); color: var(--accent); font-weight: 600; }
.content { max-width: 960px; margin: 0 auto; padding: 24px; }
.scenario-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.scenario-header h2 { font-size: 16px; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; }
.badge-pass { background: #dcfce7; color: var(--pass); }
.badge-regressed { background: #fef2f2; color: var(--fail); }
.badge-inconclusive { background: #fefce8; color: var(--warn); }
.badge-error { background: #fef2f2; color: var(--fail); }
.section { margin-bottom: 20px; }
.section-title { font-size: 13px; font-weight: 600; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
.prompt-box { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 12px; font-family: var(--mono); font-size: 13px; white-space: pre-wrap; }
.comparison { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.comparison-panel { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
.comparison-panel-header { padding: 8px 12px; font-size: 12px; font-weight: 600; color: var(--text-dim); border-bottom: 1px solid var(--border); background: #f9f9f7; }
.comparison-panel-body { padding: 12px; font-family: var(--mono); font-size: 13px; white-space: pre-wrap; max-height: 400px; overflow-y: auto; }
.analysis { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 12px; font-size: 13px; }
.analysis .tier-label { font-weight: 600; }
.collapsible { cursor: pointer; user-select: none; }
.collapsible::before { content: '▸ '; }
.collapsible.open::before { content: '▾ '; }
.collapsible-content { display: none; margin-top: 8px; }
.collapsible.open + .collapsible-content { display: block; }
.feedback-area { width: 100%; min-height: 80px; padding: 10px; border: 1px solid var(--border); border-radius: 6px; font-family: var(--sans); font-size: 13px; resize: vertical; }
.nav { display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; border-top: 1px solid var(--border); background: var(--surface); position: fixed; bottom: 0; left: 0; right: 0; }
.nav button { padding: 8px 16px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); cursor: pointer; font-size: 13px; }
.nav button:hover { background: #f0f0f0; }
.nav button:disabled { opacity: 0.4; cursor: default; }
.nav button.primary { background: var(--accent); color: white; border-color: var(--accent); }
.nav button.primary:hover { opacity: 0.9; }
.progress { font-size: 13px; color: var(--text-dim); }
body { padding-bottom: 70px; }
/* Benchmark tab */
.benchmark { display: none; }
.benchmark.active { display: block; }
.outputs { display: block; }
.outputs.hidden { display: none; }
.stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
.stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 16px; }
.stat-card h3 { font-size: 13px; color: var(--text-dim); margin-bottom: 8px; }
.stat-card .value { font-size: 28px; font-weight: 700; }
.stat-card .value.pass { color: var(--pass); }
.stat-card .value.fail { color: var(--fail); }
.tier-bar { display: flex; height: 24px; border-radius: 4px; overflow: hidden; margin-top: 4px; }
.tier-bar .t1 { background: #93c5fd; }
.tier-bar .t2 { background: #6366f1; }
.tier-bar .t3 { background: #a855f7; }
.tier-legend { display: flex; gap: 16px; margin-top: 8px; font-size: 12px; color: var(--text-dim); }
.tier-legend span::before { content: ''; display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; vertical-align: middle; }
.tier-legend .l1::before { background: #93c5fd; }
.tier-legend .l2::before { background: #6366f1; }
.tier-legend .l3::before { background: #a855f7; }
.stats-row { display: flex; gap: 24px; margin-bottom: 16px; font-size: 13px; color: var(--text-dim); }
.stats-row .stat { }
.stats-row .stat strong { color: var(--text); }
.delta { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 16px; margin-bottom: 20px; }
.delta h3 { font-size: 14px; margin-bottom: 8px; }
.delta .delta-pass { color: var(--pass); }
.delta .delta-fail { color: var(--fail); }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid var(--border); }
th { font-weight: 600; color: var(--text-dim); font-size: 12px; text-transform: uppercase; }
</style>
</head>
<body>
<div class="header">
  <h1>snapeval — <span id="skill-name"></span></h1>
  <span class="iter" id="iteration-label"></span>
</div>
<div class="tabs">
  <div class="tab active" onclick="switchTab('outputs')">Outputs</div>
  <div class="tab" onclick="switchTab('benchmark')">Benchmark</div>
</div>
<div class="content">
  <div class="outputs" id="outputs-view"></div>
  <div class="benchmark" id="benchmark-view"></div>
</div>
<div class="nav">
  <button id="btn-prev" onclick="navigate(-1)">← Prev</button>
  <span class="progress" id="progress"></span>
  <div style="display:flex;gap:8px;">
    <button class="primary" onclick="exportFeedback()">Export Feedback</button>
    <button id="btn-next" onclick="navigate(1)">Next →</button>
  </div>
</div>
<script>
const DATA = ${json};
let currentIndex = 0;
const feedback = {};

// Load saved feedback from localStorage
function loadFeedback() {
  for (const s of DATA.scenarios) {
    const key = DATA.skillName + '-' + DATA.iteration + '-' + s.scenarioId;
    const saved = localStorage.getItem(key);
    if (saved) feedback[s.scenarioId] = saved;
  }
}

function saveFeedback(scenarioId, text) {
  feedback[scenarioId] = text;
  const key = DATA.skillName + '-' + DATA.iteration + '-' + scenarioId;
  localStorage.setItem(key, text);
}

function badgeClass(verdict) {
  return 'badge badge-' + verdict;
}

function tierName(tier) {
  return tier === 1 ? 'Schema' : tier === 2 ? 'Embedding' : 'LLM Judge';
}

function renderScenario(idx) {
  const s = DATA.scenarios[idx];
  const prev = DATA.previousIteration?.scenarios?.find(p => p.scenarioId === s.scenarioId);
  let html = '<div class="scenario-header"><h2>Scenario ' + s.scenarioId + ' <span class="' + badgeClass(s.verdict) + '">' + s.verdict + '</span></h2><span class="progress">' + (idx + 1) + ' of ' + DATA.scenarios.length + '</span></div>';

  // Prompt
  html += '<div class="section"><div class="section-title">Prompt</div><div class="prompt-box">' + escapeHtml(s.prompt) + '</div></div>';

  // Comparison
  html += '<div class="section"><div class="section-title">Comparison</div><div class="comparison"><div class="comparison-panel"><div class="comparison-panel-header">Baseline</div><div class="comparison-panel-body">' + escapeHtml(s.baselineOutput) + '</div></div><div class="comparison-panel"><div class="comparison-panel-header">Current</div><div class="comparison-panel-body">' + escapeHtml(s.currentOutput) + '</div></div></div></div>';

  // Analysis
  html += '<div class="section"><div class="section-title">Analysis</div><div class="analysis">';
  html += '<div><span class="tier-label">Resolved at:</span> Tier ' + s.tier + ' — ' + tierName(s.tier) + '</div>';
  if (s.similarity != null) html += '<div>Similarity: ' + s.similarity.toFixed(4) + '</div>';
  html += '<div>' + escapeHtml(s.details) + '</div>';
  if (s.judgeReasoning) {
    html += '<div style="margin-top:8px"><span class="collapsible" onclick="this.classList.toggle(\'open\')">Judge Responses</span><div class="collapsible-content"><div style="margin-bottom:4px"><strong>Forward:</strong><pre style="font-size:12px;margin-top:4px">' + escapeHtml(s.judgeReasoning.forward) + '</pre></div><div><strong>Reverse:</strong><pre style="font-size:12px;margin-top:4px">' + escapeHtml(s.judgeReasoning.reverse) + '</pre></div></div></div>';
  }
  html += '</div></div>';

  // Previous iteration output
  if (prev) {
    html += '<div class="section"><span class="collapsible" onclick="this.classList.toggle(\'open\')">Previous Iteration Output</span><div class="collapsible-content"><div class="prompt-box">' + escapeHtml(prev.currentOutput) + '</div></div></div>';
  }

  // Feedback
  html += '<div class="section"><div class="section-title">Feedback</div><textarea class="feedback-area" placeholder="Optional feedback for this scenario..." oninput="saveFeedback(' + s.scenarioId + ', this.value)">' + escapeHtml(feedback[s.scenarioId] || '') + '</textarea></div>';

  return html;
}

function renderBenchmark() {
  const sm = DATA.summary;
  const total = sm.tier_breakdown.tier1_schema + sm.tier_breakdown.tier2_embedding + sm.tier_breakdown.tier3_llm_judge;
  const t1pct = total > 0 ? (sm.tier_breakdown.tier1_schema / total * 100) : 0;
  const t2pct = total > 0 ? (sm.tier_breakdown.tier2_embedding / total * 100) : 0;
  const t3pct = total > 0 ? (sm.tier_breakdown.tier3_llm_judge / total * 100) : 0;

  let html = '<div class="stats-grid"><div class="stat-card"><h3>Pass Rate</h3><div class="value ' + (sm.pass_rate >= 0.8 ? 'pass' : 'fail') + '">' + (sm.pass_rate * 100).toFixed(0) + '%</div></div>';
  html += '<div class="stat-card"><h3>Tier Breakdown</h3><div class="tier-bar"><div class="t1" style="width:' + t1pct + '%"></div><div class="t2" style="width:' + t2pct + '%"></div><div class="t3" style="width:' + t3pct + '%"></div></div><div class="tier-legend"><span class="l1">Schema: ' + sm.tier_breakdown.tier1_schema + '</span><span class="l2">Embedding: ' + sm.tier_breakdown.tier2_embedding + '</span><span class="l3">LLM Judge: ' + sm.tier_breakdown.tier3_llm_judge + '</span></div></div></div>';

  html += '<div class="stats-row"><div class="stat"><strong>' + (sm.total_duration_ms / 1000).toFixed(1) + 's</strong> duration</div><div class="stat"><strong>' + sm.total_tokens + '</strong> tokens</div><div class="stat"><strong>$' + sm.total_cost_usd.toFixed(4) + '</strong> cost</div><div class="stat"><strong>' + sm.total_scenarios + '</strong> scenarios</div></div>';

  // Delta
  if (DATA.previousIteration) {
    const prev = DATA.previousIteration.summary;
    const prDelta = ((sm.pass_rate - prev.pass_rate) * 100).toFixed(0);
    const arrow = sm.pass_rate >= prev.pass_rate ? '▲' : '▼';
    const cls = sm.pass_rate >= prev.pass_rate ? 'delta-pass' : 'delta-fail';
    html += '<div class="delta"><h3>Delta from Iteration ' + (DATA.iteration - 1) + '</h3>';
    html += '<div>Pass rate: ' + (prev.pass_rate * 100).toFixed(0) + '% → ' + (sm.pass_rate * 100).toFixed(0) + '% <span class="' + cls + '">(' + arrow + ' ' + prDelta + '%)</span></div>';
    // Find newly regressed / newly passing
    const newRegressed = DATA.scenarios.filter(s => {
      const p = DATA.previousIteration.scenarios.find(ps => ps.scenarioId === s.scenarioId);
      return s.verdict === 'regressed' && p && p.verdict === 'pass';
    }).map(s => s.scenarioId);
    const newPassing = DATA.scenarios.filter(s => {
      const p = DATA.previousIteration.scenarios.find(ps => ps.scenarioId === s.scenarioId);
      return s.verdict === 'pass' && p && p.verdict !== 'pass';
    }).map(s => s.scenarioId);
    if (newRegressed.length) html += '<div class="delta-fail">New regressions: Scenario ' + newRegressed.join(', Scenario ') + '</div>';
    if (newPassing.length) html += '<div class="delta-pass">Newly passing: Scenario ' + newPassing.join(', Scenario ') + '</div>';
    html += '</div>';
  }

  // Per-scenario table
  html += '<table><thead><tr><th>ID</th><th>Verdict</th><th>Tier</th><th>Time</th>';
  if (DATA.previousIteration) html += '<th>Delta</th>';
  html += '</tr></thead><tbody>';
  for (const s of DATA.scenarios) {
    const icon = s.verdict === 'pass' ? '✓' : s.verdict === 'regressed' ? '✗' : '?';
    const color = s.verdict === 'pass' ? 'var(--pass)' : s.verdict === 'regressed' ? 'var(--fail)' : 'var(--warn)';
    html += '<tr><td>' + s.scenarioId + '</td><td style="color:' + color + '">' + icon + ' ' + s.verdict + '</td><td>T' + s.tier + '</td><td>' + (s.timing.duration_ms / 1000).toFixed(1) + 's</td>';
    if (DATA.previousIteration) {
      const prev = DATA.previousIteration.scenarios.find(p => p.scenarioId === s.scenarioId);
      if (!prev) html += '<td>NEW</td>';
      else if (prev.verdict === s.verdict) html += '<td>=</td>';
      else html += '<td style="color:' + color + '">' + prev.verdict + ' → ' + s.verdict + '</td>';
    }
    html += '</tr>';
  }
  html += '</tbody></table>';
  return html;
}

function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  if (tab === 'outputs') {
    document.querySelector('.tab:first-child').classList.add('active');
    document.getElementById('outputs-view').classList.remove('hidden');
    document.getElementById('benchmark-view').classList.remove('active');
  } else {
    document.querySelector('.tab:last-child').classList.add('active');
    document.getElementById('outputs-view').classList.add('hidden');
    document.getElementById('benchmark-view').classList.add('active');
  }
}

function navigate(dir) {
  currentIndex = Math.max(0, Math.min(DATA.scenarios.length - 1, currentIndex + dir));
  render();
}

function render() {
  document.getElementById('skill-name').textContent = DATA.skillName;
  document.getElementById('iteration-label').textContent = 'Iteration ' + DATA.iteration;
  document.getElementById('outputs-view').innerHTML = renderScenario(currentIndex);
  document.getElementById('benchmark-view').innerHTML = renderBenchmark();
  document.getElementById('btn-prev').disabled = currentIndex === 0;
  document.getElementById('btn-next').disabled = currentIndex === DATA.scenarios.length - 1;
  document.getElementById('progress').textContent = (currentIndex + 1) + ' of ' + DATA.scenarios.length;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function exportFeedback() {
  const reviews = DATA.scenarios.map(s => ({
    scenario_id: s.scenarioId,
    feedback: feedback[s.scenarioId] || '',
    timestamp: new Date().toISOString(),
  }));
  const blob = new Blob([JSON.stringify({ skill_name: DATA.skillName, iteration: DATA.iteration, reviews }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'feedback.json';
  a.click();
}

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'TEXTAREA') return;
  if (e.key === 'ArrowLeft') navigate(-1);
  if (e.key === 'ArrowRight') navigate(1);
});

loadFeedback();
render();
</script>
</body>
</html>`;
}

export class HTMLReporter implements ReportAdapter {
  readonly name = 'html';

  constructor(
    private readonly outputDir: string,
    private readonly iterationNumber: number
  ) {}

  async report(results: EvalResults): Promise<void> {
    fs.mkdirSync(this.outputDir, { recursive: true });

    const viewerData = buildViewerData(results, this.iterationNumber, this.outputDir);

    // Write viewer-data.json
    fs.writeFileSync(
      path.join(this.outputDir, 'viewer-data.json'),
      JSON.stringify(viewerData, null, 2),
      'utf-8'
    );

    // Write report.html
    const html = generateHTML(viewerData);
    fs.writeFileSync(
      path.join(this.outputDir, 'report.html'),
      html,
      'utf-8'
    );
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/adapters/html.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/adapters/report/html.ts tests/adapters/html.test.ts
git commit -m "feat: add HTMLReporter with eval viewer and benchmark dashboard"
```

---

## Chunk 3: CLI Integration & SKILL.md

### Task 5: Wire `--html` flag into report command

**Files:**
- Modify: `bin/snapeval.ts:157-200`
- Modify: `src/commands/report.ts`
- Test: `tests/commands/report.test.ts`

- [ ] **Step 1: Write tests for reportCommand with --html**

Create `tests/commands/report.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { reportCommand } from '../../src/commands/report.js';
import type { EvalResults, ScenarioResult, SkillOutput } from '../../src/types.js';

function makeOutput(raw: string): SkillOutput {
  return { raw, metadata: { tokens: 50, durationMs: 200, model: 'copilot', adapter: 'copilot-cli' } };
}

function makeResults(): EvalResults {
  const scenario: ScenarioResult = {
    scenarioId: 1,
    prompt: 'test prompt',
    comparison: { scenarioId: 1, verdict: 'pass', tier: 1, details: 'Schema match' },
    timing: { total_tokens: 50, duration_ms: 200 },
    newOutput: makeOutput('current'),
    baselineOutput: makeOutput('baseline'),
  };
  return {
    skillName: 'test-skill',
    scenarios: [scenario],
    summary: {
      total_scenarios: 1, passed: 1, regressed: 0, pass_rate: 1,
      total_tokens: 50, total_cost_usd: 0, total_duration_ms: 200,
      tier_breakdown: { tier1_schema: 1, tier2_embedding: 0, tier3_llm_judge: 0 },
    },
    timing: { total_tokens: 50, duration_ms: 200 },
  };
}

describe('reportCommand', () => {
  let tmpDir: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapeval-report-test-'));
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    consoleSpy.mockRestore();
  });

  it('creates iteration-1 directory with JSON files', async () => {
    await reportCommand(tmpDir, makeResults(), { verbose: false });
    const iterDir = path.join(tmpDir, 'evals', 'results', 'iteration-1');
    expect(fs.existsSync(path.join(iterDir, 'grading.json'))).toBe(true);
    expect(fs.existsSync(path.join(iterDir, 'benchmark.json'))).toBe(true);
    expect(fs.existsSync(path.join(iterDir, 'timing.json'))).toBe(true);
  });

  it('does not create HTML files when --html is not set', async () => {
    await reportCommand(tmpDir, makeResults(), { verbose: false });
    const iterDir = path.join(tmpDir, 'evals', 'results', 'iteration-1');
    expect(fs.existsSync(path.join(iterDir, 'report.html'))).toBe(false);
  });

  it('creates HTML files when --html is set', async () => {
    await reportCommand(tmpDir, makeResults(), { verbose: false, html: true });
    const iterDir = path.join(tmpDir, 'evals', 'results', 'iteration-1');
    expect(fs.existsSync(path.join(iterDir, 'report.html'))).toBe(true);
    expect(fs.existsSync(path.join(iterDir, 'viewer-data.json'))).toBe(true);
  });

  it('returns the iteration directory path', async () => {
    const result = await reportCommand(tmpDir, makeResults(), { verbose: false });
    expect(result).toContain('iteration-1');
  });

  it('increments iteration number on subsequent calls', async () => {
    await reportCommand(tmpDir, makeResults(), { verbose: false });
    const result = await reportCommand(tmpDir, makeResults(), { verbose: false });
    expect(result).toContain('iteration-2');
  });
});
```

- [ ] **Step 2: Add `--html` option to CLI**

In `bin/snapeval.ts`, add to the `report` command (after line 166):

```ts
.option('--html', 'Generate HTML report viewer')
```

And update the action handler at line ~190, changing:

```ts
await reportCommand(skillPath, results, { verbose: Boolean(opts.verbose) });
```

to:

```ts
await reportCommand(skillPath, results, {
  verbose: Boolean(opts.verbose),
  html: Boolean(opts.html),
});
```

- [ ] **Step 2: Update reportCommand to accept and use `--html`**

In `src/commands/report.ts`, update the imports, signature, and body:

```ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { EvalResults } from '../types.js';
import { JSONReporter } from '../adapters/report/json.js';
import { TerminalReporter } from '../adapters/report/terminal.js';
import { HTMLReporter } from '../adapters/report/html.js';

export async function reportCommand(
  skillPath: string,
  results: EvalResults,
  options: { verbose?: boolean; html?: boolean } = {}
): Promise<string> {
  // Determine next iteration number
  const resultsBaseDir = path.join(skillPath, 'evals', 'results');
  fs.mkdirSync(resultsBaseDir, { recursive: true });

  const existingIterations = fs.readdirSync(resultsBaseDir)
    .filter((d) => /^iteration-\d+$/.test(d))
    .map((d) => parseInt(d.replace('iteration-', ''), 10))
    .sort((a, b) => a - b);

  const nextIteration = existingIterations.length > 0
    ? existingIterations[existingIterations.length - 1] + 1
    : 1;

  const iterationDir = path.join(resultsBaseDir, `iteration-${nextIteration}`);

  // Write JSON report
  const jsonReporter = new JSONReporter(iterationDir);
  await jsonReporter.report(results);

  // Write HTML report if requested
  if (options.html) {
    const htmlReporter = new HTMLReporter(iterationDir, nextIteration);
    await htmlReporter.report(results);
    const reportPath = path.join(iterationDir, 'report.html');
    console.log(`Report written to ${reportPath}`);
  }

  // Print terminal report
  if (options.verbose !== false) {
    const terminalReporter = new TerminalReporter();
    await terminalReporter.report(results);
  }

  return iterationDir;
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add bin/snapeval.ts src/commands/report.ts tests/commands/report.test.ts
git commit -m "feat: add --html flag to report command"
```

---

### Task 6: Update SKILL.md with report instructions

**Files:**
- Modify: `skills/snapeval/SKILL.md`

- [ ] **Step 1: Add report instructions to SKILL.md**

In `skills/snapeval/SKILL.md`, add a new section after the `### check` section:

```markdown
### report (visual review)

After running check, generate a visual report:
1. Run: `npx snapeval report --html <skill-path>`
2. Tell the user: "Report generated at `<path>/report.html` — open it in your browser to review results side-by-side"
3. Explain: the viewer shows baseline vs current output, comparison analysis, and benchmark stats
4. If the user provides feedback (verbally or via exported feedback.json from the viewer), use it to guide skill improvements
```

- [ ] **Step 2: Commit**

```bash
git add skills/snapeval/SKILL.md
git commit -m "docs: add HTML report instructions to SKILL.md"
```

---

### Task 7: Manual verification

- [ ] **Step 1: Run full test suite one final time**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 2: Verify HTML output with existing test data**

If test-skills/greeter has existing baselines, run:

```bash
npx tsx bin/snapeval.ts report --html test-skills/greeter --skip-embedding
```

Otherwise, the existing test-skills/greeter directory has baselines committed. If no baselines exist, you can create a smoke test by hand:
```bash
mkdir -p /tmp/snapeval-smoke/evals/snapshots
echo '{"skill_name":"smoke","generated_by":"manual","evals":[{"id":1,"prompt":"hello","expected_output":"hi"}]}' > /tmp/snapeval-smoke/evals/evals.json
echo '{"scenario_id":1,"prompt":"hello","output":{"raw":"Hi there!","metadata":{"tokens":0,"durationMs":1000,"model":"mock","adapter":"mock"}},"captured_at":"2026-03-15T00:00:00Z","runs":1,"approved_by":null}' > /tmp/snapeval-smoke/evals/snapshots/scenario-1.snap.json
```

Then verify the generated `report.html` opens in a browser and shows:
- Outputs tab with scenario navigation
- Side-by-side comparison panels
- Analysis section with tier info
- Benchmark tab with stats and tier breakdown
- Feedback textarea that persists to localStorage
- Export Feedback button downloads JSON
- Arrow key navigation works

- [ ] **Step 3: Final commit (if any cleanup needed)**
