import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGlobal, parseFng, fngBand, weekChange, pickSimilar, topRisks } from "../src/sidebar.js?v=__V__";
import { categoryOf } from "../src/categories.js?v=__V__";
import { MARKET_KEYS } from "../src/i18n-markets.js?v=__V__";

test("parseGlobal reads total market cap, 24h change and Bitcoin's share", () => {
  const g = parseGlobal({ data: { total_market_cap: { usd: 2.95e12, eur: 2.7e12 }, market_cap_change_percentage_24h_usd: -1.4, market_cap_percentage: { btc: 57.2, eth: 9 } } });
  assert.deepEqual(g, { total: 2.95e12, ch24: -1.4, btcDom: 57.2 });
  assert.equal(parseGlobal({}), null);
  assert.equal(parseGlobal({ data: { total_market_cap: {} } }), null);
});

test("parseFng reads the latest Fear & Greed value and bands it", () => {
  const f = parseFng({ name: "Fear and Greed Index", data: [{ value: "28", value_classification: "Fear", timestamp: "1764115200" }] });
  assert.equal(f.value, 28);
  assert.equal(f.band, "fear");
  assert.equal(f.at, 1764115200000);
  assert.equal(parseFng({ data: [] }), null);
  assert.equal(parseFng({ data: [{ value: "abc" }] }), null);
  assert.deepEqual([0, 24, 25, 44, 45, 55, 56, 75, 76, 100].map(fngBand), ["xfear", "xfear", "fear", "fear", "neutral", "neutral", "greed", "greed", "xgreed", "xgreed"]);
});

test("weekChange compares the last two weekly closes", () => {
  const w = weekChange([{ c: 100 }, { c: 500 }, { c: 525 }]);
  assert.equal(w.price, 525);
  assert.ok(Math.abs(w.ch - 5) < 1e-9);
  assert.equal(weekChange([{ c: 1 }]), null);
  assert.equal(weekChange(null), null);
});

test("pickSimilar keeps only higher scores, best first, at most three, never the asset itself", () => {
  const list = [{ id: "A", score: 6 }, { id: "B", score: 8 }, { id: "SELF", score: 9 }, { id: "C", score: 7.5 }, { id: "D", score: 9.5 }, { id: "E", score: 7.1 }, { id: "F", score: null }];
  assert.deepEqual(pickSimilar({ id: "SELF", score: 7 }, list).map((x) => x.id), ["D", "B", "C"]);
  assert.deepEqual(pickSimilar({ id: "D", score: 9.5 }, list), []);
  assert.deepEqual(pickSimilar({ id: "X", score: 1 }, null), []);
});

test("topRisks puts serious flags first and drops informational ones", () => {
  const r = topRisks([["info", "i"], ["mid", "m1"], ["high", "h"], ["mid", "m2"], ["mid", "m3"]]);
  assert.deepEqual(r.map((x) => x[1]), ["h", "m1", "m2"]);
  assert.deepEqual(topRisks([["info", "i"]]), []);
});

test("categoryOf maps CoinGecko category names to the menu, most specific first", () => {
  assert.equal(categoryOf(["Smart Contract Platform", "Layer 1 (L1)", "Proof of Stake (PoS)"]).key, "layer1");
  assert.equal(categoryOf(["Layer 1 (L1)", "Meme", "Dog-Themed"]).key, "meme");
  assert.equal(categoryOf(["Stablecoins", "USD Stablecoin", "Ethereum Ecosystem"]).key, "stable");
  assert.equal(categoryOf(["Decentralized Finance (DeFi)", "Oracle"]).key, "oracle");
  assert.equal(categoryOf(["Ethereum Ecosystem"]), null);
  assert.equal(categoryOf(undefined), null);
});

test("side-column text exists in both languages", () => {
  const keys = Object.keys(MARKET_KEYS.en).filter((k) => k.startsWith("sb_"));
  assert.ok(keys.length >= 20);
  for (const k of keys) assert.ok(k in MARKET_KEYS.el, k);
});
