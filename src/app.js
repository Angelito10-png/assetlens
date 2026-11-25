import * as E from "./engine.js?v=__V__";
import { topCoins, coinInfo, searchCoins, githubActivity, ApiError } from "./api.js?v=__V__";

const $ = (id) => document.getElementById(id);
const QUICK = [["bitcoin", "Bitcoin"], ["ethereum", "Ethereum"], ["solana", "Solana"], ["chainlink", "Chainlink"], ["dogecoin", "Dogecoin"], ["pepe", "Pepe"]];
let coins = [];
let current = null; // normalised coin
let meta = null; // { loadedAt, ghStatus, logo, cgUrl, ghUrl }
let customWeights = null; // null = use the profile's weights
let compare = []; // up to 2 extra coins: { c, meta }
const MAX_COMPARE = 2;
const SHORT = { size: "Size", tokenomics: "Tokenomics", momentum: "Momentum", stability: "Stability", development: "Development", maturity: "Track record", community: "Community" };

/* ---------- small helpers ---------- */
function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null) continue;
    if (k === "class") n.className = v; else n.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null) n.append(kid.nodeType ? kid : String(kid));
  return n;
}
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* blocked */ } },
};
const profile = () => document.querySelector('input[name="profile"]:checked').value;
const safeUrl = (u) => (typeof u === "string" && /^https?:\/\//.test(u) ? u : null);

function status(s, text) { $("status").dataset.s = s; $("statusText").textContent = text; }
function notice(kind, title, body) {
  const n = $("notice");
  if (!kind) { n.hidden = true; n.replaceChildren(); return; }
  n.hidden = false; n.className = "notice"; n.dataset.k = kind;
  n.replaceChildren(el("p", {}, el("b", {}, title)), body ? el("p", {}, body) : null);
}
function errorCopy(e) {
  if (e instanceof ApiError) {
    if (e.kind === "rate_limit") return ["CoinGecko is busy", `The free CoinGecko API allows a few requests per minute. Try again in about ${Math.ceil((e.retryAfter || 60) / 60)} minute(s).`];
    if (e.kind === "not_found") return ["Coin not found", "Pick a coin from the suggestions, or type its CoinGecko id (the last part of its coingecko.com URL)."];
    if (e.kind === "network") return ["No connection", e.message];
  }
  return ["Could not load data", (e && e.message) || "Press Analyze to try again."];
}

/* ---------- URL state: ?coin=bitcoin&profile=longterm makes results shareable ---------- */
function readUrl() {
  const p = new URLSearchParams(location.search);
  return { coin: p.get("coin"), profile: p.get("profile"), weights: E.decodeWeights(p.get("w")), vs: (p.get("vs") || "").split(",").filter(Boolean).slice(0, MAX_COMPARE) };
}
function writeUrl() {
  if (!current) return;
  const p = new URLSearchParams({ coin: current.id, profile: profile() });
  if (customWeights) p.set("w", E.encodeWeights(customWeights));
  if (compare.length) p.set("vs", compare.map((x) => x.c.id).join(","));
  history.replaceState(null, "", `${location.pathname}?${p.toString().replace(/%2C/g, ",")}`);
}

/* ---------- coin selection ---------- */
async function loadList() {
  try {
    const rows = await topCoins();
    coins = rows.map((r) => ({ id: r.id, name: r.name, symbol: (r.symbol || "").toUpperCase(), row: r }));
    $("coinlist").replaceChildren(...coins.map((c) => el("option", { value: `${c.name} (${c.symbol})` })));
  } catch { /* the list is a convenience; analyze() reports real errors */ }
}

async function resolveId(text) {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  const m = t.match(/\(([^)]+)\)\s*$/);
  const name = m ? t.slice(0, m.index).trim() : t;
  const hit = coins.find((c) => c.name.toLowerCase() === name)
    || coins.find((c) => c.symbol.toLowerCase() === t)
    || coins.find((c) => c.id === t)
    || coins.find((c) => c.name.toLowerCase().startsWith(name));
  if (hit) return hit.id;
  try { const found = await searchCoins(name); if (found.length) return found[0].id; } catch { /* fall through */ }
  return t.replace(/\s+/g, "-");
}

/** Load one coin (market data + GitHub activity) and normalise it. GitHub failures never fail the coin. */
async function loadCoin(id, onStep) {
  const info = await coinInfo(id);
  const row = (coins.find((c) => c.id === id) || {}).row;
  if (onStep) onStep("Loading GitHub activity…");
  let gh = null, ghStatus = "ok";
  try {
    gh = await githubActivity(((info.links || {}).repos_url || {}).github);
    if (!gh) ghStatus = "none";
  } catch (e) {
    ghStatus = e instanceof ApiError && e.kind === "rate_limit" ? "rate_limit" : "error";
  }
  return {
    c: E.normalize(info, row, gh),
    meta: { loadedAt: new Date(), ghStatus, logo: safeUrl((info.image || {}).small), cgUrl: `https://www.coingecko.com/en/coins/${encodeURIComponent(info.id)}`, ghUrl: gh ? safeUrl(gh.url) : null },
  };
}

async function analyze(idArg) {
  const id = idArg || (await resolveId($("coin").value));
  if (!id) { notice("warn", "Choose a coin first", "Type a name or ticker, or pick one of the shortcuts."); return; }
  $("go").disabled = true;
  status("loading", "Loading market data…");
  try {
    const loaded = await loadCoin(id, (t) => status("loading", t));
    current = loaded.c; meta = loaded.meta;
    compare = compare.filter((x) => x.c.id !== current.id);
    $("coin").value = `${current.name} (${current.symbol})`;
    notice(null);
    render();
    writeUrl();
    status("live", "Live · " + meta.loadedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
  } catch (e) {
    const [t, b] = errorCopy(e);
    notice(e instanceof ApiError && e.kind === "rate_limit" ? "warn" : "bad", t, b);
    status("error", current ? "Showing last result" : "No data");
    if (!current) $("result").replaceChildren(el("div", { class: "panel skeleton" }, "No coin loaded yet."));
  } finally {
    $("go").disabled = false;
  }
}

/* ---------- comparison ---------- */
let compareBusy = false;
async function addCompare(text) {
  if (compareBusy || compare.length >= MAX_COMPARE) return;
  const id = await resolveId(text);
  if (!id) return;
  if ((current && current.id === id) || compare.some((x) => x.c.id === id)) { setCompareMsg("That coin is already in the comparison."); return; }
  compareBusy = true; setCompareMsg("Loading…");
  try {
    compare.push(await loadCoin(id));
    setCompareMsg("");
    render(); writeUrl();
  } catch (e) {
    setCompareMsg(errorCopy(e).join(". "));
  } finally { compareBusy = false; }
}
function removeCompare(id) { compare = compare.filter((x) => x.c.id !== id); render(); writeUrl(); }
let compareMsg = "";
function setCompareMsg(t) { compareMsg = t; const n = document.getElementById("cmpMsg"); if (n) n.textContent = t; }

/* ---------- weights ---------- */
const activeWeights = () => customWeights || E.PROFILES[profile()].weights;
function renderWeights() {
  const w = activeWeights(), sum = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  const rows = E.FACTORS.map((F) => {
    const id = "w-" + F.key;
    const input = el("input", { type: "range", id, min: 0, max: 50, step: 1, value: Math.round(w[F.key] || 0), "aria-describedby": id + "-v" });
    input.addEventListener("input", () => {
      customWeights = { ...activeWeights(), [F.key]: Number(input.value) };
      if (!Object.values(customWeights).some((v) => v > 0)) customWeights[F.key] = 1;
      renderWeightsValues(); render(); writeUrlSoon();
    });
    return el("div", { class: "wrow" }, el("label", { for: id }, F.name), input, el("output", { id: id + "-v", class: "num", for: id }, Math.round(((w[F.key] || 0) / sum) * 100) + "%"));
  });
  const reset = el("button", { type: "button", class: "ghost", id: "wReset" }, `Reset to ${E.PROFILES[profile()].label.toLowerCase()} weights`);
  reset.disabled = !customWeights;
  reset.addEventListener("click", () => { customWeights = null; renderWeights(); render(); writeUrl(); });
  $("weightsBody").replaceChildren(
    el("p", { class: "muted", style: "margin:0;font-size:.85rem" }, "Drag to change how much each factor counts. Percentages show each factor's share of the total; the score updates as you drag."),
    el("div", { class: "wgrid" }, ...rows),
    el("div", { class: "wfoot" }, reset, el("span", { class: "muted", id: "wState", style: "font-size:.82rem" }, customWeights ? "Using your custom weights" : `Using the ${E.PROFILES[profile()].label.toLowerCase()} profile's weights`)),
  );
}
function renderWeightsValues() {
  const w = activeWeights(), sum = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  E.FACTORS.forEach((F) => { const o = document.getElementById("w-" + F.key + "-v"); if (o) o.textContent = Math.round(((w[F.key] || 0) / sum) * 100) + "%"; });
  const st = document.getElementById("wState"); if (st) st.textContent = customWeights ? "Using your custom weights" : "";
  const rb = document.getElementById("wReset"); if (rb) rb.disabled = !customWeights;
}
let urlTimer = null;
function writeUrlSoon() { clearTimeout(urlTimer); urlTimer = setTimeout(writeUrl, 300); }

/* ---------- radar chart (inline SVG, no library) ---------- */
function radar(series) {
  // series: [{ name, slot, factors: [{key, name, score}] }]
  const NS = "http://www.w3.org/2000/svg";
  const W = 420, H = 360, cx = W / 2, cy = H / 2 + 4, R = 120, n = E.FACTORS.length;
  const mk = (tag, attrs, text) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (text != null) e.textContent = text; return e; };
  const ang = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i, v) => [cx + Math.cos(ang(i)) * R * (v / 10), cy + Math.sin(ang(i)) * R * (v / 10)];
  const svg = mk("svg", { viewBox: `0 0 ${W} ${H}`, class: "radar", role: "img", "aria-label": "Radar chart of the seven factor scores, 0 to 10" });
  for (const ring of [2.5, 5, 7.5, 10]) {
    svg.append(mk("polygon", { points: E.FACTORS.map((_, i) => pt(i, ring).join(",")).join(" "), fill: "none", stroke: "var(--grid)", "stroke-width": ring === 10 ? 1 : 0.75 }));
  }
  [2.5, 5, 7.5].forEach((v) => { const [x, y] = pt(0, v); svg.append(mk("text", { x: x + 4, y: y + 10, class: "rtick" }, String(v))); });
  E.FACTORS.forEach((F, i) => {
    const [x, y] = pt(i, 10);
    svg.append(mk("line", { x1: cx, y1: cy, x2: x, y2: y, stroke: "var(--grid)", "stroke-width": 0.75 }));
    const [lx, ly] = pt(i, 11.6);
    const anchor = Math.abs(lx - cx) < 8 ? "middle" : lx > cx ? "start" : "end";
    svg.append(mk("text", { x: lx, y: ly + 4, "text-anchor": anchor, class: "rlabel" }, SHORT[F.key]));
  });
  series.forEach((s) => {
    const pts = s.factors.map((f, i) => pt(i, f.score ?? 0));
    svg.append(mk("polygon", { points: pts.map((p) => p.join(",")).join(" "), fill: `var(--s${s.slot})`, "fill-opacity": series.length > 1 ? 0.1 : 0.16, stroke: `var(--s${s.slot})`, "stroke-width": 2, "stroke-linejoin": "round" }));
  });
  series.forEach((s) => {
    s.factors.forEach((f, i) => {
      const [x, y] = pt(i, f.score ?? 0);
      const g = mk("g", { class: "rpt", tabindex: 0 });
      g.append(mk("circle", { cx: x, cy: y, r: 12, fill: "transparent" }));
      g.append(mk("circle", { cx: x, cy: y, r: 4.5, fill: f.score === null ? "var(--surface)" : `var(--s${s.slot})`, stroke: f.score === null ? `var(--s${s.slot})` : "var(--surface)", "stroke-width": 2 }));
      g.append(mk("title", {}, `${s.name} · ${f.name}: ${f.score === null ? "no data" : f.score.toFixed(1) + " / 10"}`));
      svg.append(g);
    });
  });
  return svg;
}

/* ---------- rendering ---------- */
const barClass = (s) => (s >= 7 ? "s-hi" : s >= 4.5 ? "s-md" : "s-lo");
const pctSpan = (v) => el("span", { class: v === null ? "" : v >= 0 ? "pos" : "neg" }, E.fmtPct(v));
const priceFmt = (v) => (v === null ? "n/a" : v >= 1 ? "$" + v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "$" + v.toPrecision(4));

function dial(score, vkey) {
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
  return el("div", { class: "dial", role: "img", "aria-label": `Score ${score} out of 10` }, svg, el("div", { class: "val" }, el("b", {}, score.toFixed(1)), el("small", {}, "out of 10")));
}

function render() {
  if (!current) return;
  const c = current, pk = profile(), r = E.score(c, pk, customWeights), [vText, vKey] = E.verdict(r.total);
  const who = customWeights ? "your custom weights" : `a ${r.profile.label.toLowerCase()} investor`;
  const all = Object.keys(E.PROFILES).map((k) => [k, E.score(c, k).total, E.PROFILES[k].label]);
  if (customWeights) all.push(["custom", r.total, "Custom"]);

  const badge = meta.logo ? el("img", { class: "logo", src: meta.logo, alt: "", width: 40, height: 40 }) : el("div", { class: "mono-badge" }, c.symbol.slice(0, 4));
  const card = el("div", { class: "panel scorecard" },
    el("div", { class: "coin-id" }, badge, el("div", { style: "text-align:left" }, el("h2", {}, c.name), el("div", { class: "muted mono", style: "font-size:.8rem" }, c.symbol + (c.rank ? " · rank #" + c.rank : "")))),
    dial(r.total, vKey),
    el("span", { class: "pill v-" + vKey }, `${vText} for ${who}`),
    r.caps.length ? el("p", { class: "caps" }, ...r.caps) : null,
    el("div", { class: "cmp" }, el("div", { class: "eyebrow" }, "Same coin, other profiles"),
      ...all.map(([k, t, label]) => el("div", { class: "cmp-row" + (k === (customWeights ? "custom" : pk) ? " on" : "") }, el("span", {}, label), el("div", { class: "track" }, el("i", { style: `width:${((t - 1) / 9) * 100}%` })), el("span", { class: "num", style: "text-align:right" }, t.toFixed(1))))),
    el("div", { class: "muted", style: "font-size:.78rem" }, `Data coverage ${r.coverage}% of weighted factors`),
  );

  const turnover = c.vol24 !== null && c.mcap ? (c.vol24 / c.mcap) * 100 : null;
  const M = [["Price", priceFmt(c.price)], ["24h", pctSpan(c.ch24)], ["Market cap", E.fmtBig(c.mcap)], ["Fully diluted", E.fmtBig(c.fdv)], ["24h volume", E.fmtBig(c.vol24)], ["Volume / cap", turnover === null ? "n/a" : turnover.toFixed(2) + "%"], ["30 days", pctSpan(c.ch30d)], ["1 year", pctSpan(c.ch1y)], ["From all-time high", pctSpan(c.athChange)]];
  const right = el("div", { class: "right" },
    el("div", { class: "metrics" }, ...M.map(([k, v]) => el("div", { class: "metric" }, el("span", { class: "k" }, k), el("span", { class: "v" }, v)))),
    c.categories.length ? el("div", { class: "cats" }, ...c.categories.slice(0, 8).map((x) => el("span", {}, x))) : null,
    el("div", { class: "panel", style: "padding:16px" }, el("div", { class: "eyebrow", style: "margin-bottom:8px" }, "Risk flags"),
      r.flags.length ? el("ul", { class: "flags" }, ...r.flags.map(([k, t]) => el("li", { class: k }, el("span", {}, t)))) : el("p", { class: "muted", style: "margin:0" }, "No major red flags in the data.")),
  );

  const ghNote = { rate_limit: "GitHub's hourly limit for anonymous visitors was reached, so development activity is skipped for now. It resets within the hour.", error: "GitHub could not be reached, so development activity is skipped for now." }[meta.ghStatus];
  const ledger = el("div", { class: "ledger" },
    el("div", { class: "frow head" }, el("div", {}, "Factor"), el("div", {}, "Score"), el("div", {}, "Weight"), el("div", {}, "Why")),
    ...r.factors.map((f) => {
      const notes = f.key === "development" && f.score === null && ghNote ? [ghNote] : f.notes;
      return el("div", { class: "frow" + (f.weight === 0 || f.score === null ? " off" : "") },
        el("div", { class: "fname" }, el("h3", {}, f.name), el("p", {}, f.what)),
        el("div", { class: "fscore" }, el("span", { class: "n" }, f.score === null ? "no data" : f.score.toFixed(1) + " / 10"), f.score === null ? null : el("div", { class: "bar10" }, el("i", { class: barClass(f.score), style: `width:${f.score * 10}%` }))),
        el("div", { class: "fw" }, f.weight === 0 ? "0%" : Math.round(f.effWeight) + "%", el("small", {}, f.weight === 0 ? "not used" : f.score === null ? "skipped" : "+" + (f.contrib * 0.9).toFixed(2) + " pts")),
        el("div", { class: "fwhy" }, el("ul", {}, ...notes.map((n) => el("li", {}, n))), f.inputs.length ? el("div", { class: "inputs" }, ...f.inputs.map(([k, v]) => el("span", {}, k + " ", el("b", {}, v)))) : null),
      );
    }),
  );

  const recs = E.recommend(c, r);
  const homepage = safeUrl(c.homepage), whitepaper = safeUrl(c.whitepaper);
  const link = (href, text) => el("a", { href, target: "_blank", rel: "noopener" }, text);
  $("result").replaceChildren(el("div", { style: "display:grid;gap:20px" },
    el("div", { class: "hero" }, card, right),
    el("div", { class: "viz" }, radarPanel(r), comparePanel(r)),
    el("section", { class: "panel" }, el("div", { class: "section-head" }, el("h2", {}, "Score breakdown"), el("span", { class: "muted", style: "font-size:.82rem" }, `${customWeights ? "Your custom weights" : `Weights for the ${r.profile.label.toLowerCase()} profile`} · score = 1 + 0.9 × weighted average`)), ledger),
    el("div", { class: "two" },
      el("section", { class: "panel" }, el("h2", { style: "margin-bottom:14px" }, `Recommendations for a ${r.profile.label.toLowerCase()} investor`), el("ul", { class: "recs" }, ...recs.map(([h, t]) => el("li", {}, el("b", {}, h), el("span", {}, t))))),
      el("section", { class: "panel" }, el("h2", { style: "margin-bottom:10px" }, "Before you act"),
        el("ul", { class: "recs" },
          el("li", {}, el("b", {}, "Not covered by the data"), el("span", {}, "Team identities, audits, regulation, token unlock dates and exchange risk are not in this data. Check them yourself.")),
          el("li", {}, el("b", {}, "Sources"), el("span", {}, link(meta.cgUrl, "CoinGecko"), meta.ghUrl ? " · " : "", meta.ghUrl ? link(meta.ghUrl, "GitHub repository") : null, homepage ? " · " : "", homepage ? link(homepage, "Project site") : null, whitepaper ? " · " : "", whitepaper ? link(whitepaper, "Whitepaper") : null)),
          el("li", {}, el("b", {}, "Loaded"), el("span", {}, meta.loadedAt.toLocaleString() + (c.updated ? ` · CoinGecko data from ${new Date(c.updated).toLocaleTimeString()}` : ""))),
        )),
    ),
  ));
}

function radarPanel(r) {
  const series = [{ name: current.name, slot: 1, factors: r.factors }, ...compare.map((x, i) => ({ name: x.c.name, slot: i + 2, factors: E.score(x.c, profile(), customWeights).factors }))];
  const legend = series.length > 1 ? el("div", { class: "legend" }, ...series.map((s) => el("span", {}, el("i", { class: "sw", style: `background:var(--s${s.slot})` }), s.name))) : null;
  return el("section", { class: "panel" },
    el("div", { class: "section-head" }, el("h2", {}, "Factor profile"), el("span", { class: "muted", style: "font-size:.82rem" }, "Each axis is a factor score from 0 (centre) to 10")),
    legend,
    el("div", { class: "radar-wrap" }, radar(series)),
    el("p", { class: "muted", style: "margin:0;font-size:.78rem" }, "Hollow points mark factors with no data. Hover or focus a point for its value."));
}

function comparePanel(r) {
  const pk = profile();
  const entries = [{ c: current, slot: 1, main: true }, ...compare.map((x, i) => ({ c: x.c, slot: i + 2 }))];
  const scored = entries.map((e) => ({ ...e, r: e.main ? r : E.score(e.c, pk, customWeights) }));
  const rowsDef = [
    ["Score", (x) => x.r.total, (v) => v.toFixed(1), true],
    ...Object.keys(E.PROFILES).filter((k) => customWeights || k !== pk).map((k) => [E.PROFILES[k].label, (x) => E.score(x.c, k).total, (v) => v.toFixed(1), false]),
    ...E.FACTORS.map((F) => [F.name, (x) => x.r.factors.find((f) => f.key === F.key).score, (v) => (v === null ? "–" : v.toFixed(1)), false]),
    ["Market cap", (x) => x.c.mcap, E.fmtBig, false],
    ["30 days", (x) => x.c.ch30d, (v) => E.fmtPct(v), false],
  ];
  const head = el("tr", {}, el("th", {}, ""), ...scored.map((x) => el("th", { class: "num" },
    el("span", { class: "chead" }, el("i", { class: "sw", style: `background:var(--s${x.slot})` }), x.c.symbol),
    x.main ? null : (() => { const b = el("button", { type: "button", class: "xbtn", "aria-label": `Remove ${x.c.name} from comparison` }, "×"); b.addEventListener("click", () => removeCompare(x.c.id)); return b; })())));
  const body = rowsDef.map(([label, get, fmt, strong]) => {
    const vals = scored.map(get);
    const nums = vals.filter((v) => typeof v === "number");
    const best = scored.length > 1 && nums.length > 1 && label !== "30 days" && label !== "Market cap" ? Math.max(...nums) : null;
    return el("tr", { class: strong ? "strong" : "" }, el("th", { scope: "row" }, label), ...vals.map((v) => el("td", { class: "num" + (best !== null && v === best ? " best" : "") }, fmt(v ?? null))));
  });
  const input = el("input", { type: "text", id: "cmpCoin", list: "coinlist", placeholder: "Add a coin to compare", autocomplete: "off" });
  const add = el("button", { type: "button", class: "ghost", id: "cmpAdd" }, "Add");
  const go = () => { if (input.value.trim()) addCompare(input.value).then(() => { const i = document.getElementById("cmpCoin"); if (i) i.value = ""; }); };
  add.addEventListener("click", go);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  const full = compare.length >= MAX_COMPARE;
  if (full) { input.disabled = true; add.disabled = true; input.placeholder = "Up to 3 coins"; }
  return el("section", { class: "panel" },
    el("div", { class: "section-head" }, el("h2", {}, "Compare coins"), el("span", { class: "muted", style: "font-size:.82rem" }, customWeights ? "Scored with your custom weights" : `Scored for a ${E.PROFILES[pk].label.toLowerCase()} investor`)),
    el("div", { class: "cmp-add" }, input, add),
    el("p", { class: "muted", id: "cmpMsg", style: "margin:0 0 8px;font-size:.8rem;min-height:1.2em", "aria-live": "polite" }, compareMsg || (compare.length ? "" : "Add up to two coins to see them side by side. Try Ethereum or Solana.")),
    el("div", { class: "ctable-wrap" }, el("table", { class: "ctable" }, el("thead", {}, head), el("tbody", {}, ...body))),
    scored.length > 1 ? el("p", { class: "muted", style: "margin:8px 0 0;font-size:.78rem" }, "Bold marks the highest score in each row.") : null,
  );
}

function renderMethod() {
  const ks = Object.keys(E.PROFILES);
  const table = el("table", { class: "w" },
    el("thead", {}, el("tr", {}, el("th", {}, "Factor"), ...ks.map((k) => el("th", { class: "num" }, E.PROFILES[k].label)))),
    el("tbody", {}, ...E.FACTORS.map((F) => el("tr", {}, el("td", {}, F.name), ...ks.map((k) => el("td", { class: "num mono" }, E.PROFILES[k].weights[F.key] + "%"))))));
  $("methodBody").replaceChildren(
    el("p", {}, "Each of seven factors gets a 0 to 10 sub-score from live data using fixed thresholds. Your profile sets how much each factor counts. The weighted average is mapped onto 1 to 10. Factors with no data are skipped and their weight is shared among the rest; the coverage figure shows how much of the weight had data."),
    el("div", {}, el("h3", { style: "margin-bottom:6px" }, "Profile weights"), el("div", { class: "wtable-wrap" }, table)),
    el("p", {}, el("b", {}, "Thresholds. "), "Examples: rank #1 scores 10 and #1000 scores 4; daily volume of 8 to 40% of market cap scores 10; 95% of supply circulating scores 10; fully diluted value at 4x market cap scores 0; 8+ years old scores 10; 200+ commits in four weeks scores 10."),
    el("p", {}, el("b", {}, "Profile rules. "), "Defensive scores are capped at 5 outside the top 100. Long-term scores are capped at 6 when the code shows no activity."),
    el("p", {}, el("b", {}, "Team credibility. "), "Neither source says who runs a project. The page uses live GitHub activity on the project's main repository (commits, contributors, stars, last push) as a stand-in. It cannot detect anonymous teams, past scandals or missing audits."),
  );
}

/* ---------- boot ---------- */
function init() {
  const url = readUrl();
  const startProfile = (url.profile && E.PROFILES[url.profile] && url.profile) || store.get("cs-profile");
  if (startProfile && E.PROFILES[startProfile]) $("p-" + startProfile).checked = true;
  const setProfNote = () => { $("profNote").textContent = E.PROFILES[profile()].blurb; };
  setProfNote();

  QUICK.forEach(([id, label]) => {
    const b = el("button", { type: "button" }, label);
    b.addEventListener("click", () => analyze(id));
    $("quick").append(b);
  });
  document.querySelectorAll('input[name="profile"]').forEach((r) => r.addEventListener("change", () => { store.set("cs-profile", profile()); setProfNote(); customWeights = null; renderWeights(); render(); writeUrl(); }));
  if (url.weights) { customWeights = url.weights; $("weightsPanel").open = true; }
  renderWeights();
  $("go").addEventListener("click", () => analyze());
  $("coin").addEventListener("keydown", (e) => { if (e.key === "Enter") analyze(); });

  renderMethod();
  loadList();
  analyze(url.coin || "bitcoin").then(async () => {
    for (const id of url.vs) { try { if (current && id !== current.id) compare.push(await loadCoin(id)); } catch { /* skip coins that fail */ } }
    if (compare.length) { render(); writeUrl(); }
  });
}

init();
