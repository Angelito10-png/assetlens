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
const UA = { "user-agent": "assetlens-news/1.0 (+https://github.com/Angelito10-png/assetlens)" };
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
  if (!r.ok) {
    const body = (await r.text().catch(() => "")).replace(/\s+/g, " ");
    const blocked = /cloudflare|cf-ray|attention required/i.test(body);
    const err = new Error(`${r.status}${blocked ? " (blocked by Cloudflare)" : ""} ${url.replace(/auth_token=[^&]+/, "auth_token=***")} ${blocked ? "" : body.slice(0, 160)}`);
    err.blocked = blocked;
    throw err;
  }
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
    // CryptoPanic serves each plan under its own path; try them in order until one answers.
    for (const plan of ["developer/v2", "free/v2", "v1"]) {
      try {
        let n = 0;
        for (let page = 1; page <= 3; page++) {
          const json = await get(`https://cryptopanic.com/api/${plan}/posts/?auth_token=${encodeURIComponent(token)}&public=true&kind=news&page=${page}`, "json");
          const got = fromCryptoPanic(json, symbolToIds);
          tagged.push(...got); n += (json.results || []).length;
          if (!json.next) break;
        }
        used.push("CryptoPanic");
        console.log(`CryptoPanic (${plan}): ${n} posts`);
        break;
      } catch (e) {
        console.warn(`CryptoPanic ${plan} failed:`, e.message);
        if (e.blocked) break; // Cloudflare refuses this network outright; other paths won't differ.
      }
    }
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
