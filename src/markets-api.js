/**
 * Data access for stocks and ETFs.
 *  - markets.json: the daily snapshot built by GitHub Actions (SEC fundamentals,
 *    filings, headlines; prices only when a key licensed for publishing is set).
 *  - Alpha Vantage: weekly adjusted prices, called from the visitor's browser
 *    with the visitor's own free key, cached in localStorage for 20 hours.
 */
import { parseAlphaWeekly, packBars, unpackBars } from "./prices.js?v=__V__";

const KEY_STORE = "ms-av-key";
const CALLS_STORE = "ms-av-calls";
const PX_PREFIX = "ms-px-";
const PX_TTL = 20 * 3600_000;
export const FREE_DAILY_CALLS = 25;

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch { /* blocked */ } },
};

export class PriceError extends Error {
  constructor(kind, message) { super(message); this.kind = kind; } // "no_key" | "rate_limit" | "bad_key" | "not_found" | "network" | "http"
}

let snapshot;
/** The daily snapshot, or null when it is missing. Loaded once per page. */
export async function loadSnapshot() {
  if (snapshot !== undefined) return snapshot;
  for (const url of ["markets.json", "data/markets.dev.json"]) {
    try {
      const r = await fetch(url, { cache: "no-cache" });
      if (r.ok) { const j = await r.json(); if (j && j.stocks) return (snapshot = j); }
    } catch { /* try the next one */ }
  }
  return (snapshot = null);
}

export const getKey = () => (ls.get(KEY_STORE) || "").trim() || null;
export function setKey(k) { const v = String(k || "").trim(); if (v) ls.set(KEY_STORE, v); else ls.del(KEY_STORE); }
const today = () => new Date().toISOString().slice(0, 10);
export function callsToday() { try { const c = JSON.parse(ls.get(CALLS_STORE) || "{}"); return c.d === today() ? c.n : 0; } catch { return 0; } }
function countCall() { ls.set(CALLS_STORE, JSON.stringify({ d: today(), n: callsToday() + 1 })); }

/** Saved prices for a ticker, even if old (for the watchlist and quick scores). */
export function cachedBars(t) {
  try { const c = JSON.parse(ls.get(PX_PREFIX + t) || "null"); return c && Array.isArray(c.b) ? { bars: unpackBars(c.b), at: c.at, fresh: Date.now() - c.at < PX_TTL } : null; } catch { return null; }
}

/**
 * Weekly bars for a ticker: from the snapshot when it carries prices, else from
 * the 20-hour cache, else one Alpha Vantage call with the visitor's key.
 */
export async function weeklyBars(t, { force = false } = {}) {
  const snap = await loadSnapshot();
  if (snap && snap.prices && snap.prices[t]) return { bars: unpackBars(snap.prices[t]), source: "snapshot", at: Date.parse(snap.updated) };
  const c = cachedBars(t);
  if (c && c.fresh && !force) return { bars: c.bars, source: "cache", at: c.at };
  const key = getKey();
  if (!key) { if (c) return { bars: c.bars, source: "cache", at: c.at, stale: true }; throw new PriceError("no_key", "No Alpha Vantage key."); }
  let json;
  try {
    const r = await fetch(`https://www.alphavantage.co/query?function=TIME_SERIES_WEEKLY_ADJUSTED&symbol=${encodeURIComponent(t)}&apikey=${encodeURIComponent(key)}`);
    if (!r.ok) throw new PriceError("http", `Alpha Vantage answered ${r.status}.`);
    json = await r.json();
  } catch (e) {
    if (c) return { bars: c.bars, source: "cache", at: c.at, stale: true };
    throw e instanceof PriceError ? e : new PriceError("network", "Network error.");
  }
  countCall();
  let parsed;
  try { parsed = parseAlphaWeekly(json); }
  catch (e) { if (c && e.kind === "rate_limit") return { bars: c.bars, source: "cache", at: c.at, stale: true }; throw new PriceError(e.kind || "http", e.message); }
  const at = Date.now();
  if (!ls.set(PX_PREFIX + t, JSON.stringify({ at, b: packBars(parsed.bars) }))) pruneCache();
  return { bars: parsed.bars, source: "live", at };
}

/** When storage is full, drop the oldest saved price series. */
function pruneCache() {
  try {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(PX_PREFIX));
    keys.map((k) => [k, (JSON.parse(localStorage.getItem(k) || "{}").at) || 0]).sort((a, b) => a[1] - b[1]).slice(0, Math.ceil(keys.length / 2)).forEach(([k]) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}
