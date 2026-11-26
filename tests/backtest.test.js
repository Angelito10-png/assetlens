import { test } from "node:test";
import assert from "node:assert/strict";
import { perfStats, spearman, dailyMap, pointInTime, scoreBacktest, portfolioHistory, PROFILE_KEYS } from "../src/backtest.js?v=__V__";
import { BACKTEST_KEYS } from "../src/i18n-backtest.js?v=__V__";
import { takeaway } from "../src/score-backtest-app.js?v=__V__";
import { setLang } from "../src/i18n.js?v=__V__";

const DAY = 864e5;
const D0 = Date.UTC(2025, 0, 1);

/** A CoinGecko-shaped daily chart: price p(i), market cap and volume proportional to it. */
function chart(days, price, supply = 1e6, start = 0) {
  const prices = [], caps = [], vols = [];
  for (let i = start; i < days; i++) { const p = price(i), ms = D0 + i * DAY; prices.push([ms, p]); caps.push([ms, p * supply]); vols.push([ms, p * supply * 0.05]); }
  return { prices, market_caps: caps, total_volumes: vols };
}

test("translations: every backtest key exists in both languages", () => {
  const en = Object.keys(BACKTEST_KEYS.en).sort(), el = Object.keys(BACKTEST_KEYS.el).sort();
  assert.deepEqual(en, el);
  for (const k of en) assert.equal(typeof BACKTEST_KEYS.en[k], typeof BACKTEST_KEYS.el[k], k);
});

test("perfStats: return, yearly return, largest drop and volatility", () => {
  const times = Array.from({ length: 53 }, (_, i) => D0 + i * 7 * DAY);
  const flat = perfStats(times.map(() => 100), times);
  assert.equal(flat.total, 0); assert.equal(flat.maxDD, 0); assert.equal(flat.vol, 0);
  const v = times.map((_, i) => (i <= 20 ? 100 + i * 5 : i <= 30 ? 200 - (i - 20) * 10 : 100 + (i - 30) * 3));
  const s = perfStats(v, times);
  assert.equal(s.total, 66);
  assert.equal(s.maxDD, -50); // 200 → 100
  assert.ok(s.cagr > 60 && s.cagr < 70);
  assert.ok(s.vol > 0);
  assert.equal(perfStats([100], [D0]), null);
  assert.equal(perfStats(v.slice(0, 10), times.slice(0, 10)).cagr, null); // under a year: no yearly figure
});

test("spearman: perfect, inverse and too few points", () => {
  assert.equal(spearman([1, 2, 3, 4, 5], [10, 20, 30, 40, 50]), 1);
  assert.equal(spearman([1, 2, 3, 4, 5], [5, 4, 3, 2, 1]), -1);
  assert.equal(spearman([1, 2, 3], [1, 2, 3]), null);
});

test("pointInTime uses nothing after the scoring day", () => {
  const a = dailyMap(chart(200, (i) => 100 + i));
  const b = dailyMap(chart(200, (i) => (i <= 120 ? 100 + i : 1))); // same past, crash afterwards
  const day = Math.floor((D0 + 120 * DAY) / DAY);
  assert.deepEqual(pointInTime(a, day, 3), pointInTime(b, day, 3));
  const p = pointInTime(a, day, 3);
  assert.equal(p.rank, 3);
  assert.equal(p.ch1y, null); // a year back isn't in the data
  assert.ok(Math.abs(p.ch30d - ((220 / 190 - 1) * 100)) < 1e-9);
  assert.equal(p.athChange, 0); // at its high
  assert.equal(pointInTime(a, day + 500, 1), null);
});

test("scoreBacktest: structure, and steady winners land in the top third", () => {
  // 15 coins over a year: some trend up steadily, some down; trends persist, so momentum should help.
  const coins = Array.from({ length: 15 }, (_, k) => {
    const drift = (k - 7) * 0.003; // −2.1% … +2.1% a day in log terms
    return { id: "c" + k, symbol: "c" + k, name: "Coin " + k, m: dailyMap(chart(366, (i) => 100 * Math.exp(drift * i) * (1 + 0.01 * Math.sin(i + k)), 1e6 * (k + 1))) };
  });
  const btc = dailyMap(chart(366, (i) => 100 * Math.exp(0.001 * i)));
  const r = scoreBacktest(coins, btc);
  assert.equal(r.universe, 15);
  assert.equal(r.horizon, 90);
  for (const k of PROFILE_KEYS) {
    const P = r.profiles[k];
    assert.ok(P.summary.cohorts >= 7, "about one scoring date a month");
    assert.equal(P.cohorts.length, P.summary.cohorts);
    assert.equal(P.headline.top.length, r.headline.days.length);
    assert.equal(P.headline.top[0], 100);
    assert.equal(P.headline.picks.length, 15);
  }
  const A = r.profiles.aggressive.summary; // momentum-heavy profile
  assert.equal(A.topBeatBottom, A.cohorts);
  assert.ok(A.top > A.bottom);
  assert.ok(A.ic > 0.5);
  assert.equal(scoreBacktest(coins, dailyMap(chart(100, () => 1))), null); // too little history
});

test("takeaway words the result honestly", () => {
  setLang("en");
  const [win] = takeaway({ cohorts: 8, topBeatBottom: 7, top: 12, bottom: 2, topBeatBtc: 5 }, "Aggressive", 90);
  assert.match(win, /beat the bottom third on 7 of 8 dates, by 10.0 percentage points/);
  const [mixed] = takeaway({ cohorts: 8, topBeatBottom: 4, top: 3, bottom: 2, topBeatBtc: 2 }, "Defensive", 90);
  assert.match(mixed, /mixed/);
  const [lose, btc] = takeaway({ cohorts: 8, topBeatBottom: 1, top: -5, bottom: 4, topBeatBtc: 0 }, "Long-term", 90);
  assert.match(lose, /did not help/);
  assert.match(btc, /0 of 8/);
});

test("portfolioHistory: buy-and-hold of today's mix versus SPY", () => {
  const now = D0 + 2 * 365 * DAY;
  const weeks = (n, f, from = 0) => Array.from({ length: n - from }, (_, j) => { const i = j + from; return { t: now - (n - 1 - i) * 7 * DAY, a: f(i), c: f(i) }; });
  const doubles = weeks(105, (i) => 100 * Math.pow(2, i / 104)); // ×2 over two years
  const flat = weeks(105, () => 50);
  const spy = weeks(105, (i) => 400 * (1 + 0.5 * (i / 104)));
  const h = portfolioHistory([{ symbol: "UP", value: 7500, bars: doubles }, { symbol: "FLAT", value: 2500, bars: flat }, { symbol: "NOPX", value: 1000, bars: null }], spy, { years: 2, now });
  assert.equal(h.port[0], 100);
  assert.ok(Math.abs(h.port[h.port.length - 1] - 175) < 1.5); // 75% doubled + 25% flat
  assert.ok(Math.abs(h.bench[h.bench.length - 1] - 150) < 1.5);
  assert.deepEqual(h.missing, ["NOPX"]);
  assert.equal(h.covered, 91);
  assert.deepEqual(h.shortened, []);
  assert.ok(h.stats.port.cagr > 30 && h.stats.port.cagr < 33);
  // a holding with only the last year of prices shortens the period, and says so
  const young = weeks(105, (i) => 10 + i, 53);
  const h2 = portfolioHistory([{ symbol: "UP", value: 1, bars: doubles }, { symbol: "NEW", value: 1, bars: young }], null, { years: 2, now });
  assert.deepEqual(h2.shortened, ["NEW"]);
  assert.equal(h2.bench, null);
  assert.ok(h2.times.length <= 53);
  assert.equal(portfolioHistory([{ symbol: "X", value: 1, bars: null }], spy), null);
});
