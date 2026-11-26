/**
 * Scoring engine for stocks and ETFs. Same model as the crypto engine
 * (engine.js): seven factors scored 0-10 from fixed thresholds, weighted by the
 * investor profile, mapped to a 1-10 score. Pure functions, no DOM or network.
 */
import { t } from "./i18n.js?v=__V__";
import "./i18n-markets.js?v=__V__";
import { lin, clamp, fmtBig, fmtPct, verdict } from "./engine.js?v=__V__";
import { stockByTicker, etfByTicker, ETF_ASSET_CLASS } from "./universe.js?v=__V__";

const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);
const log10 = (x) => Math.log10(Math.max(x, 1e-9));
const avg = (parts) => { const p = parts.filter((x) => x[0] !== null); if (!p.length) return null; const w = p.reduce((s, x) => s + x[1], 0); return p.reduce((s, x) => s + x[0] * x[1], 0) / w; };
const na = "n/a";
const fx = (v, d = 1, suf = "") => (v === null ? na : v.toFixed(d) + suf);
const ratio = (a, b) => (num(a) !== null && num(b) ? a / b : null);

/**
 * Turn one snapshot entry (markets.json) into the flat object the factors read.
 * kind is "stock" or "etf". Ratios are computed here so the UI can show them.
 */
export function normalizeAsset(entry, kind) {
  if (!entry) return null;
  const px = entry.px || {}, f = entry.fin || {};
  const base = {
    kind, id: entry.t, t: entry.t, symbol: entry.t, name: entry.name,
    price: num(px.price), asOf: px.asOf || null, stale: !!px.stale,
    r1m: num(px.r1m), r3m: num(px.r3m), r6m: num(px.r6m), r1y: num(px.r1y), cagr3y: num(px.cagr3y), cagr5y: num(px.cagr5y),
    fromHigh: num(px.fromHigh), hi52: num(px.hi52), lo52: num(px.lo52), vsMa200: num(px.vsMa200),
    vol: num(px.vol), dd1y: num(px.dd1y), dd5y: num(px.dd5y), beta: num(px.beta),
    yield: num(px.yield), divTtm: num(px.divTtm), dollarVol: num(px.dollarVol), historyYears: num(px.historyYears),
    weekly: px.weekly || null, news: Array.isArray(entry.news) ? entry.news : [], priceSource: entry.priceSource || null,
  };
  if (kind === "etf") {
    const e = etfByTicker(entry.t) || {};
    return { ...base, name: e.name || entry.name, cat: e.cat || null, issuer: e.issuer || null, er: num(e.er), holdings: num(e.holdings), top10: num(e.top10), aum: num(e.aum) === null ? null : e.aum * 1e9, since: num(e.since), top: e.top || [], sectorMix: e.sectors || null, crypto: e.crypto || null, assetClass: e.crypto ? "crypto" : ETF_ASSET_CLASS[e.cat] || "equity" };
  }
  const s = stockByTicker(entry.t);
  const mcap = base.price !== null && num(f.shares) ? base.price * f.shares : null;
  const eps = num(f.eps);
  return {
    ...base, sector: entry.sector || (s && s[2]) || null, assetClass: "equity", cik: entry.cik || null,
    mcap, revenue: num(f.revenue), netIncome: num(f.netIncome), opIncome: num(f.opIncome), eps, fcf: num(f.fcf),
    equity: num(f.equity), assets: num(f.assets), cash: num(f.cash), debt: num(f.debt),
    revGrowth: num(f.revGrowth), revCagr3: num(f.revCagr3), epsGrowth: num(f.epsGrowth),
    periodEnd: f.periodEnd || null, hasFin: num(f.revenue) !== null || num(f.netIncome) !== null,
    pe: eps !== null && eps > 0 && base.price !== null ? base.price / eps : null,
    ps: ratio(mcap, f.revenue), pb: num(f.equity) > 0 ? ratio(mcap, f.equity) : null,
    fcfYield: num(f.fcf) !== null && mcap ? (f.fcf / mcap) * 100 : null,
    netMargin: ratio(f.netIncome, f.revenue) === null ? null : (f.netIncome / f.revenue) * 100,
    opMargin: ratio(f.opIncome, f.revenue) === null ? null : (f.opIncome / f.revenue) * 100,
    roe: num(f.equity) > 0 && num(f.netIncome) !== null ? (f.netIncome / f.equity) * 100 : null,
    de: num(f.equity) > 0 && num(f.debt) !== null ? f.debt / f.equity : null,
    negEquity: num(f.equity) !== null && f.equity <= 0,
    eqAssets: num(f.equity) !== null && num(f.assets) ? (f.equity / f.assets) * 100 : null,
    payout: eps > 0 && num(px.divTtm) ? (px.divTtm / eps) * 100 : null,
  };
}

const factor = (key, run) => ({ key, get name() { return t("mf_" + key); }, get what() { return t("mf_" + key + "_what"); }, run });
const isFin = (c) => c.sector === "financials" || c.sector === "realestate";

const STOCK_FACTORS = [
  factor("valuation", (c) => {
    if (!c.hasFin) return { score: null, notes: [t("mn_noFin")], inputs: [], missing: true };
    const peS = c.eps !== null && c.eps <= 0 ? 0 : c.pe === null ? null : lin(c.pe, 45, 12);
    const fcfS = isFin(c) || c.fcfYield === null ? null : lin(c.fcfYield, 0, 6);
    const psS = isFin(c) || c.ps === null ? null : lin(c.ps, 15, 1.5);
    const pbS = isFin(c) && c.pb !== null ? lin(c.pb, 4, 1) : null;
    const notes = [];
    if (c.eps !== null && c.eps <= 0) notes.push(t("mn_losses"));
    else if (c.pe !== null) notes.push(t("mn_pe", c.pe.toFixed(1)));
    if (fcfS !== null) notes.push(t("mn_fcfYield", c.fcfYield.toFixed(1)));
    if (pbS !== null) notes.push(t("mn_pb", c.pb.toFixed(2)));
    return { score: avg([[peS, 0.5], [fcfS, 0.3], [psS, 0.2], [pbS, 0.3]]), notes, inputs: [[t("mi_pe"), c.pe === null ? (c.eps !== null && c.eps <= 0 ? t("mi_neg") : na) : c.pe.toFixed(1)], [t("mi_fcfYield"), fx(c.fcfYield, 1, "%")], [isFin(c) ? t("mi_pb") : t("mi_ps"), isFin(c) ? fx(c.pb, 2) : fx(c.ps, 1)], [t("mi_mcap"), fmtBig(c.mcap)]] };
  }),
  factor("growth", (c) => {
    if (!c.hasFin) return { score: null, notes: [t("mn_noFin")], inputs: [], missing: true };
    const s = avg([[c.revGrowth === null ? null : lin(c.revGrowth, -5, 25), 0.4], [c.epsGrowth === null ? null : lin(c.epsGrowth, -20, 40), 0.3], [c.revCagr3 === null ? null : lin(c.revCagr3, -2, 20), 0.3]]);
    const notes = [];
    if (c.revGrowth !== null) notes.push(t("mn_revGrowth", fmtPct(c.revGrowth), c.revCagr3 !== null ? fmtPct(c.revCagr3) : null));
    if (c.epsGrowth !== null) notes.push(t("mn_epsGrowth", fmtPct(c.epsGrowth)));
    return { score: s, notes, inputs: [[t("mi_revGrowth"), fmtPct(c.revGrowth)], [t("mi_revCagr3"), fmtPct(c.revCagr3)], [t("mi_epsGrowth"), fmtPct(c.epsGrowth)], [t("mi_revenue"), fmtBig(c.revenue)]] };
  }),
  factor("profit", (c) => {
    if (!c.hasFin) return { score: null, notes: [t("mn_noFin")], inputs: [], missing: true };
    const s = avg([[c.netMargin === null ? null : lin(c.netMargin, 0, 30), 0.35], [c.roe === null ? (c.negEquity && c.netIncome > 0 ? 7 : null) : lin(c.roe, 0, 30), 0.35], [c.opMargin === null ? null : lin(c.opMargin, 0, 35), 0.3]]);
    const notes = [];
    if (c.netMargin !== null) notes.push(t("mn_margin", c.netMargin.toFixed(1)));
    if (c.roe !== null) notes.push(t("mn_roe", c.roe.toFixed(1)));
    else if (c.negEquity) notes.push(t("mn_negEquityRoe"));
    return { score: s, notes, inputs: [[t("mi_netMargin"), fx(c.netMargin, 1, "%")], [t("mi_opMargin"), fx(c.opMargin, 1, "%")], [t("mi_roe"), fx(c.roe, 1, "%")], [t("mi_netIncome"), fmtBig(c.netIncome)]] };
  }),
  factor("health", (c) => {
    if (!c.hasFin) return { score: null, notes: [t("mn_noFin")], inputs: [], missing: true };
    if (c.sector === "financials") {
      const s = c.eqAssets === null ? null : lin(c.eqAssets, 5, 15);
      return { score: s, notes: [s === null ? t("mn_noBalance") : t("mn_bankCapital", c.eqAssets.toFixed(1))], inputs: [[t("mi_eqAssets"), fx(c.eqAssets, 1, "%")], [t("mi_equity"), fmtBig(c.equity)], [t("mi_assets"), fmtBig(c.assets)]], missing: s === null };
    }
    const deS = c.negEquity ? 2 : c.de === null ? null : lin(c.de, 2.5, 0.2);
    const payback = c.debt !== null && c.fcf !== null ? (c.fcf > 0 ? c.debt / c.fcf : Infinity) : null;
    const payS = payback === null ? null : payback === Infinity ? 0 : lin(payback, 8, 1);
    const notes = [];
    if (c.negEquity) notes.push(t("mn_negEquity"));
    else if (c.de !== null) notes.push(t("mn_de", c.de.toFixed(2)));
    if (payback !== null) notes.push(payback === Infinity ? t("mn_noFcf") : t("mn_payback", payback.toFixed(1)));
    return { score: avg([[deS, 0.5], [payS, 0.5]]), notes, inputs: [[t("mi_de"), c.negEquity ? t("mi_negEq") : fx(c.de, 2)], [t("mi_debt"), fmtBig(c.debt)], [t("mi_cash"), fmtBig(c.cash)], [t("mi_fcf"), fmtBig(c.fcf)]] };
  }),
  factor("dividend", (c) => {
    if (c.yield === null) return { score: null, notes: [t("mn_noPrice")], inputs: [], missing: true };
    if (!c.yield) return { score: 1, notes: [t("mn_noDividend")], inputs: [[t("mi_yield"), "0%"]] };
    const yS = lin(c.yield, 0, 4);
    const pS = c.payout === null ? null : c.payout <= 60 ? 10 : lin(c.payout, 110, 60);
    const notes = [t("mn_yield", c.yield.toFixed(2))];
    if (c.payout !== null) notes.push(c.payout > 100 ? t("mn_payoutHigh", c.payout.toFixed(0)) : t("mn_payout", c.payout.toFixed(0)));
    return { score: avg([[yS, 0.6], [pS, 0.4]]), notes, inputs: [[t("mi_yield"), fx(c.yield, 2, "%")], [t("mi_payout"), fx(c.payout, 0, "%")], [t("mi_divTtm"), c.divTtm ? "$" + c.divTtm.toFixed(2) : na]] };
  }),
  factor("momentum", momentum),
  factor("risk", (c) => {
    const parts = [[c.vol === null ? null : lin(c.vol, 60, 15), 0.35], [c.dd1y === null ? null : lin(c.dd1y, -50, -8), 0.25], [c.beta === null ? null : lin(c.beta, 2, 0.6), 0.2], [c.mcap ? lin(log10(c.mcap), 10, 12) : null, 0.2]];
    const notes = [];
    if (c.vol !== null) notes.push(t("mn_vol", c.vol.toFixed(0)));
    if (c.dd1y !== null) notes.push(t("mn_dd1y", Math.abs(c.dd1y).toFixed(0)));
    if (c.beta !== null) notes.push(t("mn_beta", c.beta.toFixed(2)));
    return { score: avg(parts), notes, inputs: [[t("mi_vol"), fx(c.vol, 0, "%")], [t("mi_dd1y"), fmtPct(c.dd1y, 0)], [t("mi_beta"), fx(c.beta, 2)], [t("mi_mcap"), fmtBig(c.mcap)]] };
  }),
];

function momentum(c) {
  const s = avg([[c.r1m === null ? null : lin(c.r1m, -10, 10), 0.15], [c.r6m === null ? null : lin(c.r6m, -20, 30), 0.35], [c.r1y === null ? null : lin(c.r1y, -30, 50), 0.3], [c.vsMa200 === null ? null : lin(c.vsMa200, -15, 15), 0.2]]);
  const notes = [];
  if (c.r1y !== null) notes.push(t("mn_ret", fmtPct(c.r6m), fmtPct(c.r1y)));
  if (c.vsMa200 !== null) notes.push(c.vsMa200 >= 0 ? t("mn_aboveMa", c.vsMa200.toFixed(1)) : t("mn_belowMa", Math.abs(c.vsMa200).toFixed(1)));
  if (s === null) notes.push(t("mn_noPrice"));
  return { score: s, notes, inputs: [[t("mi_1m"), fmtPct(c.r1m)], [t("mi_6m"), fmtPct(c.r6m)], [t("mi_1y"), fmtPct(c.r1y)], [t("mi_ma200"), fmtPct(c.vsMa200)]] };
}

const ETF_FACTORS = [
  factor("cost", (c) => {
    if (c.er === null) return { score: null, notes: [t("mn_noFacts")], inputs: [], missing: true };
    const per10k = c.er * 100; // dollars a year on $10,000
    return { score: lin(c.er, 0.75, 0.03), notes: [t("mn_er", c.er.toFixed(c.er < 0.1 ? 3 : 2), per10k.toFixed(0))], inputs: [[t("mi_er"), c.er.toFixed(c.er < 0.1 ? 3 : 2) + "%"], [t("mi_per10k"), "$" + per10k.toFixed(0)]] };
  }),
  factor("diversif", (c) => {
    if (c.holdings === null) return { score: null, notes: [t("mn_noFacts")], inputs: [], missing: true };
    if (c.holdings <= 1) return { score: 2, notes: [t("mn_single")], inputs: [[t("mi_holdings"), "1"]] };
    const s = avg([[lin(log10(c.holdings), log10(20), log10(3000)), 0.5], [c.top10 === null ? null : lin(c.top10, 70, 15), 0.5]]);
    const notes = [t("mn_holdings", c.holdings.toLocaleString("en-US"), c.top10)];
    if (c.cat === "sector") notes.push(t("mn_sectorFund"));
    return { score: c.cat === "sector" ? Math.min(s, 5) : s, notes, inputs: [[t("mi_holdings"), c.holdings.toLocaleString("en-US")], [t("mi_top10"), fx(c.top10, 0, "%")]] };
  }),
  factor("size", (c) => {
    const s = avg([[c.aum ? lin(log10(c.aum), 9, log10(3e11)) : null, 0.6], [c.dollarVol ? lin(log10(c.dollarVol), log10(5e6), log10(5e9)) : null, 0.4]]);
    const notes = [];
    if (c.aum) notes.push(t("mn_aum", fmtBig(c.aum)));
    if (c.dollarVol) notes.push(t("mn_dollarVol", fmtBig(c.dollarVol)));
    return { score: s, notes, inputs: [[t("mi_aum"), fmtBig(c.aum)], [t("mi_dollarVol"), fmtBig(c.dollarVol)]] };
  }),
  factor("perf", (c) => {
    const s = avg([[c.r1y === null ? null : lin(c.r1y, -20, 30), 0.3], [c.cagr3y === null ? null : lin(c.cagr3y, -5, 20), 0.35], [c.cagr5y === null ? null : lin(c.cagr5y, -5, 18), 0.35]]);
    const notes = [];
    if (c.r1y !== null) notes.push(t("mn_perf", fmtPct(c.r1y), c.cagr3y !== null ? fmtPct(c.cagr3y) : null, c.cagr5y !== null ? fmtPct(c.cagr5y) : null));
    if (s === null) notes.push(t("mn_noPrice"));
    return { score: s, notes, inputs: [[t("mi_1y"), fmtPct(c.r1y)], [t("mi_cagr3"), fmtPct(c.cagr3y)], [t("mi_cagr5"), fmtPct(c.cagr5y)]] };
  }),
  factor("erisk", (c) => {
    const dd = c.dd5y ?? c.dd1y;
    const s = avg([[c.vol === null ? null : lin(c.vol, 40, 8), 0.4], [dd === null ? null : lin(dd, -60, -10), 0.35], [c.beta === null ? null : lin(Math.abs(c.beta), 1.6, 0.3), 0.25]]);
    const notes = [];
    if (c.vol !== null) notes.push(t("mn_vol", c.vol.toFixed(0)));
    if (dd !== null) notes.push(t(c.dd5y !== null ? "mn_dd5y" : "mn_dd1y", Math.abs(dd).toFixed(0)));
    return { score: s, notes, inputs: [[t("mi_vol"), fx(c.vol, 0, "%")], [c.dd5y !== null ? t("mi_dd5y") : t("mi_dd1y"), fmtPct(dd, 0)], [t("mi_beta"), fx(c.beta, 2)]] };
  }),
  factor("income", (c) => {
    if (c.yield === null) return { score: null, notes: [t("mn_noPrice")], inputs: [], missing: true };
    return { score: lin(c.yield, 0, 4), notes: [c.yield ? t("mn_yield", c.yield.toFixed(2)) : t("mn_noDistrib")], inputs: [[t("mi_yield"), fx(c.yield, 2, "%")]] };
  }),
  factor("track", (c) => {
    if (c.since === null) return { score: null, notes: [t("mn_noFacts")], inputs: [], missing: true };
    const yrs = new Date().getFullYear() - c.since;
    return { score: lin(yrs, 1, 20), notes: [t("mn_since", c.since, yrs)], inputs: [[t("mi_since"), String(c.since)], [t("mi_issuer"), c.issuer || na]] };
  }),
];

const profile = (key, weights) => ({ key, get label() { return t("profile_" + key); }, get blurb() { return t("mblurb_" + key); }, weights });
export const KINDS = {
  stock: {
    factors: STOCK_FACTORS,
    profiles: {
      aggressive: profile("aggressive", { valuation: 10, growth: 30, profit: 15, health: 5, dividend: 0, momentum: 30, risk: 10 }),
      defensive: profile("defensive", { valuation: 20, growth: 5, profit: 20, health: 25, dividend: 15, momentum: 0, risk: 15 }),
      longterm: profile("longterm", { valuation: 20, growth: 25, profit: 25, health: 15, dividend: 5, momentum: 5, risk: 5 }),
    },
  },
  etf: {
    factors: ETF_FACTORS,
    profiles: {
      aggressive: profile("aggressive", { cost: 10, diversif: 10, size: 10, perf: 45, erisk: 15, income: 0, track: 10 }),
      defensive: profile("defensive", { cost: 15, diversif: 20, size: 15, perf: 5, erisk: 30, income: 10, track: 5 }),
      longterm: profile("longterm", { cost: 30, diversif: 20, size: 10, perf: 15, erisk: 10, income: 5, track: 10 }),
    },
  },
};
export const PROFILE_KEYS = ["aggressive", "defensive", "longterm"];

export function flags(c) {
  const f = [];
  if (c.stale) f.push(["mid", t("mfl_stale", c.asOf)]);
  if (c.kind === "stock") {
    if (c.eps !== null && c.eps <= 0) f.push(["high", t("mfl_losses")]);
    if (c.negEquity) f.push(["mid", t("mfl_negEquity")]);
    if (c.de !== null && c.de > 2 && c.sector !== "financials") f.push(["mid", t("mfl_debt", c.de.toFixed(1))]);
    if (c.payout !== null && c.payout > 100) f.push(["mid", t("mfl_payout", c.payout.toFixed(0))]);
    if (c.pe !== null && c.pe > 60) f.push(["mid", t("mfl_pe", c.pe.toFixed(0))]);
    if (c.revGrowth !== null && c.revGrowth < -5) f.push(["mid", t("mfl_shrinking", Math.abs(c.revGrowth).toFixed(0))]);
    if (!c.hasFin) f.push(["info", t("mfl_noFin")]);
  } else {
    if (c.er !== null && c.er >= 0.5) f.push(["mid", t("mfl_er", c.er.toFixed(2))]);
    if (c.top10 !== null && c.top10 >= 60 && c.holdings > 1) f.push(["mid", t("mfl_top10", c.top10)]);
    if (c.aum !== null && c.aum < 5e9) f.push(["info", t("mfl_small", fmtBig(c.aum))]);
    if (c.cat === "sector" || c.cat === "thematic") f.push(["info", t("mfl_narrow")]);
    if (c.crypto) f.push(["info", t("mfl_crypto")]);
  }
  if (c.vol !== null && c.vol > 50) f.push(["high", t("mfl_vol", c.vol.toFixed(0))]);
  if (c.dd1y !== null && c.dd1y < -40) f.push(["high", t("mfl_dd", Math.abs(c.dd1y).toFixed(0))]);
  return f;
}

/** Keep only known factor keys of a kind with finite, non-negative numbers. */
export function sanitizeWeights(kind, w) {
  const out = {};
  for (const F of KINDS[kind].factors) { const v = Number(w && w[F.key]); if (Number.isFinite(v) && v >= 0) out[F.key] = v; }
  return out;
}

/** Score a normalised stock or ETF for a profile; customWeights override the profile weights. */
export function score(c, profileKey, customWeights) {
  const K = KINDS[c.kind], base = K.profiles[profileKey];
  const p = customWeights ? { key: base.key, label: base.label, blurb: base.blurb, weights: { ...base.weights, ...sanitizeWeights(c.kind, customWeights) }, custom: true } : base;
  const factors = K.factors.map((F) => ({ key: F.key, name: F.name, what: F.what, weight: p.weights[F.key], ...F.run(c) }));
  const used = factors.filter((f) => f.score !== null && f.weight > 0);
  const wsum = used.reduce((s, f) => s + f.weight, 0);
  const raw = wsum ? used.reduce((s, f) => s + f.score * f.weight, 0) / wsum : 0;
  factors.forEach((f) => { f.effWeight = f.score !== null && f.weight > 0 && wsum ? (f.weight / wsum) * 100 : 0; f.contrib = f.score !== null && wsum ? (f.score * f.weight) / wsum : 0; });
  let total = 1 + raw * 0.9;
  const caps = [];
  const cap = (limit, text) => { if (total > limit) caps.push(text); total = Math.min(total, limit); };
  if (c.kind === "stock") {
    if (profileKey === "defensive" && c.vol !== null && c.vol > 45) cap(5, t("mcap_defVol", c.vol.toFixed(0)));
    if (profileKey === "longterm" && c.eps !== null && c.eps <= 0) cap(6, t("mcap_ltLoss"));
  } else {
    if (profileKey === "longterm" && c.er !== null && c.er >= 0.5) cap(6, t("mcap_ltFee", c.er.toFixed(2)));
    if (profileKey === "defensive" && c.vol !== null && c.vol > 35) cap(5, t("mcap_defVol", c.vol.toFixed(0)));
  }
  total = Math.round(clamp(total, 1, 10) * 10) / 10;
  const weighted = factors.filter((f) => f.weight > 0);
  const missing = weighted.filter((f) => f.score === null).map((f) => f.name);
  const coverage = weighted.length ? Math.round((used.length / weighted.length) * 100) : 0;
  return { total, raw, factors, caps, missing, coverage, flags: flags(c), profile: p, profileKey };
}

export function recommend(c, r) {
  const k = r.profileKey, total = r.total;
  const sorted = r.factors.filter((f) => f.score !== null && f.weight > 0).sort((a, b) => b.weight * (10 - b.score) - a.weight * (10 - a.score));
  const weak = sorted.filter((f) => f.score < 5).slice(0, 2);
  const strong = r.factors.filter((f) => f.score !== null && f.weight > 0 && f.score >= 7).sort((a, b) => b.contrib - a.contrib).slice(0, 2);
  const [hi, mid] = { aggressive: [7, 5], defensive: [7.5, 5.5], longterm: [7.5, 5.5] }[k];
  const out = [[t("r_role"), t(`mrole_${c.kind}_${k}_${total >= hi ? "hi" : total >= mid ? "mid" : "lo"}`)]];
  if (strong.length) out.push([t("r_supports"), strong.map((f) => `${f.name} (${f.score.toFixed(1)}/10): ${f.notes[0]}`).join(" ")]);
  weak.forEach((f) => out.push([t("r_watch", f.name), t("mchk_" + f.key)]));
  if (r.missing.length) out.push([t("r_gaps"), t("r_gapsBody", r.missing)]);
  return out;
}

/** Encode / decode weights for the URL as comma-separated numbers in factor order. */
export const encodeWeights = (kind, w) => KINDS[kind].factors.map((F) => Math.round(w[F.key] || 0)).join(",");
export function decodeWeights(kind, str) {
  const F = KINDS[kind].factors, parts = String(str || "").split(",").map(Number);
  if (parts.length !== F.length || parts.some((n) => !Number.isFinite(n) || n < 0) || !parts.some((n) => n > 0)) return null;
  return Object.fromEntries(F.map((x, i) => [x.key, parts[i]]));
}

export { verdict };
