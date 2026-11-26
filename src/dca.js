/**
 * Investing-plan maths for the guide page. Pure functions, unit-tested.
 * Monthly contributions are made at the start of each month; growth compounds monthly
 * at the monthly rate equivalent to the yearly return.
 */

const fin = (v) => typeof v === "number" && isFinite(v);
/** Yearly % → monthly growth rate (so 12 months of it equal the yearly return). */
export const monthlyRate = (yearPct) => Math.pow(1 + yearPct / 100, 1 / 12) - 1;

/**
 * Month-by-month plan.
 * { monthly, years, rate (yearly %), initial = 0, stepUp = 0 (% raise of the monthly amount each year) }
 * → { rows: [{ m, invested, value }] (m = 0 is the start), invested, value, profit, profitPct }
 */
export function simulate({ monthly = 0, years = 10, rate = 7, initial = 0, stepUp = 0 } = {}) {
  const n = Math.max(0, Math.round(years * 12));
  const r = monthlyRate(rate);
  let invested = Math.max(0, initial), value = invested, pay = Math.max(0, monthly);
  const rows = [{ m: 0, invested, value }];
  for (let m = 1; m <= n; m++) {
    if (m > 1 && (m - 1) % 12 === 0) pay *= 1 + stepUp / 100;
    invested += pay;
    value = (value + pay) * (1 + r);
    rows.push({ m, invested, value });
  }
  const profit = value - invested;
  return { rows, invested, value, profit, profitPct: invested > 0 ? (profit / invested) * 100 : 0 };
}

/** Monthly amount needed to reach `target` in `years` at `rate`, after `initial` (0 if already reached). */
export function requiredMonthly({ target, years, rate, initial = 0 }) {
  const n = Math.round(years * 12);
  if (!fin(target) || n <= 0) return null;
  const r = monthlyRate(rate);
  const g = Math.pow(1 + r, n);
  const fromInitial = initial * g;
  if (fromInitial >= target) return 0;
  const annuity = r === 0 ? n : ((g - 1) / r) * (1 + r);
  return (target - fromInitial) / annuity;
}

/** Yearly return needed for the plan to reach `target` (bisection, −50%…+100%); null if out of range. */
export function requiredRate({ target, years, monthly, initial = 0 }) {
  const end = (rate) => simulate({ monthly, years, rate, initial }).value;
  let lo = -50, hi = 100;
  if (!fin(target) || end(hi) < target || end(lo) > target) return null;
  for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (end(mid) < target) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

/** The same total invested all at once on day one, for comparison with the monthly plan. */
export function lumpSum({ total, years, rate }) {
  return total * Math.pow(1 + rate / 100, years);
}

/* ---------------------------------------------------------------- backtest on real prices */

/**
 * Weekly bars [{ t: ms, c: close, a: adjusted close }] → the first bar of each calendar month,
 * as { d: "YYYY-MM-DD", c } using the adjusted close (dividends reinvested) when there is one.
 */
export function monthlyFromWeekly(bars) {
  const out = [];
  let last = "";
  for (const b of bars || []) {
    const px = b && (b.a > 0 ? b.a : b.c);
    if (!(px > 0) || !isFinite(b.t)) continue;
    const d = new Date(b.t).toISOString().slice(0, 10);
    if (d.slice(0, 7) !== last) { out.push({ d, c: px }); last = d.slice(0, 7); }
  }
  return out;
}

/**
 * Buy `monthly` on the first trading week of each month over the last `years`, versus
 * investing the same total on the first day. Uses adjusted prices, so dividends count as reinvested.
 * → { start, end, months, invested, value, profitPct, lump, lumpPct, worstDrop, rows: [{ d, invested, value }] } | null
 */
export function backtestDca(bars, { monthly, years }) {
  const all = monthlyFromWeekly(bars);
  if (all.length < 2 || !(monthly > 0)) return null;
  // the last month is the valuation date; buys happen on every month before it
  const months = all.slice(-Math.min(Math.round(years * 12) + 1, all.length));
  const buys = months.slice(0, -1), last = months[months.length - 1];
  let units = 0, invested = 0, worstDrop = 0;
  const rows = [];
  for (const b of months) {
    if (b !== last) { units += monthly / b.c; invested += monthly; }
    const value = units * b.c;
    rows.push({ d: b.d, invested, value });
    worstDrop = Math.min(worstDrop, (value / invested - 1) * 100); // worst point: value vs money put in so far
  }
  const value = units * last.c, lump = (invested / buys[0].c) * last.c;
  return {
    start: buys[0].d, end: last.d, months: buys.length, invested, value,
    profitPct: (value / invested - 1) * 100, lump, lumpPct: (lump / invested - 1) * 100, worstDrop, rows,
  };
}
