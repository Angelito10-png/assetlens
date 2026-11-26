/**
 * Build step: the daily markets snapshot (markets.json) that the static site
 * reads from its own origin. Runs in GitHub Actions.
 *
 * What goes in, and why it is allowed to be published:
 *  - Fundamentals and recent filings: SEC EDGAR (companyfacts and submissions
 *    APIs). US government data, public, no key. SEC does not allow browser
 *    calls (no CORS), which is why this runs as a build step.
 *  - Headlines: public RSS feeds of financial news sites, matched to companies
 *    by name or ticker; only titles and links are kept.
 *  - Prices: only when ALPHAVANTAGE_KEY is set AND ALPHAVANTAGE_PUBLISH=1, which
 *    is meant for a key whose licence allows publishing (free keys are for
 *    personal use; on the public site visitors load prices with their own key).
 *
 * Usage: node scripts/fetch-markets.mjs <out.json> [TICKER,TICKER…]
 * SEC asks automated clients to identify themselves; set SEC_USER_AGENT to override the default.
 */
import { writeFileSync } from "node:fs";
import { STOCKS, ETFS } from "../src/universe.js";
import { fundamentals, recentFilings } from "./markets-lib.mjs";
import { parseRss } from "./news-lib.mjs";
import { parseAlphaWeekly, packBars } from "../src/prices.js";

const OUT = process.argv[2] || "markets.json";
const ONLY = process.argv[3] ? new Set(process.argv[3].split(",")) : null;
const UA = process.env.SEC_USER_AGENT || "assetlens portfolio demo (https://github.com/Angelito10-png/assetlens)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FEEDS = [
  ["CNBC", "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10001147"],
  ["CNBC", "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664"],
  ["MarketWatch", "https://feeds.content.dowjones.io/public/rss/mw_topstories"],
  ["MarketWatch", "https://feeds.content.dowjones.io/public/rss/mw_marketpulse"],
  ["Nasdaq", "https://www.nasdaq.com/feed/rssoutbound?category=Stocks"],
  ["Investing.com", "https://www.investing.com/rss/news_25.rss"],
  ["Seeking Alpha", "https://seekingalpha.com/market_currents.xml"],
];

async function get(url, { as = "json", tries = 3 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { "user-agent": UA, accept: as === "json" ? "application/json" : "application/rss+xml, application/xml, text/xml, */*" }, signal: AbortSignal.timeout(30000) });
      if (r.status === 429 || r.status >= 500) { last = new Error(`${r.status} ${url}`); await sleep(2000 * (i + 1)); continue; }
      if (!r.ok) throw Object.assign(new Error(`${r.status} ${url}`), { fatal: true });
      return as === "json" ? await r.json() : await r.text();
    } catch (e) { last = e; if (e.fatal) break; await sleep(1000 * (i + 1)); }
  }
  throw last;
}

/* Company-name matching for headlines. Short or common-word names need the ticker in $TICKER or (TICKER) form. */
const NAME_ONLY_RISKY = new Set(["Visa", "Target", "Oracle", "Apple", "Dow", "Linde", "Nike", "Intel", "SLB", "RTX", "Deere"]);
function matchers() {
  const list = [...STOCKS.map(([t, name]) => ({ t, name })), ...ETFS.map((e) => ({ t: e.t, name: null }))];
  return list.map(({ t, name }) => {
    const short = name ? name.replace(/\b(Inc|Corp|Corporation|Company|Holdings|Platforms|Technologies)\b\.?/g, "").trim() : null;
    const tick = new RegExp(`(\\$${t}\\b|\\(${t}\\)|NYSE: ?${t}\\b|NASDAQ: ?${t}\\b)`);
    const nameRe = short && short.length >= 4 ? new RegExp(`\\b${short.replace(/[.*+?^${}()|[\]\\&]/g, "\\$&")}('s)?\\b`) : null;
    return { t, test: (title) => tick.test(title) || (!!nameRe && nameRe.test(title) && (!NAME_ONLY_RISKY.has(short) || /stock|shares|earnings|revenue|profit|CEO|deal|sales/i.test(title))) };
  });
}

async function main() {
  const started = Date.now();
  const stocks = STOCKS.filter(([t]) => !ONLY || ONLY.has(t));
  const etfs = ETFS.filter((e) => !ONLY || ONLY.has(e.t));
  const out = { updated: new Date().toISOString(), sources: [], stocks: {}, etfs: {}, prices: null, failed: [] };
  const used = new Set();

  const map = await get("https://www.sec.gov/files/company_tickers.json");
  const ciks = {};
  for (const v of Object.values(map)) ciks[String(v.ticker).toUpperCase()] = String(v.cik_str).padStart(10, "0");
  used.add("SEC EDGAR");

  for (const [t, name, sector] of stocks) {
    const cik = ciks[t] || ciks[t.replace("-", ".")];
    const entry = { t, name, sector, cik: cik || null, fin: null, filings: [], news: [] };
    if (cik) {
      try { entry.fin = fundamentals(await get(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`)); } catch (e) { console.warn(`  facts ${t}: ${e.message}`); }
      await sleep(120); // SEC's fair-access limit is 10 requests a second; stay well below it
      try { entry.filings = recentFilings(await get(`https://data.sec.gov/submissions/CIK${cik}.json`)); } catch (e) { console.warn(`  filings ${t}: ${e.message}`); }
      await sleep(120);
    }
    if (!entry.fin) out.failed.push(t);
    out.stocks[t] = entry;
    console.log(`${t}: ${entry.fin ? "fundamentals" : "no fundamentals"}, ${entry.filings.length} filings`);
  }
  for (const e of etfs) out.etfs[e.t] = { t: e.t, name: e.name, news: [] };

  // Headlines from public RSS feeds
  const M = matchers();
  const seen = new Set();
  for (const [src, url] of FEEDS) {
    try {
      const items = parseRss(await get(url, { as: "text", tries: 2 }), src);
      let n = 0;
      for (const it of items) {
        if (seen.has(it.url)) continue;
        seen.add(it.url);
        for (const m of M) if (m.test(it.title)) { const target = out.stocks[m.t] || out.etfs[m.t]; if (target) { target.news.push({ title: it.title, url: it.url, source: src, published: it.published }); n++; } }
      }
      used.add(src);
      console.log(`${src}: ${items.length} items, ${n} matched`);
    } catch (e) { console.warn(`${src} feed failed: ${e.message}`); }
  }
  for (const x of [...Object.values(out.stocks), ...Object.values(out.etfs)]) x.news = x.news.sort((a, b) => ((a.published || "") < (b.published || "") ? 1 : -1)).slice(0, 6);

  // Optional: prices, only with a key licensed for publishing
  const key = process.env.ALPHAVANTAGE_KEY;
  if (key && process.env.ALPHAVANTAGE_PUBLISH === "1") {
    out.prices = {};
    for (const t of [...stocks.map((s) => s[0]), ...etfs.map((e) => e.t)]) {
      try { out.prices[t] = packBars(parseAlphaWeekly(await get(`https://www.alphavantage.co/query?function=TIME_SERIES_WEEKLY_ADJUSTED&symbol=${encodeURIComponent(t)}&apikey=${encodeURIComponent(key)}`)).bars); }
      catch (e) { console.warn(`  prices ${t}: ${e.message}`); }
      await sleep(1100);
    }
    if (Object.keys(out.prices).length) used.add("Alpha Vantage");
  }

  out.sources = [...used];
  const ok = Object.values(out.stocks).filter((s) => s.fin).length;
  if (ok < stocks.length / 2) throw new Error(`only ${ok} of ${stocks.length} stocks have fundamentals`);
  writeFileSync(OUT, JSON.stringify(out));
  console.log(`Wrote ${OUT}: ${ok}/${stocks.length} stocks with fundamentals, ${Object.keys(out.etfs).length} ETFs, prices: ${out.prices ? Object.keys(out.prices).length : "not published"}, missing: ${out.failed.join(",") || "none"}; ${Math.round((Date.now() - started) / 1000)}s`);
}

main().catch((e) => { console.error("Markets snapshot failed:", e.message); process.exit(1); });
