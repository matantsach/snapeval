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
      --bg: #f8f9fa; --surface: #ffffff; --border: #e2e4e9;
      --text: #1a1d23; --muted: #6c7281; --accent: #2563eb;
      --pass: #16a34a; --fail: #dc2626; --warn: #b45309;
      --pass-bg: #ecfdf5; --fail-bg: #fef2f2; --warn-bg: #fffbeb;
      --radius: 10px;
      --shadow: 0 1px 2px rgba(0,0,0,.05), 0 1px 3px rgba(0,0,0,.07);
      --shadow-lg: 0 4px 12px rgba(0,0,0,.08);
    }
    body { background: var(--bg); color: var(--text); font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 1.6; -webkit-font-smoothing: antialiased; }
    h1 { font-size: 1.15rem; font-weight: 650; letter-spacing: -.01em; }
    h2 { font-size: .95rem; font-weight: 620; letter-spacing: -.005em; }

    /* Header */
    .header { background: var(--surface); border-bottom: 1px solid var(--border); padding: 14px 24px; display: flex; align-items: center; gap: 16px; }
    .header-title { flex: 1; }
    .header-meta { color: var(--muted); font-size: .78rem; margin-top: 2px; }

    /* Tabs */
    .tabs { display: flex; gap: 0; padding: 0 24px; background: var(--surface); border-bottom: 1px solid var(--border); }
    .tab-btn { padding: 11px 18px; border: none; background: none; cursor: pointer; font-size: .82rem; color: var(--muted); border-bottom: 2px solid transparent; margin-bottom: -1px; font-weight: 500; transition: color .15s; }
    .tab-btn:hover { color: var(--text); }
    .tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); font-weight: 600; }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    .main { padding: 24px; max-width: 1100px; margin: 0 auto; }

    /* Cards */
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; box-shadow: var(--shadow); }
    .card + .card { margin-top: 16px; }

    /* Badges */
    .badge { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 9999px; font-size: .72rem; font-weight: 600; letter-spacing: .01em; }
    .badge-pass { background: var(--pass-bg); color: var(--pass); }
    .badge-regressed { background: var(--fail-bg); color: var(--fail); }
    .badge-inconclusive { background: var(--warn-bg); color: var(--warn); }
    .badge-error { background: var(--fail-bg); color: var(--fail); }

    /* Side-by-side outputs */
    .outputs-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media (max-width: 720px) { .outputs-grid { grid-template-columns: 1fr; } }
    .output-box { background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 14px; overflow: hidden; }
    .output-box pre { white-space: pre-wrap; word-break: break-word; font-size: .8rem; font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace; line-height: 1.55; color: var(--text); }
    .output-label { font-size: .7rem; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin-bottom: 8px; }

    /* Analysis chips */
    .analysis-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
    .analysis-item { background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 6px 12px; font-size: .78rem; }
    .analysis-item strong { display: block; font-size: .66rem; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); margin-bottom: 1px; font-weight: 600; }

    /* Collapsible */
    details summary { cursor: pointer; font-size: .78rem; font-weight: 600; color: var(--muted); padding: 8px 0; user-select: none; transition: color .15s; }
    details summary:hover { color: var(--text); }
    details .details-body { padding: 8px 0; }

    /* Feedback */
    .feedback-area { width: 100%; min-height: 60px; border: 1px solid var(--border); border-radius: 8px; padding: 10px; font-size: .8rem; resize: vertical; font-family: inherit; transition: border-color .15s; }
    .feedback-area:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(37,99,235,.1); }
    .btn { padding: 7px 16px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); cursor: pointer; font-size: .8rem; font-weight: 500; transition: all .15s; }
    .btn:hover { background: var(--bg); }

    /* Stats */
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 20px; }
    .stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px; text-align: center; box-shadow: var(--shadow); }
    .stat-value { font-size: 1.6rem; font-weight: 700; line-height: 1.2; letter-spacing: -.02em; }
    .stat-label { font-size: .7rem; color: var(--muted); margin-top: 4px; text-transform: uppercase; letter-spacing: .05em; font-weight: 500; }
    .stat-delta { font-size: .72rem; margin-top: 4px; font-weight: 600; }
    .delta-pos { color: var(--pass); }
    .delta-neg { color: var(--fail); }

    /* Tier chart */
    .tier-bar-row { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; font-size: .8rem; }
    .tier-bar-label { width: 100px; flex-shrink: 0; color: var(--muted); font-size: .78rem; }
    .tier-bar-track { flex: 1; background: var(--bg); border-radius: 9999px; height: 10px; overflow: hidden; border: 1px solid var(--border); }
    .tier-bar-fill { height: 100%; border-radius: 9999px; transition: width .3s; }
    .tier-bar-count { width: 28px; text-align: right; color: var(--muted); font-size: .78rem; font-weight: 600; }

    /* Table */
    .scenario-table { width: 100%; border-collapse: collapse; font-size: .8rem; margin-top: 16px; }
    .scenario-table th { text-align: left; padding: 10px 14px; border-bottom: 2px solid var(--border); font-size: .7rem; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); font-weight: 600; }
    .scenario-table td { padding: 10px 14px; border-bottom: 1px solid var(--border); }
    .scenario-table tr:hover td { background: var(--bg); }
    .prompt-cell { max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .table-link { color: var(--accent); cursor: pointer; text-decoration: none; background: none; border: none; font: inherit; padding: 0; font-weight: 500; }
    .table-link:hover { text-decoration: underline; }

    /* Scenario card left border accent */
    .scenario-pass { border-left: 3px solid var(--pass); }
    .scenario-regressed { border-left: 3px solid var(--fail); }
    .scenario-inconclusive { border-left: 3px solid var(--warn); }
    .scenario-error { border-left: 3px solid var(--fail); }
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

  <!-- OUTPUTS TAB — All scenarios on one page -->
  <div id="tab-outputs" class="tab-content active">
    <div class="main">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <div id="outputs-heading" style="color:var(--muted);font-size:.85rem;font-weight:500"></div>
        <button class="btn" onclick="exportFeedback()">Export Feedback</button>
      </div>
      <div id="all-scenarios"></div>
    </div>
  </div>

  <!-- BENCHMARK TAB -->
  <div id="tab-benchmark" class="tab-content">
    <div class="main">
      <div class="stats-grid" id="stats-grid"></div>
      <div class="card">
        <h2 style="margin-bottom:14px">Tier Breakdown</h2>
        <div id="tier-chart"></div>
      </div>
      <div class="card" style="margin-top:16px">
        <h2 style="margin-bottom:8px">Per-Scenario Results</h2>
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
    function deltaHtml(current, previous, higherIsBetter) {
      if (previous == null) return '';
      var diff = current - previous;
      if (Math.abs(diff) < 0.0001) return '<span class="stat-delta" style="color:var(--muted)">no change</span>';
      var positive = higherIsBetter !== false ? diff > 0 : diff < 0;
      var cls = positive ? 'delta-pos' : 'delta-neg';
      var sign = diff > 0 ? '+' : '';
      return '<span class="stat-delta ' + cls + '">' + sign + (diff * 100).toFixed(1) + '%</span>';
    }

    // ── Header ─────────────────────────────────────────────────────────────────
    document.getElementById('page-title').textContent = 'snapeval — ' + DATA.skillName;
    document.getElementById('page-meta').textContent = 'Iteration ' + DATA.iteration + ' · ' + new Date(DATA.generatedAt).toLocaleString();
    var passRate = DATA.summary.pass_rate;
    var badgeClass = passRate === 1 ? 'pass' : passRate < 0.5 ? 'regressed' : 'inconclusive';
    document.getElementById('header-badge').innerHTML = '<span class="badge badge-' + badgeClass + '">' + pct(passRate) + ' pass</span>';

    // ── Tabs ───────────────────────────────────────────────────────────────────
    document.querySelectorAll('.tab-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
        document.querySelectorAll('.tab-content').forEach(function(c) { c.classList.remove('active'); });
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      });
    });

    // ── Outputs Tab — All scenarios ────────────────────────────────────────────
    var scenarios = DATA.scenarios;
    var prevScenarios = DATA.previousIteration ? DATA.previousIteration.scenarios : [];

    function findPrev(id) { return prevScenarios.find(function(s) { return s.scenarioId === id; }); }
    function fbKey(sid) { return 'snapeval_' + DATA.skillName + '_' + DATA.iteration + '_' + sid; }

    var passCount = scenarios.filter(function(s) { return s.verdict === 'pass'; }).length;
    var failCount = scenarios.length - passCount;
    document.getElementById('outputs-heading').textContent =
      scenarios.length + ' scenario' + (scenarios.length === 1 ? '' : 's') +
      ' · ' + passCount + ' passed' + (failCount > 0 ? ' · ' + failCount + ' regressed' : '');

    function renderAllScenarios() {
      var html = '';
      scenarios.forEach(function(s) {
        var prev = findPrev(s.scenarioId);
        var accentClass = 'scenario-' + s.verdict;

        // Analysis chips
        var chips = '<div class="analysis-item"><strong>Resolved by</strong>' + esc(s.details) + '</div>';
        if (s.similarity != null) {
          chips += '<div class="analysis-item"><strong>Similarity</strong>' + s.similarity.toFixed(4) + '</div>';
        }
        if (s.judgeReasoning) {
          var fwd, rev;
          try { fwd = JSON.parse(s.judgeReasoning.forward).verdict; } catch(e) { fwd = s.judgeReasoning.forward; }
          try { rev = JSON.parse(s.judgeReasoning.reverse).verdict; } catch(e) { rev = s.judgeReasoning.reverse; }
          chips += '<div class="analysis-item"><strong>Judge fwd / rev</strong>' + esc(fwd) + ' / ' + esc(rev) + '</div>';
        }

        // Previous iteration
        var prevHtml = '';
        if (prev) {
          prevHtml = '<details style="margin-top:12px"><summary>Previous iteration — ' + esc(prev.verdict) + '</summary>' +
            '<div class="details-body"><div class="outputs-grid">' +
            '<div class="output-box"><div class="output-label">Prev Baseline</div><pre>' + esc(prev.baselineOutput) + '</pre></div>' +
            '<div class="output-box"><div class="output-label">Prev Output</div><pre>' + esc(prev.currentOutput) + '</pre></div>' +
            '</div></div></details>';
        }

        var savedFb = localStorage.getItem(fbKey(s.scenarioId)) || '';

        html +=
          '<div class="card ' + accentClass + '" id="scenario-' + s.scenarioId + '">' +
            '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">' +
              '<h2>#' + s.scenarioId + '</h2>' +
              verdictBadge(s.verdict) +
              '<span class="badge" style="background:var(--bg);color:var(--muted)">T' + s.tier + '</span>' +
              '<span style="flex:1"></span>' +
              '<span style="font-size:.75rem;color:var(--muted)">' + ms(s.timing.duration_ms) + '</span>' +
            '</div>' +
            '<div style="margin-bottom:14px;font-size:.82rem;color:var(--muted)"><span style="color:var(--text);font-weight:500">Prompt</span> · ' + esc(s.prompt) + '</div>' +
            '<div class="outputs-grid">' +
              '<div class="output-box"><div class="output-label">Baseline</div><pre>' + esc(s.baselineOutput) + '</pre></div>' +
              '<div class="output-box"><div class="output-label">Current</div><pre>' + esc(s.currentOutput) + '</pre></div>' +
            '</div>' +
            '<div class="analysis-row">' + chips + '</div>' +
            prevHtml +
            '<details style="margin-top:14px"><summary>Feedback</summary><div class="details-body">' +
              '<textarea class="feedback-area" data-scenario="' + s.scenarioId + '" placeholder="Notes on this scenario…">' + esc(savedFb) + '</textarea>' +
            '</div></details>' +
          '</div>';
      });
      document.getElementById('all-scenarios').innerHTML = html;

      // Auto-save feedback
      document.querySelectorAll('.feedback-area').forEach(function(ta) {
        ta.addEventListener('input', function() {
          localStorage.setItem(fbKey(ta.dataset.scenario), ta.value);
        });
      });
    }

    renderAllScenarios();

    // ── Benchmark Tab ──────────────────────────────────────────────────────────
    var sm = DATA.summary;
    var prevSm = DATA.previousIteration ? DATA.previousIteration.summary : null;

    function statCard(label, value, delta, style) {
      return '<div class="stat-card">' +
        '<div class="stat-value"' + (style ? ' style="' + style + '"' : '') + '>' + value + '</div>' +
        '<div class="stat-label">' + label + '</div>' +
        (delta || '') + '</div>';
    }

    var prColor = sm.pass_rate === 1 ? 'color:var(--pass)' : sm.pass_rate < 0.5 ? 'color:var(--fail)' : 'color:var(--warn)';
    document.getElementById('stats-grid').innerHTML =
      statCard('Pass Rate', pct(sm.pass_rate), deltaHtml(sm.pass_rate, prevSm ? prevSm.pass_rate : null), prColor) +
      statCard('Passed', sm.passed) +
      statCard('Regressed', sm.regressed, null, sm.regressed > 0 ? 'color:var(--fail)' : null) +
      statCard('Scenarios', sm.total_scenarios) +
      statCard('Duration', ms(sm.total_duration_ms)) +
      statCard('Cost', '$' + sm.total_cost_usd.toFixed(4));

    // Tier chart
    var tb = sm.tier_breakdown;
    var maxT = Math.max(tb.tier1_schema, tb.tier2_embedding, tb.tier3_llm_judge, 1);
    function tierBar(label, count, color) {
      var w = (count / maxT * 100).toFixed(1);
      return '<div class="tier-bar-row">' +
        '<div class="tier-bar-label">' + esc(label) + '</div>' +
        '<div class="tier-bar-track"><div class="tier-bar-fill" style="width:' + w + '%;background:' + color + '"></div></div>' +
        '<div class="tier-bar-count">' + count + '</div></div>';
    }
    document.getElementById('tier-chart').innerHTML =
      tierBar('Schema', tb.tier1_schema, '#60a5fa') +
      tierBar('Embedding', tb.tier2_embedding, '#818cf8') +
      tierBar('LLM Judge', tb.tier3_llm_judge, '#a78bfa');

    // Per-scenario table
    var tbl = '<thead><tr><th>#</th><th>Prompt</th><th>Verdict</th><th>Tier</th><th>Time</th><th></th></tr></thead><tbody>';
    scenarios.forEach(function(sc) {
      tbl += '<tr>' +
        '<td>' + sc.scenarioId + '</td>' +
        '<td class="prompt-cell">' + esc(sc.prompt) + '</td>' +
        '<td>' + verdictBadge(sc.verdict) + '</td>' +
        '<td>T' + sc.tier + '</td>' +
        '<td>' + ms(sc.timing.duration_ms) + '</td>' +
        '<td><a class="table-link" href="#scenario-' + sc.scenarioId + '" onclick="switchToOutputs()">view</a></td></tr>';
    });
    tbl += '</tbody>';
    document.getElementById('scenario-table').innerHTML = tbl;

    function switchToOutputs() {
      document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
      document.querySelectorAll('.tab-content').forEach(function(c) { c.classList.remove('active'); });
      document.querySelector('[data-tab="outputs"]').classList.add('active');
      document.getElementById('tab-outputs').classList.add('active');
    }

    // ── Feedback Export ────────────────────────────────────────────────────────
    function exportFeedback() {
      var reviews = scenarios.map(function(sc) {
        return {
          scenario_id: sc.scenarioId,
          prompt: sc.prompt,
          verdict: sc.verdict,
          feedback: localStorage.getItem(fbKey(sc.scenarioId)) || ''
        };
      });
      var json = JSON.stringify({ skill_name: DATA.skillName, iteration: DATA.iteration, reviews: reviews }, null, 2);
      var blob = new Blob([json], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'feedback.json';
      a.click();
      URL.revokeObjectURL(a.href);
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
