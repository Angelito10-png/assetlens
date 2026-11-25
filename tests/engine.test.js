import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../src/engine.js";
import { parseGithubUrl } from "../src/api.js";

/* Shaped like a real CoinGecko /coins/{id} response (trimmed to the fields the engine reads). */
const bigCoin = {
  id: "bigcoin", name: "Bigcoin", symbol: "big", market_cap_rank: 1, genesis_date: "2010-01-03",
  sentiment_votes_up_percentage: 60, watchlist_portfolio_users: 2_490_739,
  categories: ["Layer 1 (L1)"], links: { homepage: ["https://example.org"], repos_url: { github: ["https://github.com/big/big"] } },
  market_data: {
    current_price: { usd: 57947 }, market_cap: { usd: 1.166e12 }, fully_diluted_valuation: { usd: 1.1661e12 },
    total_volume: { usd: 3.08e10 }, circulating_supply: 20_117_178, total_supply: 20_117_225, max_supply: 21_000_000,
    price_change_percentage_24h: -3, price_change_percentage_7d: -8.9, price_change_percentage_30d: -27.8, price_change_percentage_1y: -33,
    ath_change_percentage: { usd: -54 }, ath: { usd: 126080 }, high_24h: { usd: 60169 }, low_24h: { usd: 57308 },
  },
};
const gh = { repo: "big/big", stars: 90_000, forks: 38_000, commits4w: 180, commits52w: 2400, contributors: 500, daysSincePush: 1 };

const tinyMeme = {
  id: "tiny", name: "Tiny", symbol: "tny", market_cap_rank: 812, categories: ["Meme"],
  market_data: { current_price: { usd: 0.0001 }, market_cap: { usd: 4e6 }, total_volume: { usd: 1e4 }, circulating_supply: 1e9, total_supply: 1e10, ath_change_percentage: { usd: -97 } },
};

test("lin maps and clamps, in both directions", () => {
  assert.equal(E.lin(5, 0, 10), 5);
  assert.equal(E.lin(-5, 0, 10), 0);
  assert.equal(E.lin(50, 0, 10), 10);
  assert.equal(E.lin(2, 10, 0), 8); // lower is better
});

test("normalize reads nested CoinGecko fields and GitHub stats", () => {
  const c = E.normalize(bigCoin, null, gh);
  assert.equal(c.symbol, "BIG");
  assert.equal(c.price, 57947);
  assert.equal(c.max, 21_000_000);
  assert.equal(c.athChange, -54);
  assert.equal(c.devSource, "github");
  assert.equal(c.commits4w, 180);
});

test("normalize falls back to a flat /coins/markets row", () => {
  const c = E.normalize({}, { id: "x", name: "X", symbol: "x", current_price: 2, market_cap: 100, market_cap_rank: 9 });
  assert.equal(c.price, 2);
  assert.equal(c.rank, 9);
  assert.equal(c.devProvided, false);
});

test("every profile yields a score between 1 and 10 with weights summing to 100", () => {
  const c = E.normalize(bigCoin, null, gh);
  for (const [k, p] of Object.entries(E.PROFILES)) {
    assert.equal(Object.values(p.weights).reduce((a, b) => a + b, 0), 100, k);
    const r = E.score(c, k);
    assert.ok(r.total >= 1 && r.total <= 10, `${k}: ${r.total}`);
    assert.equal(r.coverage, 100);
  }
});

test("missing GitHub data is skipped, not punished, when a repository exists", () => {
  const withGh = E.score(E.normalize(bigCoin, null, gh), "longterm");
  const without = E.score(E.normalize(bigCoin, null, null), "longterm");
  const dev = without.factors.find((f) => f.key === "development");
  assert.equal(dev.score, null);
  assert.ok(without.coverage < 100);
  // effective weights of the factors that remain still sum to 100%
  const eff = without.factors.reduce((s, f) => s + f.effWeight, 0);
  assert.ok(Math.abs(eff - 100) < 1e-9);
  assert.ok(withGh.total > 1 && without.total > 1);
});

test("a large, mature coin scores higher than a tiny meme coin for every profile", () => {
  const big = E.normalize(bigCoin, null, gh), tiny = E.normalize(tinyMeme);
  for (const k of Object.keys(E.PROFILES)) assert.ok(E.score(big, k).total > E.score(tiny, k).total + 3, k);
});

test("defensive profile caps coins outside the top 100 at 5", () => {
  const strongButSmall = structuredClone(bigCoin);
  strongButSmall.market_cap_rank = 150;
  const r = E.score(E.normalize(strongButSmall, null, gh), "defensive");
  assert.ok(r.total <= 5);
  assert.equal(r.caps.length, 1);
});

test("aggressive profile rewards momentum more than defensive does", () => {
  const rally = structuredClone(bigCoin);
  Object.assign(rally.market_data, { price_change_percentage_7d: 20, price_change_percentage_30d: 45, price_change_percentage_1y: 160 });
  const base = E.normalize(bigCoin, null, gh), up = E.normalize(rally, null, gh);
  const gain = (k) => E.score(up, k).total - E.score(base, k).total;
  assert.ok(gain("aggressive") > gain("defensive"));
});

test("risk flags catch low float, thin volume, deep drawdown and meme status", () => {
  const f = E.flags(E.normalize(tinyMeme)).map(([, t]) => t).join(" ");
  assert.match(f, /Small cap/);
  assert.match(f, /low trading volume/);
  assert.match(f, /10% of supply circulating/);
  assert.match(f, /Down 97%/);
  assert.match(f, /Meme coin/);
});

test("recommendations always start with the portfolio role and list data gaps", () => {
  const c = E.normalize(bigCoin);
  const recs = E.recommend(c, E.score(c, "longterm"));
  assert.equal(recs[0][0], "Role in your portfolio");
  assert.ok(recs.some(([h]) => h === "Data gaps"));
});

test("verdict bands", () => {
  assert.deepEqual(E.verdict(8.4), ["Strong fit", "strong"]);
  assert.deepEqual(E.verdict(5.0), ["Mixed", "mixed"]);
  assert.deepEqual(E.verdict(2.1), ["Poor fit", "poor"]);
});

test("parseGithubUrl handles repo and organisation links", () => {
  assert.deepEqual(parseGithubUrl("https://github.com/bitcoin/bitcoin"), { owner: "bitcoin", repo: "bitcoin" });
  assert.deepEqual(parseGithubUrl("https://github.com/ethereum"), { owner: "ethereum", repo: null });
  assert.deepEqual(parseGithubUrl("https://github.com/a/b.git"), { owner: "a", repo: "b" });
  assert.equal(parseGithubUrl("https://gitlab.com/a/b"), null);
});

test("a coin with no code repository scores 0 on development and is capped for long-term", () => {
  const c = E.normalize(tinyMeme);
  const r = E.score(c, "longterm");
  assert.equal(r.factors.find((f) => f.key === "development").score, 0);
  assert.ok(r.total <= 6);
});

test("regression: real CoinGecko + GitHub data captured on 2026-11-25", async () => {
  const fs = await import("node:fs");
  const F = JSON.parse(fs.readFileSync(new URL("./fixtures/live-2026-11-25.json", import.meta.url)));
  const s = (id, k) => E.score(E.normalize(F[id].info, null, F[id].gh), k).total;
  // Established smart-contract platform with active code beats a meme coin for long-term holders.
  assert.ok(s("ethereum", "longterm") > s("pepe", "longterm") + 2);
  assert.ok(s("chainlink", "longterm") > s("pepe", "longterm") + 2);
  // Every coin was down sharply that month, so aggressive (momentum-heavy) scores trail long-term ones.
  for (const id of ["ethereum", "chainlink", "pepe"]) assert.ok(s(id, "aggressive") < s(id, "longterm"), id);
  // Ethereum has no supply cap and gets flagged for it.
  assert.ok(E.flags(E.normalize(F.ethereum.info)).some(([, t]) => /No supply cap/.test(t)));
});

test("custom weights override the profile and change the score", () => {
  const c = E.normalize(bigCoin, null, gh);
  const base = E.score(c, "longterm");
  const momentumOnly = E.score(c, "longterm", { size: 0, tokenomics: 0, momentum: 100, stability: 0, development: 0, maturity: 0, community: 0 });
  assert.equal(momentumOnly.profile.custom, true);
  assert.ok(momentumOnly.total < base.total); // momentum was weak in the fixture
  const m = momentumOnly.factors.find((f) => f.key === "momentum");
  assert.ok(Math.abs(m.effWeight - 100) < 1e-9);
  // the original profile object is untouched
  assert.equal(E.PROFILES.longterm.weights.momentum, 5);
});

test("weights scale does not matter, only proportions", () => {
  const c = E.normalize(bigCoin, null, gh);
  const w = E.PROFILES.defensive.weights;
  const doubled = Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v * 2]));
  assert.equal(E.score(c, "defensive", doubled).total, E.score(c, "defensive").total);
});

test("weights round-trip through the URL format and reject bad input", () => {
  const w = E.PROFILES.aggressive.weights;
  assert.deepEqual(E.decodeWeights(E.encodeWeights(w)), w);
  assert.equal(E.decodeWeights("1,2,3"), null);
  assert.equal(E.decodeWeights("0,0,0,0,0,0,0"), null);
  assert.equal(E.decodeWeights("10,-1,10,10,10,10,10"), null);
  assert.deepEqual(E.sanitizeWeights({ size: "5", bogus: 3, momentum: -2 }), { size: 5 });
});
