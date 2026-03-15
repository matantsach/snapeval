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
  <title>snapeval — ${escapeHtml(viewerData.skillName)} #${viewerData.iteration}</title>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{
      --bg:#f7f8fa;--surface:#fff;--border:#e3e5ea;
      --text:#1a1d23;--muted:#6c7281;--accent:#2563eb;
      --pass:#16a34a;--fail:#dc2626;--warn:#b45309;
      --pass-bg:#ecfdf5;--fail-bg:#fef2f2;--warn-bg:#fffbeb;
      --r:10px;--shadow:0 1px 3px rgba(0,0,0,.06)
    }
    body{background:var(--bg);color:var(--text);font:14px/1.6 'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased}
    .header{background:var(--surface);border-bottom:1px solid var(--border);padding:14px 24px;display:flex;align-items:center;gap:16px}
    .header h1{font-size:1.1rem;font-weight:650;letter-spacing:-.01em;flex:1}
    .header-meta{color:var(--muted);font-size:.78rem}
    .tabs{display:flex;padding:0 24px;background:var(--surface);border-bottom:1px solid var(--border)}
    .tab-btn{padding:11px 18px;border:none;background:none;cursor:pointer;font-size:.82rem;color:var(--muted);border-bottom:2px solid transparent;margin-bottom:-1px;font-weight:500}
    .tab-btn:hover{color:var(--text)}
    .tab-btn.active{color:var(--accent);border-bottom-color:var(--accent);font-weight:600}
    .tab-content{display:none}.tab-content.active{display:block}
    .main{padding:24px;max-width:1100px;margin:0 auto}
    .card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:20px;box-shadow:var(--shadow)}
    .card+.card{margin-top:16px}
    .badge{display:inline-flex;align-items:center;padding:3px 10px;border-radius:9999px;font-size:.72rem;font-weight:600}
    .badge-pass{background:var(--pass-bg);color:var(--pass)}
    .badge-regressed{background:var(--fail-bg);color:var(--fail)}
    .badge-inconclusive{background:var(--warn-bg);color:var(--warn)}
    .badge-error{background:var(--fail-bg);color:var(--fail)}
    .outputs-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    @media(max-width:720px){.outputs-grid{grid-template-columns:1fr}}
    .output-box{background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:14px;overflow:auto;max-height:400px}
    .output-box pre{white-space:pre-wrap;word-break:break-word;font-size:.8rem;font-family:'SF Mono','Cascadia Code',Consolas,monospace;line-height:1.55}
    .output-label{font-size:.7rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:8px}
    .diff-add{background:#dcfce7;border-radius:2px;padding:0 2px}
    .diff-del{background:#fee2e2;border-radius:2px;padding:0 2px;text-decoration:line-through;opacity:.7}
    .analysis-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
    .chip{background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:6px 12px;font-size:.78rem}
    .chip strong{display:block;font-size:.66rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:1px;font-weight:600}
    details summary{cursor:pointer;font-size:.78rem;font-weight:600;color:var(--muted);padding:8px 0;user-select:none}
    details summary:hover{color:var(--text)}
    details .body{padding:8px 0}
    .stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px}
    .stat-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:18px;text-align:center;box-shadow:var(--shadow)}
    .stat-value{font-size:1.6rem;font-weight:700;line-height:1.2;letter-spacing:-.02em}
    .stat-label{font-size:.7rem;color:var(--muted);margin-top:4px;text-transform:uppercase;letter-spacing:.05em;font-weight:500}
    .stat-delta{font-size:.72rem;margin-top:4px;font-weight:600}
    .delta-pos{color:var(--pass)}.delta-neg{color:var(--fail)}
    .tier-bar-row{display:flex;align-items:center;gap:12px;margin-bottom:8px;font-size:.8rem}
    .tier-bar-label{width:100px;flex-shrink:0;color:var(--muted);font-size:.78rem}
    .tier-bar-track{flex:1;background:var(--bg);border-radius:9999px;height:10px;overflow:hidden;border:1px solid var(--border)}
    .tier-bar-fill{height:100%;border-radius:9999px}
    .tier-bar-count{width:28px;text-align:right;color:var(--muted);font-size:.78rem;font-weight:600}
    .tbl{width:100%;border-collapse:collapse;font-size:.8rem;margin-top:16px}
    .tbl th{text-align:left;padding:10px 14px;border-bottom:2px solid var(--border);font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);font-weight:600}
    .tbl td{padding:10px 14px;border-bottom:1px solid var(--border)}
    .tbl tr:hover td{background:var(--bg)}
    .prompt-cell{max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .tbl-link{color:var(--accent);text-decoration:none;font-weight:500}
    .tbl-link:hover{text-decoration:underline}
    .scenario-pass{border-left:3px solid var(--pass)}
    .scenario-regressed{border-left:3px solid var(--fail)}
    .scenario-inconclusive{border-left:3px solid var(--warn)}
    .scenario-error{border-left:3px solid var(--fail)}
  </style>
</head>
<body>
  <div class="header">
    <h1 id="title">snapeval</h1>
    <span class="header-meta" id="meta"></span>
    <span id="hbadge"></span>
  </div>
  <div class="tabs">
    <button class="tab-btn active" data-tab="outputs">Outputs</button>
    <button class="tab-btn" data-tab="benchmark">Benchmark</button>
  </div>
  <div id="tab-outputs" class="tab-content active">
    <div class="main">
      <div id="summary-line" style="color:var(--muted);font-size:.85rem;font-weight:500;margin-bottom:20px"></div>
      <div id="scenarios"></div>
    </div>
  </div>
  <div id="tab-benchmark" class="tab-content">
    <div class="main">
      <div class="stats-grid" id="stats"></div>
      <div class="card"><h2 style="margin-bottom:14px">Tier Breakdown</h2><div id="tiers"></div></div>
      <div class="card" style="margin-top:16px"><h2 style="margin-bottom:8px">Per-Scenario Results</h2><table class="tbl" id="tbl"></table></div>
    </div>
  </div>
<script>
var D=${safeJson};
function esc(s){if(s==null)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function pct(n){return(n*100).toFixed(1)+'%'}
function ms(n){return n>=1e3?(n/1e3).toFixed(2)+'s':n+'ms'}
function badge(v){return'<span class="badge badge-'+esc(v)+'">'+esc(v)+'</span>'}

// Simple word-level diff
function diffWords(a,b){
  var wa=a.split(/( +|\\n)/),wb=b.split(/( +|\\n)/);
  var m=wa.length,n=wb.length;
  // LCS via hunt-szymanski for short texts, fallback to simple for long
  if(m*n>50000){return{baseline:esc(a),current:esc(b)}}
  var dp=[];
  for(var i=0;i<=m;i++){dp[i]=[];for(var j=0;j<=n;j++)dp[i][j]=0}
  for(var i=1;i<=m;i++)for(var j=1;j<=n;j++)
    dp[i][j]=wa[i-1]===wb[j-1]?dp[i-1][j-1]+1:Math.max(dp[i-1][j],dp[i][j-1]);
  // Backtrack
  var bi=[],ci=[];
  var i=m,j=n;
  while(i>0&&j>0){
    if(wa[i-1]===wb[j-1]){bi.unshift({t:'eq',v:wa[i-1]});ci.unshift({t:'eq',v:wb[j-1]});i--;j--}
    else if(dp[i-1][j]>=dp[i][j-1]){bi.unshift({t:'del',v:wa[i-1]});i--}
    else{ci.unshift({t:'add',v:wb[j-1]});j--}
  }
  while(i>0){bi.unshift({t:'del',v:wa[i-1]});i--}
  while(j>0){ci.unshift({t:'add',v:wb[j-1]});j--}
  function render(arr,cls){return arr.map(function(x){return x.t===cls?'<span class="diff-'+cls+'">'+esc(x.v)+'</span>':esc(x.v)}).join('')}
  // Merge ci into baseline view and bi into current view
  var bhtml='',chtml='';
  // For baseline: show eq + del (highlight del)
  bhtml=bi.map(function(x){return x.t==='del'?'<span class="diff-del">'+esc(x.v)+'</span>':esc(x.v)}).join('');
  // For current: show eq + add (highlight add)
  chtml=ci.map(function(x){return x.t==='add'?'<span class="diff-add">'+esc(x.v)+'</span>':esc(x.v)}).join('');
  return{baseline:bhtml,current:chtml}
}

// Header
document.getElementById('title').textContent='snapeval — '+D.skillName;
document.getElementById('meta').textContent='Iteration '+D.iteration+' · '+new Date(D.generatedAt).toLocaleString();
var pr=D.summary.pass_rate;
var bc=pr===1?'pass':pr<.5?'regressed':'inconclusive';
document.getElementById('hbadge').innerHTML='<span class="badge badge-'+bc+'">'+pct(pr)+' pass</span>';

// Tabs
document.querySelectorAll('.tab-btn').forEach(function(b){
  b.addEventListener('click',function(){
    document.querySelectorAll('.tab-btn').forEach(function(x){x.classList.remove('active')});
    document.querySelectorAll('.tab-content').forEach(function(x){x.classList.remove('active')});
    b.classList.add('active');
    document.getElementById('tab-'+b.dataset.tab).classList.add('active');
  });
});

// All scenarios
var sc=D.scenarios,prev=D.previousIteration?D.previousIteration.scenarios:[];
var npass=sc.filter(function(s){return s.verdict==='pass'}).length;
document.getElementById('summary-line').textContent=sc.length+' scenario'+(sc.length===1?'':'s')+' · '+npass+' passed'+(sc.length-npass>0?' · '+(sc.length-npass)+' failed':'');

var html='';
sc.forEach(function(s){
  var d=s.baselineOutput===s.currentOutput?{baseline:esc(s.baselineOutput),current:esc(s.currentOutput)}:diffWords(s.baselineOutput,s.currentOutput);
  var chips='<div class="chip"><strong>Resolved by</strong>'+esc(s.details)+'</div>';
  if(s.judgeReasoning){
    var fwd,rev;
    try{fwd=JSON.parse(s.judgeReasoning.forward).verdict}catch(e){fwd=s.judgeReasoning.forward}
    try{rev=JSON.parse(s.judgeReasoning.reverse).verdict}catch(e){rev=s.judgeReasoning.reverse}
    chips+='<div class="chip"><strong>Judge</strong>'+esc(fwd)+' / '+esc(rev)+'</div>';
  }
  var same=s.baselineOutput===s.currentOutput;
  html+='<div class="card scenario-'+s.verdict+'" id="scenario-'+s.scenarioId+'">'
    +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">'
    +'<h2 style="font-size:.95rem;font-weight:620">#'+s.scenarioId+'</h2>'+badge(s.verdict)
    +'<span class="badge" style="background:var(--bg);color:var(--muted)">T'+s.tier+'</span>'
    +'<span style="flex:1"></span><span style="font-size:.75rem;color:var(--muted)">'+ms(s.timing.duration_ms)+'</span></div>'
    +'<div style="margin-bottom:14px;font-size:.82rem"><span style="color:var(--muted)">Prompt</span> · '+esc(s.prompt)+'</div>'
    +(same
      ?'<div class="output-box"><div class="output-label">Output (identical)</div><pre>'+d.baseline+'</pre></div>'
      :'<div class="outputs-grid">'
      +'<div class="output-box"><div class="output-label">Baseline</div><pre>'+d.baseline+'</pre></div>'
      +'<div class="output-box"><div class="output-label">Current</div><pre>'+d.current+'</pre></div></div>')
    +'<div class="analysis-row">'+chips+'</div></div>';
});
document.getElementById('scenarios').innerHTML=html;

// Benchmark
var sm=D.summary,ps=D.previousIteration?D.previousIteration.summary:null;
function delta(cur,prv){if(prv==null)return'';var d=cur-prv;if(Math.abs(d)<.0001)return'<div class="stat-delta" style="color:var(--muted)">—</div>';var c=d>0?'delta-pos':'delta-neg';return'<div class="stat-delta '+c+'">'+(d>0?'+':'')+pct(d)+'</div>'}
function scard(l,v,d,st){return'<div class="stat-card"><div class="stat-value"'+(st?' style="'+st+'"':'')+'">'+v+'</div><div class="stat-label">'+l+'</div>'+(d||'')+'</div>'}
var pc=sm.pass_rate===1?'color:var(--pass)':sm.pass_rate<.5?'color:var(--fail)':'color:var(--warn)';
document.getElementById('stats').innerHTML=
  scard('Pass Rate',pct(sm.pass_rate),delta(sm.pass_rate,ps?ps.pass_rate:null),pc)
  +scard('Passed',sm.passed)+scard('Regressed',sm.regressed,null,sm.regressed>0?'color:var(--fail)':null)
  +scard('Scenarios',sm.total_scenarios)+scard('Duration',ms(sm.total_duration_ms))
  +scard('Cost','$'+sm.total_cost_usd.toFixed(4));

var tb=sm.tier_breakdown,mx=Math.max(tb.tier1_schema,tb.tier2_llm_judge,1);
function tbar(l,c,col){var w=(c/mx*100).toFixed(1);return'<div class="tier-bar-row"><div class="tier-bar-label">'+esc(l)+'</div><div class="tier-bar-track"><div class="tier-bar-fill" style="width:'+w+'%;background:'+col+'"></div></div><div class="tier-bar-count">'+c+'</div></div>'}
document.getElementById('tiers').innerHTML=tbar('Schema',tb.tier1_schema,'#60a5fa')+tbar('LLM Judge',tb.tier2_llm_judge,'#a78bfa');

var t='<thead><tr><th>#</th><th>Prompt</th><th>Verdict</th><th>Tier</th><th>Time</th><th></th></tr></thead><tbody>';
sc.forEach(function(s){t+='<tr><td>'+s.scenarioId+'</td><td class="prompt-cell">'+esc(s.prompt)+'</td><td>'+badge(s.verdict)+'</td><td>T'+s.tier+'</td><td>'+ms(s.timing.duration_ms)+'</td><td><a class="tbl-link" href="#scenario-'+s.scenarioId+'" onclick="switchToOutputs()">view</a></td></tr>'});
t+='</tbody>';
document.getElementById('tbl').innerHTML=t;

function switchToOutputs(){
  document.querySelectorAll('.tab-btn').forEach(function(b){b.classList.remove('active')});
  document.querySelectorAll('.tab-content').forEach(function(c){c.classList.remove('active')});
  document.querySelector('[data-tab="outputs"]').classList.add('active');
  document.getElementById('tab-outputs').classList.add('active');
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
