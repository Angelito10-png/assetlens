/**
 * Side columns shared by all three pages.
 * Left: a market overview (S&P 500 and Nasdaq 100 through their funds, Bitcoin,
 * the total crypto market and the crypto Fear & Greed index).
 * Right: a sticky "at a glance" card for what is on screen, with better-scoring
 * alternatives from the same group.
 * On narrow screens both columns sit below the main content (see styles.css).
 */
import { t } from "./i18n.js?v=__V__";
import "./i18n-markets.js?v=__V__";
import { el, priceFmt, barClass } from "./ui.js?v=__V__";
import { marketsFor, globalMarket, fearGreed } from "./api.js?v=__V__";
import { getKey, cachedBars, weeklyBars } from "./markets-api.js?v=__V__";

const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);

/* ---------------------------------------------------------------- pure helpers (unit-tested) */

/** CoinGecko /global → total crypto market cap, its 24h change and Bitcoin's share. */
export function parseGlobal(j) {
  const d = j && j.data;
  if (!d) return null;
  const total = num(d.total_market_cap && d.total_market_cap.usd);
  return total === null ? null : { total, ch24: num(d.market_cap_change_percentage_24h_usd), btcDom: num(d.market_cap_percentage && d.market_cap_percentage.btc) };
}

/** alternative.me Fear & Greed → { value 0-100, band }. */
export function parseFng(j) {
  const x = j && Array.isArray(j.data) && j.data[0];
  const v = x ? Number(x.value) : NaN;
  if (!isFinite(v) || v < 0 || v > 100) return null;
  return { value: v, band: fngBand(v), at: Number(x.timestamp) * 1000 || null };
}
export const fngBand = (v) => (v < 25 ? "xfear" : v < 45 ? "fear" : v <= 55 ? "neutral" : v <= 75 ? "greed" : "xgreed");

/** Last weekly close and its change from the week before. */
export function weekChange(bars) {
  if (!bars || bars.length < 2) return null;
  const a = bars[bars.length - 2].c, b = bars[bars.length - 1].c;
  return a > 0 && b > 0 ? { price: b, ch: (b / a - 1) * 100 } : null;
}

/** Up to n candidates that score higher than the current asset, best first. */
export function pickSimilar(current, candidates, n = 3) {
  return (candidates || [])
    .filter((x) => x && x.id !== current.id && typeof x.score === "number" && x.score > current.score)
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

/** The worst risk flags first: [[severity, text], …] → top n. */
export function topRisks(flags, n = 3) {
  const order = { high: 0, mid: 1, info: 2 };
  return (flags || []).filter((f) => f[0] !== "info").sort((a, b) => (order[a[0]] ?? 3) - (order[b[0]] ?? 3)).slice(0, n);
}

/* ---------------------------------------------------------------- layout */

/** Wrap the page's main column with the two side columns. Called once per page. */
export function mountRails() {
  const wrap = document.querySelector(".wrap");
  if (!wrap || document.querySelector(".layout")) return;
  const layout = el("div", { class: "layout" });
  wrap.replaceWith(layout);
  const left = el("aside", { class: "rail rail-l", id: "railL", "aria-label": t("sb_market") });
  const right = el("aside", { class: "rail rail-r", id: "railR", "aria-label": t("sb_glance") });
  layout.append(left, wrap, right);
  // the footer closes the whole page, after the side columns on small screens
  const foot = wrap.querySelector(".foot");
  if (foot) layout.append(el("div", { class: "layout-foot" }, foot));
  renderMarket();
}

/* ---------------------------------------------------------------- left: market overview */

const state = { btc: undefined, global: undefined, fng: undefined, SPY: undefined, QQQ: undefined };

const pct = (v) => (v === null || v === undefined ? null : el("span", { class: "num " + (v >= 0 ? "up" : "down") }, (v >= 0 ? "+" : "") + v.toFixed(2) + "%"));
const big = (v) => (v >= 1e12 ? "$" + (v / 1e12).toFixed(2) + "T" : "$" + (v / 1e9).toFixed(0) + "B");

function row(label, value, change, sub) {
  return el("li", { class: "mk-row" },
    el("div", { class: "mk-l" }, el("span", {}, label), sub ? el("small", { class: "muted" }, sub) : null),
    el("div", { class: "mk-v" }, value === undefined ? el("span", { class: "muted" }, "…") : value === null ? el("span", { class: "muted" }, "–") : el("span", { class: "num" }, value), change || null));
}

function fundRow(tk, label) {
  const s = state[tk];
  if (s === "nokey") {
    return el("li", { class: "mk-row" }, el("div", { class: "mk-l" }, el("span", {}, label)),
      el("div", { class: "mk-v" }, el("a", { href: "markets.html#keyPanel", class: "mk-key" }, t("sb_needKey"))));
  }
  return row(label, s === undefined ? undefined : s ? priceFmt(s.price) : null, s ? pct(s.ch) : null, t("sb_week"));
}

export function renderMarket() {
  const box = document.getElementById("railL");
  if (!box) return;
  const f = state.fng;
  const gauge = f ? el("div", { class: "fng", "data-band": f.band },
    el("div", { class: "fng-bar" }, el("i", { style: `left:${f.value}%` })),
    el("div", { class: "fng-txt" }, el("b", { class: "num" }, String(f.value)), el("span", {}, t("sb_fng_" + f.band)))) : null;
  box.replaceChildren(el("div", { class: "panel rail-card" },
    el("div", { class: "eyebrow" }, t("sb_market")),
    el("ul", { class: "mk" },
      fundRow("SPY", t("sb_sp500")),
      fundRow("QQQ", t("sb_nasdaq")),
      row(t("sb_btc"), state.btc === undefined ? undefined : state.btc ? priceFmt(state.btc.price) : null, state.btc ? pct(state.btc.ch24) : null, t("sb_24h")),
      row(t("sb_total"), state.global === undefined ? undefined : state.global ? big(state.global.total) : null, state.global ? pct(state.global.ch24) : null, state.global && state.global.btcDom !== null ? t("sb_btcDom", state.global.btcDom.toFixed(1)) : t("sb_24h"))),
    el("div", { class: "mk-fng" }, el("div", { class: "mk-l" }, el("span", {}, t("sb_fng"))), f ? gauge : el("span", { class: "muted" }, f === undefined ? "…" : "–")),
    el("p", { class: "muted rail-note" }, t("sb_sources"))));
}

let loadingMarket = false;
/**
 * Fetch everything the overview shows. Each source fails on its own without hiding the others.
 * funds: false skips the SPY/QQQ price calls (the stocks page asks for SPY itself, then calls refreshFunds).
 */
export async function loadMarket({ funds = true } = {}) {
  if (loadingMarket) return;
  loadingMarket = true;
  const done = () => renderMarket();
  const jobs = [
    marketsFor(["bitcoin"]).then((rows) => { const r = rows && rows[0]; state.btc = r ? { price: r.current_price, ch24: num(r.price_change_percentage_24h) } : null; }).catch(() => { state.btc = null; }).then(done),
    globalMarket().then((j) => { state.global = parseGlobal(j); }).catch(() => { state.global = null; }).then(done),
    fearGreed().then((j) => { state.fng = parseFng(j); }).catch(() => { state.fng = null; }).then(done),
  ];
  if (funds) jobs.push(refreshFunds()); else fundsFromCache();
  done();
  await Promise.all(jobs);
  loadingMarket = false;
}

/** SPY and QQQ from the visitor's price cache, without spending calls. */
function fundsFromCache() {
  for (const tk of ["SPY", "QQQ"]) { const c = cachedBars(tk); state[tk] = c ? weekChange(c.bars) : getKey() ? undefined : "nokey"; }
}
/** SPY and QQQ from the cache, or from Alpha Vantage when the visitor has a key (one call each, then cached). */
export async function refreshFunds() {
  fundsFromCache();
  renderMarket();
  await Promise.all(["SPY", "QQQ"].filter((tk) => state[tk] === undefined).map((tk) =>
    weeklyBars(tk).then((r) => { state[tk] = weekChange(r.bars); }).catch(() => { state[tk] = null; }).then(renderMarket)));
}

/* ---------------------------------------------------------------- right: at a glance */

/**
 * data: { title, sub, score, vKey, verdictText, risks: [[sev, text]], risksTitle?, noRisks?,
 *   similarTitle, similar: [{ label, sub, score, onOpen }] | null (loading) | undefined (none),
 *   similarEmpty, note, extra?: { title, items: [text] } }
 */
export function renderGlance(data) {
  const box = document.getElementById("railR");
  if (!box) return;
  if (!data) { box.replaceChildren(); return; }
  const sim = data.similar;
  const simList = sim === undefined ? null
    : sim === null ? el("p", { class: "muted", style: "margin:0" }, "…")
    : sim.length ? el("ul", { class: "sim" }, ...sim.map((x) => {
      const b = el("button", { type: "button", class: "sim-row" },
        el("span", { class: "sim-n" }, el("b", {}, x.label), x.sub ? el("small", { class: "muted" }, x.sub) : null),
        el("span", { class: "sim-s num", "data-s": barClass(x.score) }, x.score.toFixed(1)));
      b.addEventListener("click", x.onOpen);
      return el("li", {}, b);
    }))
    : el("p", { class: "muted", style: "margin:0" }, data.similarEmpty);
  box.replaceChildren(el("div", { class: "panel rail-card glance" },
    el("div", { class: "eyebrow" }, t("sb_glance")),
    el("div", { class: "gl-head" },
      el("div", { class: "gl-n" }, el("b", {}, data.title), data.sub ? el("small", { class: "muted" }, data.sub) : null),
      el("span", { class: "gl-score num v-" + data.vKey }, data.score === null ? "–" : data.score.toFixed(1))),
    el("span", { class: "pill sm v-" + data.vKey }, data.verdictText),
    el("div", { class: "gl-sec" }, el("div", { class: "eyebrow" }, data.risksTitle || t("sb_topRisks")),
      data.risks.length ? el("ul", { class: "flags gl-flags" }, ...data.risks.map(([k, txt]) => el("li", { class: k }, el("span", {}, txt)))) : el("p", { class: "muted", style: "margin:0" }, data.noRisks || t("noFlags"))),
    data.extra && data.extra.items.length ? el("div", { class: "gl-sec" }, el("div", { class: "eyebrow" }, data.extra.title), el("ol", { class: "gl-fix" }, ...data.extra.items.map((x) => el("li", {}, x)))) : null,
    simList ? el("div", { class: "gl-sec" }, el("div", { class: "eyebrow" }, data.similarTitle), simList) : null,
    data.note ? el("p", { class: "muted rail-note" }, data.note) : null));
}
