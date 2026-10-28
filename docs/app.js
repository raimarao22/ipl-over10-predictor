// Beat the Commentator — page logic. Reads docs/data/*.json (written by src/export_web.py).

// ---------------------------------------------------------------- helpers
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const colors = () => ({
  ink: css("--ink"), muted: css("--muted"), grid: css("--rule"), panel: css("--panel"),
  model: css("--model"), ratio: css("--ratio"), comm: css("--comm"), other: css("--other"), slate: css("--slate"),
});
const fmt = (x) => Math.round(x).toString();
const signed = (x) => (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(x).toFixed(1);
const $ = (id) => document.getElementById(id);

function chartDefaults() {
  if (!window.Chart) return;
  const C = colors();
  Chart.defaults.font.family = '"Barlow", system-ui, sans-serif';
  Chart.defaults.font.size = 13;
  Chart.defaults.color = C.muted;
  Chart.defaults.borderColor = C.grid;
  Chart.defaults.plugins.legend.labels.boxWidth = 28;
  Chart.defaults.plugins.legend.labels.boxHeight = 3;
  Chart.defaults.plugins.tooltip.backgroundColor = "#000";
  Chart.defaults.maintainAspectRatio = false;
}

function radioGroup(group, onPick) {
  const buttons = [...group.querySelectorAll("button")];
  buttons.forEach((b) => b.addEventListener("click", () => {
    buttons.forEach((x) => x.setAttribute("aria-checked", x === b ? "true" : "false"));
    onPick(b);
  }));
}

// charts are built when their tab is first opened, and rebuilt when the theme changes
const charts = {};          // id -> Chart instance
const builders = {};        // id -> function that builds it
function makeChart(id, build) {
  builders[id] = build;
  if (charts[id]) charts[id].destroy();
  charts[id] = build(colors());
  if (TABLE_CHARTS.has(id)) tableToggle(id);
}
// only the charts whose exact numbers matter get a table view
const TABLE_CHARTS = new Set(["chart-compare", "chart-seasons"]);

// "Show as table": the same numbers as the chart, for screen readers and exact values
function tableToggle(id) {
  const box = $(id).closest(".chart-box");
  let btn = box.nextElementSibling;
  if (!btn || !btn.classList.contains("tbl-btn")) {
    btn = document.createElement("button");
    btn.type = "button"; btn.className = "tbl-btn"; btn.setAttribute("aria-expanded", "false");
    btn.textContent = "Show as table";
    const wrap = document.createElement("div");
    wrap.className = "tbl-wrap"; wrap.hidden = true;
    box.after(btn); btn.after(wrap);
    btn.addEventListener("click", () => {
      const open = btn.getAttribute("aria-expanded") !== "true";
      btn.setAttribute("aria-expanded", String(open));
      btn.textContent = open ? "Hide table" : "Show as table";
      wrap.hidden = !open;
      if (open) fillTable(id, wrap);
    });
  } else if (btn.getAttribute("aria-expanded") === "true") {
    fillTable(id, btn.nextElementSibling);
  }
}
function fillTable(id, wrap) {
  const ch = charts[id];
  if (!ch) return;
  const ds = ch.data.datasets;
  const num = (v) => (typeof v === "number" ? (Number.isInteger(v) ? v : v.toFixed(1)) : v);
  let head, body;
  if (ch.data.labels && ch.data.labels.length) {
    head = ["", ...ds.map((x, i) => x.label || `Series ${i + 1}`)];
    body = ch.data.labels.map((l, i) => [l, ...ds.map((x) => num(typeof x.data[i] === "object" ? x.data[i].y : x.data[i]))]);
  } else {
    head = ["Series", "x", "y"];
    body = ds.flatMap((x) => x.data.map((p) => [x.label, num(p.x), num(p.y)]));
  }
  wrap.innerHTML = `<table><thead><tr>${head.map((h) => `<th scope="col">${h}</th>`).join("")}</tr></thead>` +
    `<tbody>${body.map((r) => `<tr>${r.map((c, i) => (i === 0 ? `<th scope="row">${c}</th>` : `<td class="num">${c}</td>`)).join("")}</tr>`).join("")}</tbody></table>`;
}
function rebuildCharts() {
  chartDefaults();
  Object.keys(charts).forEach((id) => { charts[id].destroy(); charts[id] = builders[id](colors()); });
}

// ---------------------------------------------------------------- theme toggle
const themeBtn = $("theme-btn");
function setThemeLabel() {
  const dark = document.documentElement.dataset.theme === "dark";
  themeBtn.textContent = dark ? "Light" : "Dark";
  themeBtn.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
}
themeBtn.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem("theme", next); } catch (e) {}
  setThemeLabel();
  rebuildCharts();
});
setThemeLabel();

// ---------------------------------------------------------------- tabs
const TABS = [...document.querySelectorAll(".tab")].map((s) => s.id);
// "Part n of 10" above each reading tab's title
TABS.slice(1).forEach((t, i) => {
  const p = document.createElement("p");
  p.className = "ch-num";
  p.textContent = `Part ${i + 1} of ${TABS.length - 1}`;
  document.querySelector(`#${t} .chapter`).prepend(p);
});
const tabInit = {};         // id -> function run the first time the tab is shown
const tabDone = new Set();
let DATA = null;

function showTab() {
  let id = location.hash.slice(1);
  if (!TABS.includes(id)) id = "home";
  TABS.forEach((t) => { $(t).hidden = t !== id; });
  document.querySelectorAll(".tabs a").forEach((a) => {
    if (a.getAttribute("href") === "#" + id) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  const cur = document.querySelector(".tabs a[aria-current]");
  // bring the active tab into view by scrolling the strip itself; scrollIntoView would also move
  // the browser's keyboard starting point past the skip link
  const strip = document.querySelector(".tabs-inner");
  if (cur && strip) {
    const c = cur.getBoundingClientRect(), s = strip.getBoundingClientRect();
    if (c.left < s.left) strip.scrollLeft += c.left - s.left - 16;
    else if (c.right > s.right) strip.scrollLeft += c.right - s.right + 16;
  }
  setTimeout(() => window.stripFade && window.stripFade(), 50);
  const i = TABS.indexOf(id);
  const label = (t) => document.querySelector(`.tabs a[href="#${t}"]`).textContent;
  const prev = $("prev"), next = $("next");
  if (i > 0) { prev.href = "#" + TABS[i - 1]; prev.textContent = "Previous: " + label(TABS[i - 1]); prev.removeAttribute("aria-disabled"); }
  else prev.setAttribute("aria-disabled", "true");
  if (i < TABS.length - 1) { next.href = "#" + TABS[i + 1]; next.textContent = "Next: " + label(TABS[i + 1]); next.removeAttribute("aria-disabled"); }
  else next.setAttribute("aria-disabled", "true");
  if (DATA && tabInit[id] && !tabDone.has(id)) { tabDone.add(id); tabInit[id](DATA); }
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", showTab);
// skip link: move focus to the content without changing the tab in the URL
document.querySelector(".skip").addEventListener("click", (e) => { e.preventDefault(); $("main-content").focus(); });

// fade the right edge of the tab strip while more tabs are hidden
const strip = document.querySelector(".tabs-inner");
window.stripFade = stripFade;
function stripFade() { strip.classList.toggle("more", strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 24); }
strip.addEventListener("scroll", stripFade, { passive: true });
window.addEventListener("resize", stripFade);
stripFade();

// ---------------------------------------------------------------- load data
chartDefaults();
showTab();
Promise.all(["model", "summary", "explorer", "balls", "history"].map((n) =>
  fetch(`data/${n}.json`).then((r) => {
    if (!r.ok) throw new Error(`Could not load data/${n}.json`);
    return r.json();
  })
)).then(([model, summary, explorer, balls, history]) => {
  DATA = { model, summary, explorer, balls, history };
  calculator(model, history);
  homeCards(summary);
  if (!window.Chart) {
    document.querySelectorAll(".chart-box").forEach((b) => {
      b.textContent = "Charts need an internet connection to load the charting library.";
    });
  }
  showTab();
}).catch((err) => {
  $("sb-note").textContent = err.message + ". Open the site through GitHub Pages or a local web server.";
});

tabInit.home = (d) => { if (window.Chart) { scatterChart(d.explorer); game(d.explorer); } matchCards(d.explorer); };
tabInit.data = (d) => { funnel(d.summary.funnel); if (window.Chart) { seasonsChart(d.summary.seasons); eraCompare(d.summary.eras); } };
tabInit.methods = (d) => { if (window.Chart) { fitLine(d.summary.fitline, d.summary.validation.MAE); wicketsChart(d.summary.wickets); residualChart(d.explorer); } };
tabInit.preprocessing = (d) => { ballsView(d.balls, d.explorer); leakageDemo(d.summary.leakage, d.summary.validation.MAE); };
tabInit.evaluation = (d) => walkForward(d);
tabInit.results = (d) => {
  within(d.explorer);
  ablation(d.summary);
  const b = Object.fromEntries(d.summary.baselines.map((x) => [x.config, x.MAE]));
  $("st-model").textContent = d.summary.validation.MAE.toFixed(1);
  $("st-x2").textContent = b["commentator: runs_10 x 2"].toFixed(1);
  $("st-ratio").textContent = b["learned ratio: runs_10 x k"].toFixed(1); if (window.Chart) { compare(d.summary); calibChart(d.summary.calibration); } finalTest(d.summary); foldTable(d.summary.folds); };
tabInit.errors = (d) => { if (window.Chart) explorerView(d.explorer); };

// ---------------------------------------------------------------- home: calculator
function calculator(m, hist) {
  const st = { runs: 84, wkts: 2, era: 1 };
  const cf = m.coefficients;
  $("k-label").textContent = m.ratio_k.toFixed(2);
  $("formula").textContent =
    `runs still to come = ${m.intercept.toFixed(1)} + ${cf.runs_10.toFixed(2)} × runs at over 10 ` +
    `− ${Math.abs(cf.wkts_10).toFixed(1)} × wickets + ${cf.impact_era.toFixed(1)} × Impact era`;

  const LO = 60, HI = 320;
  const pos = (v) => `${(Math.min(Math.max(v, LO), HI) - LO) / (HI - LO) * 100}%`;
  for (let v = LO + 20; v < HI; v += 40) {
    const s = document.createElement("span");
    s.style.left = pos(v); s.textContent = v; $("nl-axis").appendChild(s);
  }

  let shown = null;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function animateTo(el, target) {
    if (reduce || shown === null) { el.textContent = fmt(target); shown = target; return; }
    const from = shown, t0 = performance.now(), dur = 300;
    shown = target;
    el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");
    (function step(t) {
      const k = Math.min(1, (t - t0) / dur);
      el.textContent = fmt(from + (target - from) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }

  function update() {
    const pred = st.runs + m.intercept + cf.runs_10 * st.runs + cf.wkts_10 * st.wkts + cf.impact_era * st.era;
    const lo = pred + m.interval_q05, hi = pred + m.interval_q95;
    const x2 = st.runs * 2, ratio = st.runs * m.ratio_k;
    $("sb-runs").textContent = st.runs;
    $("sb-wkts").textContent = st.wkts;
    $("out-x2").textContent = fmt(x2);
    $("out-ratio").textContent = fmt(ratio);
    animateTo($("out-model"), pred);
    $("in-runs").value = st.runs;
    $("in-runs-n").value = st.runs;
    $("out-range").textContent = `${fmt(lo)}–${fmt(hi)}`;
    $("nl-x2").style.left = pos(x2);
    $("nl-ratio").style.left = pos(ratio);
    $("nl-model").style.left = pos(pred);
    $("nl-band").style.left = pos(lo);
    $("nl-band").style.width = `calc(${pos(hi)} - ${pos(lo)})`;
    similar(lo, hi);
    const parts = [
      ["Runs so far", st.runs],
      ["Base runs still to come", m.intercept],
      [`Scoring-rate adjustment (${cf.runs_10.toFixed(2)} \u00d7 ${st.runs})`, cf.runs_10 * st.runs],
      [`Wickets lost (${st.wkts} \u00d7 ${Math.abs(cf.wkts_10).toFixed(1)} runs each)`, cf.wkts_10 * st.wkts],
      [`Impact Player era (${st.era ? "2023 onward" : "before 2023"})`, cf.impact_era * st.era],
    ];
    $("why-rows").innerHTML = parts.map(([label, v], i) =>
      `<div class="why-row"><span>${label}</span><b>${i === 0 ? "" : v >= 0 ? "+ " : "\u2212 "}${Math.abs(v).toFixed(1)}</b></div>`).join("") +
      `<div class="why-row total"><span>Predicted total</span><b>${pred.toFixed(1)}</b></div>`;
    $("in-wkts").value = st.wkts;
    $("out-wkts").textContent = st.wkts;
    $("in-wkts").setAttribute("aria-valuetext", `${st.wkts} wicket${st.wkts === 1 ? "" : "s"}`);
    const gap = Math.round(pred - x2);
    $("sb-note").textContent =
      `Each wicket lost by over 10 lowers our projection by about ${Math.abs(cf.wkts_10).toFixed(0)} runs; ` +
      `the doubling rule ignores wickets. Here our model is ${Math.abs(gap)} runs ${gap >= 0 ? "above" : "below"} the commentator.`;
  }
  // innings like this one: real development innings from the same era within 10 runs and the same
  // wickets (a wicket counts as 8 runs of distance), up to 20; if fewer than 10 are that close, the
  // closest 10 are shown and the note says so. These are history, not model output.
  function similar(lo, hi) {
    const pool = hist.filter((h) => (h[0] >= 2023 ? 1 : 0) === st.era);
    const near = pool.map((h) => [Math.abs(h[1] - st.runs) + 8 * Math.abs(h[2] - st.wkts), h])
      .sort((a, b) => a[0] - b[0] || b[1][0] - a[1][0]);
    const close = pool.length && near.filter((x) => x[0] <= 10).length;
    const picked = (close >= 10 ? near.filter((x) => x[0] <= 10).slice(0, 20) : near.slice(0, 10));
    const sparse = close < 10;
    near.length = 0; picked.forEach((x) => near.push(x[1]));
    near.sort((a, b) => a[3] - b[3]);
    const stack = {};
    $("nl-dots").innerHTML = near.map((h) => {
      const b = Math.round(h[3] / 6), n = (stack[b] = (stack[b] || 0) + 1);
      return `<span class="nl-dot" style="left:${pos(h[3])};bottom:${(n - 1) * 8}px"></span>`;
    }).join("");
    const rs = near.map((h) => h[1]), ws = near.map((h) => h[2]), fs = near.map((h) => h[3]);
    const span = (a) => (Math.min(...a) === Math.max(...a) ? `${a[0]}` : `${Math.min(...a)}–${Math.max(...a)}`);
    const inside = fs.filter((f) => f >= lo && f <= hi).length;
    $("sim-note").innerHTML =
      `<strong>Innings like this one:</strong> ${near.length} real innings ${st.era ? "from 2023–2024" : "from 2008–2022"} ` +
      `that stood at ${span(rs)} runs for ${span(ws)} wickets after 10 overs finished anywhere from ` +
      `<b>${fs[0]}</b> to <b>${fs[fs.length - 1]}</b>. ${inside} of them finished inside our range (an illustration, not a test: the range is checked properly on the Results tab).` +
      (sparse ? ` Few past innings looked like this, so these are the closest ${near.length}, not exact matches.` : "") +
      (st.wkts >= 6 ? ` <strong>Rare situation:</strong> only ${hist.filter((h) => h[2] >= 6).length} of ${hist.length} innings since 2008 ` +
        `were 6 or more down at over 10 (never more than 7), so this prediction rests on very little data.` : "");
  }
  $("in-runs").addEventListener("input", (e) => { st.runs = +e.target.value; update(); });
  $("in-runs-n").addEventListener("change", (e) => {
    const v = Math.round(+e.target.value);
    st.runs = Number.isFinite(v) ? Math.min(160, Math.max(30, v)) : st.runs;
    update();
  });
  $("to-game").addEventListener("click", () => {
    $("game").scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
    $("g-guess").focus({ preventScroll: true });
  });
  $("to-predictor").addEventListener("click", () => {
    $("predictor").scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
    $("in-runs").focus({ preventScroll: true });
  });
  $("in-wkts").addEventListener("input", (e) => { st.wkts = +e.target.value; update(); });
  radioGroup(document.querySelector(".predictor .seg"), (b) => { st.era = +b.dataset.era; update(); });
  update();
}

function homeCards(s) {
  const base = Object.fromEntries(s.baselines.map((d) => [d.config, d.MAE]));
  $("card-innings").textContent = s.funnel.kept.toLocaleString();
  $("card-mae").textContent = s.validation.MAE.toFixed(1);
  $("card-x2").textContent = base["commentator: runs_10 x 2"].toFixed(1);
  if (s.final_test) {
    const o = s.final_test.overall;
    $("card-test").textContent = ` On the unseen 2025\u20132026 seasons, tested once: ${o.model.MAE.toFixed(1)} against ${o.commentator.MAE.toFixed(1)}.`;
  }
}

// ---------------------------------------------------------------- results: the one-time final test
function finalTest(s) {
  const t = s.final_test, box = $("final-test");
  if (!t) return;
  const o = t.overall, c = t.comparisons, cov = t.interval_coverage;
  const ci = (x) => `${Math.abs(x.ci_high).toFixed(1)} to ${Math.abs(x.ci_low).toFixed(1)}`;
  const rows = [["Our model", "model", "model"], ["Commentator (score \u00d7 2)", "commentator", "comm"],
                ["Learned ratio", "learned_ratio", "ratio"], ["Typical total", "median_total", "other"]];
  box.className = "final-done";
  box.innerHTML =
    `<h3>Final test on 2025\u20132026</h3>` +
    `<p class="ft-lead">Run once, on ${t.n} innings the model had never seen, with the frozen model and a test plan fixed in advance ` +
    `(<code>src/final_test.py</code>). The pre-set rule: claim the model beats doubling only if the 95% CI of the gain excludes zero. ` +
    `<strong>${t.primary_claim_supported ? "It does." : "It does not."}</strong></p>` +
    `<div class="table-wrap"><table><thead><tr><th scope="col">Method</th><th scope="col" class="num">Test MAE (runs)</th>` +
    `<th scope="col" class="num">Signed error</th><th scope="col" class="num">Within 15 runs</th></tr></thead><tbody>` +
    rows.map(([label, k, cls]) => `<tr class="${cls}"><td>${label}</td><td class="num">${o[k].MAE.toFixed(1)}</td>` +
      `<td class="num">${signed(o[k].signed)}</td><td class="num">${Math.round(o[k].within15 * 100)}%</td></tr>`).join("") +
    `</tbody></table></div>` +
    `<ul class="results-list">` +
    `<li>Against the <strong>commentator rule</strong>: ${Math.abs(c.model_vs_commentator.diff).toFixed(1)} runs lower error (95% CI ${ci(c.model_vs_commentator)}). ` +
      `Validation had 5.2, so the gain held on new seasons.</li>` +
    `<li>Against the <strong>learned ratio</strong>: ${Math.abs(c.model_vs_learned_ratio.diff).toFixed(1)} runs lower (${ci(c.model_vs_learned_ratio)}). ` +
      `The ratio over-predicted by about ${Math.round(o.learned_ratio.signed)} runs: teams scored faster early in these seasons, so multiplying the over-10 score overshot.</li>` +
    `<li>Our model's error, ${o.model.MAE.toFixed(1)} runs, matches its ${s.validation.MAE.toFixed(1)} on validation, and its average bias shrank to ` +
      `${signed(o.model.signed)} runs (validation 2023\u20132024: ${signed(s.validation.signed_2023_24)}).</li>` +
    `<li>The 90% range caught ${(cov.overall * 100).toFixed(1)}% of innings (${Object.entries(cov.per_season).map(([y, v]) => `${y}: ${(v * 100).toFixed(1)}%`).join(", ")}), ` +
      `close to the 87% on validation: still slightly too narrow.</li>` +
    `</ul>` +
    `<p class="caption">Per season, our model's MAE: ${Object.entries(t.per_season).map(([y, v]) => `${y} ${v.model.MAE.toFixed(1)} (${v.n} innings)`).join(", ")}. ` +
    `With only ${t.n} innings the test is less precise than validation, so the confidence intervals matter more than the exact figures. The model was not changed after this test.</p>`;
}

function scatterChart(rows) {
  makeChart("chart-scatter", (C) => new Chart($("chart-scatter"), {
    type: "scatter",
    data: { datasets: [
      { label: "Perfect prediction", data: [{ x: 90, y: 90 }, { x: 270, y: 270 }], type: "line", borderColor: C.muted,
        borderDash: [5, 5], borderWidth: 1.5, pointRadius: 0 },
      { label: "One innings", data: rows.map((r) => ({ x: r.model, y: r.actual, r })), backgroundColor: C.model + "99",
        borderColor: C.model, borderWidth: 1, pointRadius: 3.5, pointHoverRadius: 6 },
    ] },
    options: {
      animation: false,
      onHover: (e, els) => { e.native.target.style.cursor = els.some((x) => x.datasetIndex === 1) ? "pointer" : "default"; },
      onClick: (e, els) => {
        const hit = els.find((x) => x.datasetIndex === 1);
        if (!hit) return;
        openInnings(rows[hit.index].id);
      },
      plugins: {
        legend: { position: "bottom" },
        tooltip: { filter: (c) => c.datasetIndex === 1, callbacks: { footer: () => "Click to see this innings", label: (c) => {
          const r = c.raw.r;
          return `${r.date}: ${r.bat}, predicted ${Math.round(r.model)}, actual ${r.actual}`;
        } } },
      },
      scales: {
        x: { min: 90, max: 270, title: { display: true, text: "Our predicted total (runs)" } },
        y: { min: 90, max: 270, title: { display: true, text: "Actual total (runs)" } },
      },
    },
  }));
}

function matchCards(rows) {
  const err = (r, k) => Math.abs(r[k] - r.actual);
  const best = rows.reduce((a, b) => (err(b, "x2") - err(b, "model") > err(a, "x2") - err(a, "model") ? b : a));
  const worst = rows.reduce((a, b) => (err(b, "model") - err(b, "x2") > err(a, "model") - err(a, "x2") ? b : a));
  const sorted = [...rows].sort((a, b) => err(a, "model") - err(b, "model"));
  const typical = sorted[Math.floor(sorted.length / 2)];
  const date = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const card = (cls, title, r) => `<article class="mcard ${cls}"><h3>${title}</h3>` +
    `<p class="who">${r.bat} v ${r.bowl}, ${date(r.date)} (${r.r10}/${r.w10} at over 10)</p>` +
    `<dl><div><dt>Our model</dt><dd>${Math.round(r.model)}</dd></div><div><dt>Commentator</dt><dd>${r.x2}</dd></div>` +
    `<div><dt>Actual</dt><dd>${r.actual}</dd></div></dl></article>`;
  $("match-cards").innerHTML =
    card("good", "Our model's best call", best) +
    card("", "A typical innings", typical) +
    card("bad", "The commentator's best call", worst);
}

// ---------------------------------------------------------------- guess the total
function game(rows) {
  const ROUNDS = 5;
  let picks = [], round = 0, revealed = false, guess = null;
  const errs = { you: [], model: [], ratio: [], comm: [] };
  const mean = (a) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : "\u2013");

  function newGame() {
    const pool = [...rows];
    picks = [];
    while (picks.length < ROUNDS) picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    round = 0; errs.you = []; errs.model = []; errs.ratio = []; errs.comm = [];
    $("gs-note").textContent = "Runs off the actual total, averaged over the innings you have played.";
    showRound();
  }
  function showRound() {
    const r = picks[round];
    revealed = false; guess = null;
    $("g-round").textContent = `Innings ${round + 1} of ${ROUNDS}`;
    $("g-score").textContent = `${r.r10}/${r.w10}`;
    $("g-era").textContent = r.season >= 2023 ? "Impact Player era (2023 onward)" : "before the Impact Player rule";
    $("g-reveal").hidden = true; $("g-next").hidden = true;
    $("g-form").hidden = false; $("g-guess").value = "";
    draw();
    score();
  }
  function draw() {
    const r = picks[round];
    const upto = revealed ? r.worm.length : 10;
    const worm = [{ x: 0, y: 0 }, ...r.worm.slice(0, upto).map((y, i) => ({ x: i + 1, y }))];
    makeChart("chart-game", (C) => {
      const ds = [{ label: "Runs", data: worm, borderColor: C.ink, backgroundColor: C.ink, borderWidth: 2.5, pointRadius: 0 }];
      if (revealed) {
        const end = { x: 20 };
        ds.push({ label: "You", data: [{ x: 10, y: r.r10 }, { ...end, y: guess }], borderColor: C.muted, borderDash: [3, 3], borderWidth: 2, pointRadius: [0, 5], backgroundColor: C.muted });
        ds.push({ label: "Our model", data: [{ x: 10, y: r.r10 }, { ...end, y: r.model }], borderColor: C.model, borderWidth: 2, pointRadius: [0, 5], backgroundColor: C.model });
        ds.push({ label: "Learned ratio", data: [{ x: 10, y: r.r10 }, { ...end, y: r.ratio }], borderColor: C.ratio, borderDash: [2, 4], borderWidth: 2, pointRadius: [0, 5], backgroundColor: C.ratio });
        ds.push({ label: "Commentator", data: [{ x: 10, y: r.r10 }, { ...end, y: r.x2 }], borderColor: C.comm, borderDash: [8, 5], borderWidth: 2, pointRadius: [0, 5], backgroundColor: C.comm });
      }
      return new Chart($("chart-game"), {
        type: "line", data: { datasets: ds },
        options: {
          parsing: false, animation: false,
          plugins: { legend: { display: revealed, position: "bottom" }, tooltip: { enabled: revealed } },
          scales: {
            x: { type: "linear", min: 0, max: 20, ticks: { stepSize: 2 }, title: { display: true, text: "Over" },
                 grid: { color: (c) => (c.tick.value === 10 ? C.muted : C.grid) } },
            y: { beginAtZero: true, suggestedMax: revealed ? Math.max(r.actual, guess, r.model, r.x2) + 10 : 200, title: { display: true, text: "Runs" } },
          },
        },
      });
    });
  }
  function score() {
    $("gs-you").textContent = mean(errs.you);
    $("gs-model").textContent = mean(errs.model);
    $("gs-ratio").textContent = mean(errs.ratio);
    $("gs-comm").textContent = mean(errs.comm);
  }
  $("g-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = Math.round(+$("g-guess").value);
    if (!Number.isFinite(v) || v < 40 || v > 320) { $("g-guess").setCustomValidity("Enter a total between 40 and 320"); $("g-guess").reportValidity(); return; }
    $("g-guess").setCustomValidity("");
    const r = picks[round];
    guess = v; revealed = true;
    const e1 = Math.abs(v - r.actual), e2 = Math.abs(r.model - r.actual), e3 = Math.abs(r.x2 - r.actual), e4 = Math.abs(r.ratio - r.actual);
    errs.you.push(e1); errs.model.push(e2); errs.comm.push(e3); errs.ratio.push(e4);
    const best = Math.min(e1, e2, e3, e4);
    const winner = best === e1 ? "You were closest this time." : best === e2 ? "Our model was closest this time."
      : best === e4 ? "The learned ratio was closest this time." : "The commentator was closest this time.";
    $("g-reveal").innerHTML = `<p class="reveal-actual">Actual final total <b>${r.actual}</b></p>` +
      `<div class="reveal-rows"><div class="you"><span>You</span><b>${v}</b><em>${e1} off</em></div>` +
      `<div class="model"><span>Our model</span><b>${Math.round(r.model)}</b><em>${Math.round(e2)} off</em></div>` +
      `<div class="ratio"><span>Learned ratio</span><b>${Math.round(r.ratio)}</b><em>${Math.round(e4)} off</em></div>` +
      `<div class="comm"><span>Commentator</span><b>${r.x2}</b><em>${e3} off</em></div></div>` +
      `<p class="reveal-win">${winner} This was ${r.bat} v ${r.bowl}, ${r.season}.</p>`;
    $("g-form").hidden = true; $("g-reveal").hidden = false;
    $("g-next").hidden = false;
    $("g-next").textContent = round < ROUNDS - 1 ? "Next innings" : "See your result";
    draw(); score();
    $("g-next").focus();
  });
  $("g-next").addEventListener("click", () => {
    if ($("g-next").textContent === "Play again") { newGame(); return; }
    if (round < ROUNDS - 1) { round++; showRound(); return; }
    const you = +mean(errs.you), mod = +mean(errs.model);
    $("g-reveal").innerHTML = `<p class="game-summary">${you < mod ? "You beat the model." : you === mod ? "A dead heat with the model." : "The model beat you this time."}</p>` +
      `<p>You were ${mean(errs.you)} runs off on average, our model ${mean(errs.model)}, the learned ratio ${mean(errs.ratio)} and the commentator ${mean(errs.comm)}. ` +
      `Over all 396 validation innings, our model's walk-forward validation MAE is 16.8 runs and the commentator's 22.0.</p>`;
    $("g-next").textContent = "Play again";
    $("gs-note").textContent = "Final scores for this game of five innings.";
  });
  newGame();
}

// ---------------------------------------------------------------- accuracy slider
function within(rows) {
  const methods = [["model", "Our model", "model"], ["ratio", "Learned ratio", "ratio"], ["comm", "Commentator", "x2"]];
  const box = $("within-rows");
  box.innerHTML = methods.map(([cls, name]) =>
    `<div class="w-row"><span>${name}</span><div class="w-track"><div class="w-bar ${cls}" id="w-${cls}"></div></div><b id="w-${cls}-n"></b></div>`).join("");
  function update() {
    const x = +$("within-x").value;
    $("within-out").textContent = x;
    methods.forEach(([cls, , key]) => {
      const share = rows.filter((r) => Math.abs(r[key] - r.actual) <= x).length / rows.length;
      $(`w-${cls}`).style.width = `${share * 100}%`;
      $(`w-${cls}-n`).textContent = `${Math.round(share * 100)}%`;
    });
  }
  $("within-x").addEventListener("input", update);
  update();
}

// ---------------------------------------------------------------- residual plot (methods tab)
function residualChart(rows) {
  const pts = rows.map((r) => ({ x: r.model, y: r.actual - r.model, r }));
  // caption computed from the same innings, so it always matches the chart
  const mean = (a) => a.reduce((t, v) => t + v, 0) / a.length;
  const cut = [...rows].sort((a, b) => b.model - a.model).slice(0, Math.round(rows.length / 5));
  const hiRes = mean(cut.map((r) => r.actual - r.model)), hiNew = cut.filter((r) => r.season >= 2023).length / cut.length;
  const w5 = rows.filter((r) => r.w10 >= 5), w5Res = mean(w5.map((r) => r.actual - r.model));
  $("resid-caption").textContent =
    `Mostly flat, so a straight-line model is reasonable. Two mild patterns: the fifth of innings with the highest predictions ` +
    `finished about ${Math.round(hiRes)} runs above them on average (${Math.round(hiNew * 100)}% of these are from 2023\u20132024), and the ` +
    `${w5.length} innings with five or more wickets down finished about ${Math.round(-w5Res)} runs below the prediction. ` +
    `With so few of those, the second pattern is a hint, not a finding.`;
  const sorted = [...pts].sort((a, b) => a.x - b.x);
  const BINS = 8, size = Math.ceil(sorted.length / BINS), line = [];
  for (let i = 0; i < sorted.length; i += size) {
    const part = sorted.slice(i, i + size);
    line.push({ x: part.reduce((a, p) => a + p.x, 0) / part.length, y: part.reduce((a, p) => a + p.y, 0) / part.length });
  }
  makeChart("chart-resid", (C) => new Chart($("chart-resid"), {
    type: "scatter",
    data: { datasets: [
      { label: "Zero error", data: [{ x: 90, y: 0 }, { x: 270, y: 0 }], type: "line", borderColor: C.muted, borderDash: [5, 5], borderWidth: 1.5, pointRadius: 0 },
      { label: "One innings", data: pts, backgroundColor: C.model + "80", borderColor: C.model, borderWidth: 1, pointRadius: 3 },
      { label: "Average error by prediction band", data: line, type: "line", borderColor: C.ink, backgroundColor: C.ink, borderWidth: 2.5, pointRadius: 4 },
    ] },
    options: {
      animation: false,
      plugins: {
        legend: { position: "bottom" },
        tooltip: { callbacks: { label: (c) => c.datasetIndex === 1
          ? `${c.raw.r.bat}, ${c.raw.r.date}: predicted ${Math.round(c.raw.x)}, actual ${c.raw.r.actual} (${c.raw.y > 0 ? "+" : ""}${Math.round(c.raw.y)})`
          : `${c.dataset.label}: ${c.parsed.y.toFixed(1)}` } },
      },
      scales: {
        x: { min: 90, max: 270, title: { display: true, text: "Predicted total (runs)" } },
        y: { suggestedMin: -80, suggestedMax: 80, title: { display: true, text: "Actual minus predicted (runs)" } },
      },
    },
  }));
}

// ---------------------------------------------------------------- ball-by-ball innings to one row (preprocessing tab)
function ballsView(innings, explorer) {
  const sel = $("balls-sel");
  const date = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  sel.innerHTML = innings.map((x, i) => `<option value="${i}">${x.bat} v ${x.bowl}, ${date(x.date)}</option>`).join("");
  let active = null;
  function render() {
    const inn = innings[+sel.value];
    const sum = (a, b, k) => inn.overs.slice(a - 1, b).flat().reduce((t, ball) => t + ball[k], 0);
    const total = inn.overs.flat().reduce((t, b) => t + b[0], 0);
    $("balls-overs").innerHTML = inn.overs.map((o, i) =>
      `<div class="over${i >= 10 ? " hidden-over" : ""}" data-over="${i + 1}"><span class="ov-n">${i + 1}</span>` +
      o.map(([r, w, x]) => `<i class="b ${w ? "bw" : x ? "bx" : r === 0 ? "b0" : r >= 6 ? "b6" : r === 4 ? "b4" : "b1"}">${w ? "W" : r === 0 ? "\u2022" : r}</i>`).join("") +
      `<span class="ov-r">${o.reduce((t, b) => t + b[0], 0)}</span></div>`).join("") +
      `<p class="overs-note">Overs 11\u2013${inn.overs.length} are faded: the model never sees them. They make up the answer it has to predict.</p>`;
    const n = inn.overs.length;
    const fields = [
      ["runs_10", "Runs at over 10", sum(1, 10, 0), 1, 10, "Every run in overs 1\u201310, extras included. The model uses this."],
      ["wkts_10", "Wickets at over 10", sum(1, 10, 1), 1, 10, "Wickets that fell in overs 1\u201310 (retired hurt does not count). The model uses this."],
      ["runs_last5", "Runs, overs 6\u201310", sum(6, 10, 0), 6, 10, "Recent scoring rate. Tested, but it did not improve predictions, so the model leaves it out."],
      ["wkts_last5", "Wickets, overs 6\u201310", sum(6, 10, 1), 6, 10, "Recent wickets. Tested and left out."],
      ["runs_last2", "Runs, overs 9\u201310", sum(9, 10, 0), 9, 10, "Momentum right before the cut-off. Tested and left out."],
      ["wkts_last2", "Wickets, overs 9\u201310", sum(9, 10, 1), 9, 10, "Very recent wickets. Tested and left out."],
    ];
    const btn = (cls, a, b, label, v, hint) =>
      `<button type="button" class="field${cls}" data-a="${a}" data-b="${b}" data-hint="${hint}" aria-pressed="false"><span>${label}</span><b>${v}</b></button>`;
    $("balls-row").innerHTML = fields.map(([k, label, v, a, b, hint]) => btn("", a, b, label, v, hint)).join("");
    const ex = explorer.find((r) => r.id === inn.id);
    $("balls-target").innerHTML =
      btn(" target", 11, n, "Runs still to come", total - sum(1, 10, 0), `Every run from over 11 to the end of the innings. This is what the model is trained to predict.`) +
      btn(" target", 1, n, "Final total", total, `All ${n} overs: the runs at over 10 plus the runs still to come. Errors are reported on this.`) +
      (ex ? btn(" model", 1, 10, "Our model predicted", Math.round(ex.model),
        `Made from overs 1\u201310 only (runs, wickets and the era), by a model trained on earlier seasons. It missed by ${Math.abs(Math.round(ex.model) - total)} runs.`) : "");
    let hint = $("balls-hint");
    if (!hint) { hint = document.createElement("p"); hint.id = "balls-hint"; hint.className = "row-hint"; hint.setAttribute("aria-live", "polite"); $("balls-target").after(hint); }
    hint.textContent = "Click any value to light up the balls it comes from.";
    active = null;
    document.querySelectorAll("#balls-row .field, #balls-target .field").forEach((btn) => btn.addEventListener("click", () => {
      const same = active === btn;
      document.querySelectorAll(".row-card .field").forEach((f) => f.setAttribute("aria-pressed", "false"));
      document.querySelectorAll("#balls-overs .over").forEach((o) => o.classList.remove("lit"));
      active = same ? null : btn;
      $("balls-hint").textContent = same ? "Click any value to light up the balls it comes from." : btn.dataset.hint;
      if (!same) {
        btn.setAttribute("aria-pressed", "true");
        document.querySelectorAll("#balls-overs .over").forEach((o) => {
          const n = +o.dataset.over;
          if (n >= +btn.dataset.a && n <= +btn.dataset.b) o.classList.add("lit");
        });
      }
    }));
  }
  sel.addEventListener("change", render);
  render();
}

// ---------------------------------------------------------------- leakage demo (preprocessing tab)
function leakageDemo(L, chosenMAE) {
  function render(v) {
    const mae = v === "leaky" ? L.leaky_MAE : L.correct_MAE;
    $("leak-mae").textContent = mae.toFixed(2);
    $("leak-mae").closest(".leak-out").classList.toggle("bad", v === "leaky");
    $("leak-badge").textContent = v === "leaky" ? "Deliberately leaky (incorrect) method" : "Correct method";
    const gain = chosenMAE - mae;
    $("leak-text").textContent = v === "leaky"
      ? `It looks ${(L.correct_MAE - L.leaky_MAE).toFixed(2)} runs better, but only because each match's venue average now includes that match's own final total and later games. ` +
        `That is ${gain.toFixed(2)} runs better than our chosen model, which would have passed our 0.1-run rule. Venue would have been wrongly kept.`
      : `Computed honestly, adding the venue average helps by only ${gain.toFixed(2)} runs over our chosen model (${chosenMAE.toFixed(2)}). That is below our 0.1-run rule, so venue was dropped.`;
  }
  radioGroup($("leak-seg"), (b) => render(b.dataset.v));
  render("correct");
}

// gentle fade-in for the home bands
document.documentElement.classList.add("js-anim");
if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }), { rootMargin: "0px 0px -10% 0px" });
  document.querySelectorAll(".fade").forEach((el) => io.observe(el));
} else {
  document.querySelectorAll(".fade").forEach((el) => el.classList.add("in"));
}

// ---------------------------------------------------------------- data tab
function funnel(f) {
  const rows = [
    ["IPL matches in the archive", f.matches, false],
    ["No result (washed out)", f.excluded.no_result, true],
    ["First innings cut short by rain", f.excluded.rain_reduced_first_innings, true],
    ["All out before over 10", f.excluded.ended_before_over10, true],
    ["First innings we model", f.kept, false],
  ];
  const box = $("funnel");
  rows.forEach(([label, n, drop]) => {
    const row = document.createElement("div");
    row.className = "fun-row" + (drop ? " drop" : "");
    const w = drop ? 100 : n / f.matches * 100;
    row.innerHTML = `<div class="fun-bar" style="width:${w}%">${label}</div><span class="n">${drop ? "−" : ""}${n.toLocaleString()}</span>`;
    box.appendChild(row);
  });
  const note = document.createElement("p");
  note.className = "caption";
  note.textContent = `${f.kept_2008_2024.toLocaleString()} innings from 2008–2024 form the development set (the first 11, from early 2008, serve only as history for the averages); ${f.kept_2025_2026} from 2025–2026 are held back for the final test.`;
  box.after(note);
}

function seasonsChart(s) {
  makeChart("chart-seasons", (C) => new Chart($("chart-seasons"), {
    type: "line",
    data: {
      labels: s.map((d) => d.season),
      datasets: [
        { label: "Average final total", data: s.map((d) => d.avg_final), borderColor: C.ink, backgroundColor: C.ink, borderWidth: 2, pointRadius: 4 },
        { label: "Average score at over 10", data: s.map((d) => d.avg_runs_10), borderColor: C.slate, backgroundColor: C.slate, borderWidth: 2, borderDash: [6, 4], pointRadius: 4 },
      ],
    },
    options: {
      interaction: { mode: "index", intersect: false },
      scales: { y: { title: { display: true, text: "Runs" }, suggestedMin: 50 }, x: { grid: { display: false } } },
      plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y.toFixed(1)}` } } },
    },
  }));
}

// ---------------------------------------------------------------- methods tab
function wicketsChart(w) {
  makeChart("chart-wickets", (C) => new Chart($("chart-wickets"), {
    type: "bar",
    data: {
      labels: w.map((d) => d.wickets),
      datasets: [{ label: "Average runs in overs 11–20", data: w.map((d) => d.avg_to_come),
                   backgroundColor: C.ink, borderRadius: 4, maxBarThickness: 48 }],
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => `${c.parsed.y.toFixed(1)} runs (${w[c.dataIndex].innings} innings)` } },
      },
      scales: {
        x: { title: { display: true, text: "Wickets lost at over 10" }, grid: { display: false } },
        y: { beginAtZero: true, title: { display: true, text: "Runs in overs 11–20" } },
      },
    },
  }));
}

// ---------------------------------------------------------------- methods: fit the line yourself
function fitLine(f, modelMAE) {
  const st = { s: 2, a: 0 };
  const L = Object.fromEntries(f.lines.map((l) => [l.name, l]));
  const pts = f.points;
  const mae = (s, a) => pts.reduce((t, [x, y]) => t + Math.abs(y - (a + s * x)), 0) / pts.length;
  const seg = (s, a) => [{ x: 25, y: a + s * 25 }, { x: 165, y: a + s * 165 }];
  const ghost = (l, color) => ({ data: seg(l.slope, l.intercept), showLine: true, borderColor: color, borderDash: [6, 5],
                                 borderWidth: 1.5, pointRadius: 0, label: "" });
  makeChart("chart-fit", (C) => new Chart($("chart-fit"), {
    type: "scatter",
    data: { datasets: [
      { label: "Innings", data: pts.map(([x, y]) => ({ x, y })), backgroundColor: C.other, pointRadius: 2.5, pointHoverRadius: 4 },
      { ...ghost(L.x2, C.comm), label: "Commentator ×2" },
      { ...ghost(L.ratio, C.ratio), label: "Learned ratio" },
      { label: "Your line", data: seg(st.s, st.a), showLine: true, borderColor: C.ink, borderWidth: 3, pointRadius: 0 },
    ] },
    options: {
      animation: false,
      plugins: { legend: { display: true, position: "bottom", labels: { filter: (i) => i.datasetIndex > 0 } },
                 tooltip: { filter: (i) => i.datasetIndex === 0,
                            callbacks: { label: (c) => `${c.parsed.x} at over 10 → finished ${c.parsed.y}` } } },
      scales: { x: { type: "linear", min: 25, max: 165, title: { display: true, text: "Runs at over 10" } },
                y: { min: 50, max: 280, title: { display: true, text: "Final total" } } },
    },
  }));
  const sIn = $("fit-s"), aIn = $("fit-a"), presets = [...document.querySelectorAll(".fit-presets button")];
  const base = mae(2, 0);
  function update() {
    $("fit-s-out").textContent = st.s.toFixed(2);
    $("fit-a-out").textContent = Math.round(st.a);
    const e = mae(st.s, st.a), d = base - e;
    $("fit-mae").textContent = e.toFixed(1);
    $("fit-vs").textContent = Math.abs(d) < 0.05 ? "the same as doubling" :
      `${Math.abs(d).toFixed(1)} runs ${d > 0 ? "better" : "worse"} than doubling`;
    presets.forEach((b) => { const l = L[b.dataset.line];
      b.setAttribute("aria-pressed", String(Math.abs(l.slope - st.s) < 0.006 && Math.abs(l.intercept - st.a) < 0.6)); });
    const ch = charts["chart-fit"];
    if (ch) { ch.data.datasets[3].data = seg(st.s, st.a); ch.update("none"); }
  }
  sIn.addEventListener("input", () => { st.s = +sIn.value; update(); });
  aIn.addEventListener("input", () => { st.a = +aIn.value; update(); });
  presets.forEach((b) => b.addEventListener("click", () => {
    const l = L[b.dataset.line];
    st.s = l.slope; st.a = l.intercept; sIn.value = st.s; aIn.value = st.a; update();
  }));
  // keep the user's line when the chart is rebuilt for a theme change
  const build = builders["chart-fit"];
  builders["chart-fit"] = (C) => { const ch = build(C); ch.data.datasets[3].data = seg(st.s, st.a); ch.update("none"); return ch; };
  update();
  $("fit-caption").textContent =
    `Lines fitted once on ${f.fitted_on.replace("-", "–")} and scored on these ${pts.length} innings, so the numbers differ slightly from the walk-forward results. ` +
    `Letting the line start above zero takes the error from ${mae(L.ratio.slope, L.ratio.intercept).toFixed(1)} to ${mae(L.free.slope, L.free.intercept).toFixed(1)} runs. ` +
    `That is most of our model's gain; adding wickets and the Impact era brings it to ${modelMAE.toFixed(1)}.`;
}

// ---------------------------------------------------------------- results tab
function compare(s) {
  const byName = Object.fromEntries([...s.baselines, ...s.ladder, ...s.trees, ...s.selected].map((d) => [d.config, d]));
  const bestTree = s.trees.reduce((a, b) => (a.MAE < b.MAE ? a : b));
  const rows = (C) => [
    ["Commentator (score × 2)", byName["commentator: runs_10 x 2"].MAE, C.comm],
    ["Learned ratio", byName["learned ratio: runs_10 x k"].MAE, C.ratio],
    ["Typical total", byName["median of earlier totals"].MAE, C.other],
    ["Ridge, score only", byName["runs only"].MAE, C.other],
    ["Gradient boosting", bestTree.MAE, C.other],
    ["Our model", s.validation.MAE, C.model],
  ];
  makeChart("chart-compare", (C) => {
    const r = rows(C);
    return new Chart($("chart-compare"), {
      type: "bar",
      data: { labels: r.map((x) => x[0]),
              datasets: [{ data: r.map((x) => x[1]), backgroundColor: r.map((x) => x[2]), borderRadius: 4, maxBarThickness: 26 }] },
      options: {
        indexAxis: "y",
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `Validation MAE ${c.parsed.x.toFixed(2)} runs` } } },
        scales: { x: { beginAtZero: true, title: { display: true, text: "Walk-forward validation MAE (runs), 2019–2024" } }, y: { grid: { display: false } } },
      },
    });
  });
  const cmp = s.comparisons;
  const line = (name, c) => {
    const li = document.createElement("li");
    if (c.ci_high < 0) {
      li.innerHTML = `Against the <strong>${name}</strong>: ${Math.abs(c.diff).toFixed(1)} runs lower error ` +
        `(95% CI ${Math.abs(c.ci_high).toFixed(1)} to ${Math.abs(c.ci_low).toFixed(1)}). The interval excludes zero, so the gap is very unlikely to be chance.`;
    } else {
      li.innerHTML = `Against <strong>${name}</strong>: ${Math.abs(c.diff).toFixed(1)} runs lower error, ` +
        `but the 95% CI for that gain (${(-c.ci_high).toFixed(1)} to ${(-c.ci_low).toFixed(1)} runs) includes zero, so it is not established.`;
    }
    $("compare-list").appendChild(li);
  };
  line("commentator rule", cmp["commentator x2"]);
  line("learned ratio", cmp["learned ratio"]);
  line("a ridge model using the score only", cmp["ridge on runs_10 only"]);
  // where the gain comes from (results/feature_gains.json; computed after the model was chosen)
  const g = s.gains, ci = (x) => `${Math.abs(x.ci_high).toFixed(1)} to ${Math.abs(x.ci_low).toFixed(1)}`;
  const extra = document.createElement("li");
  extra.innerHTML = `<strong>Where the gain comes from.</strong> A ridge model using only the score already beats the commentator by ` +
    `${Math.abs(g.score_only_vs_commentator.diff).toFixed(1)} runs (95% CI ${ci(g.score_only_vs_commentator)}) and the learned ratio by ` +
    `${Math.abs(g.score_only_vs_learned_ratio.diff).toFixed(1)} (${ci(g.score_only_vs_learned_ratio)}). Of the two features we kept, only the era indicator ` +
    `has an established gain: ${Math.abs(g.add_era_to_score_and_wickets.diff).toFixed(2)} runs (${Math.abs(g.add_era_to_score_and_wickets.ci_high).toFixed(2)} to ` +
    `${Math.abs(g.add_era_to_score_and_wickets.ci_low).toFixed(2)}), ${Math.abs(g.add_era_to_score_and_wickets_2023_24.diff).toFixed(2)} in 2023&ndash;2024 alone. ` +
    `Adding wickets to the score lowered the error by only ${Math.abs(g.add_wickets_to_score.diff).toFixed(2)} runs, and its 95% CI ` +
    `(${g.add_wickets_to_score.ci_low.toFixed(2)} to +${g.add_wickets_to_score.ci_high.toFixed(2)}) includes zero: not established. ` +
    `Wickets were retained because removing them from the selected model increased walk-forward MAE by ` +
    `${Math.abs(g.add_wickets_to_score_and_era.diff).toFixed(2)} runs, exceeding our predefined 0.1-run simplification threshold; however, the confidence interval ` +
    `(${g.add_wickets_to_score_and_era.ci_low.toFixed(2)} to +${g.add_wickets_to_score_and_era.ci_high.toFixed(2)}) includes zero, so their independent benefit is not statistically established. ` +
    `These checks were run after the model was chosen; they explain the result and did not change it.`;
  $("compare-list").appendChild(extra);
  // interpret the accuracy against the baselines and the task
  const b = Object.fromEntries(s.baselines.map((d) => [d.config, d.MAE]));
  $("results-lead").innerHTML =
    `Our model's walk-forward validation MAE is <strong>${s.validation.MAE.toFixed(1)} runs</strong>: ` +
    `${(b["commentator: runs_10 x 2"] - s.validation.MAE).toFixed(1)} runs (about ${Math.round((1 - s.validation.MAE / b["commentator: runs_10 x 2"]) * 100)}%) ` +
    `lower than the commentator rule's ${b["commentator: runs_10 x 2"].toFixed(1)}, and ` +
    `${(b["learned ratio: runs_10 x k"] - s.validation.MAE).toFixed(1)} lower than the learned ratio's ${b["learned ratio: runs_10 x k"].toFixed(1)}. ` +
    `Ignoring the innings and guessing the typical total misses by ${b["median of earlier totals"].toFixed(1)}. ` +
    `For scale, the runs still to come after over 10 vary with a standard deviation of about ${Math.round(s.to_come_sd_2019_24)} runs, ` +
    `so even the best method lands within 15 runs only about half the time. MAE is the average number of runs between a prediction and the real final total.` +
    (s.final_test ? ` <strong>On the unseen 2025\u20132026 seasons, tested once, it scored ${s.final_test.overall.model.MAE.toFixed(1)}</strong> (see the end of this tab).` : "");
}

// is the 90% range honest? promised against actual coverage, 2020-2024
function calibChart(cal) {
  makeChart("chart-calib", (C) => new Chart($("chart-calib"), {
    type: "scatter",
    data: { datasets: [
      { label: "Perfectly honest", data: [{ x: 50, y: 50 }, { x: 95, y: 95 }], showLine: true, borderColor: C.muted,
        borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0 },
      { label: "Our range", data: cal.map((c) => ({ x: c.level, y: c.coverage * 100 })), showLine: true,
        borderColor: C.model, backgroundColor: C.model, borderWidth: 2.5, pointRadius: 4, pointHoverRadius: 6 },
    ] },
    options: {
      plugins: { legend: { display: true, position: "bottom" },
                 tooltip: { filter: (i) => i.datasetIndex === 1,
                            callbacks: { label: (c) => `Promised ${c.parsed.x}%, actually caught ${c.parsed.y.toFixed(1)}%` } } },
      scales: { x: { type: "linear", min: 45, max: 100, title: { display: true, text: "Promised: share of innings the range should catch (%)" } },
                y: { min: 40, max: 100, title: { display: true, text: "Actual, 2020–2024 (%)" } } },
    },
  }));
  const c90 = cal.find((c) => c.level === 90);
  $("calib-90").textContent = `${Math.round(c90.coverage * 100)}%`;
  const seasons = Object.entries(c90.seasons);
  $("calib-seasons").innerHTML = `<p class="cs-title">By season, 90% range</p>` + seasons.map(([y, v]) =>
    `<div class="cs-row"><span>${y}</span><div class="cs-bar"><i style="width:${v * 100}%"></i><em></em></div><b>${Math.round(v * 100)}%</b></div>`).join("");
  const gaps = cal.map((c) => c.level - c.coverage * 100);
  const worst = seasons.reduce((a, b) => (b[1] < a[1] ? b : a));
  $("calib-caption").textContent =
    `At every level the range caught fewer innings than promised, by ${Math.min(...gaps).toFixed(0)} to ${Math.max(...gaps).toFixed(0)} percentage points, so it is slightly too narrow. ` +
    `The worst season was ${worst[0]} (${Math.round(worst[1] * 100)}%). Based on ${c90.n} innings; 2019 has no range because no earlier season's errors existed yet. ` +
    `We report the range as built rather than widening it after seeing this check.`;
}

function foldTable(folds) {
  const t = $("fold-table");
  t.innerHTML = `<thead><tr><th scope="col">Season predicted</th><th scope="col" class="num">Innings</th>` +
    `<th scope="col" class="num">Validation MAE (runs)</th><th scope="col" class="num">Signed error (runs)</th></tr></thead>` +
    `<tbody>${folds.map((f) => `<tr><td>${f.fold}</td><td class="num">${f.n}</td><td class="num">${f.MAE.toFixed(1)}</td>` +
    `<td class="num">${signed(f.signed)}</td></tr>`).join("")}</tbody>`;
  const cap = document.createElement("p");
  cap.className = "caption";
  cap.textContent = "Negative signed error means the model predicted too low. The underprediction is largest in 2023 and 2024, when scoring jumped.";
  t.closest(".table-wrap").after(cap);
}

// ---------------------------------------------------------------- evaluation tab
function walkForward(d) {
  const box = $("wf");
  const years = Array.from({ length: 19 }, (_, i) => 2008 + i);
  const add = (cls, txt = "") => { const d = document.createElement("div"); d.className = cls; d.textContent = txt; box.appendChild(d); };
  add("lab", "");
  years.forEach((y) => add((y - 2008) % 4 === 0 ? "yr" : "yr minor", y));
  for (let f = 2019; f <= 2024; f++) {
    add("lab f" + f, `Predict ${f}`);
    years.forEach((y) => add("c f" + f + (y < f ? " train" : y === f ? " val" : "")));
  }
  add("lab", "Final");
  years.forEach((y) => add("c" + (y <= 2024 ? " train" : " test")));

  // stepper: highlight one season and show what happened in it
  const perSeason = Object.fromEntries(d.summary.seasons.map((x) => [x.season, x.innings]));
  const WARMUP = 11;   // first innings of 2008 used only as history
  let cur = 2019;
  function show() {
    box.querySelectorAll(".lab, .c").forEach((el) => el.classList.remove("on", "off"));
    for (let f = 2019; f <= 2024; f++) box.querySelectorAll(".f" + f).forEach((el) => el.classList.add(f === cur ? "on" : "off"));
    const rows = d.explorer.filter((r) => r.season === cur);
    const mae = (k) => (rows.reduce((a, r) => a + Math.abs(r[k] - r.actual), 0) / rows.length).toFixed(1);
    let trainN = -WARMUP;
    for (let y = 2008; y < cur; y++) trainN += perSeason[y] || 0;
    $("wf-label").textContent = `Predicting ${cur}`;
    $("wf-stats").innerHTML =
      `<div><b>${trainN.toLocaleString()}</b><span>training innings, 2008\u2013${cur - 1}</span></div>` +
      `<div><b>${rows.length}</b><span>innings predicted in ${cur}</span></div>` +
      `<div class="m"><b>${mae("model")}</b><span>our model, validation MAE</span></div>` +
      `<div class="r"><b>${mae("ratio")}</b><span>learned ratio</span></div>` +
      `<div class="c2"><b>${mae("x2")}</b><span>commentator</span></div>`;
    $("wf-prev").disabled = cur <= 2019;
    $("wf-next").disabled = cur >= 2024;
  }
  $("wf-prev").addEventListener("click", () => { cur = Math.max(2019, cur - 1); show(); });
  $("wf-next").addEventListener("click", () => { cur = Math.min(2024, cur + 1); show(); });
  show();
}

// ---------------------------------------------------------------- era comparison (data tab)
function eraCompare(eras) {
  let sel = "2008-2022";
  const other = () => (sel === "2008-2022" ? "2023-2024" : "2008-2022");
  function render() {
    const e = eras[sel];
    $("era-numbers").innerHTML =
      `<div><b>${e.avg_final.toFixed(1)}</b><span>average final total</span></div>` +
      `<div><b>${e.avg_runs_10.toFixed(1)}</b><span>average score at over 10</span></div>` +
      `<div><b>${e.avg_to_come.toFixed(1)}</b><span>average runs in overs 11\u201320</span></div>` +
      `<div><b>${e.innings}</b><span>innings</span></div>`;
    makeChart("chart-era", (C) => new Chart($("chart-era"), {
      type: "bar",
      data: {
        labels: e.wickets.map((w) => w.wickets),
        datasets: [
          { label: sel.replace("-", "\u2013"), data: e.wickets.map((w) => w.avg_to_come), backgroundColor: C.ink, borderRadius: 4, maxBarThickness: 32 },
          { label: other().replace("-", "\u2013"), data: eras[other()].wickets.map((w) => w.avg_to_come), backgroundColor: C.other + "66", borderRadius: 4, maxBarThickness: 32 },
        ],
      },
      options: {
        animation: false,
        plugins: { legend: { position: "bottom" }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y.toFixed(1)} runs` } } },
        scales: { x: { title: { display: true, text: "Wickets lost at over 10" }, grid: { display: false } },
                  y: { beginAtZero: true, title: { display: true, text: "Runs in overs 11\u201320" } } },
      },
    }));
  }
  radioGroup(document.querySelector(".era-compare .seg"), (b) => { sel = b.dataset.era; render(); });
  render();
}

// ---------------------------------------------------------------- ablation explorer (results tab)
function ablation(s) {
  const GROUPS = [
    ["wickets", "Wickets at over 10"], ["last5", "Runs and wickets in overs 6\u201310"],
    ["last2", "Runs and wickets in overs 9\u201310"], ["venue", "Venue average"],
    ["league", "League scoring level"], ["era", "Impact Player era"],
  ];
  const CHOSEN = ["wickets", "era"];
  const key = (gs) => GROUPS.map(([g]) => (gs.includes(g) ? 1 : 0)).join("");
  const table = Object.fromEntries(s.ablation.map((a) => [key(a.groups), a]));
  const chosen = table[key(CHOSEN)].MAE;
  const best = s.ablation.reduce((a, b) => (a.MAE < b.MAE ? a : b));
  const base = Object.fromEntries(s.baselines.map((x) => [x.config, x.MAE]));
  const box = $("abl-boxes");
  box.insertAdjacentHTML("beforeend", GROUPS.map(([g, label]) =>
    `<label class="abl-item"><input type="checkbox" value="${g}" ${CHOSEN.includes(g) ? "checked" : ""}> ${label}` +
    `<span class="abl-tag ${CHOSEN.includes(g) ? "kept" : "dropped"}">${CHOSEN.includes(g) ? "kept" : "dropped"}</span></label>`).join(""));
  function update() {
    const gs = [...box.querySelectorAll("input:checked")].map((i) => i.value);
    const a = table[key(gs)];
    $("abl-num").textContent = a.MAE.toFixed(2);
    $("abl-cmp").textContent = `Commentator rule ${base["commentator: runs_10 x 2"].toFixed(1)}, learned ratio ${base["learned ratio: runs_10 x k"].toFixed(1)}, our chosen model ${chosen.toFixed(2)}.`;
    const diff = a.MAE - chosen;
    let story;
    if (key(gs) === key(CHOSEN)) story = "This is our chosen model: the score, wickets and the Impact Player era.";
    else if (diff < 0) story = `${Math.abs(diff).toFixed(2)} runs better than our chosen model. Our rule kept a feature only if it improved the error by at least 0.1 runs, so we preferred the simpler model.` +
      (key(gs) === key(best.groups) ? " This is the best of all 64 combinations." : "");
    else story = `${diff.toFixed(2)} runs worse than our chosen model.`;
    if (!gs.includes("wickets")) story += " Leaving out wickets hurts most.";
    $("abl-story").textContent = story;
  }
  const names = Object.fromEntries(GROUPS);
  $("abl-table").innerHTML = `<table><thead><tr><th scope="col">Rank</th><th scope="col">Extra features (besides the score)</th>` +
    `<th scope="col" class="num">Validation MAE</th></tr></thead><tbody>` +
    [...s.ablation].sort((a, b) => a.MAE - b.MAE).map((a, i) => {
      const mine = key(a.groups) === key(CHOSEN);
      return `<tr${mine ? ' class="mine"' : ""}><td class="num">${i + 1}</td><td>${a.groups.length ? a.groups.map((g) => names[g]).join(", ") : "None (score only)"}` +
        `${mine ? " <strong>(our model)</strong>" : ""}</td><td class="num">${a.MAE.toFixed(2)}</td></tr>`;
    }).join("") + `</tbody></table>`;
  box.addEventListener("change", update);
  $("abl-reset").addEventListener("click", () => {
    box.querySelectorAll("input").forEach((i) => { i.checked = CHOSEN.includes(i.value); });
    update();
  });
  update();
}

// ---------------------------------------------------------------- errors tab: match explorer
let pendingMatch = null, explorerSelect = null;
function openInnings(id) {
  pendingMatch = id;
  if (explorerSelect) explorerSelect(id);
  location.hash = "errors";
}

function explorerView(rows) {
  const seasonSel = $("ex-season"), matchSel = $("ex-match");
  const seasons = [...new Set(rows.map((r) => r.season))].sort((a, b) => b - a);
  seasonSel.innerHTML = `<option value="all">All validation seasons</option>` + seasons.map((s) => `<option>${s}</option>`).join("");
  let filter = "all";
  const err = (r, k) => Math.abs(r[k] - r.actual);
  const tagsFor = (r) => {
    const t = [];
    const n = r.worm.length;
    const wk11to20 = r.wkts[n - 1] - r.wkts[9];
    const last5 = n >= 20 ? r.worm[19] - r.worm[14] : null;
    // definitions shown on the page under the explorer
    if (wk11to20 >= 5 && r.model - r.actual >= 30) t.push("Late collapse");
    if (last5 !== null && last5 >= 75 && r.actual - r.model >= 30) t.push("Late explosion");
    if (err(r, "model") >= 35 && err(r, "x2") >= 35 && err(r, "ratio") >= 35) t.push("Every method missed by 35+");
    return t;
  };
  const keep = {
    tag: (r) => tagsFor(r).length > 0,
    all: () => true,
    model: (r) => err(r, "model") < err(r, "x2"),
    comm: (r) => err(r, "x2") < err(r, "model"),
    miss: (r) => err(r, "model") >= 30,
  };
  const dateFmt = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  function list() {
    const s = seasonSel.value;
    const inSeason = (r) => s === "all" || r.season === +s;
    const shown = rows.filter((r) => inSeason(r) && keep[filter](r)).sort((a, b) => b.date.localeCompare(a.date));
    matchSel.innerHTML = shown.map((r) =>
      `<option value="${r.id}">${dateFmt(r.date)}, ${r.bat} v ${r.bowl} (${r.r10}/${r.w10} at 10, finished ${r.actual})${tagsFor(r).length ? " [" + tagsFor(r).join(", ") + "]" : ""}</option>`).join("");
    const total = rows.filter(inSeason).length;
    $("ex-count").textContent = `${shown.length} of ${total} innings shown. The model was closer than the commentator in ` +
      `${rows.filter((r) => inSeason(r) && keep.model(r)).length} of ${total}.`;
    if (shown.length) draw(shown[0]);
    else { if (charts["chart-worm"]) { charts["chart-worm"].destroy(); delete charts["chart-worm"]; } $("ex-table").innerHTML = ""; }
  }

  function draw(r) {
    const worm = [{ x: 0, y: 0 }, ...r.worm.map((y, i) => ({ x: i + 1, y }))];
    const from = { x: 10, y: r.r10 };
    makeChart("chart-worm", (C) => {
      const proj = (label, y, color, dash) => ({
        label, data: [from, { x: 20, y }], borderColor: color, backgroundColor: color, borderWidth: 2,
        borderDash: dash, pointRadius: [0, 5], pointHoverRadius: 7,
      });
      const ds = [
        { label: "Actual innings", data: worm, borderColor: C.ink, backgroundColor: C.ink, borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 4 },
        proj("Commentator", r.x2, C.comm, [8, 5]),
        proj("Learned ratio", r.ratio, C.ratio, [2, 4]),
        proj("Our model", r.model, C.model, []),
      ];
      if (r.lo != null) ds.push({ label: "Our 90% range", data: [{ x: 20.35, y: r.lo }, { x: 20.35, y: r.hi }],
        borderColor: C.model + "66", borderWidth: 8, pointRadius: 0 });
      ds.push({ label: "Actual final total", data: [{ x: worm[worm.length - 1].x, y: r.actual }], borderColor: C.ink,
        backgroundColor: C.panel, borderWidth: 3, pointRadius: 7, showLine: false });
      const ys = [r.actual, r.x2, r.ratio, r.model, r.hi ?? r.model];
      return new Chart($("chart-worm"), {
        type: "line", data: { datasets: ds },
        options: {
          parsing: false, animation: false,
          interaction: { mode: "nearest", intersect: false },
          plugins: {
            legend: { position: "bottom" },
            tooltip: { callbacks: { label: (c) => c.dataset.label === "Actual innings"
              ? `After over ${c.parsed.x}: ${c.parsed.y}` : `${c.dataset.label}: ${Math.round(c.parsed.y)}` } },
          },
          scales: {
            x: { type: "linear", min: 0, max: 21, ticks: { stepSize: 2 }, title: { display: true, text: "Over" },
                 grid: { color: (c) => (c.tick.value === 10 ? C.muted : C.grid), lineWidth: (c) => (c.tick.value === 10 ? 2 : 1) } },
            y: { beginAtZero: true, suggestedMax: Math.max(...ys) + 10, title: { display: true, text: "Runs" } },
          },
        },
      });
    });

    const tags = tagsFor(r);
    $("ex-tags").innerHTML = tags.length ? tags.map((t) => `<span class="tag">${t}</span>`).join(" ") : "";
    const rowHTML = (cls, name, p) =>
      `<tr><td><span class="swatch ${cls}"></span>${name}</td><td class="num">${fmt(p)}</td><td class="num">${signed(p - r.actual)}</td></tr>`;
    $("ex-table").innerHTML =
      `<thead><tr><th scope="col">Method</th><th scope="col" class="num">Predicted total</th><th scope="col" class="num">Error (runs)</th></tr></thead><tbody>` +
      rowHTML("comm", "Commentator (score × 2)", r.x2) +
      rowHTML("ratio", "Learned ratio", r.ratio) +
      rowHTML("model", `Our model${r.lo != null ? ` (90% range ${fmt(r.lo)}–${fmt(r.hi)})` : ""}`, r.model) +
      `<tr><td><span class="swatch actual"></span><strong>Actual final total</strong> at ${r.venue}</td><td class="num"><strong>${r.actual}</strong></td><td></td></tr></tbody>`;
  }

  seasonSel.addEventListener("change", list);
  matchSel.addEventListener("change", () => draw(rows.find((r) => r.id === matchSel.value)));
  const segBtns = [...document.querySelectorAll("#errors .seg button")];
  radioGroup(document.querySelector("#errors .seg"), (b) => { filter = b.dataset.f; list(); });
  list();
  explorerSelect = (id) => {
    seasonSel.value = "all"; filter = "all";
    segBtns.forEach((b) => b.setAttribute("aria-checked", b.dataset.f === "all" ? "true" : "false"));
    list();
    matchSel.value = id;
    draw(rows.find((r) => r.id === id));
    pendingMatch = null;
  };
  if (pendingMatch) explorerSelect(pendingMatch);
}
