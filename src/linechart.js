/**
 * Small SVG line chart for "growth of 100" series (backtests, portfolio history), with a legend
 * and a hover/tap readout. Values are index levels (100 = start); the axis shows % change.
 * series: [{ label, values: [number|null], color: "var(--s1)", dash?: true }]
 */
import { el, locale } from "./ui.js?v=__V__";

const NS = "http://www.w3.org/2000/svg";
const mk = (tag, a, txt) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); if (txt != null) e.textContent = txt; return e; };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const pctFromIndex = (v) => (v === null || v === undefined ? "–" : (v >= 100 ? "+" : "") + (v - 100).toFixed(1) + "%");

function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

export function lineChart({ times, series, aria }) {
  const narrow = typeof innerWidth === "number" && innerWidth < 560;
  const W = narrow ? 360 : 640, H = narrow ? 240 : 260, L = narrow ? 46 : 52, R = 12, T = 12, B = 28;
  const n = times.length;
  const all = series.flatMap((s) => s.values).filter((v) => v !== null && isFinite(v));
  const lo = Math.min(100, ...all), hi = Math.max(100, ...all);
  const step = niceStep((hi - lo) / 4 || 10);
  const y0 = Math.floor(lo / step) * step, y1 = Math.ceil(hi / step) * step;
  const X = (i) => L + (n > 1 ? (i / (n - 1)) * (W - L - R) : 0);
  const Y = (v) => T + (1 - (v - y0) / (y1 - y0 || 1)) * (H - T - B);
  const svg = mk("svg", { viewBox: `0 0 ${W} ${H}`, class: "kchart", role: "img", "aria-label": aria || "" });
  for (let v = y0; v <= y1 + 1e-9; v += step) {
    svg.append(mk("line", { x1: L, x2: W - R, y1: Y(v), y2: Y(v), class: Math.abs(v - 100) < 1e-9 ? "base" : "grid" }));
    svg.append(mk("text", { x: L - 6, y: Y(v) + 4, "text-anchor": "end", class: "tick" }, Math.abs(v - 100) < 1e-9 ? "0%" : (v > 100 ? "+" : "") + Math.round(v - 100) + "%"));
  }
  const fmtTick = (ms) => new Date(ms).toLocaleDateString(locale(), { month: "short", year: "2-digit" });
  const ticks = narrow ? 4 : 6;
  for (let k = 0; k < ticks; k++) {
    const i = Math.round((k / (ticks - 1)) * (n - 1));
    svg.append(mk("text", { x: X(i), y: H - 8, "text-anchor": k === 0 ? "start" : k === ticks - 1 ? "end" : "middle", class: "tick" }, fmtTick(times[i])));
  }
  for (const s of series) {
    let d = "", pen = false;
    s.values.forEach((v, i) => { if (v === null || !isFinite(v)) { pen = false; return; } d += (pen ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1); pen = true; });
    svg.append(mk("path", { d, fill: "none", style: `stroke:${s.color};stroke-width:${s.dash ? 1.6 : 2.2};stroke-linejoin:round${s.dash ? ";stroke-dasharray:5 4" : ""}` }));
  }
  const cross = mk("line", { y1: T, y2: H - B, class: "cross", visibility: "hidden" });
  const dots = series.map((s) => mk("circle", { r: 4, visibility: "hidden", style: `fill:${s.color};stroke:var(--surface);stroke-width:2` }));
  const hit = mk("rect", { x: L, y: T, width: W - L - R, height: H - T - B, fill: "transparent" });
  svg.append(cross, ...dots, hit);
  const tip = el("div", { class: "ktip", hidden: true });
  const lastOf = (s) => { for (let i = s.values.length - 1; i >= 0; i--) if (s.values[i] !== null) return s.values[i]; return null; };
  const sw = (s) => el("i", { class: "lsw", style: `border-color:${s.color};${s.dash ? "border-top-style:dashed" : ""}` });
  const legend = el("div", { class: "legend" }, ...series.map((s) => el("span", {}, sw(s), s.label, " ", el("b", { class: "num" }, pctFromIndex(lastOf(s))))));
  const show = (evt) => {
    const box = svg.getBoundingClientRect();
    const px = ((evt.clientX - box.left) / box.width) * W;
    const i = clamp(Math.round(((px - L) / (W - L - R)) * (n - 1)), 0, n - 1), x = X(i);
    cross.setAttribute("x1", x); cross.setAttribute("x2", x); cross.setAttribute("visibility", "visible");
    series.forEach((s, j) => { const v = s.values[i]; if (v === null) { dots[j].setAttribute("visibility", "hidden"); return; } dots[j].setAttribute("cx", x); dots[j].setAttribute("cy", Y(v)); dots[j].setAttribute("visibility", "visible"); });
    tip.replaceChildren(el("b", {}, new Date(times[i]).toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" })),
      ...series.map((s) => el("span", {}, sw(s), s.label + ": ", el("span", { class: "num" }, pctFromIndex(s.values[i])))));
    tip.hidden = false;
    tip.style.left = Math.min(box.width - 180, Math.max(0, (x / W) * box.width + 12)) + "px";
    tip.style.top = "8px";
  };
  const hide = () => { tip.hidden = true; cross.setAttribute("visibility", "hidden"); dots.forEach((d) => d.setAttribute("visibility", "hidden")); };
  hit.addEventListener("pointermove", show);
  hit.addEventListener("pointerdown", show);
  hit.addEventListener("pointerleave", hide);
  return el("div", { class: "kchart-wrap" }, legend, el("div", { class: "kchart-box" }, svg, tip));
}
