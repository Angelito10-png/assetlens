/**
 * Watchlist kept in the browser (localStorage). Each entry stores a snapshot of
 * the normalised coin, so it can be scored for any profile instantly, without
 * one CoinGecko + GitHub round trip per coin. Prices are refreshed for all
 * entries with a single CoinGecko /coins/markets call.
 * Pure logic with an injectable storage, so it is unit-tested in Node.
 */

export const KEY = "cs-watchlist";
export const MAX = 20;
const DATE_FIELDS = ["genesis", "earliest"];

/** Plain-JSON copy of a normalised coin (Dates become ISO strings). */
export function toSnapshot(c) {
  const out = {};
  for (const [k, v] of Object.entries(c)) out[k] = v instanceof Date ? v.toISOString() : v;
  return out;
}

/** Inverse of toSnapshot: ISO strings back to Dates so the engine can use them. */
export function fromSnapshot(s) {
  const c = { ...s };
  for (const k of DATE_FIELDS) c[k] = s[k] ? new Date(s[k]) : null;
  if (!Array.isArray(c.repos)) c.repos = [];
  if (!Array.isArray(c.categories)) c.categories = [];
  return c;
}

const n = (v) => (typeof v === "number" && isFinite(v) ? v : null);

/** Copy fresh market figures from a /coins/markets row onto a snapshot. Missing values keep the old ones. */
export function mergeMarket(snap, row) {
  if (!row) return snap;
  const pick = (cur, v) => (n(v) === null ? cur : v);
  return {
    ...snap,
    price: pick(snap.price, row.current_price),
    mcap: pick(snap.mcap, row.market_cap),
    rank: pick(snap.rank, row.market_cap_rank),
    fdv: pick(snap.fdv, row.fully_diluted_valuation),
    vol24: pick(snap.vol24, row.total_volume),
    circ: pick(snap.circ, row.circulating_supply),
    total: pick(snap.total, row.total_supply),
    max: pick(snap.max, row.max_supply),
    ch24: pick(snap.ch24, row.price_change_percentage_24h),
    ch7d: pick(snap.ch7d, row.price_change_percentage_7d_in_currency),
    ch30d: pick(snap.ch30d, row.price_change_percentage_30d_in_currency),
    ch1y: pick(snap.ch1y, row.price_change_percentage_1y_in_currency),
    athChange: pick(snap.athChange, row.ath_change_percentage),
    ath: pick(snap.ath, row.ath),
    high24: pick(snap.high24, row.high_24h),
    low24: pick(snap.low24, row.low_24h),
  };
}

export function createWatchlist(storage) {
  const read = () => {
    try {
      const v = JSON.parse(storage.getItem(KEY) || "[]");
      return Array.isArray(v) ? v.filter((e) => e && typeof e.id === "string" && e.coin && typeof e.coin === "object") : [];
    } catch { return []; }
  };
  const write = (list) => { try { storage.setItem(KEY, JSON.stringify(list)); } catch { /* quota or blocked */ } };
  return {
    list: read,
    ids: () => read().map((e) => e.id),
    has: (id) => read().some((e) => e.id === id),
    /** Add or refresh a coin. Returns false when the list is full. */
    save(c, extra = {}) {
      const list = read();
      const i = list.findIndex((e) => e.id === c.id);
      const entry = { id: c.id, coin: toSnapshot(c), savedAt: new Date().toISOString(), ...extra, addedAt: i >= 0 ? list[i].addedAt : new Date().toISOString() };
      if (i >= 0) list[i] = { ...list[i], ...entry };
      else if (list.length >= MAX) return false;
      else list.push(entry);
      write(list);
      return true;
    },
    /** Update the snapshot only if the coin is already watched. */
    refresh(c, extra = {}) { if (read().some((e) => e.id === c.id)) this.save(c, extra); },
    remove(id) { write(read().filter((e) => e.id !== id)); },
    /** Apply /coins/markets rows to every entry. */
    applyMarkets(rows, at = new Date()) {
      const byId = Object.fromEntries((rows || []).map((r) => [r.id, r]));
      write(read().map((e) => (byId[e.id] ? { ...e, coin: mergeMarket(e.coin, byId[e.id]), pricesAt: at.toISOString() } : e)));
    },
  };
}
