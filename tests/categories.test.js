import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../src/engine.js?v=__V__";
import { CATEGORIES, categoryByKey, rankRows } from "../src/categories.js";
import { LANGS } from "../src/i18n.js";

const now = Date.now(), yearsAgo = (y) => new Date(now - y * 365.25 * 864e5).toISOString();
const row = (id, mcap, extra = {}) => ({ id, name: id[0].toUpperCase() + id.slice(1), symbol: id.slice(0, 3), market_cap: mcap, market_cap_rank: extra.rank ?? 10, current_price: 10, total_volume: mcap * 0.1, circulating_supply: 90, total_supply: 100, max_supply: 100, fully_diluted_valuation: mcap * 1.1, price_change_percentage_24h: 1, price_change_percentage_7d_in_currency: 2, price_change_percentage_30d_in_currency: 5, price_change_percentage_1y_in_currency: 40, ath_change_percentage: -20, high_24h: 10.3, low_24h: 9.8, atl_date: yearsAgo(6), ath_date: yearsAgo(1), ...extra });

test("categories: every menu entry has a CoinGecko id and a label in both languages", () => {
  assert.ok(CATEGORIES.length >= 8);
  assert.equal(new Set(CATEGORIES.map((c) => c.id)).size, CATEGORIES.length);
  for (const c of CATEGORIES) for (const lang of ["en", "el"]) assert.equal(typeof LANGS[lang]["cat_" + c.key], "string", `${lang} ${c.key}`);
  assert.equal(categoryByKey("rwa").id, "real-world-assets-rwa");
  assert.equal(categoryByKey("nope"), null);
});

test("quick score: market data only, development skipped (not zero) and no code cap", () => {
  const q = E.quickScore(row("bigchain", 5e10, { rank: 3 }), "longterm");
  const dev = q.factors.find((f) => f.key === "development");
  assert.equal(dev.score, null);
  assert.equal(q.caps.length, 0);
  assert.ok(q.total > 6, `expected a healthy large coin above the no-code cap, got ${q.total}`);
  assert.ok(q.coverage < 100);
  // The full engine still punishes a coin with no listed repository.
  const full = E.score(E.normalize(null, row("bigchain", 5e10, { rank: 3 }), null), "longterm");
  assert.equal(full.factors.find((f) => f.key === "development").score, 0);
});

test("categories: rows are scored and sorted by market cap or quick score", () => {
  const rows = [row("small", 1e8, { rank: 400, price_change_percentage_30d_in_currency: 80, price_change_percentage_1y_in_currency: 300 }), row("large", 9e10, { rank: 2 }), { id: "broken" }];
  const byCap = rankRows(rows, "defensive");
  assert.deepEqual(byCap.map((x) => x.id), ["large", "small"]);
  assert.ok(byCap[1].total <= 5, "defensive cap outside the top 100 still applies");
  const byScore = rankRows(rows, "aggressive", null, "score");
  assert.equal(byScore.length, 2);
  assert.ok(byScore[0].total >= byScore[1].total);
  assert.equal(typeof byScore[0].verdict[1], "string");
});
