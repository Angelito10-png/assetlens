/**
 * Build step: collect recent headlines per coin and write them to a JSON file
 * that the static site reads from its own origin.
 *
 * Why a build step: CryptoPanic needs a private API key and does not allow calls
 * from browsers, so the key lives in a GitHub Actions secret (CRYPTOPANIC_TOKEN)
 * and never reaches the page. Without the secret, headlines come from public RSS
 * feeds of crypto news sites instead.
 *
 * Usage: node scripts/fetch-news.mjs <out.json>
 */
import { writeFileSync } from "node:fs";
import { parseRss, coinMatchers, matchHeadline, fromCryptoPanic, groupNews } from "./news-lib.mjs";

const OUT = process.argv[2] || "news.json";
const UA = { "user-agent": "coin-scorecard-news/1.0 (+https://github.com/Angelito10-png/coin-scorecard)" };
const FEEDS = [
  ["CoinDesk", "https://www.coindesk.com/arc/outboundfeeds/rss/"],
  ["Cointelegraph", "https://cointelegraph.com/rss"],
  ["Decrypt", "https://decrypt.co/feed"],
  ["Bitcoin Magazine", "https://bitcoinmagazine.com/.rss/full/"],
  ["The Block", "https://www.theblock.co/rss.xml"],
  ["CryptoSlate", "https://cryptoslate.com/feed/"],
];

async function get(url, as = "text") {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`${r.status} ${url.replace(/auth_token=[^&]+/, "auth_token=***")}`);
  return as === "json" ? r.json() : r.text();
}

async function main() {
  const coins = (await get("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1", "json"))
    .map((c) => ({ id: c.id, name: c.name, symbol: c.symbol }));
  const tagged = [];
  const used = [];

  const token = process.env.CRYPTOPANIC_TOKEN;
  if (token) {
    const symbolToIds = {};
    for (const c of coins) (symbolToIds[c.symbol.toUpperCase()] ||= []).push(c.id);
    // Only the first coin with a ticker gets it (the list is sorted by market cap).
    for (const k of Object.keys(symbolToIds)) symbolToIds[k] = symbolToIds[k].slice(0, 1);
    try {
      for (let page = 1; page <= 3; page++) {
        const json = await get(`https://cryptopanic.com/api/developer/v2/posts/?auth_token=${encodeURIComponent(token)}&public=true&kind=news&page=${page}`, "json");
        tagged.push(...fromCryptoPanic(json, symbolToIds));
        if (!json.next) break;
      }
      used.push("CryptoPanic");
    } catch (e) { console.warn("CryptoPanic failed:", e.message); }
  }

  const matchers = coinMatchers(coins.slice(0, 150));
  for (const [name, url] of FEEDS) {
    try {
      const items = parseRss(await get(url), name);
      let n = 0;
      for (const it of items) { const ids = matchHeadline(it.title, matchers); if (ids.length) { tagged.push({ ids, item: it }); n++; } }
      used.push(name);
      console.log(`${name}: ${items.length} items, ${n} matched a coin`);
    } catch (e) { console.warn(`${name} failed:`, e.message); }
  }

  const byCoin = groupNews(tagged, 8);
  writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString(), sources: used, coins: byCoin }));
  console.log(`Wrote ${OUT}: ${Object.keys(byCoin).length} coins with news, sources: ${used.join(", ") || "none"}`);
}

main().catch((e) => {
  // Never break the deploy over news: ship an empty file and let the page say so.
  console.warn("News step failed:", e.message);
  writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString(), sources: [], coins: {} }));
});
