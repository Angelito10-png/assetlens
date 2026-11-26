import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// Same "?v=__V__" query as the app, so these share one module instance with what the app modules import.
import { flowSeries, fundamentals, recentFilings } from "../scripts/markets-lib.mjs";
import * as P from "../src/prices.js?v=__V__";
import * as M from "../src/markets-engine.js?v=__V__";
import { analyze, exposures, encodeHoldings, decodeHoldings, LIMITS } from "../src/analyst.js?v=__V__";
import { MARKET_KEYS } from "../src/i18n-markets.js?v=__V__";
import { LANGS } from "../src/i18n.js?v=__V__";
import { STOCKS, ETFS, SECTORS, ETF_ASSET_CLASS, etfAssetClass, stockByTicker, etfByTicker } from "../src/universe.js?v=__V__";

const SEC = JSON.parse(readFileSync(new URL("./fixtures/sec-2026-11-26.json", import.meta.url)));

/* ---------------------------------------------------------------- SEC helpers */

const fact = (start, end, val, form = "10-Q", filed = end) => ({ start, end, val, form, filed });
// Fiscal years end in late December; quarters reported as year-to-date.
const revenueFacts = [
  fact("2023-01-01", "2023-12-31", 80, "10-K"),
  fact("2024-01-01", "2024-12-29", 88, "10-K"),
  fact("2024-12-30", "2025-12-28", 94, "10-K"),
  fact("2024-12-30", "2025-09-28", 70),
  fact("2025-12-29", "2026-09-27", 75),
  fact("2026-06-29", "2026-09-27", 25), // a single quarter: not year-to-date, ignored
];

test("flowSeries: fiscal years newest first and TTM = last FY + YTD − prior YTD", () => {
  const s = flowSeries(revenueFacts);
  assert.deepEqual(s.years.map((y) => y.val), [94, 88, 80]);
  assert.equal(s.ttm, 94 + 75 - 70);
  assert.equal(s.ttmEnd, "2026-09-27");
  assert.deepEqual(flowSeries([]), { years: [], ttm: null, ttmEnd: null });
});

const companyfacts = (usgaap, dei = {}) => {
  const wrap = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { units: v }]));
  return { entityName: "Testco", facts: { "us-gaap": wrap(usgaap), dei: wrap(dei) } };
};

test("fundamentals: a concept with only old quarterly data does not beat current annual data", () => {
  const cf = companyfacts({
    RevenueFromContractWithCustomerExcludingAssessedTax: { USD: revenueFacts },
    Revenues: { USD: [fact("2013-07-01", "2013-09-29", 17), fact("2013-12-30", "2014-09-28", 56)] },
    NetIncomeLoss: { USD: [fact("2024-12-30", "2025-12-28", 10, "10-K"), fact("2024-01-01", "2024-12-29", 8, "10-K")] },
    StockholdersEquity: { USD: [{ end: "2026-09-27", val: 50, form: "10-Q", filed: "2026-10-20" }] },
    Assets: { USD: [{ end: "2026-09-27", val: 120, form: "10-Q", filed: "2026-10-20" }] },
    LongTermDebt: { USD: [{ end: "2026-09-27", val: 30, form: "10-Q", filed: "2026-10-20" }] },
    WeightedAverageNumberOfDilutedSharesOutstanding: { shares: [fact("2024-12-30", "2025-12-28", 2e9, "10-K")] },
  }, { EntityCommonStockSharesOutstanding: { shares: [{ end: "2026-10-15", val: 1.9e9, form: "10-Q", filed: "2026-10-20" }] } });
  const f = fundamentals(cf);
  assert.equal(f.revenue, 99);
  assert.equal(f.revGrowth, Math.round((94 / 88 - 1) * 1e4) / 100);
  assert.equal(f.netIncome, 10);
  assert.equal(f.debt, 30);
  assert.equal(f.debtFree, false);
  assert.equal(f.shares, 1.9e9); // the recent cover-page count
  assert.equal(f.eps, 10 / 1.9e9); // no EPS tag: net income / shares
});

test("fundamentals: multi-class companies use the diluted count, and no debt tags means debt-free", () => {
  const cf = companyfacts({
    StockholdersEquity: { USD: [{ end: "2026-09-30", val: 50, form: "10-Q" }] },
    WeightedAverageNumberOfDilutedSharesOutstanding: { shares: [fact("2025-10-01", "2026-09-30", 1.95e9, "10-K")] },
  }, { EntityCommonStockSharesOutstanding: { shares: [{ end: "2026-10-20", val: 4.7e8, form: "10-K" }] } });
  const f = fundamentals(cf);
  assert.equal(f.shares, 1.95e9);
  assert.equal(f.debt, 0);
  assert.equal(f.debtFree, true);
  assert.equal(fundamentals(null), null);
  // a share count from years ago is dropped rather than used
  const old = companyfacts({ StockholdersEquity: { USD: [{ end: "2026-09-30", val: 50, form: "10-K" }] } }, { EntityCommonStockSharesOutstanding: { shares: [{ end: "2010-01-27", val: 4.7e8, form: "10-K" }] } });
  assert.equal(fundamentals(old).shares, null);
});

test("recentFilings: keeps annual, quarterly, current and proxy reports with SEC links", () => {
  const sub = { cik: "320193", filings: { recent: {
    form: ["4", "8-K", "10-Q", "S-8", "DEF 14A", "10-K"],
    filingDate: ["2026-11-20", "2026-10-30", "2026-08-01", "2026-07-01", "2026-01-10", "2025-10-31"],
    reportDate: ["", "2026-10-30", "2026-06-28", "", "", "2025-09-27"],
    accessionNumber: ["a-1", "0000320193-26-000101", "0000320193-26-000090", "a-4", "0000320193-26-000010", "0000320193-25-000079"],
    primaryDocument: ["x.xml", "k8.htm", "q.htm", "s8.htm", "def.htm", "k.htm"],
    items: ["", "2.02,9.01", "", "", "", ""],
  } } };
  const list = recentFilings(sub);
  assert.deepEqual(list.map((f) => f.form), ["8-K", "10-Q", "DEF 14A", "10-K"]);
  assert.match(list[0].url, /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/320193\/000032019326000101\/k8\.htm$/);
  assert.equal(list[0].items, "2.02,9.01");
});

/* ---------------------------------------------------------------- prices */

const DAY = 864e5;
const fri = Date.UTC(2026, 10, 20, 21); // a Friday close
/** Weekly bars with a fixed pattern of returns, oldest first. */
function makeBars(n, rets, start = 100, div = 0) {
  const bars = [];
  let p = start;
  for (let i = 0; i < n; i++) {
    if (i) p *= 1 + rets[i % rets.length];
    bars.push({ t: fri - (n - 1 - i) * 7 * DAY, c: p, a: p, v: 1e6, d: i % 13 === 0 ? div : 0 });
  }
  return bars;
}

test("parseAlphaWeekly: reads the series and classifies API messages", () => {
  const series = {};
  for (let i = 0; i < 20; i++) series[new Date(fri - i * 7 * DAY).toISOString().slice(0, 10)] = { "4. close": String(100 + i), "5. adjusted close": String(99 + i), "6. volume": "1000", "7. dividend amount": "0.0000" };
  const { bars } = P.parseAlphaWeekly({ "Weekly Adjusted Time Series": series });
  assert.equal(bars.length, 20);
  assert.ok(bars[0].t < bars[19].t);
  assert.equal(bars[19].c, 100);
  const kind = (json) => { try { P.parseAlphaWeekly(json); } catch (e) { return e.kind; } };
  assert.equal(kind({ Information: "We have detected your API key as ... 25 requests per day" }), "rate_limit");
  assert.equal(kind({ Information: "the parameter apikey is invalid or missing" }), "bad_key");
  assert.equal(kind({ "Error Message": "Invalid API call" }), "not_found");
  assert.deepEqual(P.unpackBars(P.packBars(bars)).map((b) => b.c), bars.map((b) => b.c));
});

test("priceStats: returns, volatility, drawdown and yield from weekly bars", () => {
  const bars = makeBars(300, [0.02, -0.01], 100, 0.5);
  const s = P.priceStats(bars, bars, fri + DAY);
  assert.equal(s.stale, false);
  assert.ok(s.r1y > 0 && s.cagr5y > 0);
  assert.ok(s.vol > 5 && s.vol < 20, `vol ${s.vol}`);
  assert.ok(s.dd1y <= 0 && s.dd1y > -2);
  assert.equal(s.beta, 1); // against itself
  assert.ok(s.yield > 0);
  assert.equal(P.priceStats(bars.slice(0, 5)), null);
});

test("portfolioVol and correlation: mixing uncorrelated assets lowers volatility", () => {
  const a = P.weeklySeries(makeBars(160, [0.03, -0.03, 0.03, -0.03]));
  const b = P.weeklySeries(makeBars(160, [0.03, 0.03, -0.03, -0.03]));
  assert.ok(Math.abs(P.correlation(a, b)) < 0.1);
  assert.ok(P.correlation(a, a) > 0.99);
  const pv = P.portfolioVol([{ w: 1, series: a }, { w: 1, series: b }]);
  assert.ok(pv.vol < pv.weighted * 0.8, JSON.stringify(pv));
  assert.equal(P.portfolioVol([{ w: 1, series: null }]), null);
});

/* ---------------------------------------------------------------- engine */

const stock = (t, px) => M.normalizeAsset({ ...SEC.stocks[t], px }, "stock");
const etf = (t, px) => M.normalizeAsset({ t, name: etfByTicker(t).name, px }, "etf");

test("markets engine: every profile scores real SEC fundamentals between 1 and 10", () => {
  for (const t of Object.keys(SEC.stocks)) for (const k of M.PROFILE_KEYS) {
    const r = M.score(stock(t), k);
    assert.ok(r.total >= 1 && r.total <= 10, `${t} ${k} ${r.total}`);
    assert.equal(r.factors.find((f) => f.key === "risk").score, null, "no prices, no risk score");
  }
  for (const t of ["VOO", "QQQ", "ARKK", "BND", "IBIT"]) for (const k of M.PROFILE_KEYS) {
    const r = M.score(etf(t), k);
    assert.ok(r.total >= 1 && r.total <= 10, `${t} ${k}`);
  }
});

test("markets engine: weights sum to 100 for every kind and profile, and round-trip in the URL", () => {
  for (const [kind, K] of Object.entries(M.KINDS)) for (const p of Object.values(K.profiles)) {
    assert.equal(Object.values(p.weights).reduce((a, b) => a + b, 0), 100, `${kind} ${p.key}`);
    assert.deepEqual(M.decodeWeights(kind, M.encodeWeights(kind, p.weights)), p.weights);
  }
});

test("markets engine: a cheap broad fund beats a costly thematic one for long-term investors", () => {
  assert.ok(M.score(etf("VOO"), "longterm").total > M.score(etf("ARKK"), "longterm").total + 1.5);
  // ARKK's 0.75% fee caps it at 6 for long-term investors
  assert.ok(M.score(etf("ARKK"), "longterm").total <= 6);
});

test("markets engine: a volatile stock is capped for defensive investors", () => {
  const calm = stock("KO", { vol: 15, dd1y: -8 }), wild = stock("TSLA", { vol: 60, dd1y: -45 });
  const r = M.score(wild, "defensive");
  assert.ok(r.total <= 5);
  assert.equal(M.score(stock("NVDA", { vol: 60, dd1y: -20 }), "defensive").total, 5, "a strong but volatile stock hits the cap");
  assert.ok(M.score(calm, "defensive").total > r.total);
});

/* ---------------------------------------------------------------- analyst */

const H = (kind, id, value, scores, extra = {}) => ({ kind, id, symbol: id, name: id, value, scores: { aggressive: scores, defensive: scores, longterm: scores }, ...extra });
const etfH = (t, value, s) => { const e = etfByTicker(t); return H("etf", t, value, s, { cat: e.cat, er: e.er, holdings: e.holdings, top: e.top, sectorMix: e.sectors, assetClass: e.crypto ? "crypto" : ETF_ASSET_CLASS[e.cat] }); };

test("analyst: a concentrated tech + crypto portfolio gets flagged for a defensive investor", () => {
  const hs = [H("stock", "NVDA", 12000, 9, { sector: "tech" }), H("stock", "AAPL", 8000, 9, { sector: "tech" }), etfH("QQQ", 10000, 7), H("crypto", "bitcoin", 5000, 6)];
  const a = analyze(hs, "defensive");
  const keys = a.weaknesses.map((w) => w.key);
  for (const k of ["crypto", "single", "sector", "safe", "overlap"]) assert.ok(keys.includes(k), `missing ${k}: ${keys}`);
  assert.ok(a.penalty > 0 && a.score < a.holdingsScore);
  assert.equal(a.mood, "work");
  assert.equal(a.scores.defensive, a.score);
  assert.ok(a.scores.aggressive > a.score, "the same portfolio fits an aggressive investor better");
  assert.ok(a.fixes.length > 0 && a.fixes.length <= 5);
});

test("analyst: a broad, cheap, balanced portfolio passes for a long-term investor", () => {
  const hs = [etfH("VTI", 50000, 8.5), etfH("VXUS", 25000, 8), etfH("BND", 25000, 7.5)];
  const a = analyze(hs, "longterm");
  assert.equal(a.weaknesses.filter((w) => w.sev === "high").length, 0, JSON.stringify(a.weaknesses));
  assert.ok(a.score >= 7, `score ${a.score}`);
  assert.ok(a.mix.bonds > 20 && a.intl > 20);
});

test("analyst: exposures look through funds into sectors", () => {
  const ex = exposures([etfH("XLK", 1000, 5), H("stock", "JPM", 1000, 5, { sector: "financials" })]);
  assert.ok(ex.sectors.tech > 45);
  assert.equal(ex.sectors.financials >= 50, true);
  assert.equal(analyze([], "defensive").empty, true);
});

test("analyst: holdings round-trip through the URL and junk is dropped", () => {
  const list = [{ kind: "stock", id: "AAPL", value: 5000 }, { kind: "etf", id: "VOO", value: 10000 }, { kind: "crypto", id: "bitcoin", value: 2000 }];
  assert.equal(encodeHoldings(list), "s:AAPL:5000,e:VOO:10000,c:bitcoin:2000");
  assert.deepEqual(decodeHoldings(encodeHoldings(list)), list);
  assert.deepEqual(decodeHoldings("s:AAPL:-5,x:VOO:10,e:<script>:1,c:eth"), []);
});

/* ---------------------------------------------------------------- data + i18n */

test("universe: tickers are unique, sectors known, ETF sector splits near 100%", () => {
  const all = [...STOCKS.map((s) => s[0]), ...ETFS.map((e) => e.t)];
  assert.equal(new Set(all).size, all.length);
  for (const [t, , sec] of STOCKS) assert.ok(SECTORS.includes(sec), `${t} ${sec}`);
  for (const e of ETFS) {
    const sum = Object.values(e.sectors || {}).reduce((a, b) => a + b, 0);
    if (sum) assert.ok(sum > 90 && sum < 105, `${e.t} sectors sum ${sum}`);
  }
  assert.ok(stockByTicker("AAPL") && etfByTicker("VOO"));
  assert.deepEqual(Object.keys(LIMITS), M.PROFILE_KEYS);
});

test("i18n: English and Greek have the same market keys and the same argument shapes", () => {
  const { en, el } = MARKET_KEYS;
  assert.deepEqual(Object.keys(en).sort(), Object.keys(el).sort());
  for (const k of Object.keys(en)) assert.equal(typeof en[k], typeof el[k], k);
  assert.equal(LANGS.en.nav_markets, en.nav_markets, "market keys are merged into the app dictionaries");
});

/* ---------------------------------------------------------------- commodities */

const cmd = (t, px) => M.normalizeAsset({ t, name: etfByTicker(t).name, px }, "commodity");

test("commodities: every fund has the facts its factors read, and weights sum to 100", () => {
  const list = ETFS.filter((e) => e.cat === "commodity");
  assert.ok(list.length >= 10);
  for (const e of list) {
    assert.ok(["physical", "futures"].includes(e.form), e.t);
    assert.ok(e.hedge >= 0 && e.hedge <= 10 && e.metal && e.sub, e.t);
    for (const k of M.PROFILE_KEYS) { const r = M.score(cmd(e.t), k); assert.ok(r.total >= 1 && r.total <= 10, `${e.t} ${k}`); }
  }
  for (const p of Object.values(M.KINDS.commodity.profiles)) assert.equal(Object.values(p.weights).reduce((a, b) => a + b, 0), 100);
});

test("commodities: cheap physical gold beats futures-based natural gas for every profile", () => {
  for (const k of M.PROFILE_KEYS) assert.ok(M.score(cmd("GLDM"), k).total > M.score(cmd("UNG"), k).total + 2, k);
  // long-term investors: futures-based funds are capped at 6
  const r = M.score(cmd("DBC"), "longterm");
  assert.ok(r.total <= 6);
  assert.ok(M.flags(cmd("USO")).some(([, txt]) => /futures/i.test(txt)));
});

test("commodities: precious metals count as a cushion, other commodities have their own limit", () => {
  const e = (t, value) => { const x = etfByTicker(t); return { kind: "etf", id: t, symbol: t, name: t, value, cat: x.cat, metal: x.metal, er: x.er, holdings: x.holdings, top: x.top, assetClass: etfAssetClass(x), scores: { aggressive: 6, defensive: 6, longterm: 6 } }; };
  const ex = exposures([e("VTI", 70), e("GLD", 10), e("USO", 20)]);
  assert.equal(ex.mix.gold, 10);
  assert.equal(ex.mix.commodity, 20);
  const a = analyze([e("VTI", 70), e("GLD", 10), e("USO", 20)], "defensive");
  assert.ok(a.weaknesses.some((w) => w.key === "commodity"), JSON.stringify(a.weaknesses.map((w) => w.key)));
  assert.ok(!a.weaknesses.some((w) => w.key === "single" && /GLD|USO/.test(w.text)), "commodity funds are not judged as single companies");
  // the cheaper alternative for a gold fund is another gold fund
  const b = analyze([e("VTI", 50), e("GLD", 50)], "longterm");
  assert.ok(b.fixes.some((f) => f.key === "fee" && /GLDM/.test(f.text)), JSON.stringify(b.fixes));
});
