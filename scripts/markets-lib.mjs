/**
 * Pure helpers for the markets snapshot (scripts/fetch-markets.mjs):
 * price statistics from a daily price series, and fundamentals from SEC EDGAR
 * "companyfacts" JSON. No network here, so everything is unit-tested.
 */

const DAY = 864e5;
const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);
const r4 = (v) => (v === null ? null : Math.round(v * 1e4) / 1e4);
const r2 = (v) => (v === null ? null : Math.round(v * 100) / 100);

/* ------------------------------------------------------------------ prices */

/** Yahoo Finance v8 chart JSON → { name, currency, bars: [{t, c}], divs: [{t, v}], vols: [] }. */
export function parseYahooChart(json) {
  const res = json && json.chart && json.chart.result && json.chart.result[0];
  if (!res || !Array.isArray(res.timestamp)) return null;
  const q = (res.indicators && res.indicators.quote && res.indicators.quote[0]) || {};
  const adj = res.indicators && res.indicators.adjclose && res.indicators.adjclose[0] && res.indicators.adjclose[0].adjclose;
  const bars = [];
  res.timestamp.forEach((ts, i) => {
    const c = num(q.close && q.close[i]);
    if (c === null || c <= 0) return;
    bars.push({ t: ts * 1000, c, a: num(adj && adj[i]) ?? c, v: num(q.volume && q.volume[i]) ?? 0 });
  });
  const divs = Object.values((res.events && res.events.dividends) || {}).map((d) => ({ t: d.date * 1000, v: num(d.amount) })).filter((d) => d.v !== null).sort((a, b) => a.t - b.t);
  const m = res.meta || {};
  return { name: m.longName || m.shortName || null, currency: m.currency || null, exchange: m.exchangeName || null, price: num(m.regularMarketPrice), bars, divs };
}

/** Stooq daily CSV (Date,Open,High,Low,Close,Volume) → same shape as parseYahooChart, without dividends. */
export function parseStooqCsv(text) {
  const lines = String(text || "").trim().split(/\r?\n/);
  if (!/^date,/i.test(lines[0] || "")) return null;
  const bars = lines.slice(1).map((l) => l.split(",")).map((p) => ({ t: Date.parse(p[0] + "T21:00:00Z"), c: Number(p[4]), v: Number(p[5]) || 0 }))
    .filter((b) => isFinite(b.t) && isFinite(b.c) && b.c > 0).map((b) => ({ ...b, a: b.c }));
  return bars.length ? { name: null, currency: "USD", exchange: null, price: null, bars, divs: [] } : null;
}

/** Index of the last bar on or before time t (bars sorted by time), or -1. */
function barAt(bars, t) {
  let lo = 0, hi = bars.length - 1, ans = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (bars[mid].t <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return ans;
}

/** Total return (adjusted close, so dividends count) over `days` calendar days, in %. Null when history is too short. */
function ret(bars, days) {
  const last = bars[bars.length - 1];
  const i = barAt(bars, last.t - days * DAY);
  if (i < 0 || last.t - bars[0].t < days * DAY * 0.97) return null;
  return (last.a / bars[i].a - 1) * 100;
}

/** Largest peak-to-trough fall of the adjusted close since time `from`, in % (negative). */
function maxDrawdown(bars, from) {
  let peak = -Infinity, dd = 0;
  for (const b of bars) {
    if (b.t < from) continue;
    peak = Math.max(peak, b.a);
    dd = Math.min(dd, b.a / peak - 1);
  }
  return dd * 100;
}

/** Daily log returns keyed by UTC day, over the last `days` calendar days. */
function dailyReturns(bars, days) {
  const from = bars[bars.length - 1].t - days * DAY, out = new Map();
  for (let i = 1; i < bars.length; i++) if (bars[i].t >= from) out.set(Math.floor(bars[i].t / DAY), Math.log(bars[i].a / bars[i - 1].a));
  return out;
}

const sd = (xs) => { const m = xs.reduce((s, x) => s + x, 0) / xs.length; return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1)); };

/** Beta of `bars` against `bench` over the last year, using days both traded. */
export function beta(bars, bench) {
  if (!bars || !bench || bars.length < 60 || bench.length < 60) return null;
  const a = dailyReturns(bars, 365), b = dailyReturns(bench, 365);
  const xs = [], ys = [];
  for (const [d, y] of a) if (b.has(d)) { xs.push(b.get(d)); ys.push(y); }
  if (xs.length < 60) return null;
  const mx = xs.reduce((s, x) => s + x, 0) / xs.length, my = ys.reduce((s, y) => s + y, 0) / ys.length;
  let cov = 0, vx = 0;
  xs.forEach((x, i) => { cov += (x - mx) * (ys[i] - my); vx += (x - mx) ** 2; });
  return vx ? cov / vx : null;
}

/**
 * Weekly log returns over the last ~3 years, aligned to Fridays (UTC), as
 * { start: "YYYY-MM-DD" (first Friday), r: [..] }. The portfolio analyst uses
 * them to estimate correlations and portfolio volatility.
 */
export function weeklyReturns(bars, weeks = 156) {
  if (!bars || bars.length < 20) return null;
  const last = bars[bars.length - 1].t;
  const d = new Date(last); const back = (d.getUTCDay() + 2) % 7; // days since the last Friday
  const lastFri = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back, 23, 59);
  const fridays = [];
  for (let k = weeks; k >= 0; k--) fridays.push(lastFri - k * 7 * DAY);
  const closes = fridays.map((f) => { const i = barAt(bars, f); return i >= 0 && f - bars[i].t < 7 * DAY ? bars[i].a : null; });
  const r = [];
  for (let i = 1; i < closes.length; i++) r.push(closes[i] && closes[i - 1] ? r4(Math.log(closes[i] / closes[i - 1])) : null);
  while (r.length && r[0] === null) r.shift();
  const startIdx = closes.length - r.length;
  return r.length >= 26 ? { start: new Date(fridays[startIdx]).toISOString().slice(0, 10), r } : null;
}

/** Everything the scorecard needs from a price series. `bench` is SPY's series, for beta. */
export function priceStats(series, bench, now = Date.now()) {
  const bars = series && series.bars;
  if (!bars || bars.length < 20) return null;
  const last = bars[bars.length - 1];
  const yearAgo = last.t - 365 * DAY;
  const year = bars.filter((b) => b.t >= yearAgo);
  const hi52 = Math.max(...year.map((b) => b.c)), lo52 = Math.min(...year.map((b) => b.c));
  const ma200 = bars.length >= 200 ? bars.slice(-200).reduce((s, b) => s + b.c, 0) / 200 : null;
  const dr = [...dailyReturns(bars, 365).values()];
  const vol = dr.length >= 60 ? sd(dr) * Math.sqrt(252) * 100 : null;
  const divTtm = series.divs.filter((d) => d.t > last.t - 365 * DAY).reduce((s, d) => s + d.v, 0);
  const recent = bars.slice(-63);
  const dollarVol = recent.reduce((s, b) => s + b.c * b.v, 0) / recent.length;
  const years = (last.t - bars[0].t) / (365.25 * DAY);
  const cagr = (y) => { const r = ret(bars, Math.round(y * 365.25)); return r === null ? null : (Math.pow(1 + r / 100, 1 / y) - 1) * 100; };
  return {
    price: r2(series.price ?? last.c),
    asOf: new Date(last.t).toISOString().slice(0, 10),
    stale: now - last.t > 7 * DAY,
    r1m: r2(ret(bars, 30)), r3m: r2(ret(bars, 91)), r6m: r2(ret(bars, 182)), r1y: r2(ret(bars, 365)),
    cagr3y: r2(cagr(3)), cagr5y: r2(cagr(5)),
    hi52: r2(hi52), lo52: r2(lo52), fromHigh: r2((last.c / hi52 - 1) * 100),
    ma200: r2(ma200), vsMa200: ma200 ? r2((last.c / ma200 - 1) * 100) : null,
    vol: r2(vol), dd1y: r2(maxDrawdown(bars, yearAgo)), dd5y: years >= 4.5 ? r2(maxDrawdown(bars, last.t - 5 * 365.25 * DAY)) : null,
    beta: r2(beta(bars, bench && bench.bars)),
    divTtm: divTtm ? r4(divTtm) : 0, yield: divTtm ? r2((divTtm / last.c) * 100) : 0,
    dollarVol: Math.round(dollarVol),
    historyYears: r2(years),
    weekly: weeklyReturns(bars),
  };
}

/* ------------------------------------------------------------ fundamentals */

const days = (a, b) => (Date.parse(b) - Date.parse(a)) / DAY;

/** Facts of one us-gaap concept in a unit, deduplicated by period (latest filing wins). */
function factsOf(cf, concept, unit = "USD") {
  const node = cf && cf.facts && ((cf.facts["us-gaap"] || {})[concept] || (cf.facts.dei || {})[concept]);
  const list = node && node.units && node.units[unit];
  if (!Array.isArray(list)) return [];
  const byPeriod = new Map();
  for (const f of list) {
    if (num(f.val) === null || !f.end || !/^10-[KQ]/.test(f.form || "")) continue;
    const key = (f.start || "") + "|" + f.end;
    const prev = byPeriod.get(key);
    if (!prev || (f.filed || "") > (prev.filed || "")) byPeriod.set(key, f);
  }
  return [...byPeriod.values()].sort((a, b) => (a.end < b.end ? -1 : a.end > b.end ? 1 : 0));
}

/** The concept, among several candidate names, that has the most recent data. */
function bestConcept(cf, concepts, unit) {
  let best = [];
  for (const c of concepts) {
    const f = factsOf(cf, c, unit);
    if (f.length && (!best.length || f[f.length - 1].end > best[best.length - 1].end)) best = f;
  }
  return best;
}

/**
 * For a flow concept (revenue, income, cash flow): fiscal-year values (newest
 * first) and a trailing-twelve-month value = last fiscal year + this year's
 * year-to-date − last year's year-to-date.
 */
export function flowSeries(facts) {
  const annual = facts.filter((f) => f.start && days(f.start, f.end) > 350 && days(f.start, f.end) < 380).sort((a, b) => (a.end < b.end ? 1 : -1));
  // keep one value per fiscal-year end
  const years = [];
  for (const f of annual) if (!years.some((y) => Math.abs(days(y.end, f.end)) < 60)) years.push(f);
  if (!years.length) return { years: [], ttm: null, ttmEnd: null };
  const fy = years[0];
  const ytd = facts.filter((f) => f.start && f.end > fy.end && days(f.start, f.end) < 350 && days(f.start, f.end) > 80 && Math.abs(days(fy.end, f.start)) < 15)
    .sort((a, b) => (a.end < b.end ? 1 : -1))[0];
  let ttm = fy.val, ttmEnd = fy.end;
  if (ytd) {
    const len = days(ytd.start, ytd.end);
    const prior = facts.find((f) => f.start && Math.abs(days(f.end, ytd.end) - 365) < 12 && Math.abs(days(f.start, f.end) - len) < 12);
    if (prior) { ttm = fy.val + ytd.val - prior.val; ttmEnd = ytd.end; }
  }
  return { years: years.map((y) => ({ end: y.end, val: y.val })), ttm, ttmEnd };
}

/** Latest value of an instant concept (balance sheet), with its date. */
function latestInstant(facts) {
  const inst = facts.filter((f) => !f.start);
  return inst.length ? inst[inst.length - 1] : null;
}

const REVENUE = ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet", "RevenueFromContractWithCustomerIncludingAssessedTax", "RevenuesNetOfInterestExpense", "SalesRevenueGoodsNet"];

/**
 * SEC companyfacts JSON → the fundamentals the stock factors read. Flows are
 * trailing twelve months where the filings allow it, otherwise the last fiscal
 * year; growth compares fiscal years. Values the filings don't carry are null.
 */
export function fundamentals(cf) {
  if (!cf || !cf.facts) return null;
  const flow = (concepts, unit) => flowSeries(bestConcept(cf, concepts, unit));
  const rev = flow(REVENUE), ni = flow(["NetIncomeLoss", "ProfitLoss"]), op = flow(["OperatingIncomeLoss"]);
  const gp = flow(["GrossProfit"]);
  const eps = flow(["EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted", "EarningsPerShareBasic"], "USD/shares");
  const ocf = flow(["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"]);
  const capex = flow(["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"]);
  const shares = bestConcept(cf, ["WeightedAverageNumberOfDilutedSharesOutstanding"], "shares").filter((f) => f.start);
  const sharesDei = latestInstant(bestConcept(cf, ["EntityCommonStockSharesOutstanding"], "shares"));
  const equityF = latestInstant(bestConcept(cf, ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"]));
  const assetsF = latestInstant(bestConcept(cf, ["Assets"]));
  const cashF = latestInstant(bestConcept(cf, ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"]));
  const bsDate = equityF ? equityF.end : assetsF ? assetsF.end : null;
  // Debt: total long-term debt (or its current + noncurrent parts) plus short-term borrowings, all at the latest balance-sheet date.
  const at = (concepts) => { const f = latestInstant(bestConcept(cf, concepts)); return f && bsDate && Math.abs(days(f.end, bsDate)) < 100 ? f.val : null; };
  const ltd = at(["LongTermDebt", "LongTermDebtAndCapitalLeaseObligations"]);
  const ltdParts = [at(["LongTermDebtNoncurrent", "LongTermDebtAndCapitalLeaseObligationsNoncurrent"]), at(["LongTermDebtCurrent", "LongTermDebtAndCapitalLeaseObligationsCurrent"])];
  const shortTerm = (at(["ShortTermBorrowings"]) || 0) + (at(["CommercialPaper"]) || 0);
  const longTerm = ltd ?? (ltdParts.some((v) => v !== null) ? (ltdParts[0] || 0) + (ltdParts[1] || 0) : null);
  const debt = longTerm === null && !shortTerm ? null : (longTerm || 0) + shortTerm;
  const g = (s, k = 1) => (s.years.length > k && s.years[k].val > 0 ? (s.years[0].val / s.years[k].val) ** (1 / k) * 100 - 100 : null);
  const fresh = (s) => (s.ttmEnd && bsDate && days(s.ttmEnd, bsDate) > 500 ? null : s.ttm); // ignore concepts the company stopped reporting
  const revenue = fresh(rev), netIncome = fresh(ni);
  return {
    entity: cf.entityName || null,
    periodEnd: rev.ttmEnd || ni.ttmEnd || bsDate,
    fiscalYearEnd: (rev.years[0] || ni.years[0] || {}).end || null,
    revenue, netIncome, opIncome: fresh(op), grossProfit: fresh(gp),
    eps: fresh(eps), fcf: fresh(ocf) !== null ? fresh(ocf) - (fresh(capex) || 0) : null,
    revGrowth: r2(g(rev)), revCagr3: r2(g(rev, 3)), epsGrowth: eps.years.length > 1 && eps.years[1].val > 0 ? r2((eps.years[0].val / eps.years[1].val - 1) * 100) : null,
    niGrowth: r2(g(ni)),
    shares: shares.length ? shares[shares.length - 1].val : sharesDei ? sharesDei.val : null,
    equity: equityF ? equityF.val : null, assets: assetsF ? assetsF.val : null, cash: cashF ? cashF.val : null, debt,
    balanceDate: bsDate,
  };
}
