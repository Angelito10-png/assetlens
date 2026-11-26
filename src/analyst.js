/**
 * Portfolio analyst: a rule-based "bot" that reads a mixed portfolio of stocks,
 * ETFs and crypto and writes what works, what doesn't and what to fix, for the
 * chosen investor profile. Every sentence comes from a rule with its numbers,
 * so the advice is reproducible and testable. Pure functions, no DOM or network.
 *
 * A holding: { id, kind: "stock"|"etf"|"crypto", name, symbol, value (USD),
 *   scores: {aggressive, defensive, longterm} (1-10), sector?, cat?, er?, yield?,
 *   vol? (annual %), series? (weeklySeries), assetClass, top?, sectorMix?, holdings? }
 */
import { t } from "./i18n.js?v=__V__";
import "./i18n-markets.js?v=__V__";
import { portfolioVol, correlation } from "./prices.js?v=__V__";
import { ETFS } from "./universe.js?v=__V__";

/** What each profile can live with. Ranges are rules of thumb, documented in the README. */
export const LIMITS = {
  aggressive: { vol: 32, crypto: 25, safeMin: 0, single: 30, sector: 50 },
  defensive: { vol: 13, crypto: 5, safeMin: 25, single: 15, sector: 30 },
  longterm: { vol: 20, crypto: 10, safeMin: 0, single: 20, sector: 40 },
};
const BROAD_HOLDINGS = 100; // funds with at least this many holdings don't count as concentration
const pct = (x) => Math.round(x * 10) / 10;
const fmt0 = (x) => String(Math.round(x));
const usd = (x) => "$" + Math.round(x).toLocaleString("en-US");

/** Value-weighted shares of the portfolio by asset class, sector and holding. */
export function exposures(holdings) {
  const total = holdings.reduce((s, h) => s + (h.value > 0 ? h.value : 0), 0);
  const w = (h) => (total ? h.value / total : 0);
  const mix = { equity: 0, bonds: 0, gold: 0, crypto: 0 };
  const sectors = {};
  let intl = 0, equityKnown = 0;
  for (const h of holdings) {
    const share = w(h) * 100;
    const cls = h.kind === "crypto" ? "crypto" : h.assetClass || "equity";
    mix[cls] = (mix[cls] || 0) + share;
    if (h.kind === "stock" && h.sector) { sectors[h.sector] = (sectors[h.sector] || 0) + share; equityKnown += share; }
    if (h.kind === "etf" && h.sectorMix) {
      const sum = Object.values(h.sectorMix).reduce((a, b) => a + b, 0) || 1;
      for (const [s, v] of Object.entries(h.sectorMix)) sectors[s] = (sectors[s] || 0) + (share * v) / sum;
      equityKnown += share;
    }
    if (h.kind === "etf" && h.cat === "intl") intl += share;
  }
  for (const k of Object.keys(sectors)) sectors[k] = pct(sectors[k]);
  for (const k of Object.keys(mix)) mix[k] = pct(mix[k]);
  return { total, weights: holdings.map((h) => pct(w(h) * 100)), mix, sectors, intl: pct(intl), equityKnown: pct(equityKnown) };
}

/** Weighted average of a per-holding number over the holdings that have it. */
function wavg(holdings, total, get) {
  let s = 0, wsum = 0;
  for (const h of holdings) { const v = get(h); if (typeof v === "number" && isFinite(v) && h.value > 0) { s += v * h.value; wsum += h.value; } }
  return wsum ? { value: s / wsum, coverage: (wsum / total) * 100 } : null;
}

/** The full analysis. Returns numbers plus three lists of { key, text } sentences. */
export function analyze(holdings, profileKey, inner = false) {
  const hs = holdings.filter((h) => h && h.value > 0);
  const L = LIMITS[profileKey];
  const out = { profile: profileKey, holdings: hs.length, strengths: [], weaknesses: [], fixes: [] };
  if (!hs.length) return { ...out, empty: true };
  const ex = exposures(hs);
  Object.assign(out, ex);
  const S = (key, ...a) => out.strengths.push({ key, text: t("a_s_" + key, ...a) });
  const W = (key, sev, ...a) => out.weaknesses.push({ key, sev, text: t("a_w_" + key, ...a) });
  const F = (key, ...a) => out.fixes.push({ key, text: t("a_f_" + key, ...a) });

  // ---- overall score: value-weighted average of the holdings' scores for this profile
  const sc = wavg(hs, ex.total, (h) => h.scores && h.scores[profileKey]);
  out.holdingsScore = sc ? Math.round(sc.value * 10) / 10 : null;

  // ---- risk: volatility from weekly returns and correlations where possible
  const pv = portfolioVol(hs.map((h) => ({ w: h.value, series: h.series })));
  const coveredShare = pv ? (pv.covered / ex.total) * 100 : 0;
  const naive = wavg(hs, ex.total, (h) => h.vol);
  out.vol = pv && coveredShare >= 70 ? pv.vol : naive && naive.coverage >= 70 ? Math.round(naive.value * 10) / 10 : null;
  out.volMethod = pv && coveredShare >= 70 ? "covariance" : out.vol !== null ? "weighted" : null;
  if (pv && coveredShare >= 70) out.diversificationGain = pv.weighted > 0 ? pct((1 - pv.vol / pv.weighted) * 100) : null;
  if (out.vol !== null) {
    if (out.vol <= L.vol) S("vol", out.vol.toFixed(0), L.vol);
    else { W("vol", out.vol > L.vol * 1.5 ? "high" : "mid", out.vol.toFixed(0), L.vol); F("vol", profileKey === "aggressive" ? "crypto" : "bonds"); }
  }
  if (out.diversificationGain !== undefined && out.diversificationGain >= 15 && hs.length > 1) S("divGain", fmt0(out.diversificationGain));

  // ---- asset mix vs profile
  const crypto = ex.mix.crypto || 0, safe = (ex.mix.bonds || 0) + (ex.mix.gold || 0);
  if (crypto > L.crypto) { W("crypto", crypto > L.crypto * 2 ? "high" : "mid", fmt0(crypto), L.crypto); F("crypto", L.crypto); }
  else if (crypto > 0) S("crypto", fmt0(crypto), L.crypto);
  if (L.safeMin && safe < L.safeMin) { W("safe", "mid", fmt0(safe), L.safeMin); F("safe", L.safeMin); }
  else if (L.safeMin && safe >= L.safeMin) S("safe", fmt0(safe));
  if (profileKey === "aggressive" && safe > 30) W("tooSafe", "info", fmt0(safe));

  // ---- concentration: single positions (broad funds excluded) and number of holdings
  const singles = hs.map((h, i) => ({ h, w: ex.weights[i] })).filter(({ h }) => !(h.kind === "etf" && (h.holdings || 0) >= BROAD_HOLDINGS && h.cat !== "sector" && h.cat !== "thematic"));
  const big = singles.filter((x) => x.w > L.single).sort((a, b) => b.w - a.w);
  if (big.length) { W("single", big[0].w > L.single * 1.6 ? "high" : "mid", big[0].h.symbol, fmt0(big[0].w), L.single); F("single", big[0].h.symbol, L.single); }
  const hhi = ex.weights.reduce((s, w) => s + (w / 100) ** 2, 0);
  out.effectiveN = hhi ? Math.round((1 / hhi) * 10) / 10 : 0;
  const broad = hs.filter((h) => h.kind === "etf" && (h.holdings || 0) >= 500 && (h.cat === "us_broad" || h.cat === "intl"));
  const broadShare = broad.reduce((s, h) => s + h.value, 0) / ex.total * 100;
  if (broadShare >= 40) S("core", fmt0(broadShare));
  else if (hs.length < 5 && broadShare < 20) { W("few", "mid", hs.length); F("core"); }
  if (hs.length > 25) W("many", "info", hs.length);

  // ---- sectors (look-through for funds)
  const sectorList = Object.entries(ex.sectors).sort((a, b) => b[1] - a[1]);
  const equityShare = ex.mix.equity || 0;
  if (sectorList.length && equityShare >= 30) {
    const [topS, topW] = sectorList[0];
    if (topW > L.sector) { W("sector", topW > L.sector * 1.4 ? "high" : "mid", t("sector_" + topS), fmt0(topW)); F("sector", t("sector_" + topS)); }
    else if (sectorList.filter(([, v]) => v >= 3).length >= 6) S("sectors", sectorList.filter(([, v]) => v >= 3).length);
  }
  if (equityShare >= 50 && ex.intl < 5 && profileKey !== "aggressive") { W("homeBias", "info", fmt0(equityShare)); F("intl"); }

  // ---- overlap: a stock held directly that is also a top holding of a fund you own
  const funds = hs.filter((h) => h.kind === "etf" && Array.isArray(h.top));
  const overlaps = [];
  for (const h of hs.filter((x) => x.kind === "stock")) {
    const inFunds = funds.filter((f) => f.top.includes(h.symbol)).map((f) => f.symbol);
    if (inFunds.length) overlaps.push([h.symbol, inFunds]);
  }
  const fundPairs = [];
  for (let i = 0; i < funds.length; i++) for (let j = i + 1; j < funds.length; j++) {
    const a = funds[i], b = funds[j];
    if (a.top.length >= 5 && b.top.length >= 5 && a.top.filter((x) => b.top.includes(x)).length >= 5) fundPairs.push([a.symbol, b.symbol]);
  }
  if (overlaps.length) W("overlap", "info", overlaps.slice(0, 3).map(([s, f]) => `${s} (${f.join(", ")})`).join("; "));
  if (fundPairs.length) { W("fundOverlap", "mid", fundPairs[0][0], fundPairs[0][1]); F("fundOverlap", fundPairs[0][0], fundPairs[0][1]); }

  // ---- correlation: two non-fund holdings moving almost together
  const pairs = [];
  const solo = hs.filter((h) => h.series && h.kind !== "etf");
  for (let i = 0; i < solo.length; i++) for (let j = i + 1; j < solo.length; j++) { const c = correlation(solo[i].series, solo[j].series); if (c !== null && c >= 0.85) pairs.push([solo[i].symbol, solo[j].symbol, c]); }
  if (pairs.length) { pairs.sort((a, b) => b[2] - a[2]); W("corr", "info", pairs[0][0], pairs[0][1], pairs[0][2].toFixed(2)); }

  // ---- costs
  const etfs = hs.filter((h) => h.kind === "etf" && typeof h.er === "number");
  if (etfs.length) {
    const fee = etfs.reduce((s, h) => s + (h.value * h.er) / 100, 0);
    const etfValue = etfs.reduce((s, h) => s + h.value, 0);
    out.fees = { yearly: Math.round(fee), avg: Math.round((fee / etfValue) * 10000) / 100 };
    const pricey = etfs.filter((h) => h.er >= 0.3).sort((a, b) => b.value * b.er - a.value * a.er)[0];
    if (pricey) {
      const alt = ETFS.filter((e) => e.cat === pricey.cat && e.er < pricey.er && e.t !== pricey.symbol && !e.crypto).sort((a, b) => a.er - b.er)[0];
      W("fee", "mid", pricey.symbol, pricey.er.toFixed(2), usd((pricey.value * pricey.er) / 100));
      if (alt) F("fee", pricey.symbol, alt.t, alt.er.toFixed(2), usd((pricey.value * (pricey.er - alt.er)) / 100));
    } else if (out.fees.avg <= 0.15) S("fees", out.fees.avg.toFixed(2), usd(out.fees.yearly));
  }

  // ---- income
  const y = wavg(hs, ex.total, (h) => h.yield);
  out.yield = y && y.coverage >= 60 ? Math.round(y.value * 100) / 100 : null;
  if (out.yield !== null) {
    if (profileKey === "defensive" && out.yield >= 2) S("income", out.yield.toFixed(1), usd((ex.total * out.yield) / 100));
    if (profileKey === "defensive" && out.yield < 1) { W("income", "info", out.yield.toFixed(1)); F("income"); }
  }

  // ---- weak and strong holdings for this profile
  const scored = hs.map((h, i) => ({ h, w: ex.weights[i], s: h.scores && h.scores[profileKey] })).filter((x) => typeof x.s === "number");
  const weak = scored.filter((x) => x.s < 4.5 && x.w >= 5).sort((a, b) => b.w - a.w);
  const strong = scored.filter((x) => x.s >= 7).sort((a, b) => b.w - a.w);
  if (strong.length) S("strong", strong.slice(0, 3).map((x) => `${x.h.symbol} ${x.s.toFixed(1)}`).join(", "));
  if (weak.length) { W("weak", weak[0].s < 3.5 ? "high" : "mid", weak.slice(0, 3).map((x) => `${x.h.symbol} ${x.s.toFixed(1)}`).join(", ")); F("weak", weak[0].h.symbol); }

  // ---- data gaps
  const noPx = hs.filter((h) => h.kind !== "crypto" && !h.series && h.vol == null).map((h) => h.symbol);
  if (noPx.length) out.gaps = noPx;

  // ---- portfolio score: the holdings' average, minus points for portfolio-level problems
  // (a great stock is still a poor fit if it is 60% of a defensive portfolio).
  out.penalty = Math.min(3, out.weaknesses.reduce((p, w) => p + (w.sev === "high" ? 1 : w.sev === "mid" ? 0.5 : 0), 0));
  out.score = out.holdingsScore === null ? null : Math.max(1, Math.round((out.holdingsScore - out.penalty) * 10) / 10);
  if (!inner) out.scores = Object.fromEntries(Object.keys(LIMITS).map((k) => [k, k === profileKey ? out.score : analyze(holdings, k, true).score]));

  const order = { high: 0, mid: 1, info: 2 };
  out.weaknesses.sort((a, b) => order[a.sev] - order[b.sev]);
  out.fixes = out.fixes.slice(0, 5);
  out.mood = out.score === null ? "unknown" : out.weaknesses.some((x) => x.sev === "high") ? "work" : out.score >= 7 && out.weaknesses.filter((x) => x.sev !== "info").length <= 1 ? "good" : out.score >= 5 ? "ok" : "work";
  return out;
}

/** Holdings encoded for the URL: "s:AAPL:5000,e:VOO:10000,c:bitcoin:2000". */
export function encodeHoldings(list) {
  return list.map((h) => `${h.kind[0]}:${h.id}:${Math.round(h.value)}`).join(",");
}
export function decodeHoldings(str) {
  const kinds = { s: "stock", e: "etf", c: "crypto" };
  return String(str || "").split(",").map((p) => p.split(":")).filter((p) => p.length === 3 && kinds[p[0]] && /^[A-Za-z0-9.-]{1,40}$/.test(p[1]) && Number(p[2]) > 0)
    .slice(0, 40).map(([k, id, v]) => ({ kind: kinds[k], id, value: Math.min(Number(v), 1e12) }));
}
