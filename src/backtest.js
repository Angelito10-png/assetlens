/**
 * Backtests. Pure functions, no DOM or network: used by the build script, the pages and the tests.
 *
 * 1. scoreBacktest: "did coins with high scores do better afterwards?"
 *    On a series of past dates, each coin is scored using only what was known that day
 *    (price, market cap and volume history up to that date), the coins are split into thirds
 *    by score, and each third's return over the following weeks is compared with Bitcoin.
 *    Factors that need today's data (supply, code activity, community, launch date) are left out,
 *    exactly as the app already does for coins it can't fully load.
 *
 * 2. portfolioHistory: what today's mix of holdings would have done over the last 1–5 years,
 *    bought and held, compared with the S&P 500 (SPY), with return, drawdown and volatility.
 */
import { score } from "./engine.js?v=__V__";

const DAY = 864e5;
export const PROFILE_KEYS = ["aggressive", "defensive", "longterm"];
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const r2 = (v) => (v === null || v === undefined || !isFinite(v) ? null : Math.round(v * 100) / 100);
const iso = (day) => new Date(day * DAY).toISOString().slice(0, 10);

/* ---------------------------------------------------------------- shared statistics */

/**
 * Performance of an index series (values sampled weekly, any starting level).
 * → { total %, cagr % (only for spans of a year or more), maxDD % (negative), vol % a year, years }
 */
export function perfStats(values, times) {
  const v = (values || []).filter((x) => x > 0);
  if (v.length < 2) return null;
  const years = times && times.length === values.length ? (times[times.length - 1] - times[0]) / (365.25 * DAY) : (v.length - 1) / 52;
  const total = (v[v.length - 1] / v[0] - 1) * 100;
  let peak = -Infinity, dd = 0;
  for (const x of v) { peak = Math.max(peak, x); dd = Math.min(dd, x / peak - 1); }
  const rets = [];
  for (let i = 1; i < v.length; i++) rets.push(Math.log(v[i] / v[i - 1]));
  const m = mean(rets);
  const sd = rets.length > 1 ? Math.sqrt(rets.reduce((s, x) => s + (x - m) ** 2, 0) / (rets.length - 1)) : null;
  return {
    total: r2(total),
    cagr: years >= 0.99 ? r2((Math.pow(v[v.length - 1] / v[0], 1 / years) - 1) * 100) : null,
    maxDD: r2(dd * 100),
    vol: sd === null ? null : r2(sd * Math.sqrt(52) * 100),
    years: r2(years),
  };
}

/** Spearman rank correlation, or null with fewer than 5 pairs. */
export function spearman(xs, ys) {
  const n = xs.length;
  if (n < 5 || ys.length !== n) return null;
  const rank = (a) => {
    const idx = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]);
    const r = new Array(n);
    for (let i = 0; i < n;) {
      let j = i;
      while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j++;
      for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(xs), ry = rank(ys), mx = mean(rx), my = mean(ry);
  let c = 0, vx = 0, vy = 0;
  for (let i = 0; i < n; i++) { c += (rx[i] - mx) * (ry[i] - my); vx += (rx[i] - mx) ** 2; vy += (ry[i] - my) ** 2; }
  return vx && vy ? c / Math.sqrt(vx * vy) : null;
}

/* ---------------------------------------------------------------- 1. score backtest (crypto) */

/**
 * CoinGecko /coins/{id}/market_chart (daily) → { day → { p, cap, vol } } keyed by whole UTC day number.
 * When a day has two points (the last one is "now"), the later one wins.
 */
export function dailyMap(chart) {
  const m = new Map();
  const put = (arr, key) => { for (const [ms, v] of arr || []) { if (!(v > 0)) continue; const d = Math.floor(ms / DAY); const o = m.get(d) || {}; o[key] = v; m.set(d, o); } };
  put(chart && chart.prices, "p"); put(chart && chart.market_caps, "cap"); put(chart && chart.total_volumes, "vol");
  for (const [d, o] of m) if (!(o.p > 0)) m.delete(d);
  return m;
}

/**
 * The scoring inputs a coin had on `day`, from its own history up to that day only.
 * Anything that would need today's data is left empty, so the engine skips that factor.
 */
export function pointInTime(m, day, rank) {
  const now = m.get(day);
  if (!now) return null;
  const back = (n) => { for (let k = 0; k <= 3; k++) { const o = m.get(day - n - k); if (o) return o.p; } return null; };
  const ch = (n) => { const p = back(n); return p ? (now.p / p - 1) * 100 : null; };
  let peak = 0;
  for (const [d, o] of m) if (d <= day && o.p > peak) peak = o.p;
  return {
    price: now.p, mcap: now.cap || null, vol24: now.vol || null, rank,
    ch24: ch(1), ch7d: ch(7), ch30d: ch(30), ch1y: ch(365),
    athChange: peak ? (now.p / peak - 1) * 100 : null, ath: peak || null, // highest price in the history we have, not the all-time high
    high24: null, low24: null, fdv: null, circ: null, total: null, max: null,
    genesis: null, earliest: null, marketOnly: true, devProvided: false, repos: [], categories: [],
    commits4w: null, commits52w: null, contributors: null, stars: null, forks: null, daysSincePush: null,
    sentimentUp: null, watchlist: null,
  };
}

/** Equal-weight return of a group from day d0 to d1, in %. */
function groupReturn(group, d0, d1) {
  const rs = group.map((x) => { const a = x.m.get(d0), b = x.m.get(d1); return a && b ? (b.p / a.p - 1) * 100 : null; }).filter((r) => r !== null);
  return mean(rs);
}

/**
 * Run the score backtest.
 * coins: [{ id, symbol, name, m: dailyMap() }]; bench: the dailyMap of Bitcoin.
 * opts: horizon (days held after each scoring date), every (days between scoring dates),
 *       warmup (days of history a scoring date needs before it), headlineAgo (days back for the chart).
 */
export function scoreBacktest(coins, bench, { horizon = 90, every = 30, warmup = 60, headlineAgo = 182, now = null } = {}) {
  const days = [...bench.keys()].sort((a, b) => a - b);
  if (days.length < warmup + horizon + 2) return null;
  const first = days[0], last = now ?? days[days.length - 1];
  const scoreOn = (day) => {
    const live = coins.filter((c) => c.m.has(day));
    const byCap = [...live].sort((a, b) => (b.m.get(day).cap || 0) - (a.m.get(day).cap || 0));
    return byCap.map((c, i) => {
      const inp = pointInTime(c.m, day, i + 1);
      return { ...c, s: Object.fromEntries(PROFILE_KEYS.map((k) => [k, score(inp, k).total])) };
    });
  };
  const thirds = (list, k) => {
    const sorted = [...list].sort((a, b) => b.s[k] - a.s[k]);
    const n = Math.max(1, Math.floor(sorted.length / 3));
    return { top: sorted.slice(0, n), bottom: sorted.slice(-n) };
  };
  const benchRet = (d0, d1) => { const a = bench.get(d0), b = bench.get(d1); return a && b ? (b.p / a.p - 1) * 100 : null; };

  // rolling cohorts: score on each date, hold for `horizon` days
  const cohorts = Object.fromEntries(PROFILE_KEYS.map((k) => [k, []]));
  for (let d0 = first + warmup; d0 + horizon <= last; d0 += every) {
    const d1 = d0 + horizon;
    const scored = scoreOn(d0).filter((c) => c.m.has(d1));
    if (scored.length < 9 || !bench.has(d0) || !bench.has(d1)) continue;
    for (const k of PROFILE_KEYS) {
      const { top, bottom } = thirds(scored, k);
      cohorts[k].push({
        d: iso(d0), n: scored.length,
        top: r2(groupReturn(top, d0, d1)), bottom: r2(groupReturn(bottom, d0, d1)), all: r2(groupReturn(scored, d0, d1)), btc: r2(benchRet(d0, d1)),
        ic: r2(spearman(scored.map((c) => c.s[k]), scored.map((c) => (c.m.get(d1).p / c.m.get(d0).p - 1) * 100))),
      });
    }
  }

  // one chart: scores from about six months ago, growth of 100 until today
  const h0 = Math.max(first + warmup, last - headlineAgo);
  const atStart = scoreOn(h0);
  const weeks = [];
  for (let d = h0; d <= last; d += 7) weeks.push(d);
  if (weeks[weeks.length - 1] !== last) weeks.push(last);
  const curve = (group) => weeks.map((d) => {
    const v = group.map((x) => { const a = x.m.get(h0); let b = null; for (let k = 0; k <= 3 && !b; k++) b = x.m.get(d - k); return a && b ? b.p / a.p : null; }).filter((x) => x !== null);
    return v.length ? r2(mean(v) * 100) : null;
  });
  const benchCurve = weeks.map((d) => { const a = bench.get(h0); let b = null; for (let k = 0; k <= 3 && !b; k++) b = bench.get(d - k); return a && b ? r2((b.p / a.p) * 100) : null; });

  const profiles = {};
  for (const k of PROFILE_KEYS) {
    const cs = cohorts[k];
    const { top, bottom } = thirds(atStart, k);
    const finalRet = (x) => { const a = x.m.get(h0); let b = null; for (let j = 0; j <= 3 && !b; j++) b = x.m.get(last - j); return a && b ? r2((b.p / a.p - 1) * 100) : null; };
    profiles[k] = {
      summary: {
        cohorts: cs.length,
        top: r2(mean(cs.map((c) => c.top))), bottom: r2(mean(cs.map((c) => c.bottom))), all: r2(mean(cs.map((c) => c.all))), btc: r2(mean(cs.map((c) => c.btc))),
        topBeatBottom: cs.filter((c) => c.top > c.bottom).length, topBeatBtc: cs.filter((c) => c.top > c.btc).length,
        ic: r2(mean(cs.map((c) => c.ic).filter((x) => x !== null))),
      },
      cohorts: cs,
      headline: {
        top: curve(top), bottom: curve(bottom), all: curve(atStart),
        picks: [...atStart].sort((a, b) => b.s[k] - a.s[k]).map((x) => ({ s: x.symbol.toUpperCase(), n: x.name, sc: x.s[k], r: finalRet(x), g: top.includes(x) ? "top" : bottom.includes(x) ? "bottom" : "mid" })),
      },
    };
  }
  return {
    v: 1, universe: coins.length, horizon, every, from: iso(first), to: iso(last),
    headline: { from: iso(h0), days: weeks.map(iso), btc: benchCurve },
    profiles,
  };
}

/* ---------------------------------------------------------------- 2. portfolio history */

const weekOf = (t) => Math.floor((Math.floor(t / DAY) + 3) / 7); // Monday-based week number, so Friday closes of stocks and crypto line up

/** Weekly bars [{ t, a | c }] → Map(week → price), keeping the last bar of each week. */
function weekly(bars) {
  const m = new Map();
  for (const b of bars || []) { const px = b.a > 0 ? b.a : b.c; if (px > 0 && isFinite(b.t)) m.set(weekOf(b.t), { t: b.t, px }); }
  return m;
}

/**
 * Today's mix, bought `years` ago and held (no rebalancing), versus SPY bought on the same day.
 * items: [{ symbol, value, bars }] (holdings without bars are left out and listed in `missing`).
 * → { start, end, times, port, bench, stats: { port, bench }, covered %, missing, shortened: [symbols that start later] } | null
 */
export function portfolioHistory(items, benchBars, { years = 1, now = Date.now() } = {}) {
  const usable = items.filter((x) => x.value > 0 && x.bars && x.bars.length >= 4);
  const missing = items.filter((x) => !usable.includes(x)).map((x) => x.symbol);
  if (!usable.length) return null;
  const series = usable.map((x) => ({ ...x, w: weekly(x.bars) }));
  const firstWeeks = series.map((x) => Math.min(...x.w.keys()));
  const want = weekOf(now - years * 365.25 * DAY);
  const start = Math.max(want, ...firstWeeks);
  const end = Math.min(...series.map((x) => Math.max(...x.w.keys())));
  if (end - start < 4) return null;
  const shortened = start > want ? series.filter((x, i) => firstWeeks[i] === start).map((x) => x.symbol) : [];
  const total = series.reduce((s, x) => s + x.value, 0);
  const at = (w, k) => { for (let j = k; j >= k - 3; j--) if (w.has(j)) return w.get(j).px; return null; };
  const base = series.map((x) => at(x.w, start) ?? x.w.get(Math.min(...[...x.w.keys()].filter((k) => k >= start))).px);
  const b = benchBars && benchBars.length ? weekly(benchBars) : null;
  const bBase = b ? at(b, start) : null;
  const times = [], port = [], bench = [];
  const last = series.map((x, i) => base[i]);
  for (let k = start; k <= end; k++) {
    series.forEach((x, i) => { const p = x.w.get(k); if (p) last[i] = p.px; });
    times.push((7 * k + 1) * DAY); // the Friday of that week
    port.push(r2((series.reduce((s, x, i) => s + (x.value / total) * (last[i] / base[i]), 0)) * 100));
    const bp = b && bBase ? at(b, k) : null;
    bench.push(bp ? r2((bp / bBase) * 100) : null);
  }
  const benchOk = bench.every((v) => v !== null);
  const allValue = items.reduce((s, x) => s + (x.value > 0 ? x.value : 0), 0);
  return {
    start: new Date(times[0]).toISOString().slice(0, 10), end: new Date(times[times.length - 1]).toISOString().slice(0, 10),
    times, port, bench: benchOk ? bench : null,
    stats: { port: perfStats(port, times), bench: benchOk ? perfStats(bench, times) : null },
    covered: allValue ? Math.round((total / allValue) * 100) : 0, missing, shortened,
  };
}
