import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../src/engine.js";
import { createWatchlist, toSnapshot, fromSnapshot, mergeMarket, MAX, KEY } from "../src/watchlist.js";
import fs from "node:fs";

const F = JSON.parse(fs.readFileSync(new URL("./fixtures/live-2026-11-25.json", import.meta.url)));
const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };

test("watchlist: a saved snapshot scores exactly like the live coin, for every profile", () => {
  const c = E.normalize(F.ethereum.info, null, F.ethereum.gh);
  const back = fromSnapshot(JSON.parse(JSON.stringify(toSnapshot(c))));
  assert.ok(back.genesis instanceof Date || back.genesis === null);
  for (const k of Object.keys(E.PROFILES)) assert.equal(E.score(back, k).total, E.score(c, k).total, k);
});

test("watchlist: add, keep order, refresh, remove, and persist in storage", () => {
  const s = memory(), w = createWatchlist(s);
  const eth = E.normalize(F.ethereum.info, null, F.ethereum.gh), link = E.normalize(F.chainlink.info, null, F.chainlink.gh);
  assert.equal(w.save(eth), true);
  w.save(link);
  assert.deepEqual(w.ids(), ["ethereum", "chainlink"]);
  const added = w.list()[0].addedAt;
  w.save({ ...eth, price: 1 });
  assert.equal(w.list()[0].coin.price, 1);
  assert.equal(w.list()[0].addedAt, added); // re-saving keeps the original add time
  w.refresh(E.normalize(F.pepe.info)); // not watched: ignored
  assert.equal(w.ids().length, 2);
  w.remove("ethereum");
  assert.deepEqual(createWatchlist(s).ids(), ["chainlink"]); // a new instance reads the same storage
});

test("watchlist: limited size, and broken storage never throws", () => {
  const w = createWatchlist(memory());
  for (let i = 0; i < MAX; i++) assert.equal(w.save({ id: "c" + i, name: "C", symbol: "C" }), true);
  assert.equal(w.save({ id: "extra" }), false);
  const bad = memory(); bad.setItem(KEY, "{not json");
  assert.deepEqual(createWatchlist(bad).list(), []);
  const throwing = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  const tw = createWatchlist(throwing);
  assert.deepEqual(tw.list(), []);
  tw.save({ id: "x" }); // no throw
});

test("watchlist: market refresh updates prices and keeps factor data", () => {
  const s = memory(), w = createWatchlist(s);
  w.save(E.normalize(F.chainlink.info, null, F.chainlink.gh));
  const before = w.list()[0].coin;
  w.applyMarkets([{ id: "chainlink", current_price: 99, price_change_percentage_24h: 5, market_cap: null }], new Date("2026-11-26T06:00:00Z"));
  const e = w.list()[0];
  assert.equal(e.coin.price, 99);
  assert.equal(e.coin.ch24, 5);
  assert.equal(e.coin.mcap, before.mcap); // null in the row keeps the old value
  assert.equal(e.coin.commits4w, before.commits4w);
  assert.equal(e.pricesAt, "2026-11-26T06:00:00.000Z");
  assert.deepEqual(mergeMarket(before, null), before);
});
