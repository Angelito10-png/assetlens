/**
 * Coin categories shown in the menu, mapped to CoinGecko category ids
 * (checked against /coins/categories/list on 2026-11-26).
 */
import * as E from "./engine.js?v=__V__";

export const CATEGORIES = [
  { key: "layer1", id: "layer-1" },
  { key: "layer2", id: "layer-2" },
  { key: "defi", id: "decentralized-finance-defi" },
  { key: "rwa", id: "real-world-assets-rwa" },
  { key: "ai", id: "artificial-intelligence" },
  { key: "meme", id: "meme-token" },
  { key: "gaming", id: "gaming" },
  { key: "depin", id: "depin" },
  { key: "oracle", id: "oracle" },
  { key: "privacy", id: "privacy-coins" },
  { key: "stable", id: "stablecoins" },
];

export const categoryByKey = (key) => CATEGORIES.find((c) => c.key === key) || null;

/**
 * Score every market row for a profile and sort it.
 * sort: "mcap" (largest first, unknown last) or "score" (highest quick score first).
 */
export function rankRows(rows, profileKey, customWeights, sort = "mcap") {
  const out = (rows || []).filter((r) => r && r.id && r.name).map((row) => {
    const q = E.quickScore(row, profileKey, customWeights);
    return { id: row.id, name: row.name, symbol: (row.symbol || "").toUpperCase(), image: row.image || null, row, c: q.c, total: q.total, coverage: q.coverage, verdict: E.verdict(q.total) };
  });
  const mc = (x) => (typeof x.row.market_cap === "number" ? x.row.market_cap : -1);
  out.sort(sort === "score" ? (a, b) => b.total - a.total || mc(b) - mc(a) : (a, b) => mc(b) - mc(a));
  return out;
}
