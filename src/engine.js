/**
 * Coin Scorecard scoring engine.
 * Pure functions only: no DOM, no network. Everything here is unit-tested in tests/engine.test.js.
 */
import { t } from "./i18n.js?v=__V__";

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// linear map of x from [x0,x1] onto [0,10]; works with x0 > x1 for "lower is better"
const lin = (x, x0, x1) => clamp(((x - x0) / (x1 - x0)) * 10, 0, 10);
const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);
const pick = (o, path) => path.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o);
const first = (o, paths) => { for (const p of paths) { const v = num(pick(o, p)); if (v !== null) return v; } return null; };
const usd = (v) => (v && typeof v === "object" ? num(v.usd) : num(v));

/**
 * Normalise a CoinGecko /coins/{id} payload (optionally merged with a /coins/markets row)
 * and optional GitHub stats from api.js into one flat object the factors read.
 */
function normalize(info, row, gh) {
  info = info || {}; row = row || {};
  const md = info.market_data || {};
  const dev = info.developer_data || {};
  const links = info.links || {};
  const g = (mdKey, rowKey) => { const a = usd(md[mdKey]); return a !== null ? a : num(row[rowKey ?? mdKey]); };
  const dates = [info.genesis_date, pick(md, "atl_date.usd") || row.atl_date, pick(md, "ath_date.usd") || row.ath_date]
    .filter(Boolean).map((d) => new Date(d)).filter((d) => !isNaN(d));
  const genesis = info.genesis_date ? new Date(info.genesis_date) : null;
  return {
    id: info.id || row.id,
    name: info.name || row.name,
    symbol: (info.symbol || row.symbol || "").toUpperCase(),
    price: g("current_price"),
    mcap: g("market_cap"),
    rank: num(info.market_cap_rank) ?? num(md.market_cap_rank) ?? num(row.market_cap_rank),
    fdv: g("fully_diluted_valuation"),
    vol24: g("total_volume"),
    circ: num(md.circulating_supply) ?? num(row.circulating_supply),
    total: num(md.total_supply) ?? num(row.total_supply),
    max: num(md.max_supply) ?? num(row.max_supply),
    ch24: num(md.price_change_percentage_24h) ?? num(row.price_change_percentage_24h),
    ch7d: num(md.price_change_percentage_7d) ?? num(row.price_change_percentage_7d_in_currency),
    ch30d: num(md.price_change_percentage_30d) ?? num(row.price_change_percentage_30d_in_currency),
    ch1y: num(md.price_change_percentage_1y) ?? num(row.price_change_percentage_1y_in_currency),
    athChange: usd(md.ath_change_percentage) ?? num(row.ath_change_percentage),
    ath: usd(md.ath) ?? num(row.ath),
    high24: usd(md.high_24h) ?? num(row.high_24h),
    low24: usd(md.low_24h) ?? num(row.low_24h),
    genesis,
    earliest: dates.length ? new Date(Math.min(...dates)) : null,
    devSource: gh ? "github" : info.developer_data ? "coingecko" : null,
    devProvided: !!(gh || info.developer_data),
    commits4w: gh ? num(gh.commits4w) : num(dev.commit_count_4_weeks),
    commits52w: gh ? num(gh.commits52w) : null,
    contributors: gh ? num(gh.contributors) : num(dev.pull_request_contributors),
    stars: gh ? num(gh.stars) : num(dev.stars),
    forks: gh ? num(gh.forks) : num(dev.forks),
    daysSincePush: gh ? num(gh.daysSincePush) : null,
    ghRepo: gh ? gh.repo : null,
    whitepaper: typeof links.whitepaper === "string" && links.whitepaper ? links.whitepaper : null,
    repos: ((links.repos_url || {}).github || []).filter(Boolean),
    homepage: (links.homepage || []).filter(Boolean)[0] || null,
    sentimentUp: num(info.sentiment_votes_up_percentage),
    watchlist: num(info.watchlist_portfolio_users),
    categories: (info.categories || []).filter(Boolean),
    updated: info.last_updated || md.last_updated || row.last_updated || null,
  };
}

const fmtPct = (v, d = 1) => (v === null ? "n/a" : (v > 0 ? "+" : "") + v.toFixed(d) + "%");
const fmtBig = (v) => {
  if (v === null) return "n/a";
  const a = Math.abs(v);
  if (a >= 1e12) return "$" + (v / 1e12).toFixed(2) + "T";
  if (a >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
  if (a >= 1e3) return "$" + (v / 1e3).toFixed(1) + "K";
  return "$" + v.toFixed(2);
};
const fmtNum = (v) => (v === null ? "n/a" : v >= 1e9 ? (v / 1e9).toFixed(2) + "B" : v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v >= 1e3 ? (v / 1e3).toFixed(1) + "K" : String(Math.round(v)));
const avg = (parts) => { const p = parts.filter((x) => x[0] !== null); if (!p.length) return null; const w = p.reduce((s, x) => s + x[1], 0); return p.reduce((s, x) => s + x[0] * x[1], 0) / w; };
const log10 = (x) => Math.log10(Math.max(x, 1e-9));

/* Each factor returns { score 0-10 | null, notes: [string], inputs: [[label, value]] }.
   Names, descriptions and notes come from i18n.js, so they follow the current language. */
const na = "n/a";
const factor = (key, run) => ({ key, get name() { return t("f_" + key); }, get what() { return t("f_" + key + "_what"); }, run });
const FACTORS = [
  factor("size", (c) => {
    const rankS = c.rank ? clamp(10 - 2 * log10(c.rank), 0, 10) : null;
    const turnover = c.vol24 !== null && c.mcap ? (c.vol24 / c.mcap) * 100 : null;
    const liqS = turnover === null ? null : turnover <= 0.3 ? 1 : turnover < 8 ? lin(log10(turnover), log10(0.3), log10(8)) : turnover <= 40 ? 10 : 6;
    const notes = [];
    if (c.rank) notes.push(t("n_rank", c.rank, fmtBig(c.mcap)));
    if (turnover !== null) notes.push(turnover > 40 ? t("n_volHigh", turnover.toFixed(1)) : turnover < 1 ? t("n_volLow", turnover.toFixed(2)) : t("n_volOk", turnover.toFixed(1)));
    return { score: avg([[rankS, 0.6], [liqS, 0.4]]), notes, inputs: [[t("i_rank"), c.rank ? "#" + c.rank : na], [t("i_mcap"), fmtBig(c.mcap)], [t("i_vol"), fmtBig(c.vol24)], [t("i_volcap"), turnover === null ? na : turnover.toFixed(2) + "%"]] };
  }),
  factor("tokenomics", (c) => {
    const cap = c.max || c.total;
    const float = c.circ && cap ? clamp(c.circ / cap, 0, 1) : null;
    const floatS = float === null ? null : lin(float, 0.15, 0.95);
    const fdvRatio = c.fdv && c.mcap ? c.fdv / c.mcap : float ? 1 / float : null;
    const dilS = fdvRatio === null ? null : lin(fdvRatio, 4, 1.05);
    const capS = c.max ? 10 : c.total ? 5 : null;
    const notes = [];
    if (float !== null) notes.push(t("n_float", (float * 100).toFixed(0), !!c.max));
    if (fdvRatio !== null) notes.push(fdvRatio > 2 ? t("n_fdvHigh", fdvRatio.toFixed(1)) : t("n_fdvLow", fdvRatio.toFixed(2)));
    notes.push(c.max ? t("n_capped", fmtNum(c.max)) : t("n_uncapped"));
    return { score: avg([[floatS, 0.4], [dilS, 0.4], [capS, 0.2]]), notes, inputs: [[t("i_circ"), fmtNum(c.circ)], [t("i_total"), fmtNum(c.total)], [t("i_max"), c.max ? fmtNum(c.max) : t("i_uncapped")], [t("i_fdvcap"), fdvRatio === null ? na : fdvRatio.toFixed(2) + "x"]] };
  }),
  factor("momentum", (c) => {
    const s = avg([[c.ch7d === null ? null : lin(c.ch7d, -15, 20), 0.2], [c.ch30d === null ? null : lin(c.ch30d, -30, 40), 0.4], [c.ch1y === null ? null : lin(c.ch1y, -60, 150), 0.4]]);
    const notes = [];
    if (c.ch30d !== null) notes.push(t("n_mom30", fmtPct(c.ch30d), c.ch1y !== null ? fmtPct(c.ch1y) : null));
    if (c.ch7d !== null) notes.push(t("n_mom7", fmtPct(c.ch7d)));
    if (s === null) notes.push(t("n_noHistory"));
    return { score: s, notes, inputs: [[t("i_7d"), fmtPct(c.ch7d)], [t("i_30d"), fmtPct(c.ch30d)], [t("i_1y"), fmtPct(c.ch1y)]] };
  }),
  factor("stability", (c) => {
    const ddS = c.athChange === null ? null : lin(c.athChange, -95, -10);
    const range = c.high24 && c.low24 && c.price ? ((c.high24 - c.low24) / c.price) * 100 : null;
    const rangeS = range === null ? null : lin(range, 15, 1.5);
    const swingS = c.ch7d === null ? null : lin(Math.abs(c.ch7d), 30, 3);
    const notes = [];
    if (c.athChange !== null) notes.push(t("n_ath", Math.abs(c.athChange).toFixed(0), fmtBig(c.ath)));
    if (range !== null) notes.push(t("n_range", range.toFixed(1)));
    return { score: avg([[ddS, 0.5], [rangeS, 0.25], [swingS, 0.25]]), notes, inputs: [[t("i_fromAth"), fmtPct(c.athChange, 0)], [t("i_range"), range === null ? na : range.toFixed(1) + "%"], [t("i_swing"), fmtPct(c.ch7d)]] };
  }),
  factor("development", (c) => {
    const has = c.commits4w !== null || c.stars !== null || c.contributors !== null;
    if (c.marketOnly) return { score: null, notes: [t("n_marketOnly")], inputs: [], missing: true };
    if (!c.repos.length && !c.devProvided) return { score: 0, notes: [t("n_noRepo")], inputs: [[t("i_repos"), "0"]] };
    if (!c.devProvided) return { score: null, notes: [t("n_ghFailed", c.repos.length)], inputs: [[t("i_repos"), String(c.repos.length)]], missing: true };
    if (!has || (c.commits4w === 0 && !c.stars && !c.contributors)) {
      return { score: c.repos.length ? 3 : null, notes: [c.repos.length ? t("n_repoNoFigures") : t("n_noDev")], inputs: [[t("i_repos"), String(c.repos.length)]], missing: !c.repos.length };
    }
    const commitS = c.commits4w === null ? null : lin(log10(c.commits4w + 1), 0, log10(201));
    const contribS = c.contributors === null ? null : lin(log10(c.contributors + 1), 0, log10(301));
    const starS = c.stars === null ? null : lin(log10(c.stars + 1), 1, log10(30001));
    const pushS = c.daysSincePush === null ? null : lin(c.daysSincePush, 180, 7);
    const contrib = c.contributors === null ? na : c.contributors >= 500 ? "500+" : fmtNum(c.contributors);
    const notes = [t("n_commits", fmtNum(c.commits4w), c.commits52w !== null ? fmtNum(c.commits52w) : null, c.ghRepo ? t("n_mainRepo", c.ghRepo) : t("n_repos"))];
    if (c.contributors !== null) notes.push(t("n_contrib", contrib, fmtNum(c.stars)));
    if (c.daysSincePush !== null) notes.push(c.daysSincePush <= 14 ? t("n_pushRecent") : t("n_pushOld", Math.round(c.daysSincePush)));
    return { score: avg([[commitS, 0.4], [contribS, 0.3], [starS, 0.15], [pushS, 0.15]]), notes, inputs: [[t("i_commits"), fmtNum(c.commits4w)], [t("i_contrib"), contrib], [t("i_stars"), fmtNum(c.stars)], [t("i_source"), c.devSource === "github" ? "GitHub" : "CoinGecko"]] };
  }),
  factor("maturity", (c) => {
    const ref = c.genesis || c.earliest;
    if (!ref) return { score: null, notes: [t("n_noLaunch")], inputs: [], missing: true };
    const yrs = (Date.now() - ref.getTime()) / (365.25 * 864e5);
    const notes = [t("n_launched", ref.getFullYear(), yrs.toFixed(1), !!c.genesis), yrs >= 4 ? t("n_cycle") : t("n_noCycle")];
    return { score: lin(yrs, 0.5, 8), notes, inputs: [[t("i_age"), t("i_yrs", yrs.toFixed(1))]] };
  }),
  factor("community", (c) => {
    const sentS = c.sentimentUp === null ? null : lin(c.sentimentUp, 40, 90);
    const watchS = c.watchlist === null ? null : lin(log10(c.watchlist + 1), 3, log10(2e6));
    if (sentS === null && watchS === null) return { score: null, notes: [t("n_noCommunity")], inputs: [], missing: true };
    const notes = [];
    if (c.watchlist !== null) notes.push(t("n_watch", fmtNum(c.watchlist)));
    if (c.sentimentUp !== null) notes.push(t("n_sentiment", c.sentimentUp.toFixed(0)));
    return { score: avg([[watchS, 0.6], [sentS, 0.4]]), notes, inputs: [[t("i_watch"), fmtNum(c.watchlist)], [t("i_votes"), c.sentimentUp === null ? na : c.sentimentUp.toFixed(0) + "%"]] };
  }),
];

/* Weights per profile. Labels and blurbs follow the current language. */
const profile = (key, weights) => ({ key, get label() { return t("profile_" + key); }, get blurb() { return t("blurb_" + key); }, weights });
const PROFILES = {
  aggressive: profile("aggressive", { size: 10, tokenomics: 15, momentum: 30, stability: 5, development: 20, maturity: 5, community: 15 }),
  defensive: profile("defensive", { size: 25, tokenomics: 15, momentum: 5, stability: 25, development: 10, maturity: 20, community: 0 }),
  longterm: profile("longterm", { size: 15, tokenomics: 25, momentum: 5, stability: 10, development: 25, maturity: 15, community: 5 }),
};

function flags(c) {
  const f = [];
  const turnover = c.vol24 !== null && c.mcap ? (c.vol24 / c.mcap) * 100 : null;
  if (c.rank && c.rank > 300) f.push(["high", t("fl_smallCap", c.rank)]);
  if (turnover !== null && turnover < 0.5) f.push(["high", t("fl_lowVol")]);
  if (turnover !== null && turnover > 60) f.push(["mid", t("fl_highVol")]);
  const cap = c.max || c.total;
  if (c.circ && cap && c.circ / cap < 0.4) f.push(["high", t("fl_lowFloat", ((c.circ / cap) * 100).toFixed(0))]);
  if (!c.max) f.push(["mid", t("fl_noCap")]);
  if (c.athChange !== null && c.athChange < -85) f.push(["high", t("fl_drawdown", Math.abs(c.athChange).toFixed(0))]);
  if (c.devProvided ? c.commits4w === 0 : !c.repos.length) f.push(["mid", c.devProvided ? t("fl_noActivity") : t("fl_noRepo")]);
  if ((c.categories || []).some((x) => /meme/i.test(x))) f.push(["mid", t("fl_meme")]);
  if ((c.categories || []).some((x) => /stablecoin/i.test(x))) f.push(["info", t("fl_stable")]);
  return f;
}

/**
 * Score a normalised coin for a profile. Pass `customWeights` ({factorKey: number}, any scale)
 * to override the profile's weights; the profile's rules (caps, recommendations) still apply.
 */
function score(c, profileKey, customWeights) {
  const base = PROFILES[profileKey];
  const p = customWeights ? { key: base.key, label: base.label, blurb: base.blurb, weights: { ...base.weights, ...sanitizeWeights(customWeights) }, custom: true } : base;
  const factors = FACTORS.map((F) => {
    const r = F.run(c);
    return { key: F.key, name: F.name, what: F.what, weight: p.weights[F.key], ...r };
  });
  const used = factors.filter((f) => f.score !== null && f.weight > 0);
  const wsum = used.reduce((s, f) => s + f.weight, 0);
  const raw = wsum ? used.reduce((s, f) => s + f.score * f.weight, 0) / wsum : 0;
  factors.forEach((f) => { f.effWeight = f.score !== null && f.weight > 0 && wsum ? (f.weight / wsum) * 100 : 0; f.contrib = f.score !== null && wsum ? (f.score * f.weight) / wsum : 0; });
  let total = 1 + raw * 0.9; // map 0-10 onto 1-10
  const caps = [];
  if (profileKey === "defensive" && c.rank && c.rank > 100) { if (total > 5) caps.push(t("cap_defensive", c.rank)); total = Math.min(total, 5); }
  const noCode = (!c.marketOnly && !c.repos.length && !c.devProvided) || (c.devProvided && c.commits4w === 0 && !c.stars);
  if (profileKey === "longterm" && noCode) { if (total > 6) caps.push(t("cap_longterm")); total = Math.min(total, 6); }
  total = Math.round(total * 10) / 10;
  const missing = factors.filter((f) => f.score === null && f.weight > 0).map((f) => f.name);
  const coverage = factors.filter((f) => f.weight > 0).length ? Math.round((used.length / factors.filter((f) => f.weight > 0).length) * 100) : 0;
  return { total, raw, factors, caps, missing, coverage, flags: flags(c), profile: p, profileKey };
}

/**
 * Quick score from a /coins/markets row alone (used for category lists, where
 * loading every coin's full data would hit the free API limits). Development and
 * community are unknown here, so they are skipped rather than counted as zero.
 */
function quickScore(row, profileKey, customWeights) {
  const c = { ...normalize(null, row, null), marketOnly: true };
  return { c, ...score(c, profileKey, customWeights) };
}

/** Keep only known factor keys with finite, non-negative numbers. */
function sanitizeWeights(w) {
  const out = {};
  for (const F of FACTORS) {
    const v = Number(w[F.key]);
    if (Number.isFinite(v) && v >= 0) out[F.key] = v;
  }
  return out;
}

/** Encode / decode weights for the URL as seven comma-separated numbers in factor order. */
const encodeWeights = (w) => FACTORS.map((F) => Math.round(w[F.key] || 0)).join(",");
function decodeWeights(str) {
  const parts = String(str || "").split(",").map(Number);
  if (parts.length !== FACTORS.length || parts.some((n) => !Number.isFinite(n) || n < 0) || !parts.some((n) => n > 0)) return null;
  return Object.fromEntries(FACTORS.map((F, i) => [F.key, parts[i]]));
}

/** [label, key] for a total score. The key is stable across languages. */
const verdict = (total) => {
  const key = total >= 8 ? "strong" : total >= 6.5 ? "good" : total >= 5 ? "mixed" : total >= 3.5 ? "weak" : "poor";
  return [t("verdict_" + key), key];
};

function recommend(c, r) {
  const k = r.profileKey, total = r.total;
  const sorted = r.factors.filter((f) => f.score !== null && f.weight > 0).sort((a, b) => b.weight * (10 - b.score) - a.weight * (10 - a.score));
  const weak = sorted.filter((f) => f.score < 5).slice(0, 2);
  const strong = r.factors.filter((f) => f.score !== null && f.weight > 0 && f.score >= 7).sort((a, b) => b.contrib - a.contrib).slice(0, 2);
  const [hi, mid] = { aggressive: [7, 5], defensive: [7.5, 5.5], longterm: [7.5, 5.5] }[k];
  const out = [[t("r_role"), t(`role_${k}_${total >= hi ? "hi" : total >= mid ? "mid" : "lo"}`)]];
  if (strong.length) out.push([t("r_supports"), strong.map((f) => `${f.name} (${f.score.toFixed(1)}/10): ${f.notes[0]}`).join(" ")]);
  const check = (key) => key === "momentum" ? t(k === "aggressive" ? "chk_momentum_aggr" : "chk_momentum") : key === "stability" ? t(k === "defensive" ? "chk_stability_def" : "chk_stability") : t("chk_" + key);
  weak.forEach((f) => out.push([t("r_watch", f.name), check(f.key)]));
  if (r.missing.length) out.push([t("r_gaps"), t("r_gapsBody", r.missing)]);
  return out;
}

export { normalize, score, quickScore, sanitizeWeights, encodeWeights, decodeWeights, recommend, verdict, flags, FACTORS, PROFILES, fmtBig, fmtPct, fmtNum, lin, clamp };
