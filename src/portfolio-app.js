/**
 * Portfolio page: the visitor enters holdings (stocks, ETFs and crypto in one
 * list), each holding is scored with the same engines as the other pages, and
 * the rule-based analyst (analyst.js) writes strengths, weaknesses and fixes.
 */
import * as M from "./markets-engine.js?v=__V__";
import * as C from "./engine.js?v=__V__";
import { analyze, encodeHoldings, decodeHoldings, LIMITS, exposures } from "./analyst.js?v=__V__";
import { t, getLang } from "./i18n.js?v=__V__";
import { STOCKS, ETFS, stockByTicker, etfByTicker, SECTORS, isCommodity } from "./universe.js?v=__V__";
import { loadSnapshot, weeklyBars, getKey, setKey, callsToday, FREE_DAILY_CALLS, PriceError } from "./markets-api.js?v=__V__";
import { topCoins, marketsFor, coinChart } from "./api.js?v=__V__";
import { priceStats, weeklySeries } from "./prices.js?v=__V__";
import { fmtBig } from "./engine.js?v=__V__";
import { $, el, store, initChrome, applyStatic, dial, locale } from "./ui.js?v=__V__";
import { mountRails, loadMarket, refreshFunds, renderMarket, renderGlance } from "./sidebar.js?v=__V__";
import "./i18n-backtest.js?v=__V__";
import { portfolioHistory } from "./backtest.js?v=__V__";
import { lineChart } from "./linechart.js?v=__V__";

const STORE = "pf-holdings";
const PROFILES = ["aggressive", "defensive", "longterm"];
const EXAMPLES = {
  balanced: [["etf", "VTI", 30000], ["etf", "VXUS", 12000], ["etf", "BND", 15000], ["etf", "GLDM", 4000], ["stock", "MSFT", 4000], ["stock", "JNJ", 3000], ["crypto", "bitcoin", 2000]],
  tech: [["stock", "NVDA", 12000], ["stock", "AAPL", 8000], ["stock", "MSFT", 7000], ["etf", "QQQ", 10000], ["stock", "TSLA", 5000], ["etf", "ARKK", 3000]],
  crypto: [["crypto", "bitcoin", 9000], ["crypto", "ethereum", 6000], ["crypto", "solana", 4000], ["crypto", "dogecoin", 2000], ["etf", "VOO", 4000], ["stock", "PLTR", 2000]],
};
let holdings = []; // [{ kind, id, value }]
let coins = []; // CoinGecko top list
let snap = null, spyBars = null, lastResult = null, busy = false, histYears = 1;
const profile = () => document.querySelector('input[name="profile"]:checked').value;
const blurb = () => M.KINDS.stock.profiles[profile()].blurb;

/* ---------- holdings list ---------- */
function save() { store.set(STORE, JSON.stringify(holdings)); writeUrl(); }
function load() {
  const p = new URLSearchParams(location.search);
  if (p.get("h")) return decodeHoldings(p.get("h"));
  try { const v = JSON.parse(store.get(STORE) || "[]"); return Array.isArray(v) ? decodeHoldings(encodeHoldings(v.filter((h) => h && h.kind && h.id && h.value > 0))) : []; } catch { return []; }
}
function writeUrl() {
  const p = new URLSearchParams();
  if (holdings.length) p.set("h", encodeHoldings(holdings));
  p.set("profile", profile());
  if (getLang() !== "en") p.set("lang", getLang());
  history.replaceState(null, "", `${location.pathname}?${p.toString().replace(/%2C/g, ",").replace(/%3A/g, ":")}`);
}
const label = (h) => (h.kind === "crypto" ? (coins.find((c) => c.id === h.id) || {}).name || h.id : h.kind === "stock" ? `${h.id} · ${stockByTicker(h.id)[1]}` : `${h.id} · ${etfByTicker(h.id).name}`);
const symbol = (h) => (h.kind === "crypto" ? ((coins.find((c) => c.id === h.id) || {}).symbol || h.id).toUpperCase() : h.id);

function resolve(text) {
  const q = String(text || "").trim();
  if (!q) return null;
  const tk = q.split(/[\s·(]/)[0].toUpperCase();
  if (stockByTicker(tk)) return { kind: "stock", id: tk };
  if (etfByTicker(tk)) return { kind: "etf", id: tk };
  const lower = q.toLowerCase().replace(/\s*\([^)]*\)\s*$/, "");
  const coin = coins.find((c) => c.name.toLowerCase() === lower || c.symbol.toLowerCase() === lower || c.id === lower) || coins.find((c) => c.name.toLowerCase().startsWith(lower));
  if (coin) return { kind: "crypto", id: coin.id };
  const st = STOCKS.find(([, n]) => n.toLowerCase().startsWith(lower));
  if (st) return { kind: "stock", id: st[0] };
  const etf = ETFS.find((e) => e.name.toLowerCase().includes(lower));
  return etf ? { kind: "etf", id: etf.t } : null;
}

function addHolding() {
  const r = resolve($("pfAsset").value), v = Number($("pfValue").value);
  if (!r) { $("pfMsg").textContent = t("p_notFound"); return; }
  if (!(v > 0)) { $("pfMsg").textContent = t("p_needValue"); $("pfValue").focus(); return; }
  const i = holdings.findIndex((h) => h.kind === r.kind && h.id === r.id);
  if (i >= 0) holdings[i].value += v; else if (holdings.length >= 40) { $("pfMsg").textContent = t("p_full"); return; } else holdings.push({ ...r, value: v });
  $("pfMsg").textContent = t("p_added", label(r));
  $("pfAsset").value = ""; $("pfValue").value = ""; $("pfAsset").focus();
  save(); renderTable(); lastResult = null; renderResult();
}

function renderTable() {
  const total = holdings.reduce((s, h) => s + h.value, 0);
  $("pfTotal").textContent = holdings.length ? t("p_total", holdings.length, "$" + Math.round(total).toLocaleString("en-US")) : "";
  if (!holdings.length) { $("pfTable").replaceChildren(el("p", { class: "muted", style: "margin:8px 0 0" }, t("p_empty"))); return; }
  const scores = lastResult ? Object.fromEntries(lastResult.items.map((x) => [x.kind + ":" + x.id, x])) : {};
  const rows = holdings.map((h, i) => {
    const input = el("input", { type: "number", min: "1", step: "any", value: String(h.value), class: "pf-v", "aria-label": t("p_valueOf", label(h)) });
    input.addEventListener("change", () => { const v = Number(input.value); if (v > 0) { holdings[i].value = v; save(); renderTable(); if (lastResult) run(); } });
    const rm = el("button", { type: "button", class: "xbtn", "aria-label": t("p_remove", label(h)) }, "×");
    rm.addEventListener("click", () => { holdings.splice(i, 1); save(); renderTable(); if (lastResult) run(); else renderResult(); });
    const s = scores[h.kind + ":" + h.id];
    const sc = s && typeof s.scores[profile()] === "number" ? s.scores[profile()] : null;
    return el("tr", {},
      el("th", { scope: "row" }, el("span", { class: "pf-name" }, label(h)), el("small", { class: "muted" }, t(h.kind === "etf" && isCommodity(h.id) ? "m_kind_commodity" : "p_kind_" + h.kind))),
      el("td", { class: "num" }, input),
      el("td", { class: "num" }, total ? ((h.value / total) * 100).toFixed(1) + "%" : "–"),
      el("td", { class: "num" }, sc === null ? "–" : el("b", {}, (s.partial ? "≈" : "") + sc.toFixed(1))),
      el("td", {}, rm));
  });
  $("pfTable").replaceChildren(el("div", { class: "ctable-wrap" }, el("table", { class: "ctable pf-table" },
    el("thead", {}, el("tr", {}, el("th", {}, t("p_col_asset")), el("th", { class: "num" }, t("p_col_value")), el("th", { class: "num" }, t("p_col_weight")), el("th", { class: "num" }, t("p_col_score")), el("th", {}, ""))),
    el("tbody", {}, ...rows))));
}

/* ---------- scoring each holding ---------- */
async function loadSpy() { if (spyBars) return spyBars; try { spyBars = (await weeklyBars("SPY")).bars; } catch { spyBars = null; } return spyBars; }

async function stockOrEtf(h) {
  const kind = h.kind, base = kind === "stock" ? { t: h.id, name: stockByTicker(h.id)[1], sector: stockByTicker(h.id)[2] } : { t: h.id, name: etfByTicker(h.id).name };
  const entry = { ...base, ...((snap && (kind === "stock" ? snap.stocks[h.id] : snap.etfs[h.id])) || {}) };
  let bars = null, pxErr = null;
  try { bars = (await weeklyBars(h.id)).bars; } catch (e) { pxErr = e instanceof PriceError ? e.kind : "network"; }
  const bench = bars ? await loadSpy() : null;
  const c = M.normalizeAsset({ ...entry, px: bars ? priceStats(bars, h.id === "SPY" ? null : bench) : null }, kind === "etf" && isCommodity(h.id) ? "commodity" : kind);
  const scores = Object.fromEntries(PROFILES.map((k) => [k, M.score(c, k).total]));
  return { ...h, name: c.name, symbol: h.id, scores, partial: M.score(c, profile()).coverage < 100, sector: c.sector, cat: c.cat, er: c.er, yield: c.yield, vol: c.vol, series: bars ? weeklySeries(bars) : null, bars, assetClass: c.assetClass, top: c.top, sectorMix: c.sectorMix, holdings: c.holdings, metal: c.metal || null, pxErr };
}

/** Daily CoinGecko prices → Friday closes, so crypto lines up with the weekly stock data. */
function fridayBars(prices) {
  return (prices || []).filter(([ms]) => new Date(ms).getUTCDay() === 5).map(([ms, p]) => ({ t: Math.floor(ms / 864e5) * 864e5 + 21 * 3600e3, c: p, a: p, v: 0, d: 0 }));
}
async function cryptoHoldings(list) {
  if (!list.length) return [];
  let rows = [];
  try { rows = await marketsFor(list.map((h) => h.id)); } catch { /* scored as unknown */ }
  const out = [];
  for (const h of list) {
    const row = rows.find((r) => r.id === h.id);
    let series = null, vol = null, bars = null;
    try {
      bars = fridayBars((await coinChart(h.id)).prices);
      series = weeklySeries(bars, 52);
      const st = priceStats(bars, null);
      vol = st ? st.vol : null;
    } catch { /* keep going without correlations */ }
    const scores = row ? Object.fromEntries(PROFILES.map((k) => [k, C.quickScore(row, k).total])) : {};
    out.push({ ...h, name: row ? row.name : h.id, symbol: row ? row.symbol.toUpperCase() : h.id, scores, partial: true, assetClass: "crypto", vol, series, bars, yield: 0, stable: row && /usd|dai/i.test(row.symbol) && Math.abs((row.price_change_percentage_24h || 0)) < 1 });
  }
  return out;
}

async function run() {
  if (busy || !holdings.length) { if (!holdings.length) { $("pfMsg").textContent = t("p_emptyRun"); } return; }
  busy = true; $("go").disabled = true;
  status("loading", t("p_loading"));
  try {
    snap = snap || (await loadSnapshot());
    const markets = [];
    for (const h of holdings.filter((x) => x.kind !== "crypto")) markets.push(await stockOrEtf(h)); // one by one: free keys allow a few calls a minute
    const cryptos = await cryptoHoldings(holdings.filter((x) => x.kind === "crypto"));
    const items = holdings.map((h) => [...markets, ...cryptos].find((x) => x.kind === h.kind && x.id === h.id)).filter(Boolean);
    // Stablecoins behave like cash, not like crypto risk.
    items.forEach((x) => { if (x.stable) x.assetClass = "bonds"; });
    await loadSpy(); // benchmark for the history chart
    lastResult = { items, at: new Date() };
    refreshFunds(); // SPY is cached by now
    status("live", t("p_done", new Date().toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" })));
  } catch (e) {
    status("error", t("p_failed"));
  } finally { busy = false; $("go").disabled = false; }
  renderTable(); renderResult(); renderKey();
}

function status(s, text) { $("status").dataset.s = s; $("statusText").textContent = text; }

/* ---------- the analyst's report ---------- */
const CLASS_COLORS = { equity: "var(--s1)", bonds: "var(--s3)", gold: "var(--mid)", commodity: "var(--muted)", crypto: "var(--s2)" };
function renderResult() {
  if (!lastResult) { $("result").replaceChildren(); renderGlance(null); return; }
  const pk = profile();
  const a = analyze(lastResult.items, pk);
  if (a.empty) { $("result").replaceChildren(); renderGlance(null); return; }
  const P = M.KINDS.stock.profiles[pk];
  const v = C.verdict(a.score ?? 1);
  renderGlance({
    title: t("p_score"), sub: t("p_total", a.holdings, "$" + Math.round(a.total).toLocaleString("en-US")), score: a.score, vKey: v[1],
    verdictText: t("fitFor", v[0], t("whoProfile", P.label)),
    risksTitle: t("sb_pfIssues"), noRisks: t("sb_pfNone"),
    risks: a.weaknesses.filter((w) => w.sev !== "info").slice(0, 3).map((w) => [w.sev, w.text]),
    extra: { title: t("sb_pfFixes"), items: a.fixes.slice(0, 3).map((f) => f.text) },
  });
  const noPx = lastResult.items.filter((x) => x.pxErr).map((x) => x.symbol);
  const bubble = el("div", { class: "bot" },
    el("div", { class: "bot-avatar", "aria-hidden": "true" }, botIcon()),
    el("div", { class: "bot-body" },
      el("div", { class: "bot-name" }, t("p_botName"), el("span", { class: "muted" }, " · " + t("p_botRole"))),
      el("p", { class: "bot-lead" }, t("p_lead_" + a.mood, a.score === null ? "–" : a.score.toFixed(1), P.label, a.strengths.length, a.weaknesses.filter((w) => w.sev !== "info").length)),
      section("good", t("p_strengths"), a.strengths, t("p_noStrengths")),
      section("bad", t("p_weaknesses"), a.weaknesses, t("p_noWeaknesses")),
      a.fixes.length ? el("div", { class: "bot-sec fix" }, el("h3", {}, t("p_fixes")), el("ol", {}, ...a.fixes.map((f) => el("li", {}, f.text)))) : null,
      noPx.length ? el("p", { class: "muted", style: "margin:4px 0 0;font-size:.8rem" }, t("p_gapsPx", noPx.join(", "))) : null,
    ));
  const mixBar = el("div", { class: "mixbar", role: "img", "aria-label": Object.entries(a.mix).filter(([, x]) => x > 0).map(([k, x]) => `${t("p_cls_" + k)} ${x}%`).join(", ") },
    ...Object.entries(a.mix).filter(([, x]) => x > 0).map(([k, x]) => el("i", { style: `width:${x}%;background:${CLASS_COLORS[k]}`, title: `${t("p_cls_" + k)} ${x}%` })));
  const mixLegend = el("div", { class: "legend" }, ...Object.entries(a.mix).filter(([, x]) => x > 0).map(([k, x]) => el("span", {}, el("i", { class: "sw", style: `background:${CLASS_COLORS[k]}` }), `${t("p_cls_" + k)} ${x.toFixed(0)}%`)));
  const sectors = Object.entries(a.sectors).filter(([, x]) => x >= 0.5).sort((x, y) => y[1] - x[1]).slice(0, 8);
  const L = LIMITS[pk];
  const sectorBars = sectors.length ? el("div", { class: "cmp" }, ...sectors.map(([s, x]) => el("div", { class: "cmp-row" + (x > L.sector ? " over" : "") }, el("span", {}, t("sector_" + s)), el("div", { class: "track" }, el("i", { style: `width:${Math.min(100, x)}%` })), el("span", { class: "num", style: "text-align:right" }, x.toFixed(0) + "%")))) : el("p", { class: "muted", style: "margin:0" }, t("p_noSectors"));
  const KPI = [
    [t("p_k_vol"), a.vol === null ? t("p_needPx") : `${a.vol.toFixed(0)}%`, a.vol === null ? null : t(a.volMethod === "covariance" ? "p_k_volCov" : "p_k_volAvg", L.vol)],
    [t("p_k_yield"), a.yield === null ? "–" : a.yield.toFixed(2) + "%", a.yield === null ? null : t("p_k_yieldUsd", "$" + Math.round((a.total * a.yield) / 100).toLocaleString("en-US"))],
    [t("p_k_fees"), a.fees ? "$" + a.fees.yearly.toLocaleString("en-US") : "–", a.fees ? t("p_k_feesAvg", a.fees.avg.toFixed(2)) : t("p_k_noEtf")],
    [t("p_k_eff"), a.effectiveN.toFixed(1), t("p_k_effNote", a.holdings)],
  ];
  const other = PROFILES.map((k) => [k, a.scores[k]]);
  const side = el("div", { class: "panel scorecard pf-score" },
    el("div", { class: "eyebrow" }, t("p_score")),
    dial(a.score ?? 1, v[1]),
    el("span", { class: "pill v-" + v[1] }, t("fitFor", v[0], t("whoProfile", P.label))),
    el("div", { class: "cmp" }, el("div", { class: "eyebrow" }, t("p_otherProfiles")),
      ...other.map(([k, s]) => el("div", { class: "cmp-row" + (k === pk ? " on" : "") }, el("span", {}, M.KINDS.stock.profiles[k].label), el("div", { class: "track" }, el("i", { style: `width:${s === null ? 0 : ((s - 1) / 9) * 100}%` })), el("span", { class: "num", style: "text-align:right" }, s === null ? "–" : s.toFixed(1))))),
    el("p", { class: "muted", style: "margin:0;font-size:.78rem" }, t("p_scoreNote", a.holdingsScore === null ? "–" : a.holdingsScore.toFixed(1), a.penalty.toFixed(1))));
  $("result").replaceChildren(el("div", { style: "display:grid;gap:20px" },
    el("div", { class: "hero pf-hero" }, side, el("section", { class: "panel" }, bubble)),
    el("div", { class: "two" },
      el("section", { class: "panel" }, el("h2", { style: "margin-bottom:12px" }, t("p_mix")), mixBar, mixLegend, el("h3", { style: "margin:16px 0 8px" }, t("p_sectors")), sectorBars, el("p", { class: "muted", style: "margin:8px 0 0;font-size:.78rem" }, t("p_sectorsNote", L.sector))),
      el("section", { class: "panel" }, el("h2", { style: "margin-bottom:12px" }, t("p_numbers")), el("div", { class: "metrics pf-kpi" }, ...KPI.map(([k, val, sub]) => el("div", { class: "metric" }, el("span", { class: "k" }, k), el("span", { class: "v" }, val), sub ? el("small", { class: "muted" }, sub) : null))),
        el("p", { class: "muted", style: "margin:12px 0 0;font-size:.78rem" }, t("p_limits", P.label, L.vol, L.crypto, L.single, L.sector, L.safeMin))),
    ),
    historyPanel(),
  ));
}
/* ---------- how today's mix did over the last 1–5 years, vs the S&P 500 ---------- */
function historyPanel() {
  const items = lastResult.items.map((x) => ({ symbol: x.symbol, value: holdings.find((h) => h.kind === x.kind && h.id === x.id)?.value || 0, bars: x.bars }));
  const hist = portfolioHistory(items, spyBars, { years: histYears });
  const buttons = el("div", { class: "ph-years", role: "group", "aria-label": t("ph_title") }, ...[1, 3, 5].map((n) => {
    const b = el("button", { type: "button", "aria-pressed": String(n === histYears) }, t("ph_years", n));
    b.addEventListener("click", () => { histYears = n; renderResult(); document.getElementById("phPanel")?.scrollIntoView({ block: "nearest" }); });
    return b;
  }));
  const head = el("div", { class: "ph-head" }, el("h2", {}, t("ph_title")), buttons);
  if (!hist) return el("section", { class: "panel ph", id: "phPanel" }, head, el("p", { class: "muted", style: "margin:12px 0 0" }, t("ph_none")));
  const S = hist.stats, pct = (v) => (v === null || v === undefined ? "–" : (v > 0 ? "+" : "") + v.toFixed(1) + "%");
  const cls = (v) => (v > 0 ? "up" : v < 0 ? "down" : "");
  const day = (d) => new Date(d + "T12:00:00Z").toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" });
  const series = [{ label: t("ph_port"), values: hist.port, color: "var(--s1)" }];
  if (hist.bench) series.push({ label: t("ph_spy"), values: hist.bench, color: "var(--muted)", dash: true });
  const rows = [["ph_r_total", "total"], ["ph_r_cagr", "cagr"], ["ph_r_dd", "maxDD"], ["ph_r_vol", "vol"]]
    .filter(([, k]) => k !== "cagr" || S.port.cagr !== null)
    .map(([lk, k]) => el("tr", {}, el("td", {}, t(lk)),
      el("td", { class: "num " + (k === "vol" ? "" : cls(S.port[k])) }, k === "vol" ? (S.port.vol === null ? "–" : S.port.vol.toFixed(1) + "%") : pct(S.port[k])),
      hist.bench ? el("td", { class: "num " + (k === "vol" ? "" : cls(S.bench[k])) }, k === "vol" ? (S.bench.vol === null ? "–" : S.bench.vol.toFixed(1) + "%") : pct(S.bench[k])) : null));
  const notes = [
    hist.bench ? t("ph_vs", S.port.total - S.bench.total) : t("ph_noBench"),
    hist.shortened.length ? t("ph_short", hist.shortened.join(", "), day(hist.start)) : null,
    hist.missing.length ? t("ph_missing", hist.missing.join(", ")) : null,
    hist.covered < 100 ? t("ph_covered", hist.covered) : null,
    t("ph_ddNote"),
  ].filter(Boolean);
  return el("section", { class: "panel ph", id: "phPanel" },
    el("div", { class: "ph-body" },
      head,
      el("p", { class: "muted", style: "margin:0;font-size:.86rem" }, t("ph_note", day(hist.start))),
      lineChart({ times: hist.times, series, aria: t("ph_aria") }),
      el("div", { class: "tbl-wrap" }, el("table", { class: "ph-stats" },
        el("thead", {}, el("tr", {}, el("th", {}, ""), el("th", { class: "num" }, t("ph_port")), hist.bench ? el("th", { class: "num" }, t("ph_spy")) : null)),
        el("tbody", {}, ...rows))),
      el("ul", { class: "ph-notes" }, ...notes.map((n) => el("li", {}, n)))));
}

function section(kind, title, items, empty) {
  return el("div", { class: "bot-sec " + kind }, el("h3", {}, title), items.length ? el("ul", {}, ...items.map((x) => el("li", { class: x.sev ? "sev-" + x.sev : "" }, x.text))) : el("p", { class: "muted", style: "margin:0" }, empty));
}
function botIcon() {
  const NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 32 32");
  svg.innerHTML = '<rect x="6" y="9" width="20" height="16" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12.5" cy="17" r="2" fill="currentColor"/><circle cx="19.5" cy="17" r="2" fill="currentColor"/><path d="M16 9V5M13 21.5h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
  return svg;
}

/* ---------- prices key (same key as the Stocks & ETFs page) ---------- */
function renderKey() {
  const key = getKey(), n = callsToday();
  const hasMarkets = holdings.some((h) => h.kind !== "crypto");
  $("keyPanel").hidden = !hasMarkets;
  $("keyState").textContent = snap && snap.prices ? t("m_pxPublished") : key ? t("m_pxKeyOn", n, FREE_DAILY_CALLS) : t("m_pxKeyOff");
  const input = el("input", { type: "password", id: "avKey", autocomplete: "off", spellcheck: "false", placeholder: t("m_pxKeyPh") });
  const sv = el("button", { type: "button", class: "primary" }, t("m_pxSave"));
  const rm = el("button", { type: "button", class: "ghost" }, t("m_pxRemove")); rm.hidden = !key;
  sv.addEventListener("click", () => { if (input.value.trim()) { setKey(input.value); renderKey(); if (lastResult) run(); else refreshFunds(); } });
  rm.addEventListener("click", () => { setKey(""); renderKey(); });
  $("keyBody").replaceChildren(
    el("p", { class: "muted", style: "margin:0;font-size:.85rem" }, t("p_pxHelp"), " ", el("a", { href: "https://www.alphavantage.co/support/#api-key", target: "_blank", rel: "noopener" }, t("m_pxGetKey"))),
    el("div", { class: "cmp-add", style: "margin:10px 0 0" }, input, sv, rm),
    key ? el("p", { class: "muted", style: "margin:8px 0 0;font-size:.8rem" }, t("m_pxKeyNote", n, FREE_DAILY_CALLS)) : null);
}

function renderMethod() {
  const rows = PROFILES.map((k) => { const L = LIMITS[k]; return el("tr", {}, el("td", {}, M.KINDS.stock.profiles[k].label), el("td", { class: "num mono" }, L.vol + "%"), el("td", { class: "num mono" }, L.crypto + "%"), el("td", { class: "num mono" }, L.single + "%"), el("td", { class: "num mono" }, L.sector + "%"), el("td", { class: "num mono" }, L.safeMin + "%")); });
  $("methodBody").replaceChildren(
    el("p", {}, t("p_method1")),
    el("div", { class: "wtable-wrap" }, el("table", { class: "w" }, el("thead", {}, el("tr", {}, el("th", {}, ""), ...["p_m_vol", "p_m_crypto", "p_m_single", "p_m_sector", "p_m_safe"].map((k) => el("th", { class: "num" }, t(k))))), el("tbody", {}, ...rows))),
    el("p", {}, t("p_method2")),
    el("p", {}, t("p_method3")),
  );
}

/* ---------- boot ---------- */
function relabel() { applyStatic(); renderMarket(); $("profNote").textContent = blurb(); renderExamples(); renderTable(); renderResult(); renderKey(); renderMethod(); writeUrl(); }
function renderExamples() {
  $("pfExamples").replaceChildren(el("span", { class: "muted", style: "font-size:.82rem" }, t("p_examples")), ...Object.keys(EXAMPLES).map((k) => {
    const b = el("button", { type: "button" }, t("p_ex_" + k));
    b.addEventListener("click", () => { holdings = EXAMPLES[k].map(([kind, id, value]) => ({ kind, id, value })); save(); renderTable(); renderKey(); run(); });
    return b;
  }));
}
async function init() {
  initChrome(relabel);
  mountRails();
  loadMarket({ funds: false });
  const openKey = () => { if (location.hash === "#keyPanel" && !$("keyPanel").hidden) { $("keyPanel").open = true; $("keyPanel").scrollIntoView({ block: "start" }); } };
  addEventListener("hashchange", openKey);
  const p = new URLSearchParams(location.search);
  const start = (p.get("profile") && PROFILES.includes(p.get("profile")) && p.get("profile")) || store.get("cs-profile");
  if (start && PROFILES.includes(start)) $("p-" + start).checked = true;
  $("profNote").textContent = blurb();
  holdings = load();
  document.querySelectorAll('input[name="profile"]').forEach((r) => r.addEventListener("change", () => { store.set("cs-profile", profile()); $("profNote").textContent = blurb(); writeUrl(); renderTable(); renderResult(); }));
  $("pfAddBtn").addEventListener("click", addHolding);
  ["pfAsset", "pfValue"].forEach((id) => $(id).addEventListener("keydown", (e) => { if (e.key === "Enter") { if (id === "pfAsset" && !$("pfValue").value) $("pfValue").focus(); else addHolding(); } }));
  $("go").addEventListener("click", run);
  const opts = () => [...STOCKS.map(([tk, n]) => `${tk} · ${n}`), ...ETFS.map((e) => `${e.t} · ${e.name}`), ...coins.slice(0, 150).map((c) => `${c.name} (${c.symbol})`)];
  $("pfList").replaceChildren(...opts().map((v) => el("option", { value: v })));
  renderExamples(); renderTable(); renderMethod(); renderKey(); writeUrl();
  try { coins = (await topCoins()).map((r) => ({ id: r.id, name: r.name, symbol: (r.symbol || "").toUpperCase() })); $("pfList").replaceChildren(...opts().map((v) => el("option", { value: v }))); renderTable(); } catch { /* crypto names fall back to ids */ }
  if (holdings.length) await run(); else refreshFunds();
  openKey();
}
init();
