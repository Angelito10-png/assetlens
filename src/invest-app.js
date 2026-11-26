/**
 * "How to invest" page: strategies explained, a monthly-investing calculator with a
 * growth chart, and a backtest of monthly investing on a real fund's prices.
 */
import { t, getLang } from "./i18n.js?v=__V__";
import "./i18n-markets.js?v=__V__";
import { $, el, store, initChrome, locale } from "./ui.js?v=__V__";
import { simulate, requiredMonthly, requiredRate, lumpSum, backtestDca } from "./dca.js?v=__V__";
import { weeklyBars } from "./markets-api.js?v=__V__";
import { ETFS, STOCKS } from "./universe.js?v=__V__";

const STRATS = ["dca", "lump", "va", "bh", "cs", "reb", "div"];
const PRESETS = [["cash", 2], ["bonds", 4], ["mix", 6], ["stocks", 8]];
const PLAN_KEY = "dca-plan";
const DEFAULTS = { mode: "grow", monthly: 200, years: 20, rate: 7, initial: 0, stepUp: 0, inflation: 2, target: 100000, cur: "", bt: { tk: "SPY", monthly: 200, years: 10 } };

let plan = loadPlan();
function loadPlan() {
  try { const v = JSON.parse(store.get(PLAN_KEY) || "null"); return v && typeof v === "object" ? { ...DEFAULTS, ...v, bt: { ...DEFAULTS.bt, ...(v.bt || {}) } } : { ...DEFAULTS }; } catch { return { ...DEFAULTS }; }
}
const savePlan = () => store.set(PLAN_KEY, JSON.stringify(plan));
const cur = () => plan.cur || (getLang() === "el" ? "EUR" : "USD");
const money = (v) => new Intl.NumberFormat(locale(), { style: "currency", currency: cur(), maximumFractionDigits: 0 }).format(Math.round(v));
const moneyShort = (v) => new Intl.NumberFormat(locale(), { style: "currency", currency: cur(), notation: "compact", maximumFractionDigits: 1 }).format(v);
const pctS = (v, d = 1) => (v >= 0 ? "+" : "") + v.toLocaleString(locale(), { maximumFractionDigits: d, minimumFractionDigits: d }) + "%";
const num = (v, d) => { const x = Number(String(v).replace(",", ".")); return isFinite(x) ? x : d; };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ---------------------------------------------------------------- guide */

function renderGuide() {
  $("strats").replaceChildren(...STRATS.map((k) => {
    const card = el("article", { class: "panel strat", id: "s-" + k },
      el("h3", {}, t("g_" + k)),
      el("p", {}, t("g_" + k + "What")),
      el("dl", {}, el("dt", {}, t("g_good")), el("dd", { class: "muted" }, t("g_" + k + "Good")), el("dt", {}, t("g_watch")), el("dd", { class: "muted" }, t("g_" + k + "Watch"))));
    if (k === "dca" || k === "lump") {
      const b = el("button", { type: "button", class: "linkbtn" }, t("g_try") + " ↓");
      b.addEventListener("click", () => { plan.mode = "grow"; savePlan(); renderCalc(); $("calc").scrollIntoView({ behavior: "smooth", block: "start" }); });
      card.append(b);
    }
    return card;
  }));
  $("choose").replaceChildren(...[1, 2, 3].map((n) => el("li", {}, t("g_choose" + n))));
}

/* ---------------------------------------------------------------- calculator */

function input(id, label, value, { step = 1, min = 0, max, suffix } = {}) {
  const i = el("input", { type: "number", id, value: String(value), step: String(step), min: String(min), max: max != null ? String(max) : null, inputmode: "decimal", class: "num-in" });
  return el("div", { class: "k-field" }, el("label", { class: "l", for: id }, label), suffix ? el("div", { class: "in-suffix" }, i, el("span", { class: "muted" }, suffix)) : i);
}

function seg(name, options, value, onPick) {
  const g = el("div", { class: "seg seg-auto", role: "radiogroup" });
  for (const [v, label] of options) {
    const r = el("input", { type: "radio", name, value: v, checked: v === value });
    r.addEventListener("change", () => onPick(v));
    g.append(el("label", {}, r, el("span", {}, label)));
  }
  return g;
}

function renderCalc() {
  const body = $("calcBody");
  const goal = plan.mode === "goal";
  const curSym = cur() === "EUR" ? "€" : "$";
  const fields = el("div", { class: "k-grid" },
    goal ? input("kTarget", t("k_target"), plan.target, { step: 1000, suffix: curSym }) : input("kMonthly", t("k_monthly"), plan.monthly, { step: 50, suffix: curSym }),
    input("kYears", t("k_years"), plan.years, { min: 1, max: 60 }),
    input("kRate", t("k_rate"), plan.rate, { step: 0.5, min: -20, max: 30, suffix: "%" }),
    input("kInitial", t("k_initial"), plan.initial, { step: 500, suffix: curSym }),
    goal ? input("kMonthly", t("k_monthly"), plan.monthly, { step: 50, suffix: curSym }) : input("kStep", t("k_stepUp"), plan.stepUp, { step: 1, min: 0, max: 20, suffix: "%" }),
    input("kInfl", t("k_inflation"), plan.inflation, { step: 0.5, min: 0, max: 15, suffix: "%" }));
  const presets = el("div", { class: "quick k-presets" }, el("span", { class: "muted" }, t("k_presets")),
    ...PRESETS.map(([k, r]) => { const b = el("button", { type: "button", "aria-pressed": String(plan.rate === r) }, t("k_p_" + k)); b.addEventListener("click", () => { plan.rate = r; savePlan(); renderCalc(); }); return b; }));
  const top = el("div", { class: "k-top" },
    seg("kMode", [["grow", t("k_modeGrow")], ["goal", t("k_modeGoal")]], plan.mode, (v) => { plan.mode = v; savePlan(); renderCalc(); }),
    seg("kCur", [["EUR", "€"], ["USD", "$"]], cur(), (v) => { plan.cur = v; savePlan(); renderCalc(); renderBacktest(); }));
  body.replaceChildren(top, fields, presets, el("div", { id: "calcOut", "aria-live": "polite" }));
  fields.addEventListener("input", () => { readCalc(); savePlan(); renderCalcOut(); presets.querySelectorAll("button").forEach((b, i) => b.setAttribute("aria-pressed", String(plan.rate === PRESETS[i][1]))); });
  renderCalcOut();
}

function readCalc() {
  const v = (id) => ($(id) ? $(id).value : undefined);
  plan.years = clamp(Math.round(num(v("kYears"), plan.years)), 1, 60);
  plan.rate = clamp(num(v("kRate"), plan.rate), -20, 30);
  plan.initial = Math.max(0, num(v("kInitial"), plan.initial));
  plan.inflation = clamp(num(v("kInfl"), plan.inflation), 0, 15);
  if ($("kMonthly")) plan.monthly = Math.max(0, num(v("kMonthly"), plan.monthly));
  if ($("kTarget")) plan.target = Math.max(0, num(v("kTarget"), plan.target));
  if ($("kStep")) plan.stepUp = clamp(num(v("kStep"), plan.stepUp), 0, 20);
}

const tile = (k, v, sub, cls) => el("div", { class: "metric" + (cls ? " " + cls : "") }, el("span", { class: "k" }, k), el("span", { class: "v" }, v), sub ? el("small", { class: "muted" }, sub) : null);

function renderCalcOut() {
  const out = $("calcOut");
  if (!out) return;
  const goal = plan.mode === "goal";
  const parts = [];
  let monthly = plan.monthly;
  if (goal) {
    const need = requiredMonthly({ target: plan.target, years: plan.years, rate: plan.rate, initial: plan.initial });
    const rr = requiredRate({ target: plan.target, years: plan.years, monthly: plan.monthly, initial: plan.initial });
    parts.push(el("div", { class: "k-answer" },
      need === 0 ? el("p", {}, t("k_reached")) : el("p", {}, t("k_needMonthly"), " ", el("b", { class: "num big" }, money(need ?? 0))),
      el("p", { class: "muted" }, rr === null ? t("k_needRateNone") : [t("k_needRate"), " ", el("b", { class: "num" }, pctS(rr)), "."])));
    monthly = need ?? 0;
  }
  const s = simulate({ monthly, years: plan.years, rate: plan.rate, initial: plan.initial, stepUp: goal ? 0 : plan.stepUp });
  const real = s.value / Math.pow(1 + plan.inflation / 100, plan.years);
  parts.push(el("div", { class: "metrics k-kpi" },
    tile(t("k_invested"), money(s.invested)),
    tile(t("k_final"), money(s.value), null, "hl"),
    tile(t("k_profit"), money(s.profit), pctS(s.profitPct, 0), s.profit >= 0 ? "up" : "down"),
    tile(t("k_real"), money(real), t("k_realNote", plan.inflation.toLocaleString(locale())))));
  const yearly = s.rows.filter((r) => r.m % 12 === 0);
  parts.push(chart(s.rows.map((r) => ({ x: r.m / 12, invested: r.invested, value: r.value, label: r.m % 12 === 0 ? t("k_year", r.m / 12) : t("k_year", Math.floor(r.m / 12)) + " · " + (r.m % 12) + "/12" })), { xLabel: (x) => String(Math.round(x)), years: plan.years }));
  parts.push(el("p", { class: "muted k-note" }, t("k_lumpCmp", money(lumpSum({ total: s.invested, years: plan.years, rate: plan.rate })), money(s.invested))));
  parts.push(el("details", { class: "k-table" }, el("summary", {}, t("k_table")),
    el("div", { class: "tbl-wrap" }, el("table", {},
      el("thead", {}, el("tr", {}, el("th", {}, t("k_yearCol")), el("th", {}, t("k_invested")), el("th", {}, t("k_lgValue")), el("th", {}, t("k_profit")))),
      el("tbody", {}, ...yearly.slice(1).map((r) => el("tr", {}, el("td", {}, String(r.m / 12)), el("td", { class: "num" }, money(r.invested)), el("td", { class: "num" }, money(r.value)), el("td", { class: "num" }, money(r.value - r.invested)))))))));
  parts.push(el("p", { class: "muted k-note" }, t("k_disclaimer")));
  out.replaceChildren(...parts);
}

/* ---------------------------------------------------------------- chart: money put in vs value, with hover */

function chart(rows, { xLabel, years, dates }) {
  const NS = "http://www.w3.org/2000/svg";
  const narrow = typeof innerWidth === "number" && innerWidth < 560; // fewer, larger units on phones so labels stay readable
  const W = narrow ? 360 : 640, H = narrow ? 240 : 260, L = narrow ? 50 : 56, R = 12, T = 12, B = 28;
  const mk = (tag, a, txt) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); if (txt != null) e.textContent = txt; return e; };
  const n = rows.length;
  const maxY = Math.max(1, ...rows.map((r) => Math.max(r.value, r.invested)));
  const step = niceStep(maxY / 4);
  const top = Math.ceil(maxY / step) * step;
  const X = (i) => L + (n > 1 ? (i / (n - 1)) * (W - L - R) : 0);
  const Y = (v) => T + (1 - Math.max(0, v) / top) * (H - T - B);
  const svg = mk("svg", { viewBox: `0 0 ${W} ${H}`, class: "kchart", role: "img", "aria-label": t("k_chartAria") });
  for (let v = 0; v <= top + 1e-9; v += step) {
    svg.append(mk("line", { x1: L, x2: W - R, y1: Y(v), y2: Y(v), class: v === 0 ? "base" : "grid" }));
    svg.append(mk("text", { x: L - 8, y: Y(v) + 4, "text-anchor": "end", class: "tick" }, v === 0 ? "0" : moneyShort(v)));
  }
  // x ticks: about six, on whole years (or dates for the backtest)
  const every = Math.max(1, Math.ceil((dates ? n / 12 : years) / 6));
  rows.forEach((r, i) => {
    const isTick = dates ? i % (12 * every) === 0 : r.x % every === 0 && Number.isInteger(r.x);
    if (isTick) svg.append(mk("text", { x: X(i), y: H - 8, "text-anchor": i === 0 ? "start" : "middle", class: "tick" }, dates ? r.label.slice(0, 4) : xLabel(r.x)));
  });
  const path = (key) => rows.map((r, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(r[key]).toFixed(1)).join("");
  svg.append(mk("path", { d: path("value") + `L${X(n - 1)} ${Y(0)}L${X(0)} ${Y(0)}Z`, class: "area" }));
  svg.append(mk("path", { d: path("invested"), class: "ln-inv" }));
  svg.append(mk("path", { d: path("value"), class: "ln-val" }));
  // end labels (direct labelling of the two series)
  const last = rows[n - 1];
  // hover layer
  const cross = mk("line", { y1: T, y2: H - B, class: "cross", visibility: "hidden" });
  const dotV = mk("circle", { r: 4.5, class: "dot-val", visibility: "hidden" });
  const dotI = mk("circle", { r: 4.5, class: "dot-inv", visibility: "hidden" });
  const hit = mk("rect", { x: L, y: T, width: W - L - R, height: H - T - B, fill: "transparent" });
  svg.append(cross, dotI, dotV, hit);
  const tip = el("div", { class: "ktip", hidden: true });
  const wrap = el("div", { class: "kchart-wrap" },
    el("div", { class: "legend" }, el("span", {}, el("i", { class: "sw val" }), t("k_lgValue"), " ", el("b", { class: "num" }, money(last.value))), el("span", {}, el("i", { class: "sw inv" }), t("k_lgInvested"), " ", el("b", { class: "num" }, money(last.invested)))),
    el("div", { class: "kchart-box" }, svg, tip));
  const show = (evt) => {
    const box = svg.getBoundingClientRect();
    const px = ((evt.clientX - box.left) / box.width) * W;
    const i = clamp(Math.round(((px - L) / (W - L - R)) * (n - 1)), 0, n - 1);
    const r = rows[i], x = X(i);
    for (const [e, a] of [[cross, { x1: x, x2: x }], [dotV, { cx: x, cy: Y(r.value) }], [dotI, { cx: x, cy: Y(r.invested) }]]) { for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); e.setAttribute("visibility", "visible"); }
    tip.replaceChildren(el("b", {}, r.label), el("span", {}, el("i", { class: "sw val" }), t("k_lgValue") + ": ", el("span", { class: "num" }, money(r.value))), el("span", {}, el("i", { class: "sw inv" }), t("k_lgInvested") + ": ", el("span", { class: "num" }, money(r.invested))));
    tip.hidden = false;
    const left = (x / W) * box.width;
    tip.style.left = Math.min(box.width - 170, Math.max(0, left + 12)) + "px";
    tip.style.top = "8px";
  };
  const hide = () => { tip.hidden = true; [cross, dotV, dotI].forEach((e) => e.setAttribute("visibility", "hidden")); };
  hit.addEventListener("pointermove", show);
  hit.addEventListener("pointerdown", show);
  hit.addEventListener("pointerleave", hide);
  return wrap;
}
function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

/* ---------------------------------------------------------------- backtest */

let btResult = null, btBusy = false, btError = null;

function renderBacktest() {
  const b = plan.bt;
  const curSym = cur() === "EUR" ? "€" : "$";
  const dl = el("datalist", { id: "btList" }, ...ETFS.filter((e) => !e.crypto).map((e) => el("option", { value: e.t }, e.name || e.t)), ...STOCKS.map((s) => el("option", { value: s[0] }, s[1])));
  const tk = el("input", { type: "text", id: "btTk", list: "btList", value: b.tk, autocomplete: "off", class: "num-in", maxlength: "8" });
  const run = el("button", { type: "button", class: "primary", disabled: btBusy }, btBusy ? t("b_loading") : t("b_run"));
  const form = el("div", { class: "k-grid bt-grid" },
    el("div", { class: "k-field" }, el("label", { class: "l", for: "btTk" }, t("b_asset")), tk, dl),
    input("btMonthly", t("k_monthly"), b.monthly, { step: 50, suffix: curSym }),
    input("btYears", t("k_years"), b.years, { min: 1, max: 20 }),
    el("div", { class: "k-field bt-run" }, run));
  run.addEventListener("click", runBacktest);
  tk.addEventListener("keydown", (e) => { if (e.key === "Enter") runBacktest(); });
  const out = el("div", { "aria-live": "polite" });
  if (btError === "no_key") out.append(el("p", { class: "notice-inline" }, t("b_needKey"), " ", el("a", { href: "markets.html#keyPanel" }, t("b_setKey"))));
  else if (btError) out.append(el("p", { class: "notice-inline" }, t(btError)));
  else if (btResult) {
    const r = btResult;
    const wantY = b.years, gotY = r.months / 12;
    if (gotY < wantY - 0.5) out.append(el("p", { class: "muted" }, t("b_short", gotY.toLocaleString(locale(), { maximumFractionDigits: 1 }))));
    out.append(el("p", { class: "muted" }, t("b_from", fmtDate(r.start), fmtDate(r.end))));
    out.append(el("div", { class: "metrics k-kpi" },
      tile(t("k_invested"), money(r.invested)),
      tile(t("b_dca"), money(r.value), pctS(r.profitPct, 0), "hl"),
      tile(t("b_lump"), money(r.lump), pctS(r.lumpPct, 0)),
      tile(t("b_worst"), r.worstDrop < 0 ? pctS(r.worstDrop, 0) : "–", null, r.worstDrop < 0 ? "down" : "")));
    out.append(chart(r.rows.map((x) => ({ invested: x.invested, value: x.value, label: fmtDate(x.d) })), { dates: true }));
    out.append(el("p", { class: "muted k-note" }, r.worstDrop < 0 ? t("b_worstTxt", pctS(r.worstDrop, 0)) : t("b_noWorst")));
  }
  $("btBody").replaceChildren(form, out);
}
const fmtDate = (d) => new Date(d + "T12:00:00Z").toLocaleDateString(locale(), { year: "numeric", month: "short" });

async function runBacktest() {
  const b = plan.bt;
  b.tk = String($("btTk").value || "SPY").trim().toUpperCase().replace(/[^A-Z.\-]/g, "").slice(0, 8) || "SPY";
  b.monthly = Math.max(1, num($("btMonthly").value, b.monthly));
  b.years = clamp(Math.round(num($("btYears").value, b.years)), 1, 20);
  savePlan();
  btBusy = true; btError = null; renderBacktest();
  try {
    const { bars } = await weeklyBars(b.tk);
    btResult = backtestDca(bars, { monthly: b.monthly, years: b.years });
    if (!btResult) btError = "b_none";
  } catch (e) {
    btResult = null;
    btError = e && e.kind === "no_key" ? "no_key" : e && e.kind === "not_found" ? "b_none" : "b_err";
  }
  btBusy = false; renderBacktest();
}

/* ---------------------------------------------------------------- boot */

function renderAll() { document.title = t("g_title"); renderGuide(); renderCalc(); renderBacktest(); }
initChrome(renderAll);
renderAll();
