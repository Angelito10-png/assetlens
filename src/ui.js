/**
 * Shared UI helpers for the stocks & ETFs page and the portfolio page:
 * DOM builder, storage, theme and language toggles, score dial and radar chart.
 * (The crypto page keeps its own copies in app.js.)
 */
import { t, setLang, getLang } from "./i18n.js?v=__V__";

export const $ = (id) => document.getElementById(id);

export function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v; else n.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid.nodeType ? kid : String(kid));
  return n;
}

export const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* blocked */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* blocked */ } },
};
export const browserStorage = { getItem: (k) => store.get(k), setItem: (k, v) => store.set(k, v) };

export const safeUrl = (u) => (typeof u === "string" && /^https?:\/\//.test(u) ? u : null);
export const locale = () => (getLang() === "el" ? "el-GR" : "en-US");
export const priceFmt = (v) => (v === null || v === undefined ? "n/a" : v >= 1 ? "$" + v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "$" + v.toPrecision(4));
export const barClass = (s) => (s >= 7 ? "s-hi" : s >= 4.5 ? "s-md" : "s-lo");

export function ago(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!isFinite(s) || s < 60) return t("justNow");
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: "auto" });
  if (s < 3600) return rtf.format(-Math.round(s / 60), "minute");
  if (s < 86400) return rtf.format(-Math.round(s / 3600), "hour");
  return rtf.format(-Math.round(s / 86400), "day");
}

/* ---------- language & theme ---------- */
const THEMES = ["system", "light", "dark"];
export function applyStatic() {
  document.documentElement.lang = getLang();
  document.querySelectorAll("[data-i18n]").forEach((n) => { n.textContent = t(n.dataset.i18n); });
  document.querySelectorAll("[data-i18n-ph]").forEach((n) => { n.placeholder = t(n.dataset.i18nPh); });
  document.querySelectorAll("[data-i18n-aria]").forEach((n) => { n.setAttribute("aria-label", t(n.dataset.i18nAria)); });
  document.querySelectorAll("[data-lang]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === getLang())));
}
export function applyTheme(theme, save) {
  if (!THEMES.includes(theme)) theme = "system";
  if (theme === "system") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme;
  if (save) store.set("cs-theme", theme);
  document.querySelectorAll("[data-theme-btn]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.themeBtn === theme)));
}
/** Language from the URL, then the saved choice, then the browser. onChange runs after a switch. */
export function initChrome(onChange) {
  const p = new URLSearchParams(location.search);
  const nav = (navigator.language || "").toLowerCase().startsWith("el") ? "el" : "en";
  setLang(p.get("lang") || store.get("cs-lang") || nav);
  applyTheme(store.get("cs-theme") || "system", false);
  applyStatic();
  document.querySelectorAll("[data-lang]").forEach((b) => b.addEventListener("click", () => {
    setLang(b.dataset.lang); store.set("cs-lang", getLang()); applyStatic(); syncNavLang(); onChange && onChange();
  }));
  document.querySelectorAll("[data-theme-btn]").forEach((b) => b.addEventListener("click", () => applyTheme(b.dataset.themeBtn, true)));
  syncNavLang();
}
/** Section links carry the language so switching pages keeps it. */
function syncNavLang() {
  document.querySelectorAll("a[data-nav]").forEach((a) => { a.href = a.dataset.nav + (getLang() !== "en" ? "?lang=" + getLang() : ""); });
}

/* ---------- score dial ---------- */
export function dial(score, vkey) {
  const r = 80, C = 2 * Math.PI * r, frac = (score - 1) / 9;
  const color = { strong: "var(--good)", good: "var(--good)", mixed: "var(--mid)", weak: "var(--bad)", poor: "var(--bad)" }[vkey];
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 190 190"); svg.setAttribute("aria-hidden", "true");
  const circle = (attrs) => { const c = document.createElementNS(NS, "circle"); for (const [k, v] of Object.entries(attrs)) c.setAttribute(k, v); return c; };
  svg.append(
    circle({ cx: 95, cy: 95, r, fill: "none", stroke: "var(--sunk)", "stroke-width": 14 }),
    circle({ cx: 95, cy: 95, r, fill: "none", stroke: "var(--line)", "stroke-width": 1 }),
    circle({ class: "arc", cx: 95, cy: 95, r, fill: "none", stroke: color, "stroke-width": 14, "stroke-linecap": "round", "stroke-dasharray": C, "stroke-dashoffset": C * (1 - frac), transform: "rotate(-90 95 95)" }),
  );
  return el("div", { class: "dial", role: "img", "aria-label": `${score} / 10` }, svg, el("div", { class: "val" }, el("b", {}, score.toFixed(1)), el("small", {}, t("outOf10"))));
}

/* ---------- radar chart (inline SVG, no library) ---------- */
export function radar(series, factorDefs) {
  // series: [{ name, slot, factors: [{key, name, score}] }]; factorDefs: [{key}]
  const NS = "http://www.w3.org/2000/svg";
  const W = 420, H = 360, cx = W / 2, cy = H / 2 + 4, R = 120, n = factorDefs.length;
  const mk = (tag, attrs, text) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (text != null) e.textContent = text; return e; };
  const ang = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i, v) => [cx + Math.cos(ang(i)) * R * (v / 10), cy + Math.sin(ang(i)) * R * (v / 10)];
  const svg = mk("svg", { viewBox: `0 0 ${W} ${H}`, class: "radar", role: "img", "aria-label": t("radarAria") });
  for (const ring of [2.5, 5, 7.5, 10]) svg.append(mk("polygon", { points: factorDefs.map((_, i) => pt(i, ring).join(",")).join(" "), fill: "none", stroke: "var(--grid)", "stroke-width": ring === 10 ? 1 : 0.75 }));
  [2.5, 5, 7.5].forEach((v) => { const [x, y] = pt(0, v); svg.append(mk("text", { x: x + 4, y: y + 10, class: "rtick" }, String(v))); });
  factorDefs.forEach((F, i) => {
    const [x, y] = pt(i, 10);
    svg.append(mk("line", { x1: cx, y1: cy, x2: x, y2: y, stroke: "var(--grid)", "stroke-width": 0.75 }));
    const [lx, ly] = pt(i, 11.6);
    const anchor = Math.abs(lx - cx) < 8 ? "middle" : lx > cx ? "start" : "end";
    svg.append(mk("text", { x: lx, y: ly + 4, "text-anchor": anchor, class: "rlabel" }, t("short_" + F.key)));
  });
  series.forEach((s) => {
    const pts = s.factors.map((f, i) => pt(i, f.score ?? 0));
    svg.append(mk("polygon", { points: pts.map((p) => p.join(",")).join(" "), fill: `var(--s${s.slot})`, "fill-opacity": series.length > 1 ? 0.1 : 0.16, stroke: `var(--s${s.slot})`, "stroke-width": 2, "stroke-linejoin": "round" }));
  });
  series.forEach((s) => s.factors.forEach((f, i) => {
    const [x, y] = pt(i, f.score ?? 0);
    const g = mk("g", { class: "rpt", tabindex: 0 });
    g.append(mk("circle", { cx: x, cy: y, r: 12, fill: "transparent" }));
    g.append(mk("circle", { cx: x, cy: y, r: 4.5, fill: f.score === null ? "var(--surface)" : `var(--s${s.slot})`, stroke: f.score === null ? `var(--s${s.slot})` : "var(--surface)", "stroke-width": 2 }));
    g.append(mk("title", {}, `${s.name} · ${f.name}: ${f.score === null ? t("noDataShort") : f.score.toFixed(1) + " / 10"}`));
    svg.append(g);
  }));
  return svg;
}

/** Close a <dialog> when its backdrop is clicked. */
export function backdropClose(d) { d.addEventListener("click", (e) => { if (e.target === d) d.close(); }); }

export function closeBtn(onClick) {
  const b = el("button", { type: "button", class: "xbtn quiz-x", "aria-label": t("quizClose") }, "×");
  b.addEventListener("click", onClick);
  return b;
}
