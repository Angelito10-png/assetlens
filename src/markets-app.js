/**
 * Stocks & ETFs page. Reads the daily snapshot (SEC fundamentals, filings,
 * headlines), loads weekly prices with the visitor's own Alpha Vantage key,
 * and renders the same scorecard as the crypto page.
 */
import * as M from "./markets-engine.js?v=__V__";
import { t, getLang } from "./i18n.js?v=__V__";
import { STOCKS, ETFS, SECTORS, ETF_CATEGORIES, ETF_FACTS_AS_OF, stockByTicker, etfByTicker } from "./universe.js?v=__V__";
import { loadSnapshot, weeklyBars, cachedBars, getKey, setKey, callsToday, FREE_DAILY_CALLS, PriceError } from "./markets-api.js?v=__V__";
import { priceStats } from "./prices.js?v=__V__";
import { fmtBig, fmtPct } from "./engine.js?v=__V__";
import { QUESTIONS, PROFILE_KEYS, quizResult } from "./quiz.js?v=__V__";
import { $, el, store, safeUrl, locale, priceFmt, barClass, ago, initChrome, applyStatic, dial, radar, backdropClose, closeBtn } from "./ui.js?v=__V__";

const QUICK = ["AAPL", "MSFT", "NVDA", "KO", "JPM", "VOO", "QQQ", "SCHD"];
const MAX_COMPARE = 2, WATCH_KEY = "ms-watchlist", WATCH_MAX = 30;
let snap = null;
let current = null; // { t, kind, c, px: {status, source, at} }
let compare = []; // [{ t, c }]
let customWeights = null; // per current kind
let spyBars = null;
const profile = () => document.querySelector('input[name="profile"]:checked').value;
const kindOf = (tk) => (stockByTicker(tk) ? "stock" : etfByTicker(tk) ? "etf" : null);
const nameOf = (tk) => (stockByTicker(tk) || [])[1] || (etfByTicker(tk) || {}).name || tk;

/* ---------- assets ---------- */
function entryFor(tk) {
  const kind = kindOf(tk);
  if (!kind) return null;
  const base = kind === "stock" ? { t: tk, name: nameOf(tk), sector: stockByTicker(tk)[2] } : { t: tk, name: nameOf(tk) };
  const fromSnap = snap && (kind === "stock" ? snap.stocks[tk] : snap.etfs[tk]);
  return { kind, entry: { ...base, ...(fromSnap || {}) } };
}
/** Normalised asset with whatever prices are at hand (none, cached or fresh). */
function assetWith(tk, bars) {
  const x = entryFor(tk);
  if (!x) return null;
  const b = bars || (cachedBars(tk) || {}).bars || null;
  const bench = spyBars || (cachedBars("SPY") || {}).bars || null;
  const px = b ? priceStats(b, tk === "SPY" ? null : bench) : null;
  return M.normalizeAsset({ ...x.entry, px }, x.kind);
}

async function loadPrices(tk) {
  try {
    if (!spyBars && tk !== "SPY") { try { spyBars = (await weeklyBars("SPY")).bars; } catch { /* the benchmark only feeds beta; the stock's own prices still load */ } }
    const r = await weeklyBars(tk);
    if (tk === "SPY") spyBars = r.bars;
    return { bars: r.bars, status: r.stale ? "stale" : "ok", source: r.source, at: r.at };
  } catch (e) {
    return { bars: null, status: e instanceof PriceError ? e.kind : "network" };
  }
}

/* ---------- URL state ---------- */
function readUrl() {
  const p = new URLSearchParams(location.search);
  return { t: (p.get("t") || "").toUpperCase(), profile: p.get("profile"), w: p.get("w"), vs: (p.get("vs") || "").toUpperCase().split(",").filter(Boolean).slice(0, MAX_COMPARE) };
}
function writeUrl() {
  if (!current) return;
  const p = new URLSearchParams({ t: current.t, profile: profile() });
  if (customWeights) p.set("w", M.encodeWeights(current.kind, customWeights));
  if (compare.length) p.set("vs", compare.map((x) => x.t).join(","));
  if (getLang() !== "en") p.set("lang", getLang());
  history.replaceState(null, "", `${location.pathname}?${p.toString().replace(/%2C/g, ",")}`);
}

/* ---------- selection ---------- */
function resolve(text) {
  const q = String(text || "").trim();
  if (!q) return null;
  const tk = q.split(/[\s·(]/)[0].toUpperCase();
  if (kindOf(tk)) return tk;
  const lower = q.toLowerCase();
  const hit = STOCKS.find(([, n]) => n.toLowerCase() === lower) || ETFS.find((e) => e.name.toLowerCase() === lower)
    || STOCKS.find(([, n]) => n.toLowerCase().startsWith(lower)) || ETFS.find((e) => e.name.toLowerCase().includes(lower));
  return hit ? hit[0] || hit.t : null;
}

async function analyze(tkArg) {
  const tk = tkArg || resolve($("coin").value);
  if (!tk) { notice("warn", t("m_notFound"), t("m_notFoundBody")); return; }
  notice(null);
  const kind = kindOf(tk);
  if (!current || current.kind !== kind) { customWeights = null; compare = []; }
  compare = compare.filter((x) => x.t !== tk && kindOf(x.t) === kind);
  current = { t: tk, kind, c: assetWith(tk), px: { status: "loading" } };
  $("coin").value = `${tk} · ${nameOf(tk)}`;
  renderWeights(); render(); writeUrl();
  status("loading", t("m_loadingPx"));
  const px = await loadPrices(tk);
  if (!current || current.t !== tk) return;
  current.px = px;
  current.c = assetWith(tk, px.bars);
  compare = compare.map((x) => ({ ...x, c: assetWith(x.t) }));
  render(); renderKey();
  status(px.bars ? "live" : "idle", px.bars ? t("m_pxStatus", px.source, new Date(px.at).toLocaleDateString(locale())) : t("m_fundOnly"));
}

function status(s, text) { $("status").dataset.s = s; $("statusText").textContent = text; }
function notice(kind, title, body) {
  const n = $("notice");
  if (!kind) { n.hidden = true; n.replaceChildren(); return; }
  n.hidden = false; n.className = "notice"; n.dataset.k = kind;
  n.replaceChildren(el("p", {}, el("b", {}, title)), body ? el("p", {}, body) : null);
}

/* ---------- prices key panel ---------- */
function renderKey() {
  const key = getKey(), n = callsToday();
  $("keyState").textContent = snap && snap.prices ? t("m_pxPublished") : key ? t("m_pxKeyOn", n, FREE_DAILY_CALLS) : t("m_pxKeyOff");
  const input = el("input", { type: "password", id: "avKey", autocomplete: "off", spellcheck: "false", placeholder: t("m_pxKeyPh"), "aria-describedby": "avHelp" });
  const save = el("button", { type: "button", class: "primary" }, t("m_pxSave"));
  const rm = el("button", { type: "button", class: "ghost" }, t("m_pxRemove"));
  rm.hidden = !key;
  save.addEventListener("click", () => { if (!input.value.trim()) return; setKey(input.value); renderKey(); if (current) analyze(current.t); });
  rm.addEventListener("click", () => { setKey(""); renderKey(); });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") save.click(); });
  const err = current && current.px && ["rate_limit", "bad_key", "not_found", "network", "http"].includes(current.px.status) ? el("p", { class: "notice", "data-k": "warn", style: "margin:0" }, t("m_pxErr_" + current.px.status)) : null;
  $("keyBody").replaceChildren(
    el("p", { class: "muted", id: "avHelp", style: "margin:0;font-size:.85rem" }, t("m_pxHelp"), " ", el("a", { href: "https://www.alphavantage.co/support/#api-key", target: "_blank", rel: "noopener" }, t("m_pxGetKey"))),
    el("div", { class: "cmp-add", style: "margin:10px 0 0" }, input, save, rm),
    key ? el("p", { class: "muted", style: "margin:8px 0 0;font-size:.8rem" }, t("m_pxKeyNote", n, FREE_DAILY_CALLS)) : null,
    err,
  );
}

/* ---------- weights ---------- */
const K = () => M.KINDS[current ? current.kind : "stock"];
const activeWeights = () => customWeights || K().profiles[profile()].weights;
function renderWeights() {
  const w = activeWeights(), sum = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  const rows = K().factors.map((F) => {
    const id = "w-" + F.key;
    const input = el("input", { type: "range", id, min: 0, max: 50, step: 1, value: Math.round(w[F.key] || 0), "aria-describedby": id + "-v" });
    input.addEventListener("input", () => {
      customWeights = { ...activeWeights(), [F.key]: Number(input.value) };
      if (!Object.values(customWeights).some((v) => v > 0)) customWeights[F.key] = 1;
      renderWeightsValues(); render(); writeUrl();
    });
    return el("div", { class: "wrow" }, el("label", { for: id }, F.name), input, el("output", { id: id + "-v", class: "num", for: id }, Math.round(((w[F.key] || 0) / sum) * 100) + "%"));
  });
  const P = K().profiles[profile()];
  const reset = el("button", { type: "button", class: "ghost", id: "wReset" }, t("resetWeights", P.label));
  reset.disabled = !customWeights;
  reset.addEventListener("click", () => { customWeights = null; renderWeights(); render(); writeUrl(); });
  $("weightsBody").replaceChildren(
    el("p", { class: "muted", style: "margin:0;font-size:.85rem" }, t("weightsHelp"), " ", t(current && current.kind === "etf" ? "m_weightsEtf" : "m_weightsStock")),
    el("div", { class: "wgrid" }, ...rows),
    el("div", { class: "wfoot" }, reset, el("span", { class: "muted", id: "wState", style: "font-size:.82rem" }, customWeights ? t("usingCustom") : t("usingProfile", P.label))),
  );
}
function renderWeightsValues() {
  const w = activeWeights(), sum = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  K().factors.forEach((F) => { const o = document.getElementById("w-" + F.key + "-v"); if (o) o.textContent = Math.round(((w[F.key] || 0) / sum) * 100) + "%"; });
  const P = K().profiles[profile()];
  const st = document.getElementById("wState"); if (st) st.textContent = customWeights ? t("usingCustom") : t("usingProfile", P.label);
  const rb = document.getElementById("wReset"); if (rb) rb.disabled = !customWeights;
}

/* ---------- rendering ---------- */
const pctSpan = (v) => el("span", { class: v === null ? "" : v >= 0 ? "pos" : "neg" }, fmtPct(v));
const fx = (v, d, suf = "") => (v === null || v === undefined ? "n/a" : v.toFixed(d) + suf);
const groupLabel = (c) => (c.kind === "stock" ? t("sector_" + c.sector) : t("etfcat_" + c.cat));

function metrics(c) {
  const M_ = c.kind === "stock"
    ? [[t("mm_price"), priceFmt(c.price)], [t("mi_pe"), c.pe ? c.pe.toFixed(1) : c.eps !== null && c.eps <= 0 ? t("mi_neg") : "n/a"], [t("mi_mcap"), fmtBig(c.mcap)], [t("mi_yield"), fx(c.yield, 2, "%")], [t("mi_1y"), pctSpan(c.r1y)], [t("mi_vol"), fx(c.vol, 0, "%")], [t("mm_fromHigh"), pctSpan(c.fromHigh)], [t("mi_revenue"), fmtBig(c.revenue)], [t("mi_netMargin"), fx(c.netMargin, 1, "%")]]
    : [[t("mm_price"), priceFmt(c.price)], [t("mi_er"), c.er === null ? "n/a" : c.er.toFixed(c.er < 0.1 ? 3 : 2) + "%"], [t("mi_aum"), fmtBig(c.aum)], [t("mi_holdings"), c.holdings === null ? "n/a" : c.holdings.toLocaleString("en-US")], [t("mi_yield"), fx(c.yield, 2, "%")], [t("mi_1y"), pctSpan(c.r1y)], [t("mi_cagr5"), pctSpan(c.cagr5y)], [t("mi_vol"), fx(c.vol, 0, "%")], [t("mm_fromHigh"), pctSpan(c.fromHigh)]];
  return el("div", { class: "metrics" }, ...M_.map(([k, v]) => el("div", { class: "metric" }, el("span", { class: "k" }, k), el("span", { class: "v" }, v))));
}

function render() {
  renderWatch();
  if ($("catDrawer").open) renderMenu();
  if (!current) return;
  const c = current.c, pk = profile(), r = M.score(c, pk, customWeights), [vText, vKey] = M.verdict(r.total);
  const P = M.KINDS[c.kind].profiles;
  const who = customWeights ? t("whoCustom") : t("whoProfile", r.profile.label);
  const all = PROFILE_KEYS.map((k) => [k, M.score(c, k).total, P[k].label]);
  if (customWeights) all.push(["custom", r.total, t("profile_custom")]);
  const card = el("div", { class: "panel scorecard" },
    el("div", { class: "coin-id" }, el("div", { class: "mono-badge" }, c.t.slice(0, 4)), el("div", { style: "text-align:left" }, el("h2", {}, c.name), el("div", { class: "muted mono", style: "font-size:.8rem" }, `${c.t} · ${t(c.kind === "stock" ? "m_kind_stock" : "m_kind_etf")} · ${groupLabel(c)}`))),
    watchButton(c),
    dial(r.total, vKey),
    el("span", { class: "pill v-" + vKey }, t("fitFor", vText, who)),
    r.caps.length ? el("p", { class: "caps" }, ...r.caps) : null,
    el("div", { class: "cmp" }, el("div", { class: "eyebrow" }, t("m_otherProfiles")),
      ...all.map(([k, tot, label]) => el("div", { class: "cmp-row" + (k === (customWeights ? "custom" : pk) ? " on" : "") }, el("span", {}, label), el("div", { class: "track" }, el("i", { style: `width:${((tot - 1) / 9) * 100}%` })), el("span", { class: "num", style: "text-align:right" }, tot.toFixed(1))))),
    el("div", { class: "muted", style: "font-size:.78rem" }, t("coverage", r.coverage)),
  );
  const pxNote = pricesNote();
  const right = el("div", { class: "right" },
    metrics(c),
    pxNote,
    el("div", { class: "panel", style: "padding:16px" }, el("div", { class: "eyebrow", style: "margin-bottom:8px" }, t("riskFlags")),
      r.flags.length ? el("ul", { class: "flags" }, ...r.flags.map(([k, txt]) => el("li", { class: k }, el("span", {}, txt)))) : el("p", { class: "muted", style: "margin:0" }, t("noFlags"))),
  );
  const ledger = el("div", { class: "ledger" },
    el("div", { class: "frow head" }, el("div", {}, t("col_factor")), el("div", {}, t("col_score")), el("div", {}, t("col_weight")), el("div", {}, t("col_why"))),
    ...r.factors.map((f) => el("div", { class: "frow" + (f.weight === 0 || f.score === null ? " off" : "") },
      el("div", { class: "fname" }, el("h3", {}, f.name), el("p", {}, f.what)),
      el("div", { class: "fscore" }, el("span", { class: "n" }, f.score === null ? t("noDataShort") : f.score.toFixed(1) + " / 10"), f.score === null ? null : el("div", { class: "bar10" }, el("i", { class: barClass(f.score), style: `width:${f.score * 10}%` }))),
      el("div", { class: "fw" }, f.weight === 0 ? "0%" : Math.round(f.effWeight) + "%", el("small", {}, f.weight === 0 ? t("notUsed") : f.score === null ? t("skipped") : t("pts", (f.contrib * 0.9).toFixed(2)))),
      el("div", { class: "fwhy" }, el("ul", {}, ...f.notes.map((n) => el("li", {}, n))), f.inputs.length ? el("div", { class: "inputs" }, ...f.inputs.map(([k, v]) => el("span", {}, k + " ", el("b", {}, v)))) : null),
    )),
  );
  const recs = M.recommend(c, r);
  const link = (href, text) => el("a", { href, target: "_blank", rel: "noopener" }, text);
  const srcLinks = c.kind === "stock"
    ? [c.cik ? link(`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${encodeURIComponent(c.cik)}&type=10-K`, "SEC EDGAR") : "SEC EDGAR", " · ", link(`https://www.alphavantage.co/`, "Alpha Vantage")]
    : [t("m_etfFacts", ETF_FACTS_AS_OF, c.issuer || ""), " · ", link(`https://www.alphavantage.co/`, "Alpha Vantage")];
  $("result").replaceChildren(el("div", { style: "display:grid;gap:20px" },
    el("div", { class: "hero" }, card, right),
    el("div", { class: "viz" }, radarPanel(r), comparePanel(r)),
    feedPanel(),
    el("section", { class: "panel" }, el("div", { class: "section-head" }, el("h2", {}, t("breakdown")), el("span", { class: "muted", style: "font-size:.82rem" }, t("breakdownNote", !!customWeights, r.profile.label))), ledger),
    el("div", { class: "two" },
      el("section", { class: "panel" }, el("h2", { style: "margin-bottom:14px" }, t("recsFor", t("whoProfile", r.profile.label))), el("ul", { class: "recs" }, ...recs.map(([h, txt]) => el("li", {}, el("b", {}, h), el("span", {}, txt))))),
      el("section", { class: "panel" }, el("h2", { style: "margin-bottom:10px" }, t("beforeAct")),
        el("ul", { class: "recs" },
          el("li", {}, el("b", {}, t("notCovered")), el("span", {}, t(c.kind === "stock" ? "m_notCoveredStock" : "m_notCoveredEtf"))),
          el("li", {}, el("b", {}, t("sources")), el("span", {}, ...srcLinks)),
          el("li", {}, el("b", {}, t("m_dataDates")), el("span", {}, t("m_dataDatesBody", c.kind === "stock" ? c.periodEnd : null, c.asOf, snap ? new Date(snap.updated).toLocaleDateString(locale()) : null))),
        )),
    ),
  ));
}

function pricesNote() {
  const s = current.px && current.px.status;
  if (s === "ok" || s === "stale") return null;
  const key = getKey();
  const text = s === "loading" ? t("m_pxLoading") : s === "no_key" || !key ? t("m_pxNeedKey") : t("m_pxErr_" + s);
  const open = el("button", { type: "button", class: "linkbtn" }, t("m_pxOpen"));
  open.addEventListener("click", () => { $("keyPanel").open = true; $("keyPanel").scrollIntoView({ behavior: "smooth", block: "center" }); setTimeout(() => document.getElementById("avKey")?.focus(), 300); });
  return el("div", { class: "notice", "data-k": s === "loading" ? "info" : "warn" }, el("p", {}, text), s === "loading" ? null : el("p", {}, open));
}

function radarPanel(r) {
  const factors = M.KINDS[current.kind].factors;
  const series = [{ name: current.c.name, slot: 1, factors: r.factors }, ...compare.map((x, i) => ({ name: x.c.name, slot: i + 2, factors: M.score(x.c, profile(), customWeights).factors }))];
  const legend = series.length > 1 ? el("div", { class: "legend" }, ...series.map((s) => el("span", {}, el("i", { class: "sw", style: `background:var(--s${s.slot})` }), s.name))) : null;
  return el("section", { class: "panel" },
    el("div", { class: "section-head" }, el("h2", {}, t("factorProfile")), el("span", { class: "muted", style: "font-size:.82rem" }, t("radarNote"))),
    legend, el("div", { class: "radar-wrap" }, radar(series, factors)),
    el("p", { class: "muted", style: "margin:0;font-size:.78rem" }, t("radarFoot")));
}

function comparePanel(r) {
  const pk = profile(), kind = current.kind;
  const entries = [{ c: current.c, slot: 1, main: true }, ...compare.map((x, i) => ({ c: x.c, slot: i + 2, t: x.t }))];
  const scored = entries.map((e) => ({ ...e, r: e.main ? r : M.score(e.c, pk, customWeights) }));
  const extra = kind === "stock" ? [["pe", t("mi_pe"), (x) => x.c.pe, (v) => fx(v, 1)], ["yield", t("mi_yield"), (x) => x.c.yield, (v) => fx(v, 2, "%")]] : [["er", t("mi_er"), (x) => x.c.er, (v) => fx(v, 2, "%")], ["yield", t("mi_yield"), (x) => x.c.yield, (v) => fx(v, 2, "%")]];
  const rowsDef = [
    ["score", t("score"), (x) => x.r.total, (v) => v.toFixed(1), true, true],
    ...PROFILE_KEYS.filter((k) => customWeights || k !== pk).map((k) => [k, M.KINDS[kind].profiles[k].label, (x) => M.score(x.c, k).total, (v) => v.toFixed(1), false, true]),
    ...M.KINDS[kind].factors.map((F) => [F.key, F.name, (x) => x.r.factors.find((f) => f.key === F.key).score, (v) => (v === null ? "–" : v.toFixed(1)), false, true]),
    ...extra.map(([k, l, g, f]) => [k, l, g, f, false, false]),
  ];
  const head = el("tr", {}, el("th", {}, ""), ...scored.map((x) => el("th", { class: "num" },
    el("span", { class: "chead" }, el("i", { class: "sw", style: `background:var(--s${x.slot})` }), x.c.t),
    x.main ? null : (() => { const b = el("button", { type: "button", class: "xbtn", "aria-label": t("remove", x.c.name) }, "×"); b.addEventListener("click", () => { compare = compare.filter((y) => y.t !== x.t); render(); writeUrl(); }); return b; })())));
  const body = rowsDef.map(([key, label, get, fmt, strong, best]) => {
    const vals = scored.map(get), nums = vals.filter((v) => typeof v === "number");
    const top = best && scored.length > 1 && nums.length > 1 ? Math.max(...nums) : null;
    return el("tr", { class: strong ? "strong" : "" }, el("th", { scope: "row" }, label), ...vals.map((v) => el("td", { class: "num" + (top !== null && v === top ? " best" : "") }, fmt(v ?? null))));
  });
  const input = el("input", { type: "text", id: "cmpCoin", list: kind === "stock" ? "stockList" : "etfList", placeholder: t(kind === "stock" ? "m_addStock" : "m_addEtf"), autocomplete: "off" });
  const add = el("button", { type: "button", class: "ghost" }, t("add"));
  const msg = el("p", { class: "muted", id: "cmpMsg", style: "margin:0 0 8px;font-size:.8rem;min-height:1.2em", "aria-live": "polite" }, compare.length ? "" : t(kind === "stock" ? "m_compareHintStock" : "m_compareHintEtf"));
  const go = async () => {
    const tk = resolve(input.value);
    if (!tk) { msg.textContent = t("m_notFound"); return; }
    if (kindOf(tk) !== kind) { msg.textContent = t("m_compareKind"); return; }
    if (tk === current.t || compare.some((x) => x.t === tk)) { msg.textContent = t("m_alreadyIn"); return; }
    msg.textContent = t("loading");
    const px = await loadPrices(tk);
    compare.push({ t: tk, c: assetWith(tk, px.bars) });
    render(); writeUrl();
  };
  add.addEventListener("click", go);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  if (compare.length >= MAX_COMPARE) { input.disabled = true; add.disabled = true; input.placeholder = t("m_upTo3"); }
  return el("section", { class: "panel" },
    el("div", { class: "section-head" }, el("h2", {}, t(kind === "stock" ? "m_compareStocks" : "m_compareEtfs")), el("span", { class: "muted", style: "font-size:.82rem" }, customWeights ? t("scoredCustom") : t("scoredFor", M.KINDS[kind].profiles[pk].label))),
    el("div", { class: "cmp-add" }, input, add), msg,
    el("div", { class: "ctable-wrap" }, el("table", { class: "ctable" }, el("thead", {}, head), el("tbody", {}, ...body))),
    scored.length > 1 ? el("p", { class: "muted", style: "margin:8px 0 0;font-size:.78rem" }, t("boldBest")) : null);
}

function feedPanel() {
  const c = current.c;
  const items = (c.news || []).filter((x) => safeUrl(x.url));
  const filings = c.kind === "stock" ? ((snap && snap.stocks[c.t] && snap.stocks[c.t].filings) || []).filter((x) => safeUrl(x.url)) : [];
  const news = !snap ? el("p", { class: "muted", style: "margin:0" }, t("m_noSnap"))
    : !items.length ? el("p", { class: "muted", style: "margin:0" }, t("m_noNews"))
    : el("ul", { class: "news" }, ...items.map((x) => el("li", {}, el("a", { href: safeUrl(x.url), target: "_blank", rel: "noopener" }, x.title), el("span", { class: "muted" }, [x.source, x.published ? ago(x.published) : null].filter(Boolean).join(" · ")))));
  const fil = c.kind !== "stock" ? null : el("div", {},
    el("h3", { style: "margin:16px 0 8px" }, t("m_filings")),
    filings.length ? el("ul", { class: "news" }, ...filings.map((f) => el("li", {},
      el("a", { href: safeUrl(f.url), target: "_blank", rel: "noopener" }, `${f.form} · ${t("m_form_" + f.kind)}` + (f.kind === "event" && f.items ? ` (${itemsText(f.items)})` : "")),
      el("span", { class: "muted" }, f.date ? new Date(f.date + "T12:00:00Z").toLocaleDateString(locale()) : "")))) : el("p", { class: "muted", style: "margin:0" }, t("m_noFilings")));
  return el("section", { class: "panel", id: "newsPanel" },
    el("div", { class: "section-head" }, el("h2", {}, t("news")), el("span", { class: "muted", style: "font-size:.82rem" }, snap ? t("m_newsNote", (snap.sources || []).filter((s) => s !== "SEC EDGAR" && s !== "Alpha Vantage").join(", ") || "–", ago(snap.updated)) : "")),
    news, fil);
}
/** 8-K item numbers → a few words (the most common items only). */
function itemsText(items) {
  const known = { "1.01": "m_8k_101", "2.02": "m_8k_202", "5.02": "m_8k_502", "5.07": "m_8k_507", "7.01": "m_8k_701", "8.01": "m_8k_801", "2.01": "m_8k_201", "1.02": "m_8k_102" };
  const words = String(items).split(",").map((x) => known[x.trim()]).filter(Boolean).map((k) => t(k));
  return words.length ? words.join(", ") : t("m_8k_other");
}

function renderMethod() {
  const table = (kind) => {
    const P = M.KINDS[kind].profiles;
    return el("table", { class: "w" },
      el("thead", {}, el("tr", {}, el("th", {}, t("col_factor")), ...PROFILE_KEYS.map((k) => el("th", { class: "num" }, P[k].label)))),
      el("tbody", {}, ...M.KINDS[kind].factors.map((F) => el("tr", {}, el("td", {}, F.name), ...PROFILE_KEYS.map((k) => el("td", { class: "num mono" }, P[k].weights[F.key] + "%"))))));
  };
  $("methodBody").replaceChildren(
    el("p", {}, t("m_methodIntro")),
    el("div", {}, el("h3", { style: "margin-bottom:6px" }, t("m_weightsStockTitle")), el("div", { class: "wtable-wrap" }, table("stock"))),
    el("div", {}, el("h3", { style: "margin-bottom:6px" }, t("m_weightsEtfTitle")), el("div", { class: "wtable-wrap" }, table("etf"))),
    el("p", {}, el("b", {}, t("thresholds") + " "), t("m_thresholdsBody")),
    el("p", {}, el("b", {}, t("profileRules") + " "), t("m_rulesBody")),
    el("p", {}, el("b", {}, t("m_dataTitle") + " "), t("m_dataBody")),
  );
}

/* ---------- watchlist (tickers saved in this browser) ---------- */
const watchList = () => { try { const v = JSON.parse(store.get(WATCH_KEY) || "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string" && kindOf(x)) : []; } catch { return []; } };
const watchSave = (l) => store.set(WATCH_KEY, JSON.stringify(l));
function watchButton(c) {
  const on = watchList().includes(c.t);
  const b = el("button", { type: "button", class: "watch-btn" + (on ? " on" : ""), id: "watchBtn", "aria-pressed": String(on), "aria-label": on ? t("watchRemoveAria", c.name) : t("watchAddAria", c.name) }, el("span", { "aria-hidden": "true" }, on ? "★" : "☆"), " ", on ? t("watchIn") : t("watchAdd"));
  b.addEventListener("click", () => {
    const l = watchList();
    if (l.includes(c.t)) watchSave(l.filter((x) => x !== c.t));
    else if (l.length >= WATCH_MAX) { notice("warn", t("m_watchFull", WATCH_MAX)); return; }
    else watchSave([...l, c.t]);
    b.replaceWith(watchButton(c)); renderWatch(); document.getElementById("watchBtn")?.focus();
  });
  return b;
}
function assetRow(tk, onOpen, extra) {
  const c = assetWith(tk), r = M.score(c, profile(), current && current.kind === c.kind ? customWeights : null), [vText, vKey] = M.verdict(r.total);
  const open = el("button", { type: "button", class: "w-coin", "aria-label": t("watchOpenAria", c.name) }, el("span", { class: "mono-badge sm" }, tk.slice(0, 4)), el("span", { class: "w-name" }, el("b", {}, c.name), el("small", { class: "muted mono" }, `${tk} · ${groupLabel(c)}`)));
  open.addEventListener("click", onOpen);
  return { r, li: el("li", { class: "w-row" + (current && current.t === tk ? " on" : "") }, open,
    el("span", { class: "w-price num" }, priceFmt(c.price)),
    el("span", { class: "w-ch num" }, c.r1y === null ? el("span", { class: "muted" }, "–") : pctSpan(c.r1y)),
    el("span", { class: "w-score" }, el("b", { class: "num", title: t("m_coverageShort", r.coverage) }, (r.coverage < 100 ? "≈" : "") + r.total.toFixed(1)), el("span", { class: "pill sm v-" + vKey }, vText)), extra || null) };
}
function renderWatch() {
  const list = watchList();
  $("watchCount").hidden = !list.length; $("watchCount").textContent = String(list.length);
  $("watchOpen").classList.toggle("on", list.length > 0);
  const head = el("div", { class: "quiz-head" }, el("div", {}, el("h2", { id: "watchTitle" }, t("watchlist")), list.length ? el("div", { class: "muted", style: "font-size:.8rem;margin-top:2px" }, t("m_watchSub", list.length, M.KINDS.stock.profiles[profile()].label)) : null), closeBtn(() => $("watchDrawer").close()));
  if (!list.length) { $("watchPanel").replaceChildren(head, el("div", { class: "drawer-body" }, el("p", { class: "muted", style: "margin:0" }, t("m_watchEmpty")))); return; }
  const rows = list.map((tk) => {
    const rm = el("button", { type: "button", class: "xbtn", "aria-label": t("watchRemoveAria", nameOf(tk)) }, "×");
    rm.addEventListener("click", () => { watchSave(watchList().filter((x) => x !== tk)); renderWatch(); const wb = document.getElementById("watchBtn"); if (wb && current) wb.replaceWith(watchButton(current.c)); });
    return assetRow(tk, () => { $("watchDrawer").close(); analyze(tk); window.scrollTo({ top: $("result").offsetTop - 12, behavior: "smooth" }); }, rm);
  }).sort((a, b) => b.r.total - a.r.total);
  $("watchPanel").replaceChildren(head, el("div", { class: "drawer-body" }, el("ul", { class: "w-list" }, ...rows.map((x) => x.li)), el("p", { class: "muted", style: "margin:12px 0 0;font-size:.78rem" }, t("m_watchNote"))));
}

/* ---------- sector & fund-type menu ---------- */
let menuKey = null, menuSort = "score";
const MENU = [...SECTORS.map((s) => ({ key: "s:" + s, label: () => t("sector_" + s), list: () => STOCKS.filter((x) => x[2] === s).map((x) => x[0]) })),
  ...ETF_CATEGORIES.map((g) => ({ key: "e:" + g, label: () => t("etfcat_" + g), list: () => ETFS.filter((e) => e.cat === g).map((e) => e.t), etf: true }))];
function renderMenuNav() {
  const chip = (m) => { const b = el("button", { type: "button", class: "chip", "aria-haspopup": "dialog" }, m.label()); b.addEventListener("click", () => { menuKey = m.key; renderMenu(); $("catDrawer").showModal(); }); return b; };
  $("catsNav").replaceChildren(el("span", { class: "cats-label" }, t("m_sectors")), ...MENU.filter((m) => !m.etf).map(chip), el("span", { class: "cats-label" }, t("m_etfs")), ...MENU.filter((m) => m.etf).map(chip));
}
function renderMenu() {
  const m = MENU.find((x) => x.key === menuKey);
  if (!m) return;
  const tabs = el("div", { class: "cat-tabs", role: "group", "aria-label": t("m_sectors") }, ...MENU.filter((x) => !!x.etf === !!m.etf).map((x) => { const b = el("button", { type: "button", class: "chip", "aria-pressed": String(x.key === menuKey) }, x.label()); b.addEventListener("click", () => { menuKey = x.key; renderMenu(); }); return b; }));
  const sort = el("div", { class: "cat-sort" }, el("span", { class: "muted" }, t("sortBy")), el("div", { class: "tgl" }, ...[["score", t("sortScore")], ["name", t("m_sortName")]].map(([k, label]) => { const b = el("button", { type: "button", "aria-pressed": String(menuSort === k) }, label); b.addEventListener("click", () => { menuSort = k; renderMenu(); }); return b; })));
  const rows = m.list().map((tk) => assetRow(tk, () => { $("catDrawer").close(); analyze(tk); window.scrollTo({ top: $("result").offsetTop - 12, behavior: "smooth" }); }));
  rows.sort(menuSort === "score" ? (a, b) => b.r.total - a.r.total : () => 0);
  const who = t("whoProfile", M.KINDS.stock.profiles[profile()].label);
  const y = $("catPanel").querySelector(".drawer-body")?.scrollTop;
  $("catPanel").replaceChildren(
    el("div", { class: "quiz-head" }, el("div", {}, el("h2", { id: "catTitle" }, m.label()), el("div", { class: "muted", style: "font-size:.8rem;margin-top:2px" }, t("m_menuSub", rows.length, who))), closeBtn(() => $("catDrawer").close())),
    el("div", { class: "drawer-body" }, tabs, sort, el("ul", { class: "w-list" }, ...rows.map((x) => x.li)), el("p", { class: "muted", style: "margin:12px 0 0;font-size:.78rem" }, t("m_quickNote"))));
  if (y) $("catPanel").querySelector(".drawer-body").scrollTop = y;
}

/* ---------- profile quiz (same questions, stock-market wording) ---------- */
let quizAnswers = [], quizShowResult = false;
const qt = (k) => { const v = t("m" + k); return v === "m" + k ? t(k) : v; };
function setProfile(key) { $("p-" + key).checked = true; store.set("cs-profile", key); $("profNote").textContent = M.KINDS.stock.profiles[key].blurb; customWeights = null; renderWeights(); render(); writeUrl(); }
function renderQuiz() {
  const d = $("quiz"), total = QUESTIONS.length, answered = quizAnswers.filter((a) => Number.isInteger(a)).length, r = quizResult(quizAnswers);
  const head = el("div", { class: "quiz-head" }, el("h2", { id: "quizTitle" }, quizShowResult ? t("quizResult") : t("quizTitle")), closeBtn(() => d.close()));
  let body, foot;
  if (quizShowResult && r.complete) {
    const P = M.KINDS.stock.profiles[r.profile], top = r.points[r.profile], tie = PROFILE_KEYS.filter((k) => r.points[k] === top).length > 1;
    body = el("div", { class: "quiz-body" }, el("div", { class: "quiz-result" }, el("b", {}, P.label), el("p", {}, P.blurb)), el("p", { style: "margin:0" }, t("quizWhy", top) + (tie ? " " + t("quizTie") : "")),
      el("div", { class: "cmp" }, el("div", { class: "eyebrow" }, t("quizPoints")), ...PROFILE_KEYS.map((k) => el("div", { class: "cmp-row" + (k === r.profile ? " on" : "") }, el("span", {}, M.KINDS.stock.profiles[k].label), el("div", { class: "track" }, el("i", { style: `width:${(r.points[k] / total) * 100}%` })), el("span", { class: "num", style: "text-align:right" }, `${r.points[k]}/${total}`)))),
      el("p", { class: "muted", style: "margin:0;font-size:.8rem" }, t("quizNote")));
    const apply = el("button", { type: "button", class: "primary" }, t("quizApply", P.label)); apply.addEventListener("click", () => { setProfile(r.profile); d.close(); });
    const again = el("button", { type: "button", class: "ghost" }, t("quizRetake")); again.addEventListener("click", () => { quizAnswers = []; quizShowResult = false; renderQuiz(); });
    foot = el("div", { class: "quiz-foot" }, again, apply);
  } else {
    body = el("div", { class: "quiz-body" }, el("p", { class: "muted", style: "margin:0" }, t("quizIntro")),
      ...QUESTIONS.map((q, qi) => el("fieldset", { class: "quiz-q" }, el("legend", {}, el("span", { class: "quiz-n" }, String(qi + 1)), qt("quiz_" + q.key)),
        ...q.options.map((_, oi) => { const input = el("input", { type: "radio", name: "quiz-" + q.key, value: oi }); if (quizAnswers[qi] === oi) input.checked = true; input.addEventListener("change", () => { quizAnswers[qi] = oi; renderQuizFoot(); }); return el("label", { class: "quiz-opt" }, input, el("span", {}, qt(`quiz_${q.key}_${oi}`))); }))));
    const see = el("button", { type: "button", class: "primary", id: "quizSee" }, t("quizSee")); see.disabled = answered < total;
    see.addEventListener("click", () => { quizShowResult = true; renderQuiz(); });
    foot = el("div", { class: "quiz-foot" }, el("span", { class: "muted", id: "quizProg", "aria-live": "polite" }, t("quizProgress", answered, total)), see);
  }
  d.replaceChildren(el("div", { class: "quiz-card" }, head, body, foot));
}
function renderQuizFoot() { const n = quizAnswers.filter((a) => Number.isInteger(a)).length; $("quizProg").textContent = t("quizProgress", n, QUESTIONS.length); $("quizSee").disabled = n < QUESTIONS.length; }

/* ---------- boot ---------- */
function relabel() {
  applyStatic();
  $("profNote").textContent = M.KINDS.stock.profiles[profile()].blurb;
  renderMenuNav(); renderMethod(); renderKey(); renderWeights();
  if ($("quiz").open) renderQuiz();
  render(); writeUrl();
}
async function init() {
  initChrome(relabel);
  const url = readUrl();
  const startProfile = (url.profile && M.KINDS.stock.profiles[url.profile] && url.profile) || store.get("cs-profile");
  if (startProfile && M.KINDS.stock.profiles[startProfile]) $("p-" + startProfile).checked = true;
  $("profNote").textContent = M.KINDS.stock.profiles[profile()].blurb;
  $("coinlist").replaceChildren(...[...STOCKS.map(([tk, n]) => `${tk} · ${n}`), ...ETFS.map((e) => `${e.t} · ${e.name}`)].map((v) => el("option", { value: v })));
  document.body.append(el("datalist", { id: "stockList" }, ...STOCKS.map(([tk, n]) => el("option", { value: `${tk} · ${n}` }))), el("datalist", { id: "etfList" }, ...ETFS.map((e) => el("option", { value: `${e.t} · ${e.name}` }))));
  QUICK.forEach((tk) => { const b = el("button", { type: "button" }, tk); b.addEventListener("click", () => analyze(tk)); $("quick").append(b); });
  document.querySelectorAll('input[name="profile"]').forEach((r) => r.addEventListener("change", () => { store.set("cs-profile", profile()); $("profNote").textContent = M.KINDS.stock.profiles[profile()].blurb; customWeights = null; renderWeights(); render(); writeUrl(); }));
  $("go").addEventListener("click", () => analyze());
  $("coin").addEventListener("keydown", (e) => { if (e.key === "Enter") analyze(); });
  $("watchOpen").addEventListener("click", () => { renderWatch(); $("watchDrawer").showModal(); });
  [$("watchDrawer"), $("catDrawer"), $("quiz")].forEach(backdropClose);
  $("quizBtn").addEventListener("click", () => { renderQuiz(); $("quiz").showModal(); });
  renderMenuNav(); renderMethod(); renderKey(); renderWatch();
  snap = await loadSnapshot();
  if (!snap) notice("warn", t("m_noSnapTitle"), t("m_noSnap"));
  const first = kindOf(url.t) ? url.t : "AAPL";
  if (url.w) { const w = M.decodeWeights(kindOf(first), url.w); if (w) { current = { t: first, kind: kindOf(first) }; customWeights = w; $("weightsPanel").open = true; } }
  const keepW = customWeights;
  await analyze(first);
  if (keepW) { customWeights = keepW; renderWeights(); render(); }
  for (const tk of url.vs) if (kindOf(tk) === current.kind && tk !== current.t) { const px = await loadPrices(tk); compare.push({ t: tk, c: assetWith(tk, px.bars) }); }
  if (compare.length) { render(); writeUrl(); }
}
init();
