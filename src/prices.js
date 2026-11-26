/**
 * Price statistics for stocks and ETFs, from a weekly adjusted price series
 * (Alpha Vantage TIME_SERIES_WEEKLY_ADJUSTED). Pure functions, no DOM or
 * network: used by the page and unit-tested in Node.
 *
 * Weekly data keeps each ticker to one free API call. Volatility and beta are
 * computed from weekly returns and annualised with √52.
 */

const DAY = 864e5;
const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);
const r2 = (v) => (v === null || !isFinite(v) ? null : Math.round(v * 100) / 100);
const r4 = (v) => (v === null || !isFinite(v) ? null : Math.round(v * 1e4) / 1e4);

/**
 * Alpha Vantage weekly-adjusted JSON → { bars: [{t, c, a, v, d}] } oldest first,
 * keeping the last `years` years. Throws an Error with .kind for API messages
 * ("rate_limit" for the daily cap, "bad_key", "not_found").
 */
export function parseAlphaWeekly(json, years = 20) { // 20 years: enough for the backtest on the investing page
  if (!json || typeof json !== "object") throw Object.assign(new Error("empty response"), { kind: "http" });
  const msg = json.Note || json.Information || json["Error Message"];
  if (msg) {
    const kind = /invalid api key|apikey is invalid|the parameter apikey/i.test(msg) ? "bad_key" : json["Error Message"] ? "not_found" : "rate_limit";
    throw Object.assign(new Error(String(msg).slice(0, 200)), { kind });
  }
  const s = json["Weekly Adjusted Time Series"];
  if (!s) throw Object.assign(new Error("no series"), { kind: "not_found" });
  const from = Date.now() - years * 365.25 * DAY;
  const bars = Object.entries(s).map(([d, v]) => ({ t: Date.parse(d + "T21:00:00Z"), c: Number(v["4. close"]), a: Number(v["5. adjusted close"]), v: Number(v["6. volume"]) || 0, d: Number(v["7. dividend amount"]) || 0 }))
    .filter((b) => isFinite(b.t) && b.c > 0 && b.a > 0 && b.t >= from).sort((x, y) => x.t - y.t);
  if (bars.length < 10) throw Object.assign(new Error("too little history"), { kind: "not_found" });
  return { bars };
}

/** Compact form for storage: [[dayNumber, close, adjClose, volume, dividend], …]. */
export const packBars = (bars) => bars.map((b) => [Math.round(b.t / DAY), r4(b.c), r4(b.a), Math.round(b.v), r4(b.d)]);
export const unpackBars = (rows) => (rows || []).map(([d, c, a, v, dv]) => ({ t: d * DAY, c, a, v, d: dv }));

function barAt(bars, t) {
  let lo = 0, hi = bars.length - 1, ans = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (bars[mid].t <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return ans;
}

/** Total return (adjusted close, so dividends count) over `days` calendar days, in %. */
function ret(bars, days) {
  const last = bars[bars.length - 1];
  if (last.t - bars[0].t < days * DAY * 0.97) return null;
  const i = barAt(bars, last.t - days * DAY);
  return i < 0 ? null : (last.a / bars[i].a - 1) * 100;
}

function maxDrawdown(bars, from) {
  let peak = -Infinity, dd = 0;
  for (const b of bars) { if (b.t < from) continue; peak = Math.max(peak, b.a); dd = Math.min(dd, b.a / peak - 1); }
  return dd * 100;
}

/** Weekly log returns keyed by week number, over the last `days` calendar days. */
function weekReturns(bars, days) {
  const from = bars[bars.length - 1].t - days * DAY, out = new Map();
  for (let i = 1; i < bars.length; i++) if (bars[i].t >= from && bars[i].t - bars[i - 1].t < 15 * DAY) out.set(Math.round(bars[i].t / (7 * DAY)), Math.log(bars[i].a / bars[i - 1].a));
  return out;
}
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const sd = (xs) => { const m = mean(xs); return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1)); };

/** Beta against a benchmark over `days` (default 2 years), from weeks both series cover. */
export function beta(bars, bench, days = 730) {
  if (!bars || !bench || bars.length < 30 || bench.length < 30) return null;
  const a = weekReturns(bars, days), b = weekReturns(bench, days);
  const xs = [], ys = [];
  for (const [w, y] of a) if (b.has(w)) { xs.push(b.get(w)); ys.push(y); }
  if (xs.length < 26) return null;
  const mx = mean(xs), my = mean(ys);
  let cov = 0, vx = 0;
  xs.forEach((x, i) => { cov += (x - mx) * (ys[i] - my); vx += (x - mx) ** 2; });
  return vx ? cov / vx : null;
}

/** Last `weeks` weekly log returns as { end: weekNumber of the last return, r: [...] } for correlations. */
export function weeklySeries(bars, weeks = 156) {
  if (!bars || bars.length < 27) return null;
  const m = weekReturns(bars, weeks * 7 + 3);
  if (m.size < 26) return null;
  const keys = [...m.keys()].sort((x, y) => x - y);
  return { end: keys[keys.length - 1], weeks: keys, r: keys.map((k) => r4(m.get(k))) };
}

/** Everything the scorecard needs from a weekly series. `bench` is SPY's bars, for beta. */
export function priceStats(bars, bench, now = Date.now()) {
  if (!bars || bars.length < 10) return null;
  const last = bars[bars.length - 1];
  const yearAgo = last.t - 365 * DAY;
  const year = bars.filter((b) => b.t >= yearAgo);
  const hi52 = Math.max(...year.map((b) => b.c)), lo52 = Math.min(...year.map((b) => b.c));
  const ma40 = bars.length >= 40 ? mean(bars.slice(-40).map((b) => b.c)) : null; // 40 weeks ≈ the 200-day average
  const wr = [...weekReturns(bars, 365).values()];
  const divTtm = bars.filter((b) => b.t > yearAgo + 3 * DAY).reduce((s, b) => s + (b.d || 0), 0);
  const recent = bars.slice(-13);
  const years = (last.t - bars[0].t) / (365.25 * DAY);
  const cagr = (y) => { const r = ret(bars, Math.round(y * 365.25)); return r === null ? null : (Math.pow(1 + r / 100, 1 / y) - 1) * 100; };
  return {
    price: r2(last.c),
    asOf: new Date(last.t).toISOString().slice(0, 10),
    stale: now - last.t > 10 * DAY,
    r1m: r2(ret(bars, 28)), r3m: r2(ret(bars, 91)), r6m: r2(ret(bars, 182)), r1y: r2(ret(bars, 364)),
    cagr3y: r2(cagr(3)), cagr5y: r2(cagr(5)),
    hi52: r2(hi52), lo52: r2(lo52), fromHigh: r2((last.c / hi52 - 1) * 100),
    ma200: r2(ma40), vsMa200: ma40 ? r2((last.c / ma40 - 1) * 100) : null,
    vol: wr.length >= 26 ? r2(sd(wr) * Math.sqrt(52) * 100) : null,
    dd1y: r2(maxDrawdown(bars, yearAgo)), dd5y: years >= 4.5 ? r2(maxDrawdown(bars, last.t - 5 * 365.25 * DAY)) : null,
    beta: r2(beta(bars, bench)),
    divTtm: r4(divTtm) || 0, yield: divTtm ? r2((divTtm / last.c) * 100) : 0,
    dollarVol: Math.round(mean(recent.map((b) => (b.c * b.v) / 5))), // weekly volume → average per trading day
    historyYears: r2(years),
  };
}

/**
 * Portfolio volatility (annualised, %) from weights and weekly return series,
 * using the sample covariance over the weeks all series share. Holdings without
 * a series are left out and reported, so the caller can say what was covered.
 * items: [{ w: weight (any scale), series: weeklySeries() | null }]
 */
export function portfolioVol(items, minWeeks = 26) {
  const withS = items.filter((x) => x.series && x.w > 0);
  if (!withS.length) return null;
  let common = new Set(withS[0].series.weeks);
  for (const x of withS.slice(1)) common = new Set(x.series.weeks.filter((w) => common.has(w)));
  const weeks = [...common].sort((a, b) => a - b);
  if (weeks.length < minWeeks) return null;
  const R = withS.map((x) => { const m = new Map(x.series.weeks.map((w, i) => [w, x.series.r[i]])); return weeks.map((w) => m.get(w)); });
  const means = R.map(mean);
  const W = withS.reduce((s, x) => s + x.w, 0);
  const w = withS.map((x) => x.w / W);
  let v = 0;
  for (let i = 0; i < R.length; i++) for (let j = 0; j < R.length; j++) {
    let c = 0;
    for (let k = 0; k < weeks.length; k++) c += (R[i][k] - means[i]) * (R[j][k] - means[j]);
    v += w[i] * w[j] * (c / (weeks.length - 1));
  }
  const solo = R.map((r) => sd(r) * Math.sqrt(52) * 100);
  return { vol: r2(Math.sqrt(v * 52) * 100), weighted: r2(w.reduce((s, wi, i) => s + wi * solo[i], 0)), weeks: weeks.length, covered: W };
}

/** Pearson correlation of two weekly series over shared weeks, or null. */
export function correlation(a, b) {
  if (!a || !b) return null;
  const mb = new Map(b.weeks.map((w, i) => [w, b.r[i]]));
  const xs = [], ys = [];
  a.weeks.forEach((w, i) => { if (mb.has(w)) { xs.push(a.r[i]); ys.push(mb.get(w)); } });
  if (xs.length < 26) return null;
  const mx = mean(xs), my = mean(ys);
  let c = 0, vx = 0, vy = 0;
  xs.forEach((x, i) => { c += (x - mx) * (ys[i] - my); vx += (x - mx) ** 2; vy += (ys[i] - my) ** 2; });
  return vx && vy ? c / Math.sqrt(vx * vy) : null;
}

export { num };
