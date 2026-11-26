/**
 * Build step: the crypto score backtest (backtest.json), published next to the site.
 * Runs in GitHub Actions; the page only reads the finished result.
 *
 * Data: CoinGecko's free public API (daily price, market cap and volume for the last 365 days,
 * the keyless limit). Only derived results are published (scores, group returns and growth
 * curves), never the raw price series. Attribution "Data: CoinGecko" is shown on the page.
 *
 * The public API allows only a few calls a minute, so the calls are spaced out and the whole
 * run takes a few minutes. It is rebuilt at most once a week: the deploy job passes the
 * currently published file, and if it is younger than MAX_AGE_DAYS it is kept as is.
 *
 * Usage: node scripts/fetch-backtest.mjs <out.json> [previous.json]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dailyMap, scoreBacktest } from "../src/backtest.js";

const OUT = process.argv[2] || "backtest.json";
const PREV = process.argv[3];
const MAX_AGE_DAYS = 6;
const UNIVERSE = 40; // coins scored on each date
const GAP_MS = Number(process.env.CG_GAP_MS) || 7000;
const CG = "https://api.coingecko.com/api/v3";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Stablecoins, wrapped and staked copies, and gold tokens: they would only mirror another asset. */
const SKIP = /^(usdt|usdc|dai|fdusd|tusd|usde|usds|susds|susde|pyusd|busd|usdd|frax|usd0|rlusd|usd1|usdtb|bsc-usd|usdf|gho|crvusd|lusd|eurc|wbtc|weth|steth|wsteth|weeth|cbbtc|reth|wbeth|meth|ezeth|rseth|jitosol|msol|jupsol|bnsol|lbtc|solvbtc|clbtc|tbtc|xaut|paxg|figr_heloc|buidl|ousg|usyc)$/i;
const skipCoin = (c) => SKIP.test(c.symbol || "") || /wrapped|staked|bridged|restaked|liquid staking|\busd\b|tether|stable/i.test(c.name || "");

async function get(url) {
  for (let i = 0; i < 4; i++) {
    let r;
    try { r = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(30000) }); } catch (e) { await sleep(5000 * (i + 1)); continue; }
    if (r.status === 429) { await sleep(65000); continue; }
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r.json();
  }
  throw new Error("CoinGecko kept refusing: " + url);
}

async function main() {
  if (PREV && existsSync(PREV)) {
    try {
      const prev = JSON.parse(readFileSync(PREV, "utf8"));
      if (prev && prev.updated && Date.now() - Date.parse(prev.updated) < MAX_AGE_DAYS * 864e5) {
        writeFileSync(OUT, JSON.stringify(prev));
        console.log(`Backtest from ${prev.updated} is recent: kept.`);
        return;
      }
    } catch { /* rebuild */ }
  }
  const top = await get(`${CG}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false`);
  const picked = top.filter((c) => !skipCoin(c)).slice(0, UNIVERSE);
  const coins = [];
  for (const c of picked) {
    await sleep(GAP_MS);
    try {
      const chart = await get(`${CG}/coins/${encodeURIComponent(c.id)}/market_chart?vs_currency=usd&days=365&interval=daily`);
      coins.push({ id: c.id, symbol: c.symbol, name: c.name, m: dailyMap(chart) });
      console.log(`  ${c.symbol}: ${coins[coins.length - 1].m.size} days`);
    } catch (e) { console.log(`  ${c.symbol}: skipped (${e.message})`); }
  }
  const btc = coins.find((c) => c.id === "bitcoin");
  if (!btc || coins.length < 15) throw new Error(`only ${coins.length} coins loaded`);
  const result = scoreBacktest(coins, btc.m);
  if (!result) throw new Error("not enough history");
  writeFileSync(OUT, JSON.stringify({ ...result, updated: new Date().toISOString(), source: "CoinGecko" }));
  console.log(`Backtest: ${coins.length} coins, ${result.profiles.longterm.summary.cohorts} scoring dates → ${OUT}`);
}

main().catch((e) => { console.error("Backtest failed:", e.message); process.exit(1); });
