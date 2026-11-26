/**
 * Build step: the daily snapshot of stocks and ETFs that the static site reads
 * from its own origin (markets.json). Runs in GitHub Actions; needs no API key.
 *
 * Why a build step: free stock data APIs either need a key (which a static page
 * would expose) or refuse calls from browsers (CORS). So the snapshot is built
 * once a day on the server side and published next to the page.
 *
 * Sources:
 *  - Prices, dividends: Yahoo Finance chart API (unofficial, no key); Stooq CSV as fallback.
 *  - Fundamentals: SEC EDGAR companyfacts (official XBRL data from 10-K/10-Q filings).
 *  - Headlines: Yahoo Finance RSS per ticker.
 *  - ETF facts: src/universe.js (from issuer fact sheets).
 *
 * Usage: node scripts/fetch-markets.mjs <out.json> [TICKER,TICKER…]
 * SEC asks automated clients to identify themselves; set SEC_USER_AGENT
 * (for example "Your Name your@email") to override the default.
 */
import { writeFileSync } from "node:fs";
import { STOCKS, ETFS } from "../src/universe.js";
import { parseYahooChart, parseStooqCsv, priceStats, fundamentals } from "./markets-lib.mjs";
import { parseRss } from "./news-lib.mjs";

const OUT = process.argv[2] || "markets.json";
const ONLY = process.argv[3] ? new Set(process.argv[3].split(",")) : null;
const BROWSER_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const SEC_UA = process.env.SEC_USER_AGENT || "coin-scorecard portfolio demo (https://github.com/Angelito10-png/coin-scorecard)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, { as = "json", ua = BROWSER_UA, tries = 3 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { "user-agent": ua, accept: as === "json" ? "application/json" : "*/*" }, signal: AbortSignal.timeout(25000) });
      if (r.status === 429 || r.status >= 500) { last = new Error(`${r.status} ${url}`); await sleep(1500 * (i + 1)); continue; }
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return as === "json" ? await r.json() : await r.text();
    } catch (e) { last = e; if (/^4\d\d /.test(e.message) && !/^429/.test(e.message)) break; await sleep(800 * (i + 1)); }
  }
  throw last;
}

const yahooSym = (t) => t.replace(".", "-");
async function prices(t) {
  try {
    const s = parseYahooChart(await get(`https://query1.finance.yahoo.com/v8/finance/chart/${yahooSym(t)}?range=5y&interval=1d&events=div`));
    if (s && s.bars.length > 20) return { ...s, source: "Yahoo Finance" };
  } catch (e) { console.warn(`  Yahoo ${t}: ${e.message}`); }
  try {
    const s = parseStooqCsv(await get(`https://stooq.com/q/d/l/?s=${t.toLowerCase().replace(".", "-")}.us&i=d`, { as: "text" }));
    if (s) { const from = Date.now() - 5.1 * 365.25 * 864e5; s.bars = s.bars.filter((b) => b.t >= from); return { ...s, source: "Stooq" }; }
  } catch (e) { console.warn(`  Stooq ${t}: ${e.message}`); }
  return null;
}

async function headlines(t) {
  try {
    const xml = await get(`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${yahooSym(t)}&region=US&lang=en-US`, { as: "text", tries: 2 });
    return parseRss(xml, "Yahoo Finance").filter((x) => x.published).sort((a, b) => (a.published < b.published ? 1 : -1)).slice(0, 6).map(({ title, url, source, published }) => ({ title, url, source, published }));
  } catch { return []; }
}

async function main() {
  const started = Date.now();
  const stocks = STOCKS.filter(([t]) => !ONLY || ONLY.has(t));
  const etfs = ETFS.filter((e) => !ONLY || ONLY.has(e.t));
  const out = { updated: new Date().toISOString(), sources: [], stocks: {}, etfs: {}, failed: [] };
  const used = new Set();

  const spy = await prices("SPY");
  if (!spy) throw new Error("no benchmark prices (SPY); sources unreachable");

  let ciks = {};
  try {
    const map = await get("https://www.sec.gov/files/company_tickers.json", { ua: SEC_UA });
    for (const v of Object.values(map)) ciks[v.ticker.toUpperCase()] = String(v.cik_str).padStart(10, "0");
    used.add("SEC EDGAR");
  } catch (e) { console.warn("SEC ticker map failed:", e.message); }

  for (const [t, name, sector] of stocks) {
    const p = await prices(t);
    if (!p) { out.failed.push(t); continue; }
    used.add(p.source);
    let f = null;
    if (ciks[t]) {
      try { f = fundamentals(await get(`https://data.sec.gov/api/xbrl/companyfacts/CIK${ciks[t]}.json`, { ua: SEC_UA })); }
      catch (e) { console.warn(`  SEC ${t}: ${e.message}`); }
      await sleep(150); // SEC allows 10 requests a second; stay well below
    }
    out.stocks[t] = { t, name: p.name || name, sector, cik: ciks[t] || null, priceSource: p.source, px: priceStats(p, spy), fin: f, news: await headlines(t) };
    console.log(`${t}: ${p.source}${f ? ", SEC" : ""}`);
  }
  for (const e of etfs) {
    const p = e.t === "SPY" ? { ...spy, source: "Yahoo Finance" } : await prices(e.t);
    if (!p) { out.failed.push(e.t); continue; }
    used.add(p.source);
    out.etfs[e.t] = { t: e.t, name: e.name, priceSource: p.source, px: priceStats(p, spy), news: await headlines(e.t) };
    console.log(`${e.t}: ${p.source}`);
  }
  if (Object.values(out.stocks).some((s) => s.news.length) || Object.values(out.etfs).some((s) => s.news.length)) used.add("Yahoo Finance RSS");
  out.sources = [...used];
  const n = Object.keys(out.stocks).length + Object.keys(out.etfs).length;
  if (n < (stocks.length + etfs.length) / 2) throw new Error(`only ${n} of ${stocks.length + etfs.length} tickers loaded`);
  writeFileSync(OUT, JSON.stringify(out));
  const withFin = Object.values(out.stocks).filter((s) => s.fin && s.fin.revenue !== null).length;
  console.log(`Wrote ${OUT}: ${Object.keys(out.stocks).length} stocks (${withFin} with SEC fundamentals), ${Object.keys(out.etfs).length} ETFs, failed: ${out.failed.join(",") || "none"}; ${Math.round((Date.now() - started) / 1000)}s`);
}

main().catch((e) => { console.error("Markets snapshot failed:", e.message); process.exit(1); });
