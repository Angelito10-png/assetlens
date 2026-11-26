/**
 * Crypto page: "Did high scores pay off?" Reads backtest.json (built weekly by
 * scripts/fetch-backtest.mjs) and shows the result for the selected profile.
 */
import { t } from "./i18n.js?v=__V__";
import "./i18n-backtest.js?v=__V__";
import { el, locale } from "./ui.js?v=__V__";
import { lineChart } from "./linechart.js?v=__V__";

const box = typeof document !== "undefined" ? document.getElementById("sbtBody") : null;
let data, failed = false;

const profile = () => (document.querySelector('input[name="profile"]:checked') || {}).value || "longterm";
const pct = (v) => (v === null || v === undefined ? "–" : (v > 0 ? "+" : "") + v.toFixed(1) + "%");
const num = (v, d = 2) => (v === null || v === undefined ? "–" : v.toLocaleString(locale(), { minimumFractionDigits: d, maximumFractionDigits: d }));
const date = (s) => new Date(s + "T12:00:00Z").toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" });
const signCls = (v) => (v > 0 ? "up" : v < 0 ? "down" : "");

/** The plain-language takeaway for one profile's summary. Exported for the tests. */
export function takeaway(s, label, horizon) {
  const m = s.cohorts, k = s.topBeatBottom, gap = (s.top ?? 0) - (s.bottom ?? 0);
  const g = num(Math.abs(gap), 1);
  const main = k >= Math.ceil(m * 0.6) && gap > 0 ? t("sb_win", label, k, m, g, horizon) : k <= Math.floor(m * 0.4) && gap < 0 ? t("sb_lose", label, k, m, g) : t("sb_mixed", label, k, m);
  return [main, t("sb_btc", s.topBeatBtc, m)];
}

function render() {
  if (!box) return;
  if (failed || (data && !data.profiles)) { box.replaceChildren(el("p", { class: "muted", style: "margin:0" }, t("sb_missing"))); return; }
  if (!data) return;
  const pk = profile(), P = data.profiles[pk], s = P.summary, label = t("profile_" + pk), h = data.horizon;
  const [main, btc] = takeaway(s, label, h);
  const tile = (k, v, cls) => el("div", { class: "metric " + (cls || "") }, el("span", { class: "k" }, k), el("span", { class: "v num" }, pct(v)), el("small", { class: "muted" }, t("sb_k_avg", h)));
  const hd = data.headline;
  const times = hd.days.map((d) => Date.parse(d + "T12:00:00Z"));
  const chart = lineChart({
    times, aria: t("sb_chartAria"),
    series: [
      { label: t("sb_k_top"), values: P.headline.top, color: "var(--s1)" },
      { label: t("sb_k_bottom"), values: P.headline.bottom, color: "var(--s2)" },
      { label: t("sb_k_btc"), values: hd.btc, color: "var(--muted)", dash: true },
    ],
  });
  const th = (k, right) => el("th", right ? { class: "num" } : {}, t(k));
  const td = (v, f = pct) => el("td", { class: "num " + signCls(v) }, f(v));
  const cohorts = el("details", { class: "k-table" }, el("summary", {}, t("sb_dates")),
    el("div", { class: "tbl-wrap" }, el("table", {},
      el("thead", {}, el("tr", {}, th("sb_col_date"), th("sb_col_top", 1), th("sb_col_bottom", 1), th("sb_col_btc", 1), th("sb_col_ic", 1))),
      el("tbody", {}, ...P.cohorts.map((c) => el("tr", {}, el("td", {}, date(c.d)), td(c.top), td(c.bottom), td(c.btc), el("td", { class: "num" }, num(c.ic))))))));
  const picks = el("details", { class: "k-table" }, el("summary", {}, t("sb_picks", date(hd.from))),
    el("div", { class: "tbl-wrap" }, el("table", {},
      el("thead", {}, el("tr", {}, th("sb_col_coin"), th("sb_col_score", 1), th("sb_col_ret", 1), th("sb_col_group", 1))),
      el("tbody", {}, ...P.headline.picks.map((x) => el("tr", {}, el("td", {}, el("b", {}, x.s), " ", el("span", { class: "muted" }, x.n)), el("td", { class: "num" }, num(x.sc, 1)), td(x.r), el("td", { class: "num" }, t("sb_g_" + x.g))))))));
  const method = el("details", { class: "k-table" }, el("summary", {}, t("sb_method")),
    el("ul", { class: "sbt-method" }, ...["sb_m1", "sb_m2"].map((k) => el("li", {}, t(k))), el("li", {}, t("sb_m3", data.universe)), el("li", {}, t("sb_m4", data.every, h)), el("li", {}, t("sb_m5"))));
  box.replaceChildren(
    el("p", { style: "margin:0" }, t("sb_intro", s.cohorts, data.universe, h)),
    el("div", { class: "k-answer" }, el("p", {}, el("b", {}, main)), el("p", {}, btc), s.ic !== null ? el("p", { class: "muted", style: "font-size:.86rem" }, t("sb_ic", num(s.ic))) : null),
    el("div", { class: "metrics k-kpi" }, tile(t("sb_k_top"), s.top, s.top > s.bottom ? "hl" : ""), tile(t("sb_k_bottom"), s.bottom), tile(t("sb_k_all"), s.all), tile(t("sb_k_btc"), s.btc)),
    el("h3", { style: "margin:8px 0 0" }, t("sb_chartTitle", date(hd.from))),
    el("p", { class: "muted", style: "margin:0;font-size:.86rem" }, t("sb_chartNote")),
    chart, cohorts, picks, method,
    el("p", { class: "muted", style: "margin:0;font-size:.78rem" }, t("sb_source", date(data.updated.slice(0, 10)))),
  );
}

function relabel() {
  const h = document.getElementById("sbtTitle");
  if (h) h.textContent = t("sb_title");
  render();
}

async function init() {
  if (!box) return;
  relabel();
  document.querySelectorAll('input[name="profile"]').forEach((r) => r.addEventListener("change", render));
  document.querySelectorAll("[data-lang]").forEach((b) => b.addEventListener("click", () => setTimeout(relabel)));
  try {
    const r = await fetch("backtest.json", { cache: "no-cache" });
    if (!r.ok) throw new Error(String(r.status));
    data = await r.json();
  } catch { failed = true; }
  render();
}

if (typeof document !== "undefined") init();
