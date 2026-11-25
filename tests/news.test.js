import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRss, coinMatchers, matchHeadline, fromCryptoPanic, groupNews, decodeEntities } from "../scripts/news-lib.mjs";

const coins = [
  { id: "bitcoin", name: "Bitcoin", symbol: "btc" },
  { id: "ethereum", name: "Ethereum", symbol: "eth" },
  { id: "chainlink", name: "Chainlink", symbol: "link" },
  { id: "toncoin", name: "Toncoin", symbol: "ton" },
  { id: "solana", name: "Solana", symbol: "sol" },
];

test("news: parses RSS items with CDATA, entities and dates", () => {
  const xml = `<rss><channel><title>Feed</title>
    <item><title><![CDATA[Chainlink &amp; Swift expand pilot]]></title><link>https://ex.com/a</link><pubDate>Tue, 25 Nov 2026 10:00:00 GMT</pubDate><description>&lt;p&gt;Body&lt;/p&gt;</description></item>
    <item><title>No link</title></item>
    <item><title>Bad link</title><link>javascript:alert(1)</link></item>
  </channel></rss>`;
  const items = parseRss(xml, "Ex");
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Chainlink & Swift expand pilot");
  assert.equal(items[0].published, "2026-11-25T10:00:00.000Z");
  assert.equal(items[0].source, "Ex");
  assert.equal(decodeEntities("A &#8217; B"), "A ’ B");
});

test("news: matches headlines by name or unambiguous ticker, not by substrings", () => {
  const m = coinMatchers(coins);
  assert.deepEqual(matchHeadline("Bitcoin slips below $90K as ETH holds", m), ["bitcoin", "ethereum"]);
  assert.deepEqual(matchHeadline("Oracle network Chainlink adds CCIP lanes", m), ["chainlink"]);
  assert.deepEqual(matchHeadline("$LINK jumps 12%", m), ["chainlink"]);
  assert.deepEqual(matchHeadline("Click the link to read more", m), []); // lower-case word, not the ticker
  assert.deepEqual(matchHeadline("Firm buys a ton of servers", m), []); // ambiguous ticker
  assert.deepEqual(matchHeadline("Solanart and Ethereumish are other things", m), []);
});

test("news: CryptoPanic posts map to coins by ticker; groups dedupe and sort newest first", () => {
  const json = { results: [
    { title: "BTC ETF inflows hit record", published_at: "2026-11-25T09:00:00Z", id: 1, slug: "btc-etf", source: { title: "Src" }, instruments: [{ code: "BTC" }] },
    { title: "Old BTC story", published_at: "2026-11-24T09:00:00Z", original_url: "https://ex.com/old", currencies: [{ code: "BTC" }] },
    { title: "Unknown coin", published_at: "2026-11-25T09:00:00Z", id: 2, slug: "x", instruments: [{ code: "ZZZ" }] },
  ] };
  const tagged = fromCryptoPanic(json, { BTC: ["bitcoin"] });
  assert.equal(tagged.length, 2);
  tagged.push({ ids: ["bitcoin"], item: { title: "btc etf inflows hit record", url: "https://other.com", source: "Dup", published: "2026-11-25T08:00:00Z" } });
  const g = groupNews(tagged);
  assert.deepEqual(g.bitcoin.map((x) => x.title), ["BTC ETF inflows hit record", "Old BTC story"]);
  assert.equal(g.bitcoin[0].url, "https://cryptopanic.com/news/1/btc-etf");
});
