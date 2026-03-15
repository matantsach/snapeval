import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  ReportAdapter,
  EvalResults,
  ViewerData,
  ViewerScenario,
} from '../../types.js';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildViewerData(results: EvalResults, iteration: number): ViewerData {
  const scenarios: ViewerScenario[] = results.scenarios.map((s) => {
    const scenario: ViewerScenario = {
      scenarioId: s.scenarioId,
      prompt: s.prompt,
      baselineOutput: s.baselineOutput.raw,
      currentOutput: s.newOutput.raw,
      verdict: s.comparison.verdict,
      tier: s.comparison.tier,
      details: s.comparison.details,
      timing: s.timing,
    };
    if (s.comparison.similarity !== undefined) {
      scenario.similarity = s.comparison.similarity;
    }
    if (s.comparison.judgeReasoning !== undefined) {
      scenario.judgeReasoning = s.comparison.judgeReasoning;
    }
    return scenario;
  });

  return {
    skillName: results.skillName,
    generatedAt: new Date().toISOString(),
    iteration,
    scenarios,
    summary: results.summary,
  };
}

function loadPreviousIteration(
  outputDir: string,
  iteration: number
): ViewerData['previousIteration'] | undefined {
  if (iteration <= 1) return undefined;
  const parentDir = path.dirname(outputDir);
  const prevPath = path.join(parentDir, `iteration-${iteration - 1}`, 'viewer-data.json');
  try {
    const raw = fs.readFileSync(prevPath, 'utf-8');
    const data = JSON.parse(raw) as ViewerData;
    return { summary: data.summary, scenarios: data.scenarios };
  } catch {
    return undefined;
  }
}

function buildHtml(viewerData: ViewerData): string {
  const dataJson = JSON.stringify(viewerData);
  const safeJson = dataJson.replace(/<\/script>/gi, '<\\/script>');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>snapeval — ${escapeHtml(viewerData.skillName)} iteration ${viewerData.iteration}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #faf9f6;
      --surface: #ffffff;
      --border: #e5e7eb;
      --text: #111827;
      --muted: #6b7280;
      --accent: #2563eb;
      --pass: #16a34a;
      --fail: #dc2626;
      --warn: #ca8a04;
      --pass-bg: #f0fdf4;
      --fail-bg: #fef2f2;
      --warn-bg: #fffbeb;
      --radius: 8px;
      --shadow: 0 1px 3px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.04);
    }
    body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 14px; line-height: 1.5; }
    h1 { font-size: 1.25rem; font-weight: 700; }
    h2 { font-size: 1rem; font-weight: 600; }
    h3 { font-size: .875rem; font-weight: 600; }

    /* Layout */
    .header { background: var(--surface); border-bottom: 1px solid var(--border); padding: 12px 20px; display: flex; align-items: center; gap: 16px; }
    .header-title { flex: 1; }
    .header-meta { color: var(--muted); font-size: .8rem; }
    .tabs { display: flex; gap: 4px; padding: 0 20px; background: var(--surface); border-bottom: 1px solid var(--border); }
    .tab-btn { padding: 10px 16px; border: none; background: none; cursor: pointer; font-size: .875rem; color: var(--muted); border-bottom: 2px solid transparent; margin-bottom: -1px; }
    .tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); font-weight: 600; }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    .main { padding: 20px; max-width: 1200px; margin: 0 auto; }

    /* Cards */
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; box-shadow: var(--shadow); }
    .card + .card { margin-top: 12px; }

    /* Verdict badges */
    .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: .75rem; font-weight: 600; }
    .badge-pass { background: var(--pass-bg); color: var(--pass); }
    .badge-regressed { background: var(--fail-bg); color: var(--fail); }
    .badge-inconclusive { background: var(--warn-bg); color: var(--warn); }
    .badge-error { background: var(--fail-bg); color: var(--fail); }

    /* Scenario navigation */
    .nav-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
    .nav-btn { padding: 6px 14px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); cursor: pointer; font-size: .875rem; }
    .nav-btn:disabled { opacity: .4; cursor: not-allowed; }
    .nav-counter { color: var(--muted); font-size: .875rem; }

    /* Side-by-side outputs */
    .outputs-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media (max-width: 700px) { .outputs-grid { grid-template-columns: 1fr; } }
    .output-box { background: #f8f8f7; border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; }
    .output-box pre { white-space: pre-wrap; word-break: break-word; font-size: .8rem; font-family: "SFMono-Regular", Consolas, monospace; }
    .output-label { font-size: .75rem; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin-bottom: 6px; }

    /* Analysis section */
    .analysis-row { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 12px; }
    .analysis-item { background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 8px 12px; font-size: .8rem; }
    .analysis-item strong { display: block; font-size: .7rem; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin-bottom: 2px; }

    /* Collapsible */
    details summary { cursor: pointer; font-size: .8rem; font-weight: 600; color: var(--muted); padding: 6px 0; user-select: none; }
    details summary:hover { color: var(--text); }
    details .details-body { padding: 8px 0; }

    /* Feedback */
    .feedback-area { width: 100%; min-height: 72px; border: 1px solid var(--border); border-radius: var(--radius); padding: 8px; font-size: .8rem; resize: vertical; font-family: inherit; margin-top: 8px; }
    .feedback-area:focus { outline: none; border-color: var(--accent); }
    .feedback-row { display: flex; gap: 8px; margin-top: 8px; align-items: center; }
    .btn { padding: 6px 14px; border-radius: var(--radius); border: 1px solid var(--border); background: var(--surface); cursor: pointer; font-size: .8rem; }
    .btn-primary { background: var(--accent); color: #fff; border-color: var(--accent); }
    .btn-primary:hover { background: #1d4ed8; }
    .feedback-saved { font-size: .75rem; color: var(--pass); opacity: 0; transition: opacity .3s; }
    .feedback-saved.show { opacity: 1; }

    /* Benchmark tab */
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 16px; }
    .stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; text-align: center; box-shadow: var(--shadow); }
    .stat-value { font-size: 1.75rem; font-weight: 700; line-height: 1.2; }
    .stat-label { font-size: .75rem; color: var(--muted); margin-top: 4px; text-transform: uppercase; letter-spacing: .04em; }
    .stat-delta { font-size: .75rem; margin-top: 4px; font-weight: 600; }
    .delta-pos { color: var(--pass); }
    .delta-neg { color: var(--fail); }

    /* Tier chart */
    .tier-chart { margin: 16px 0; }
    .tier-bar-row { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; font-size: .8rem; }
    .tier-bar-label { width: 140px; flex-shrink: 0; color: var(--muted); }
    .tier-bar-track { flex: 1; background: var(--border); border-radius: 9999px; height: 12px; overflow: hidden; }
    .tier-bar-fill { height: 100%; border-radius: 9999px; background: var(--accent); }
    .tier-bar-count { width: 30px; text-align: right; color: var(--muted); }

    /* Per-scenario table */
    .scenario-table { width: 100%; border-collapse: collapse; font-size: .8rem; margin-top: 16px; }
    .scenario-table th { text-align: left; padding: 8px 12px; border-bottom: 2px solid var(--border); font-size: .75rem; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
    .scenario-table td { padding: 8px 12px; border-bottom: 1px solid var(--border); vertical-align: top; }
    .scenario-table tr:hover td { background: var(--bg); }
    .prompt-cell { max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .table-link { color: var(--accent); cursor: pointer; text-decoration: underline; background: none; border: none; font: inherit; padding: 0; }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-title">
      <h1 id="page-title">snapeval</h1>
      <div class="header-meta" id="page-meta"></div>
    </div>
    <div id="header-badge"></div>
  </div>

  <div class="tabs">
    <button class="tab-btn active" data-tab="outputs">Outputs</button>
    <button class="tab-btn" data-tab="benchmark">Benchmark</button>
  </div>

  <!-- OUTPUTS TAB -->
  <div id="tab-outputs" class="tab-content active">
    <div class="main">
      <div class="nav-bar">
        <button class="nav-btn" id="btn-prev" disabled>&#8592; Prev</button>
        <span class="nav-counter" id="nav-counter"></span>
        <button class="nav-btn" id="btn-next">Next &#8594;</button>
        <button class="nav-btn" onclick="exportFeedback()">Export Feedback</button>
      </div>
      <div id="scenario-view"></div>
    </div>
  </div>

  <!-- BENCHMARK TAB -->
  <div id="tab-benchmark" class="tab-content">
    <div class="main">
      <div class="stats-grid" id="stats-grid"></div>
      <div class="card">
        <h2>Tier Breakdown</h2>
        <div class="tier-chart" id="tier-chart"></div>
      </div>
      <div class="card" style="margin-top:12px">
        <h2>Per-Scenario Results</h2>
        <table class="scenario-table" id="scenario-table"></table>
      </div>
    </div>
  </div>

  <script>
    const DATA = ${safeJson};

    // ── Utilities ──────────────────────────────────────────────────────────────
    function esc(s) {
      if (s == null) return '';
      return String(s)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
    }

    function pct(n) { return (n * 100).toFixed(1) + '%'; }
    function ms(n) { return n >= 1000 ? (n/1000).toFixed(2) + 's' : n + 'ms'; }

    function verdictBadge(v) {
      return '<span class="badge badge-' + esc(v) + '">' + esc(v) + '</span>';
    }

    function deltaHtml(current, previous, higherIsBetter = true) {
      if (previous == null) return '';
      const diff = current - previous;
      if (Math.abs(diff) < 0.0001) return '<span class="stat-delta" style="color:var(--muted)">= no change</span>';
      const positive = higherIsBetter ? diff > 0 : diff < 0;
      const cls = positive ? 'delta-pos' : 'delta-neg';
      const sign = diff > 0 ? '+' : '';
      return '<span class="stat-delta ' + cls + '">' + sign + (diff * 100).toFixed(1) + '% vs prev</span>';
    }

    // ── Header ─────────────────────────────────────────────────────────────────
    document.getElementById('page-title').textContent =
      'snapeval — ' + DATA.skillName + ' #' + DATA.iteration;
    document.getElementById('page-meta').textContent =
      'Generated ' + new Date(DATA.generatedAt).toLocaleString();

    const passRate = DATA.summary.pass_rate;
    const badgeEl = document.getElementById('header-badge');
    const badgeClass = passRate === 1 ? 'pass' : passRate < 0.5 ? 'regressed' : 'inconclusive';
    badgeEl.innerHTML = '<span class="badge badge-' + badgeClass + '">' + pct(passRate) + ' pass rate</span>';

    // ── Tabs ───────────────────────────────────────────────────────────────────
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      });
    });

    // ── Outputs Tab ────────────────────────────────────────────────────────────
    let currentIdx = 0;
    const scenarios = DATA.scenarios;
    const prevScenarios = DATA.previousIteration ? DATA.previousIteration.scenarios : [];

    function findPrevScenario(id) {
      return prevScenarios.find(s => s.scenarioId === id);
    }

    function getFeedbackKey(scenarioId) {
      return 'snapeval_feedback_' + DATA.skillName + '_iter' + DATA.iteration + '_s' + scenarioId;
    }

    function renderScenario(idx) {
      const s = scenarios[idx];
      const prev = findPrevScenario(s.scenarioId);

      // Nav
      document.getElementById('nav-counter').textContent =
        (idx + 1) + ' / ' + scenarios.length + ' — ' + s.prompt.slice(0, 60) + (s.prompt.length > 60 ? '…' : '');
      document.getElementById('btn-prev').disabled = idx === 0;
      document.getElementById('btn-next').disabled = idx === scenarios.length - 1;

      // Similarity / judge reasoning analysis
      let analysisHtml = '';
      if (s.similarity != null) {
        analysisHtml += '<div class="analysis-item"><strong>Similarity</strong>' + s.similarity.toFixed(4) + '</div>';
      }
      if (s.judgeReasoning) {
        let fwd = '', rev = '';
        try { fwd = JSON.parse(s.judgeReasoning.forward).verdict || s.judgeReasoning.forward; } catch { fwd = s.judgeReasoning.forward; }
        try { rev = JSON.parse(s.judgeReasoning.reverse).verdict || s.judgeReasoning.reverse; } catch { rev = s.judgeReasoning.reverse; }
        analysisHtml += '<div class="analysis-item"><strong>Judge (forward)</strong>' + esc(fwd) + '</div>';
        analysisHtml += '<div class="analysis-item"><strong>Judge (reverse)</strong>' + esc(rev) + '</div>';
      }

      // Previous iteration
      let prevHtml = '';
      if (prev) {
        prevHtml = '<details style="margin-top:12px"><summary>Previous iteration (iter ' +
          (DATA.iteration - 1) + ') — ' + esc(prev.verdict) + '</summary>' +
          '<div class="details-body">' +
          '<div class="outputs-grid">' +
          '<div class="output-box"><div class="output-label">Baseline</div><pre>' + esc(prev.baselineOutput) + '</pre></div>' +
          '<div class="output-box"><div class="output-label">Output</div><pre>' + esc(prev.currentOutput) + '</pre></div>' +
          '</div></div></details>';
      }

      // Feedback
      const savedFeedback = localStorage.getItem(getFeedbackKey(s.scenarioId)) || '';

      const html =
        '<div class="card">' +
          '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">' +
            '<h2>Scenario #' + s.scenarioId + '</h2>' +
            verdictBadge(s.verdict) +
            '<span class="badge" style="background:var(--bg);color:var(--muted)">Tier ' + s.tier + '</span>' +
          '</div>' +
          '<div style="margin-bottom:12px"><strong>Prompt:</strong> <span id="prompt-text">' + esc(s.prompt) + '</span></div>' +
          '<div class="outputs-grid">' +
            '<div class="output-box"><div class="output-label">Baseline</div><pre>' + esc(s.baselineOutput) + '</pre></div>' +
            '<div class="output-box"><div class="output-label">Current</div><pre>' + esc(s.currentOutput) + '</pre></div>' +
          '</div>' +
          '<div class="analysis-row">' +
            '<div class="analysis-item"><strong>Details</strong>' + esc(s.details) + '</div>' +
            '<div class="analysis-item"><strong>Duration</strong>' + ms(s.timing.duration_ms) + '</div>' +
            '<div class="analysis-item"><strong>Tokens</strong>' + s.timing.total_tokens + '</div>' +
            analysisHtml +
          '</div>' +
          prevHtml +
          '<div style="margin-top:16px">' +
            '<h3>Feedback</h3>' +
            '<textarea class="feedback-area" id="feedback-area" placeholder="Your notes on this scenario...">' + esc(savedFeedback) + '</textarea>' +
            '<div class="feedback-row">' +
              '<button class="btn btn-primary" onclick="saveFeedback(' + s.scenarioId + ')">Save</button>' +
              '<span class="feedback-saved" id="feedback-saved">Saved</span>' +
            '</div>' +
          '</div>' +
        '</div>';

      document.getElementById('scenario-view').innerHTML = html;
    }

    function saveFeedback(scenarioId) {
      const val = document.getElementById('feedback-area').value;
      localStorage.setItem(getFeedbackKey(scenarioId), val);
      const el = document.getElementById('feedback-saved');
      el.classList.add('show');
      setTimeout(() => el.classList.remove('show'), 1500);
    }

    function navigate(delta) {
      const next = currentIdx + delta;
      if (next < 0 || next >= scenarios.length) return;
      currentIdx = next;
      renderScenario(currentIdx);
    }

    document.getElementById('btn-prev').addEventListener('click', () => navigate(-1));
    document.getElementById('btn-next').addEventListener('click', () => navigate(1));

    document.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) return;
      if (e.key === 'ArrowLeft') navigate(-1);
      if (e.key === 'ArrowRight') navigate(1);
    });

    renderScenario(0);

    // ── Benchmark Tab ──────────────────────────────────────────────────────────
    const s = DATA.summary;
    const prevS = DATA.previousIteration ? DATA.previousIteration.summary : null;

    function statCard(label, value, deltaHtmlStr, colorClass) {
      return '<div class="stat-card">' +
        '<div class="stat-value' + (colorClass ? ' ' + colorClass : '') + '">' + value + '</div>' +
        '<div class="stat-label">' + label + '</div>' +
        (deltaHtmlStr || '') +
        '</div>';
    }

    const prevPassRate = prevS ? prevS.pass_rate : null;
    const passColor = s.pass_rate === 1 ? 'style="color:var(--pass)"' : s.pass_rate < 0.5 ? 'style="color:var(--fail)"' : 'style="color:var(--warn)"';

    document.getElementById('stats-grid').innerHTML =
      '<div class="stat-card"><div class="stat-value" ' + passColor + '>' + pct(s.pass_rate) + '</div><div class="stat-label">Pass Rate</div>' + deltaHtml(s.pass_rate, prevPassRate) + '</div>' +
      statCard('Passed', s.passed, null, null) +
      statCard('Regressed', s.regressed, null, null) +
      statCard('Total Scenarios', s.total_scenarios, null, null) +
      statCard('Total Tokens', s.total_tokens, null, null) +
      statCard('Duration', ms(s.total_duration_ms), null, null);

    // Tier breakdown chart
    const tb = s.tier_breakdown;
    const maxTier = Math.max(tb.tier1_schema, tb.tier2_embedding, tb.tier3_llm_judge, 1);
    function tierBar(label, count) {
      const pctW = (count / maxTier * 100).toFixed(1);
      return '<div class="tier-bar-row">' +
        '<div class="tier-bar-label">' + esc(label) + '</div>' +
        '<div class="tier-bar-track"><div class="tier-bar-fill" style="width:' + pctW + '%"></div></div>' +
        '<div class="tier-bar-count">' + count + '</div>' +
        '</div>';
    }

    document.getElementById('tier-chart').innerHTML =
      tierBar('tier1_schema', tb.tier1_schema) +
      tierBar('tier2_embedding', tb.tier2_embedding) +
      tierBar('tier3_llm_judge', tb.tier3_llm_judge);

    // Per-scenario table
    let tableHtml =
      '<thead><tr><th>#</th><th>Prompt</th><th>Verdict</th><th>Tier</th><th>Similarity</th><th>Duration</th><th></th></tr></thead><tbody>';
    scenarios.forEach((sc, idx) => {
      tableHtml +=
        '<tr>' +
        '<td>' + sc.scenarioId + '</td>' +
        '<td class="prompt-cell">' + esc(sc.prompt) + '</td>' +
        '<td>' + verdictBadge(sc.verdict) + '</td>' +
        '<td>' + sc.tier + '</td>' +
        '<td>' + (sc.similarity != null ? sc.similarity.toFixed(4) : '—') + '</td>' +
        '<td>' + ms(sc.timing.duration_ms) + '</td>' +
        '<td><button class="table-link" onclick="jumpToScenario(' + idx + ')">View</button></td>' +
        '</tr>';
    });
    tableHtml += '</tbody>';
    document.getElementById('scenario-table').innerHTML = tableHtml;

    function jumpToScenario(idx) {
      currentIdx = idx;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.querySelector('[data-tab="outputs"]').classList.add('active');
      document.getElementById('tab-outputs').classList.add('active');
      renderScenario(currentIdx);
    }

    // ── Feedback Export ────────────────────────────────────────────────────────
    function exportFeedback() {
      const feedback = scenarios.map(sc => ({
        scenarioId: sc.scenarioId,
        prompt: sc.prompt,
        verdict: sc.verdict,
        feedback: localStorage.getItem(getFeedbackKey(sc.scenarioId)) || '',
      }));
      const blob = new Blob([JSON.stringify(feedback, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'feedback.json';
      a.click();
      URL.revokeObjectURL(url);
    }
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

    const viewerData = buildViewerData(results, this.iterationNumber);

    // Load previous iteration if available
    const prevIteration = loadPreviousIteration(this.outputDir, this.iterationNumber);
    if (prevIteration !== undefined) {
      viewerData.previousIteration = prevIteration;
    }

    // Write viewer-data.json
    fs.writeFileSync(
      path.join(this.outputDir, 'viewer-data.json'),
      JSON.stringify(viewerData, null, 2),
      'utf-8'
    );

    // Write report.html
    const html = buildHtml(viewerData);
    fs.writeFileSync(path.join(this.outputDir, 'report.html'), html, 'utf-8');
  }
}
