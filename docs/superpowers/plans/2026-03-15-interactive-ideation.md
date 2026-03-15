# Interactive Scenario Ideation — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace single-shot test case generation with an interactive, multi-phase ideation process featuring a browser-based viewer.

**Architecture:** Intelligence lives in the SKILL.md (Copilot reasons conversationally). Infrastructure is thin: a `writeEvalsJson` serializer, an `ideate` CLI command that injects analysis JSON into a shipped HTML template, and the HTML template itself.

**Tech Stack:** TypeScript (ESM), Vitest, commander, Node.js fs/path/child_process

**Spec:** `docs/superpowers/specs/2026-03-15-interactive-ideation-design.md`

---

## Chunk 1: Engine + CLI Infrastructure

### Task 1: Add `writeEvalsJson` utility to generator.ts

**Files:**
- Modify: `src/engine/generator.ts` (add export at bottom)
- Test: `tests/engine/generator.test.ts` (add new describe block)

- [ ] **Step 1: Write the failing test**

Add to the bottom of `tests/engine/generator.test.ts`:

```ts
// --- writeEvalsJson ---

describe('writeEvalsJson', () => {
  it('maps scenarios to EvalsFile with correct structure', () => {
    const result = writeEvalsJson('my-skill', [
      { id: 1, prompt: 'hello', expected_output: 'greeting' },
      { id: 2, prompt: 'bye', expected_output: 'farewell' },
    ]);

    expect(result.skill_name).toBe('my-skill');
    expect(result.generated_by).toBe('snapeval interactive');
    expect(result.evals).toHaveLength(2);
    expect(result.evals[0]).toEqual({
      id: 1,
      prompt: 'hello',
      expected_output: 'greeting',
      files: [],
      assertions: [],
    });
  });

  it('handles empty scenarios array', () => {
    const result = writeEvalsJson('empty-skill', []);
    expect(result.evals).toEqual([]);
    expect(result.skill_name).toBe('empty-skill');
  });
});
```

Update the import at the top of the test file:

```ts
import { buildGeneratorPrompt, generateEvals, writeEvalsJson } from '../../src/engine/generator.js';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/generator.test.ts`
Expected: FAIL — `writeEvalsJson` is not exported from generator.js

- [ ] **Step 3: Write minimal implementation**

Add to the bottom of `src/engine/generator.ts`:

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

Note: `EvalsFile` is already imported at the top of the file (`import type { InferenceAdapter, EvalsFile } from '../types.js'`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/generator.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/generator.ts tests/engine/generator.test.ts
git commit -m "feat: add writeEvalsJson serializer for interactive ideation path"
```

---

### Task 2: Create the ideation viewer HTML template

**Files:**
- Create: `assets/ideation-viewer.html`
- Modify: `package.json` (add `assets/` to `files` array)

This is a self-contained HTML file with embedded CSS and JS. It receives analysis data via a `__ANALYSIS_DATA_PLACEHOLDER__` that gets replaced with JSON by the `ideate` command. Must be created BEFORE the ideate command tests (Task 3), since those tests depend on the template existing.

- [ ] **Step 1: Create assets directory and the HTML template**

Create `assets/ideation-viewer.html`. The template has these sections:

1. **Header** — Skill name, stats summary
2. **Skill Map tab** — Behavior cards, dimension tags
3. **Ambiguities section** — Cards with in-scope/out-of-scope toggle
4. **Coverage Matrix** — Table derived from scenarios[].covers
5. **Scenarios section** — Cards with toggle, inline edit, dimension tags
6. **Add Scenario form** — Free-form input for custom scenarios
7. **Notes textarea** — Free-text context
8. **Confirm & Run button** — Exports scenario_plan.json

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>snapeval — Scenario Ideation</title>
<style>
  /* === Reset & Base === */
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #faf9f6;
    color: #1a1a1a;
    line-height: 1.6;
    padding: 2rem;
    max-width: 1200px;
    margin: 0 auto;
  }
  code, pre, .mono { font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace; }

  /* === Colors (shared with eval viewer) === */
  :root {
    --accent: #2563eb;
    --accent-light: #dbeafe;
    --pass: #16a34a;
    --pass-bg: #dcfce7;
    --fail: #dc2626;
    --fail-bg: #fee2e2;
    --warn: #ca8a04;
    --warn-bg: #fef9c3;
    --gray: #6b7280;
    --gray-light: #f3f4f6;
    --gray-border: #e5e7eb;
    --bg: #faf9f6;
    --card-bg: #ffffff;
  }

  /* === Layout === */
  header { margin-bottom: 2rem; }
  header h1 { font-size: 1.5rem; font-weight: 600; }
  header .subtitle { color: var(--gray); font-size: 0.875rem; margin-top: 0.25rem; }
  .stats { display: flex; gap: 1.5rem; margin-top: 1rem; flex-wrap: wrap; }
  .stat { background: var(--card-bg); border: 1px solid var(--gray-border); border-radius: 8px; padding: 0.75rem 1rem; }
  .stat-value { font-size: 1.25rem; font-weight: 600; }
  .stat-label { font-size: 0.75rem; color: var(--gray); text-transform: uppercase; letter-spacing: 0.05em; }

  /* === Sections === */
  section { margin-bottom: 2rem; }
  section h2 { font-size: 1.125rem; font-weight: 600; margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--gray-border); }
  section h3 { font-size: 0.875rem; font-weight: 600; color: var(--gray); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.75rem; }

  /* === Cards === */
  .card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }
  .card {
    background: var(--card-bg);
    border: 1px solid var(--gray-border);
    border-radius: 8px;
    padding: 1rem;
    transition: border-color 0.15s;
  }
  .card:hover { border-color: var(--accent); }
  .card-title { font-weight: 600; font-size: 0.9rem; margin-bottom: 0.5rem; }
  .card-desc { font-size: 0.85rem; color: var(--gray); }

  /* === Tags === */
  .tag {
    display: inline-block;
    background: var(--accent-light);
    color: var(--accent);
    font-size: 0.75rem;
    font-weight: 500;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    margin: 0.15rem;
  }
  .tag.dim { background: var(--gray-light); color: var(--gray); }

  /* === Ambiguities === */
  .ambiguity-card { border-left: 3px solid var(--warn); }
  .ambiguity-why { font-size: 0.8rem; color: var(--gray); margin: 0.5rem 0; font-style: italic; }
  .scope-toggle { display: flex; gap: 0.5rem; margin-top: 0.75rem; }
  .scope-btn {
    padding: 0.3rem 0.75rem;
    border: 1px solid var(--gray-border);
    border-radius: 4px;
    background: var(--card-bg);
    cursor: pointer;
    font-size: 0.8rem;
    transition: all 0.15s;
  }
  .scope-btn:hover { border-color: var(--accent); }
  .scope-btn.active-in { background: var(--pass-bg); border-color: var(--pass); color: var(--pass); }
  .scope-btn.active-out { background: var(--gray-light); border-color: var(--gray); color: var(--gray); }

  /* === Coverage Matrix === */
  .matrix-wrapper { overflow-x: auto; }
  table.matrix {
    border-collapse: collapse;
    width: 100%;
    font-size: 0.8rem;
  }
  table.matrix th, table.matrix td {
    border: 1px solid var(--gray-border);
    padding: 0.5rem 0.75rem;
    text-align: center;
  }
  table.matrix th { background: var(--gray-light); font-weight: 600; }
  table.matrix td.covered { background: var(--pass-bg); color: var(--pass); }
  table.matrix td.not-covered { background: var(--card-bg); color: var(--gray-light); }
  table.matrix td.scenario-label { text-align: left; font-weight: 500; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* === Scenario Cards === */
  .scenario-card { position: relative; }
  .scenario-card.disabled { opacity: 0.5; }
  .scenario-toggle {
    position: absolute;
    top: 1rem;
    right: 1rem;
    width: 40px;
    height: 22px;
    background: var(--pass);
    border-radius: 11px;
    cursor: pointer;
    border: none;
    transition: background 0.2s;
  }
  .scenario-toggle.off { background: var(--gray); }
  .scenario-toggle::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    background: white;
    border-radius: 50%;
    transition: transform 0.2s;
  }
  .scenario-toggle.off::after { transform: translateX(0); }
  .scenario-toggle:not(.off)::after { transform: translateX(18px); }

  .scenario-prompt {
    background: var(--gray-light);
    border-radius: 4px;
    padding: 0.75rem;
    font-family: monospace;
    font-size: 0.85rem;
    margin: 0.75rem 0;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .scenario-why { font-size: 0.8rem; color: var(--gray); margin-bottom: 0.5rem; }
  .scenario-expected { font-size: 0.85rem; margin-top: 0.5rem; }
  .scenario-expected strong { font-weight: 600; }

  .editable {
    border: 1px solid transparent;
    border-radius: 4px;
    padding: 0.25rem;
    transition: border-color 0.15s;
    cursor: text;
  }
  .editable:hover { border-color: var(--gray-border); }
  .editable:focus { border-color: var(--accent); outline: none; background: var(--accent-light); }

  /* === Add Scenario === */
  .add-form {
    background: var(--card-bg);
    border: 2px dashed var(--gray-border);
    border-radius: 8px;
    padding: 1.25rem;
    margin-top: 1rem;
  }
  .add-form label { display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.25rem; margin-top: 0.75rem; }
  .add-form label:first-child { margin-top: 0; }
  .add-form textarea, .add-form input[type="text"] {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid var(--gray-border);
    border-radius: 4px;
    font-family: inherit;
    font-size: 0.85rem;
    resize: vertical;
  }
  .add-form textarea:focus, .add-form input[type="text"]:focus { border-color: var(--accent); outline: none; }

  /* === Notes === */
  #user-notes {
    width: 100%;
    min-height: 80px;
    padding: 0.75rem;
    border: 1px solid var(--gray-border);
    border-radius: 8px;
    font-family: inherit;
    font-size: 0.85rem;
    resize: vertical;
  }
  #user-notes:focus { border-color: var(--accent); outline: none; }

  /* === Buttons === */
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 1.25rem;
    border: none;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }
  .btn-primary { background: var(--accent); color: white; }
  .btn-primary:hover { background: #1d4ed8; }
  .btn-secondary { background: var(--gray-light); color: var(--gray); border: 1px solid var(--gray-border); }
  .btn-secondary:hover { background: var(--gray-border); }
  .btn-add { background: var(--pass-bg); color: var(--pass); border: 1px solid var(--pass); }
  .btn-add:hover { background: var(--pass); color: white; }

  .actions { display: flex; gap: 1rem; margin-top: 2rem; padding-top: 1.5rem; border-top: 2px solid var(--gray-border); }
  .actions .spacer { flex: 1; }
</style>
</head>
<body>

<script>
  const DATA = __ANALYSIS_DATA_PLACEHOLDER__;

  // State
  const state = {
    scenarios: DATA.scenarios.map(s => ({ ...s })),
    ambiguityDecisions: DATA.ambiguities.map(a => ({ description: a.description, decision: a.in_scope === true ? 'in_scope' : a.in_scope === false ? 'out_of_scope' : null })),
    customScenarios: [],
    userNotes: '',
  };

  function render() {
    document.getElementById('app').innerHTML = `
      ${renderHeader()}
      ${renderSkillMap()}
      ${renderAmbiguities()}
      ${renderCoverageMatrix()}
      ${renderScenarios()}
      ${renderAddForm()}
      ${renderNotes()}
      ${renderActions()}
    `;
    bindEvents();
  }

  function renderHeader() {
    const enabled = state.scenarios.filter(s => s.enabled).length;
    return `
      <header>
        <h1>snapeval — ${DATA.skill_name}</h1>
        <div class="subtitle">Interactive Scenario Ideation</div>
        <div class="stats">
          <div class="stat"><div class="stat-value">${DATA.behaviors.length}</div><div class="stat-label">Behaviors</div></div>
          <div class="stat"><div class="stat-value">${DATA.dimensions.length}</div><div class="stat-label">Dimensions</div></div>
          <div class="stat"><div class="stat-value">${enabled} / ${state.scenarios.length + state.customScenarios.length}</div><div class="stat-label">Scenarios</div></div>
          <div class="stat"><div class="stat-value">${DATA.ambiguities.length}</div><div class="stat-label">Ambiguities</div></div>
        </div>
      </header>
    `;
  }

  function renderSkillMap() {
    const behaviorCards = DATA.behaviors.map(b => `
      <div class="card">
        <div class="card-title">${esc(b.name)}</div>
        <div class="card-desc">${esc(b.description)}</div>
      </div>
    `).join('');

    const dimensionCards = DATA.dimensions.map(d => `
      <div class="card">
        <div class="card-title">${esc(d.name)}</div>
        <div>${d.values.map(v => `<span class="tag dim">${esc(v)}</span>`).join(' ')}</div>
      </div>
    `).join('');

    return `
      <section>
        <h2>Skill Map</h2>
        <h3>Behaviors</h3>
        <div class="card-grid">${behaviorCards}</div>
        <h3 style="margin-top:1.5rem">Input Dimensions</h3>
        <div class="card-grid">${dimensionCards}</div>
      </section>
    `;
  }

  function renderAmbiguities() {
    if (DATA.ambiguities.length === 0) return '';
    const cards = DATA.ambiguities.map((a, i) => {
      const decision = state.ambiguityDecisions[i]?.decision;
      return `
        <div class="card ambiguity-card">
          <div class="card-title">${esc(a.description)}</div>
          <div class="ambiguity-why">${esc(a.why_it_matters)}</div>
          <div class="scope-toggle">
            <button class="scope-btn ${decision === 'in_scope' ? 'active-in' : ''}" data-amb-idx="${i}" data-decision="in_scope">In Scope</button>
            <button class="scope-btn ${decision === 'out_of_scope' ? 'active-out' : ''}" data-amb-idx="${i}" data-decision="out_of_scope">Out of Scope</button>
          </div>
        </div>
      `;
    }).join('');

    return `
      <section>
        <h2>Gaps & Ambiguities</h2>
        <div class="card-grid">${cards}</div>
      </section>
    `;
  }

  function renderCoverageMatrix() {
    const allScenarios = [...state.scenarios.filter(s => s.enabled), ...state.customScenarios];
    if (allScenarios.length === 0 || DATA.dimensions.length === 0) return '';

    // Group by dimension
    const dimGroups = Object.create(null);
    DATA.dimensions.forEach(d => { dimGroups[d.name] = d.values; });

    const dimNames = Object.keys(dimGroups);
    const dimValues = dimNames.flatMap(d => dimGroups[d].map(v => ({ dim: d, value: v, key: `${d}:${v}` })));

    const headerCells = dimValues.map(dv => `<th title="${esc(dv.dim)}">${esc(dv.value)}</th>`).join('');
    const rows = allScenarios.map((s, i) => {
      const covers = new Set(s.covers || []);
      const cells = dimValues.map(dv =>
        `<td class="${covers.has(dv.key) ? 'covered' : 'not-covered'}">${covers.has(dv.key) ? '●' : '·'}</td>`
      ).join('');
      const label = s.prompt ? s.prompt.slice(0, 50) + (s.prompt.length > 50 ? '...' : '') : `Custom #${i+1}`;
      return `<tr><td class="scenario-label" title="${esc(s.prompt || '')}">${esc(label)}</td>${cells}</tr>`;
    }).join('');

    const groupHeaders = dimNames.map(d => `<th colspan="${dimGroups[d].length}" style="background:var(--accent-light);color:var(--accent)">${esc(d)}</th>`).join('');

    return `
      <section>
        <h2>Coverage Matrix</h2>
        <div class="matrix-wrapper">
          <table class="matrix">
            <thead>
              <tr><th></th>${groupHeaders}</tr>
              <tr><th>Scenario</th>${headerCells}</tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderScenarios() {
    const cards = state.scenarios.map((s, i) => `
      <div class="card scenario-card ${s.enabled ? '' : 'disabled'}">
        <button class="scenario-toggle ${s.enabled ? '' : 'off'}" data-scenario-idx="${i}" title="${s.enabled ? 'Enabled' : 'Disabled'}"></button>
        <div class="card-title">Scenario ${s.id}</div>
        <div class="scenario-why">${esc(s.why)}</div>
        <div class="scenario-prompt editable" contenteditable="true" data-field="prompt" data-scenario-idx="${i}">${esc(s.prompt)}</div>
        <div>${(s.covers || []).map(c => `<span class="tag">${esc(c)}</span>`).join(' ')}</div>
        <div class="scenario-expected"><strong>Expected:</strong> <span class="editable" contenteditable="true" data-field="expected_behavior" data-scenario-idx="${i}">${esc(s.expected_behavior)}</span></div>
      </div>
    `).join('');

    const customCards = state.customScenarios.map((s, i) => `
      <div class="card scenario-card" style="border-color:var(--pass)">
        <div class="card-title" style="color:var(--pass)">Custom #${i + 1} <button class="btn-secondary" style="font-size:0.7rem;padding:0.15rem 0.4rem;margin-left:0.5rem" data-remove-custom="${i}">Remove</button></div>
        <div class="scenario-prompt">${esc(s.prompt)}</div>
        <div class="scenario-expected"><strong>Expected:</strong> ${esc(s.expected_behavior)}</div>
      </div>
    `).join('');

    return `
      <section>
        <h2>Proposed Scenarios</h2>
        <div class="card-grid">${cards}${customCards}</div>
      </section>
    `;
  }

  function renderAddForm() {
    return `
      <section>
        <h2>Add Custom Scenario</h2>
        <div class="add-form">
          <label for="custom-prompt">User Prompt</label>
          <textarea id="custom-prompt" rows="3" placeholder="Type a realistic user prompt..."></textarea>
          <label for="custom-expected">Expected Behavior</label>
          <input type="text" id="custom-expected" placeholder="What should happen?" />
          <div style="margin-top:0.75rem">
            <button class="btn btn-add" id="add-scenario-btn">Add Scenario</button>
          </div>
        </div>
      </section>
    `;
  }

  function renderNotes() {
    return `
      <section>
        <h2>Notes for AI</h2>
        <textarea id="user-notes" placeholder="Add any context, constraints, or known issues you want the AI to consider...">${esc(state.userNotes)}</textarea>
      </section>
    `;
  }

  function renderActions() {
    const enabledCount = state.scenarios.filter(s => s.enabled).length + state.customScenarios.length;
    return `
      <div class="actions">
        <span style="color:var(--gray);font-size:0.85rem;align-self:center">${enabledCount} scenario${enabledCount !== 1 ? 's' : ''} will be exported</span>
        <span class="spacer"></span>
        <button class="btn btn-primary" id="confirm-btn">Confirm & Run</button>
      </div>
    `;
  }

  function bindEvents() {
    // Scenario toggles
    document.querySelectorAll('.scenario-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.scenarioIdx);
        state.scenarios[idx].enabled = !state.scenarios[idx].enabled;
        render();
      });
    });

    // Ambiguity scope buttons
    document.querySelectorAll('.scope-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.ambIdx);
        const decision = btn.dataset.decision;
        const current = state.ambiguityDecisions[idx].decision;
        state.ambiguityDecisions[idx].decision = current === decision ? null : decision;
        render();
      });
    });

    // Editable fields (blur saves)
    document.querySelectorAll('.editable[data-scenario-idx]').forEach(el => {
      el.addEventListener('blur', () => {
        const idx = parseInt(el.dataset.scenarioIdx);
        const field = el.dataset.field;
        state.scenarios[idx][field] = el.textContent.trim();
      });
    });

    // Remove custom scenario
    document.querySelectorAll('[data-remove-custom]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.removeCustom);
        state.customScenarios.splice(idx, 1);
        render();
      });
    });

    // Add scenario
    const addBtn = document.getElementById('add-scenario-btn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        const prompt = document.getElementById('custom-prompt').value.trim();
        const expected = document.getElementById('custom-expected').value.trim();
        if (!prompt) return;
        state.customScenarios.push({ prompt, expected_behavior: expected || 'Not specified' });
        render();
      });
    }

    // Notes
    const notes = document.getElementById('user-notes');
    if (notes) {
      notes.addEventListener('input', () => { state.userNotes = notes.value; });
    }

    // Confirm & Run
    const confirmBtn = document.getElementById('confirm-btn');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', exportPlan);
    }
  }

  function exportPlan() {
    const plan = {
      version: 1,
      confirmed_scenarios: state.scenarios
        .filter(s => s.enabled)
        .map(s => ({
          id: s.id,
          prompt: s.prompt,
          expected_behavior: s.expected_behavior,
          covers: s.covers,
          why: s.why,
        })),
      custom_scenarios: state.customScenarios.map(s => ({
        prompt: s.prompt,
        expected_behavior: s.expected_behavior,
      })),
      ambiguity_decisions: state.ambiguityDecisions.filter(a => a.decision !== null),
      user_notes: state.userNotes || '',
    };

    const blob = new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'scenario_plan.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    const confirmBtn = document.getElementById('confirm-btn');
    if (confirmBtn) {
      confirmBtn.textContent = 'Exported! Return to your terminal.';
      confirmBtn.disabled = true;
      confirmBtn.style.background = 'var(--pass)';
    }
  }

  function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Boot
  document.addEventListener('DOMContentLoaded', () => {
    const app = document.createElement('div');
    app.id = 'app';
    document.body.appendChild(app);
    render();
  });
</script>

</body>
</html>
```

- [ ] **Step 2: Add `assets/` to package.json `files` array**

In `package.json`, add `"assets/"` to the `files` array so the template ships with the npm package.

- [ ] **Step 3: Commit**

```bash
git add assets/ideation-viewer.html package.json
git commit -m "feat: add ideation viewer HTML template with interactive scenario editing"
```

---

### Task 3: Create the `ideate` CLI command

**Files:**
- Create: `src/commands/ideate.ts`
- Test: `tests/commands/ideate.test.ts`
- Modify: `bin/snapeval.ts` (wire the command)

The `ideate` command reads `evals/analysis.json` from a skill directory, injects it into the shipped HTML template (created in Task 2), writes `evals/ideation.html`, and opens it in the default browser.

- [ ] **Step 1: Write the failing tests**

Create `tests/commands/ideate.test.ts`:

```ts
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ideateCommand } from '../../src/commands/ideate.js';

// Mock child_process.execSync to prevent actually opening a browser
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

const VALID_ANALYSIS = {
  version: 1,
  skill_name: 'greeter',
  behaviors: [
    { name: 'formal-greeting', description: 'Greets formally' },
  ],
  dimensions: [
    { name: 'style', values: ['formal', 'casual'] },
  ],
  failure_modes: [],
  ambiguities: [],
  scenarios: [
    {
      id: 1,
      prompt: 'greet me formally',
      expected_behavior: 'Formal greeting',
      covers: ['style:formal'],
      why: 'Baseline happy path',
      enabled: true,
    },
  ],
};

describe('ideateCommand', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapeval-ideate-'));
    fs.mkdirSync(path.join(tmpDir, 'evals'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reads analysis.json and writes ideation.html', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'evals', 'analysis.json'),
      JSON.stringify(VALID_ANALYSIS)
    );

    await ideateCommand(tmpDir);

    const htmlPath = path.join(tmpDir, 'evals', 'ideation.html');
    expect(fs.existsSync(htmlPath)).toBe(true);

    const html = fs.readFileSync(htmlPath, 'utf-8');
    expect(html).toContain('greeter');
    expect(html).toContain('formal-greeting');
    expect(html).not.toContain('__ANALYSIS_DATA_PLACEHOLDER__');
  });

  it('throws when analysis.json is missing', async () => {
    await expect(ideateCommand(tmpDir)).rejects.toThrow('analysis.json');
  });

  it('throws when analysis.json is malformed', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'evals', 'analysis.json'),
      'not json'
    );

    await expect(ideateCommand(tmpDir)).rejects.toThrow();
  });

  it('throws when analysis.json is missing required fields', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'evals', 'analysis.json'),
      JSON.stringify({ version: 1 })
    );

    await expect(ideateCommand(tmpDir)).rejects.toThrow();
  });

  it('embeds the analysis data in the HTML', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'evals', 'analysis.json'),
      JSON.stringify(VALID_ANALYSIS)
    );

    await ideateCommand(tmpDir);

    const html = fs.readFileSync(
      path.join(tmpDir, 'evals', 'ideation.html'),
      'utf-8'
    );
    // The JSON should be embedded as a JS variable
    expect(html).toContain(JSON.stringify(VALID_ANALYSIS));
  });

  it('attempts to open the browser', async () => {
    const { execSync } = await import('node:child_process');

    fs.writeFileSync(
      path.join(tmpDir, 'evals', 'analysis.json'),
      JSON.stringify(VALID_ANALYSIS)
    );

    await ideateCommand(tmpDir);

    expect(execSync).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/commands/ideate.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the ideateCommand implementation**

Create `src/commands/ideate.ts`:

```ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { SnapevalError } from '../errors.js';

interface AnalysisData {
  version: number;
  skill_name: string;
  behaviors: Array<{ name: string; description: string }>;
  dimensions: Array<{ name: string; values: string[] }>;
  failure_modes: Array<{ description: string; severity: string }>;
  ambiguities: Array<{ description: string; why_it_matters: string; in_scope: boolean | null }>;
  scenarios: Array<{
    id: number;
    prompt: string;
    expected_behavior: string;
    covers: string[];
    why: string;
    enabled: boolean;
  }>;
}

function validateAnalysis(data: unknown): asserts data is AnalysisData {
  if (!data || typeof data !== 'object') {
    throw new SnapevalError('analysis.json must be a JSON object.');
  }
  const obj = data as Record<string, unknown>;
  if (!obj.skill_name || !Array.isArray(obj.behaviors) || !Array.isArray(obj.scenarios)) {
    throw new SnapevalError(
      'analysis.json is missing required fields (skill_name, behaviors, scenarios).'
    );
  }
}

function getTemplatePath(): string {
  // Resolve template relative to this module's location
  // In dev (tsx): src/commands/ideate.ts → ../../assets/ideation-viewer.html
  // In compiled: dist/src/commands/ideate.js → ../../../assets/ideation-viewer.html
  const moduleDir = path.dirname(new URL(import.meta.url).pathname);
  const candidates = [
    path.resolve(moduleDir, '../../assets/ideation-viewer.html'),
    path.resolve(moduleDir, '../../../assets/ideation-viewer.html'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new SnapevalError(
    'Could not find ideation-viewer.html template. Ensure the assets/ directory is present.'
  );
}

function openInBrowser(filePath: string): void {
  const platform = process.platform;
  try {
    if (platform === 'darwin') {
      execSync(`open "${filePath}"`);
    } else if (platform === 'linux') {
      execSync(`xdg-open "${filePath}"`);
    } else if (platform === 'win32') {
      execSync(`start "" "${filePath}"`);
    }
  } catch {
    // Browser open is best-effort — don't fail the command
    console.log(`Could not open browser automatically. Open this file manually:\n${filePath}`);
  }
}

export async function ideateCommand(skillPath: string): Promise<string> {
  const analysisPath = path.join(skillPath, 'evals', 'analysis.json');

  if (!fs.existsSync(analysisPath)) {
    throw new SnapevalError(
      `No analysis.json found at ${analysisPath}. ` +
      'The snapeval skill generates this file during the analysis phase.'
    );
  }

  let analysisData: unknown;
  try {
    analysisData = JSON.parse(fs.readFileSync(analysisPath, 'utf-8'));
  } catch {
    throw new SnapevalError(`Failed to parse ${analysisPath}. Ensure it contains valid JSON.`);
  }

  validateAnalysis(analysisData);

  const template = fs.readFileSync(getTemplatePath(), 'utf-8');
  const html = template.replace(
    '__ANALYSIS_DATA_PLACEHOLDER__',
    JSON.stringify(analysisData)
  );

  const outputPath = path.join(skillPath, 'evals', 'ideation.html');
  fs.writeFileSync(outputPath, html, 'utf-8');

  openInBrowser(outputPath);

  return outputPath;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/commands/ideate.test.ts`
Expected: ALL PASS (the HTML template was created in Task 2)

- [ ] **Step 5: Wire the `ideate` command into bin/snapeval.ts**

Add after the `report` command block in `bin/snapeval.ts`:

```ts
import { ideateCommand } from '../src/commands/ideate.js';
```

And the command definition:

```ts
// --- ideate ---
program
  .command('ideate')
  .description('Open the interactive scenario ideation viewer')
  .argument('[skill-dir]', 'Path to skill directory', process.cwd())
  .action(async (skillDir: string) => {
    try {
      const skillPath = path.resolve(skillDir);
      const outputPath = await ideateCommand(skillPath);
      console.log(`Ideation viewer opened: ${outputPath}`);
      process.exit(0);
    } catch (err) {
      handleError(err);
    }
  });
```

- [ ] **Step 6: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add src/commands/ideate.ts tests/commands/ideate.test.ts bin/snapeval.ts
git commit -m "feat: add ideate CLI command for interactive scenario ideation"
```

---

## Chunk 2: SKILL.md Rewrite

### Task 4: Rewrite the snapeval SKILL.md with multi-phase evaluate flow

**Files:**
- Modify: `skills/snapeval/SKILL.md` (major rewrite)
- Modify: `plugin/skills/snapeval/SKILL.md` (copy)

The SKILL.md is the product. It teaches Copilot how to analyze a skill, reason about coverage, generate realistic prompts, present the analysis visually, and handle user feedback.

- [ ] **Step 1: Rewrite `skills/snapeval/SKILL.md`**

Replace the entire file with:

```markdown
---
name: snapeval
description: Evaluate AI skills through interactive scenario ideation. Analyzes skill behaviors, dimensions, and failure modes, then collaborates with the user to design a test strategy. Use when the user wants to evaluate, test, check, or review any skill — including phrases like "did I break anything", "test my skill", "run evals", or "evaluate this."
---

You are snapeval, a skill evaluation assistant. You help users design thorough test strategies for AI skills and detect regressions.

## Commands

### evaluate / test (scenario ideation + first capture)

When the user asks to evaluate or test a skill, follow this multi-phase process. Do NOT skip phases or collapse them into a single step.

#### Phase 0 — Validate

1. Identify the skill to evaluate — ask for the path if not provided
2. Verify the skill directory exists and contains a SKILL.md (or skill.md)
3. If not found, tell the user: "No SKILL.md found at `<path>`. This tool evaluates skills that follow the agentskills.io standard."

#### Phase 1 — Analyze the Skill

Read the target skill's SKILL.md completely. If it references files in `scripts/`, `references/`, or `assets/`, read those too.

Then reason through the skill systematically. Produce a structured analysis covering:

**Behaviors** — Discrete things the skill can do. Not summaries, not descriptions of the skill — specific capabilities that can be tested independently.

**Input Dimensions** — What varies across invocations. Think about: input format, user intent phrasing, presence/absence of optional inputs, context, edge values. Each dimension has named values.

**Failure Modes** — Where things could break. Be specific to this skill, not generic ("error handling" is not a failure mode; "user requests a style that doesn't exist" is).

**Ambiguities** — Things the SKILL.md doesn't clearly specify. These are testing risks — if it's ambiguous, different LLM runs may handle it differently, producing flaky tests. For each, explain why it matters.

After analysis, generate 5-8 test scenarios. For each scenario:
- Write a realistic, messy user prompt (see Prompt Realism below)
- Tag which dimensions it covers using `dimension:value` format
- Explain WHY this scenario matters — what regression would it catch?
- Describe expected behavior in plain language

Select scenarios to maximize coverage across dimensions. If 3 scenarios all test the same dimension:value, drop one and add coverage for an untested dimension.

Write the analysis as JSON to `<skill-path>/evals/analysis.json`:

```json
{
  "version": 1,
  "skill_name": "<name>",
  "behaviors": [{ "name": "...", "description": "..." }],
  "dimensions": [{ "name": "...", "values": ["..."] }],
  "failure_modes": [{ "description": "...", "severity": "low|medium|high" }],
  "ambiguities": [{ "description": "...", "why_it_matters": "...", "in_scope": null }],
  "scenarios": [{
    "id": 1,
    "prompt": "...",
    "expected_behavior": "...",
    "covers": ["dim:value", ...],
    "why": "...",
    "enabled": true
  }]
}
```

Give a brief terminal summary: "I've analyzed your skill — found N behaviors, N dimensions, and N potential gaps. Opening the analysis viewer."

#### Phase 2 — Visual Presentation

Open the interactive ideation viewer:

```bash
npx snapeval ideate <skill-path>
```

Tell the user:
> "I've opened the analysis viewer in your browser. Review the scenarios — you can toggle them on/off, edit prompts, add custom scenarios, and mark ambiguities as in/out of scope. When you're done, click 'Confirm & Run' to export your plan. Come back here and tell me when you're ready."

Wait for the user to return.

#### Phase 3 — Ingest Feedback

When the user says they're done, find the exported plan:
1. Check `~/Downloads/scenario_plan.json`
2. Check `~/Downloads/scenario_plan (1).json`, `scenario_plan (2).json` (browser duplicates)
3. If not found, ask: "I couldn't find scenario_plan.json in your Downloads. Can you paste the path?"

Read the plan and acknowledge changes:
- Scenarios toggled off — "Removed N scenarios"
- Custom scenarios added — "Added N custom scenarios"
- Ambiguities marked in-scope — generate additional scenarios for them, present briefly
- Edits — use as-is

If the user marked ambiguities as in-scope, generate additional scenarios covering them and ask for quick confirmation.

#### Phase 4 — Write & Run

Write the finalized scenarios to `evals/evals.json`. Map fields:
- `confirmed_scenarios[].prompt` → `evals[].prompt`
- `confirmed_scenarios[].expected_behavior` → `evals[].expected_output`
- `custom_scenarios[]` → append with auto-assigned IDs starting after the last confirmed ID
- `covers` and `why` are not persisted — they're ideation metadata

Run capture:
```bash
npx snapeval capture <skill-path>
```

Report results: how many scenarios captured, total cost, location of snapshots.

### check (regression detection)

1. Run: `npx snapeval check <skill-path>`
2. Parse the terminal output
3. Report conversationally:
   - Which scenarios passed and at which tier (schema/judge)
   - Which scenarios regressed with details about what changed
   - Total cost and duration
4. If regressions found, present options:
   - Fix the skill and re-check
   - Run `@snapeval approve` to accept new behavior

### report (visual review)

After running check, generate a visual report:
1. Run: `npx snapeval report --html <skill-path>`
2. Tell the user: "Report generated at `<path>/report.html` — open it in your browser to review results side-by-side"
3. Explain: the viewer shows baseline vs current output, comparison analysis, and benchmark stats
4. If the user provides feedback (verbally or via exported feedback.json from the viewer), use it to guide skill improvements

### approve

1. Run: `npx snapeval approve --scenario <N>` (or without --scenario for all)
2. Confirm what was approved
3. Remind user to commit the updated snapshots

## Prompt Realism

When generating scenario prompts, make them realistic — the way a real user would actually type them. Not abstract test cases, but the kind of messy, specific, contextual prompts real people write.

**Bad:** "Please provide a formal greeting for Eleanor"
**Good:** "hey can you greet my colleague eleanor? make it formal, she's kind of old school"

**Bad:** "Handle an unknown style gracefully"
**Good:** "greet me in shakespearean english plz"

**Bad:** "Test empty input"
**Good:** "" (literally empty) or just "hey" with no clear intent

Vary style across scenarios: some terse, some with backstory, some with typos or abbreviations, some polite, some casual. Mix lengths. Include personal context where natural. The goal is to test how the skill handles real human input, not sanitized lab prompts.

## Important

- Never ask the user to write evals.json, analysis.json, or any config files manually
- Always read the target skill's SKILL.md (and referenced files) before generating scenarios
- Report costs prominently (should be $0.00 for Copilot gpt-5-mini)
- When reporting regressions, explain what changed in plain language
- The ideation viewer and eval viewer are separate tools for separate stages — don't confuse them
```

- [ ] **Step 2: Copy to plugin directory**

```bash
cp skills/snapeval/SKILL.md plugin/skills/snapeval/SKILL.md
```

- [ ] **Step 3: Run all tests to ensure nothing is broken**

Run: `npx vitest run`
Expected: ALL PASS (SKILL.md changes don't affect code tests)

- [ ] **Step 4: Commit**

```bash
git add skills/snapeval/SKILL.md plugin/skills/snapeval/SKILL.md
git commit -m "feat: rewrite SKILL.md with multi-phase interactive ideation flow"
```

---

### Task 5: Final verification and integration test

**Files:**
- None created — verification only

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: Clean compilation, no type errors

- [ ] **Step 3: Manual smoke test of ideate command**

Create a test analysis file and run the ideate command:

```bash
mkdir -p test-skills/greeter/evals
cat > test-skills/greeter/evals/analysis.json << 'EOF'
{
  "version": 1,
  "skill_name": "greeter",
  "behaviors": [
    { "name": "formal-greeting", "description": "Greets formally" },
    { "name": "casual-greeting", "description": "Default casual greeting" }
  ],
  "dimensions": [
    { "name": "style", "values": ["formal", "casual", "unknown"] },
    { "name": "name", "values": ["provided", "missing"] }
  ],
  "failure_modes": [
    { "description": "Unknown style requested", "severity": "medium" }
  ],
  "ambiguities": [
    { "description": "Case sensitivity", "why_it_matters": "Formal vs formal vs FORMAL", "in_scope": null }
  ],
  "scenarios": [
    {
      "id": 1,
      "prompt": "hey greet eleanor formally pls",
      "expected_behavior": "Formal greeting for Eleanor",
      "covers": ["style:formal", "name:provided"],
      "why": "Happy path",
      "enabled": true
    },
    {
      "id": 2,
      "prompt": "yo whats up",
      "expected_behavior": "Casual greeting with default name",
      "covers": ["style:casual", "name:missing"],
      "why": "Default behavior",
      "enabled": true
    }
  ]
}
EOF
npx tsx bin/snapeval.ts ideate test-skills/greeter
```

Expected: Browser opens with the ideation viewer showing the greeter analysis. Verify:
- Behaviors and dimensions render as cards
- Coverage matrix shows a 2x5 grid
- Scenarios are toggleable
- "Confirm & Run" downloads a JSON file
- Clean up: `rm test-skills/greeter/evals/analysis.json test-skills/greeter/evals/ideation.html`

- [ ] **Step 4: Final commit if any cleanup was needed**

```bash
git add -A
git commit -m "chore: integration verification and cleanup"
```
