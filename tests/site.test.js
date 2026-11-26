import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { simulate, requiredMonthly, requiredRate, lumpSum, monthlyRate, monthlyFromWeekly, backtestDca } from "../src/dca.js?v=__V__";
import { SYNC_KEYS, snapshot, mergeOnLogin, validEmail, validPassword, errorKey } from "../src/account.js?v=__V__";
import { accountsEnabled } from "../src/config.js?v=__V__";
import { SITE_KEYS } from "../src/i18n-site.js?v=__V__";
import { LANGS } from "../src/i18n.js?v=__V__";

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} ≈ ${b}`);

test("monthly plan: compounding matches the closed form, and goals invert it", () => {
  close(Math.pow(1 + monthlyRate(7), 12), 1.07);
  const zero = simulate({ monthly: 100, years: 10, rate: 0 });
  assert.equal(zero.invested, 12000); close(zero.value, 12000); assert.equal(zero.rows.length, 121);
  const s = simulate({ monthly: 200, years: 20, rate: 7, initial: 1000 });
  const r = monthlyRate(7), n = 240, g = Math.pow(1 + r, n);
  close(s.value, 1000 * g + 200 * ((g - 1) / r) * (1 + r));
  assert.equal(s.invested, 1000 + 200 * 240);
  close(requiredMonthly({ target: s.value, years: 20, rate: 7, initial: 1000 }), 200);
  close(requiredRate({ target: s.value, years: 20, monthly: 200, initial: 1000 }), 7, 1e-6);
  assert.equal(requiredMonthly({ target: 500, years: 5, rate: 5, initial: 1000 }), 0, "already there");
  assert.equal(requiredRate({ target: 1e12, years: 5, monthly: 10 }), null, "out of reach");
  close(lumpSum({ total: 1000, years: 2, rate: 10 }), 1210);
});

test("monthly plan: a yearly raise adds money from the second year on", () => {
  const s = simulate({ monthly: 100, years: 2, rate: 0, stepUp: 10 });
  assert.equal(s.invested, 12 * 100 + 12 * 110);
});

test("backtest: buys on the first week of each month, values on the last month", () => {
  const bars = [];
  for (let i = 0; i < 60; i++) bars.push({ t: Date.UTC(2020, 0, 3) + i * 7 * 864e5, c: 100 + i, a: 100 + i });
  const m = monthlyFromWeekly(bars);
  assert.equal(new Set(m.map((x) => x.d.slice(0, 7))).size, m.length);
  assert.equal(m[0].d, "2020-01-03");
  const r = backtestDca(bars, { monthly: 100, years: 1 });
  assert.equal(r.months, 12); assert.equal(r.invested, 1200);
  assert.ok(r.value > r.invested, "rising prices → gain");
  assert.ok(r.lump > r.value, "on a steady rise, investing at once beats spreading it");
  assert.equal(r.worstDrop, 0);
  // a crash in the middle shows up as the worst moment
  const crash = bars.map((b, i) => ({ ...b, a: i > 20 && i < 40 ? 50 : 100 }));
  assert.ok(backtestDca(crash, { monthly: 100, years: 2 }).worstDrop < -30);
  assert.equal(backtestDca([], { monthly: 100, years: 1 }), null);
});

test("accounts: snapshot and merge keep the account's data and fill gaps from the browser", () => {
  const ls = { "pf-holdings": "[1]", "cs-theme": "dark", "ms-av-key": "SECRET", other: "x" };
  const snap = snapshot({ getItem: (k) => (k in ls ? ls[k] : null) });
  assert.deepEqual(Object.keys(snap).sort(), ["cs-theme", "pf-holdings"]);
  assert.ok(!SYNC_KEYS.includes("ms-av-key"), "the price key never leaves the browser");
  const first = mergeOnLogin(snap, null);
  assert.equal(first.push, true); assert.deepEqual(first.writeLocal, {}); assert.deepEqual(first.data, snap);
  const m = mergeOnLogin(snap, { "pf-holdings": "[2]", "cs-watchlist": "[\"bitcoin\"]" });
  assert.deepEqual(m.writeLocal, { "pf-holdings": "[2]", "cs-watchlist": "[\"bitcoin\"]" });
  assert.equal(m.data["cs-theme"], "dark"); assert.equal(m.push, true);
  assert.equal(mergeOnLogin({ a: 1 }, { "cs-theme": "dark" }).push, false);
});

test("accounts: validation, error messages, off without settings", () => {
  assert.ok(validEmail(" a@b.gr ")); assert.ok(!validEmail("a@b")); assert.ok(!validEmail(""));
  assert.ok(validPassword("12345678")); assert.ok(!validPassword("1234567"));
  assert.equal(errorKey({ code: "invalid_credentials" }), "ac_err_creds");
  assert.equal(errorKey({ message: "User already registered" }), "ac_err_exists");
  assert.equal(errorKey({ message: "Email not confirmed" }), "ac_err_confirm");
  assert.equal(errorKey({ message: "TypeError: Failed to fetch" }), "ac_err_net");
  assert.equal(errorKey({ message: "weird" }), null);
  assert.equal(accountsEnabled(), false, "placeholders mean no accounts");
});

test("site strings exist in English and Greek with the same parameters", () => {
  const { en, el } = SITE_KEYS;
  assert.deepEqual(Object.keys(en).sort(), Object.keys(el).sort());
  for (const k of Object.keys(en)) {
    assert.equal(typeof en[k], typeof el[k], k);
    if (typeof en[k] === "function") assert.equal(en[k].length, el[k].length, k);
  }
  assert.equal(LANGS.el.nav_invest, el.nav_invest);
});

test("every page has the five section links and the account script", () => {
  for (const [page, current] of [["index.html", "./"], ["crypto.html", "crypto.html"], ["markets.html", "markets.html"], ["portfolio.html", "portfolio.html"], ["invest.html", "invest.html"]]) {
    const html = readFileSync(new URL("../" + page, import.meta.url), "utf8");
    for (const target of ["./", "crypto.html", "markets.html", "portfolio.html", "invest.html"]) assert.ok(html.includes(`data-nav="${target}"`), `${page} → ${target}`);
    assert.ok(html.includes(`data-nav="${current}" href="${current}" aria-current="page"`), `${page} marks itself`);
    assert.ok(html.includes("src/account.js?v=__V__"), page);
  }
  assert.ok(readFileSync(new URL("../index.html", import.meta.url), "utf8").includes('location.replace("crypto.html"'), "old ?coin= links still open the crypto page");
});
