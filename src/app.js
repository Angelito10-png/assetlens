import * as E from "./engine.js?v=__V__";
import { topCoins, coinInfo, searchCoins, githubActivity, newsFeed, marketsFor, categoryCoins, ApiError } from "./api.js?v=__V__";
import { t, setLang, getLang } from "./i18n.js?v=__V__";
import "./i18n-markets.js?v=__V__"; // section names for the top navigation
import { QUESTIONS, PROFILE_KEYS, quizResult } from "./quiz.js?v=__V__";
import { CATEGORIES, categoryByKey, rankRows } from "./categories.js?v=__V__";
import { createWatchlist, fromSnapshot, MAX as WATCH_MAX } from "./watchlist.js?v=__V__";

const $ = (id) => document.getElementById(id);
const QUICK = [["bitcoin", "Bitcoin"], ["ethereum", "Ethereum"], ["solana", "Solana"], ["chainlink", "Chainlink"], ["dogecoin", "Dogecoin"], ["pepe", "Pepe"]];
let coins = [];
let current = null; // normalised coin
let meta = null; // { loadedAt, ghStatus, logo, cgUrl, ghUrl }
let customWeights = null; // null = use the profile's weights
let news; // undefined = loading, null = unavailable, else { updated, sources, coins }
let compare = []; // up to 2 extra coins: { c, meta }
const MAX_COMPARE = 2;
const locale = () => (getLang() === "el" ? "el-GR" : "en-US");
const THEMES = ["system", "light", "dark"];

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
const watch = createWatchlist({ getItem: (k) => localStorage.getItem(k), setItem: (k, v) => localStorage.setItem(k, v) });
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
    if (e.kind === "rate_limit") return [t("errBusy"), t("errBusyBody", Math.ceil((e.retryAfter || 60) / 60))];
    if (e.kind === "not_found") return [t("errNotFound"), t("errNotFoundBody")];
    if (e.kind === "network") return [t("errNetwork"), t("errNetworkBody")];
  }
  return [t("errGeneric"), t("errGenericBody")];
}

/* ---------- URL state: ?coin=bitcoin&profile=longterm makes results shareable ---------- */
function readUrl() {
  const p = new URLSearchParams(location.search);
  return { lang: p.get("lang"), coin: p.get("coin"), profile: p.get("profile"), weights: E.decodeWeights(p.get("w")), vs: (p.get("vs") || "").split(",").filter(Boolean).slice(0, MAX_COMPARE) };
}
function writeUrl() {
  if (!current) return;
  const p = new URLSearchParams({ coin: current.id, profile: profile() });
  if (customWeights) p.set("w", E.encodeWeights(customWeights));
  if (compare.length) p.set("vs", compare.map((x) => x.c.id).join(","));
  if (getLang() !== "en") p.set("lang", getLang());
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
  const q = text.trim().toLowerCase();
  if (!q) return null;
  const m = q.match(/\(([^)]+)\)\s*$/);
  const name = m ? q.slice(0, m.index).trim() : q;
  const hit = coins.find((c) => c.name.toLowerCase() === name)
    || coins.find((c) => c.symbol.toLowerCase() === q)
    || coins.find((c) => c.id === q)
    || coins.find((c) => c.name.toLowerCase().startsWith(name));
  if (hit) return hit.id;
  try { const found = await searchCoins(name); if (found.length) return found[0].id; } catch { /* fall through */ }
  return q.replace(/\s+/g, "-");
}

/** Load one coin (market data + GitHub activity) and normalise it. GitHub failures never fail the coin. */
async function loadCoin(id, onStep) {
  const info = await coinInfo(id);
  const row = (coins.find((c) => c.id === id) || {}).row;
  if (onStep) onStep(t("loadingGithub"));
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

let lastError = null;
function setLiveStatus() { if (meta) status("live", t("live", meta.loadedAt.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" }))); }
async function analyze(idArg) {
  lastError = null;
  const id = idArg || (await resolveId($("coin").value));
  if (!id) { notice("warn", t("chooseCoin"), t("chooseCoinBody")); return; }
  $("go").disabled = true;
  status("loading", t("loadingMarket"));
  try {
    const loaded = await loadCoin(id, (msg) => status("loading", msg));
    current = loaded.c; meta = loaded.meta;
    watch.refresh(current, { logo: meta.logo });
    compare = compare.filter((x) => x.c.id !== current.id);
    $("coin").value = `${current.name} (${current.symbol})`;
    notice(null);
    render();
    writeUrl();
    setLiveStatus();
  } catch (e) {
    lastError = e;
    const [h, b] = errorCopy(e);
    notice(e instanceof ApiError && e.kind === "rate_limit" ? "warn" : "bad", h, b);
    status("error", t(current ? "showingLast" : "noData"));
    if (!current) $("result").replaceChildren(el("div", { class: "panel skeleton" }, t("noCoin")));
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
  if ((current && current.id === id) || compare.some((x) => x.c.id === id)) { setCompareMsg(t("alreadyIn")); return; }
  compareBusy = true; setCompareMsg(t("loading"));
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
function setCompareMsg(msg) { compareMsg = msg; const n = document.getElementById("cmpMsg"); if (n) n.textContent = msg; }

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
  const reset = el("button", { type: "button", class: "ghost", id: "wReset" }, t("resetWeights", E.PROFILES[profile()].label));
  reset.disabled = !customWeights;
  reset.addEventListener("click", () => { customWeights = null; renderWeights(); render(); writeUrl(); });
  $("weightsBody").replaceChildren(
    el("p", { class: "muted", style: "margin:0;font-size:.85rem" }, t("weightsHelp")),
    el("div", { class: "wgrid" }, ...rows),
    el("div", { class: "wfoot" }, reset, el("span", { class: "muted", id: "wState", style: "font-size:.82rem" }, customWeights ? t("usingCustom") : t("usingProfile", E.PROFILES[profile()].label))),
  );
}
function renderWeightsValues() {
  const w = activeWeights(), sum = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  E.FACTORS.forEach((F) => { const o = document.getElementById("w-" + F.key + "-v"); if (o) o.textContent = Math.round(((w[F.key] || 0) / sum) * 100) + "%"; });
  const st = document.getElementById("wState"); if (st) st.textContent = customWeights ? t("usingCustom") : t("usingProfile", E.PROFILES[profile()].label);
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
  const svg = mk("svg", { viewBox: `0 0 ${W} ${H}`, class: "radar", role: "img", "aria-label": t("radarAria") });
  for (const ring of [2.5, 5, 7.5, 10]) {
    svg.append(mk("polygon", { points: E.FACTORS.map((_, i) => pt(i, ring).join(",")).join(" "), fill: "none", stroke: "var(--grid)", "stroke-width": ring === 10 ? 1 : 0.75 }));
  }
  [2.5, 5, 7.5].forEach((v) => { const [x, y] = pt(0, v); svg.append(mk("text", { x: x + 4, y: y + 10, class: "rtick" }, String(v))); });
  E.FACTORS.forEach((F, i) => {
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
  series.forEach((s) => {
    s.factors.forEach((f, i) => {
      const [x, y] = pt(i, f.score ?? 0);
      const g = mk("g", { class: "rpt", tabindex: 0 });
      g.append(mk("circle", { cx: x, cy: y, r: 12, fill: "transparent" }));
      g.append(mk("circle", { cx: x, cy: y, r: 4.5, fill: f.score === null ? "var(--surface)" : `var(--s${s.slot})`, stroke: f.score === null ? `var(--s${s.slot})` : "var(--surface)", "stroke-width": 2 }));
      g.append(mk("title", {}, `${s.name} · ${f.name}: ${f.score === null ? t("noDataShort") : f.score.toFixed(1) + " / 10"}`));
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
  return el("div", { class: "dial", role: "img", "aria-label": `${score} / 10` }, svg, el("div", { class: "val" }, el("b", {}, score.toFixed(1)), el("small", {}, t("outOf10"))));
}

function render() {
  renderWatch();
  if ($("catDrawer").open) renderCategory();
  if (!current) return;
  const c = current, pk = profile(), r = E.score(c, pk, customWeights), [vText, vKey] = E.verdict(r.total);
  const who = customWeights ? t("whoCustom") : t("whoProfile", r.profile.label);
  const all = Object.keys(E.PROFILES).map((k) => [k, E.score(c, k).total, E.PROFILES[k].label]);
  if (customWeights) all.push(["custom", r.total, t("profile_custom")]);

  const badge = meta.logo ? el("img", { class: "logo", src: meta.logo, alt: "", width: 40, height: 40 }) : el("div", { class: "mono-badge" }, c.symbol.slice(0, 4));
  const card = el("div", { class: "panel scorecard" },
    el("div", { class: "coin-id" }, badge, el("div", { style: "text-align:left" }, el("h2", {}, c.name), el("div", { class: "muted mono", style: "font-size:.8rem" }, c.symbol + (c.rank ? " · " + t("rank", c.rank) : "")))),
    watchButton(c),
    dial(r.total, vKey),
    el("span", { class: "pill v-" + vKey }, t("fitFor", vText, who)),
    r.caps.length ? el("p", { class: "caps" }, ...r.caps) : null,
    el("div", { class: "cmp" }, el("div", { class: "eyebrow" }, t("otherProfiles")),
      ...all.map(([k, tot, label]) => el("div", { class: "cmp-row" + (k === (customWeights ? "custom" : pk) ? " on" : "") }, el("span", {}, label), el("div", { class: "track" }, el("i", { style: `width:${((tot - 1) / 9) * 100}%` })), el("span", { class: "num", style: "text-align:right" }, tot.toFixed(1))))),
    el("div", { class: "muted", style: "font-size:.78rem" }, t("coverage", r.coverage)),
  );

  const turnover = c.vol24 !== null && c.mcap ? (c.vol24 / c.mcap) * 100 : null;
  const M = [[t("m_price"), priceFmt(c.price)], [t("m_24h"), pctSpan(c.ch24)], [t("m_mcap"), E.fmtBig(c.mcap)], [t("m_fdv"), E.fmtBig(c.fdv)], [t("m_vol"), E.fmtBig(c.vol24)], [t("m_volcap"), turnover === null ? "n/a" : turnover.toFixed(2) + "%"], [t("m_30d"), pctSpan(c.ch30d)], [t("m_1y"), pctSpan(c.ch1y)], [t("m_ath"), pctSpan(c.athChange)]];
  const right = el("div", { class: "right" },
    el("div", { class: "metrics" }, ...M.map(([k, v]) => el("div", { class: "metric" }, el("span", { class: "k" }, k), el("span", { class: "v" }, v)))),
    c.categories.length ? el("div", { class: "cats" }, ...c.categories.slice(0, 8).map((x) => el("span", {}, x))) : null,
    el("div", { class: "panel", style: "padding:16px" }, el("div", { class: "eyebrow", style: "margin-bottom:8px" }, t("riskFlags")),
      r.flags.length ? el("ul", { class: "flags" }, ...r.flags.map(([k, txt]) => el("li", { class: k }, el("span", {}, txt)))) : el("p", { class: "muted", style: "margin:0" }, t("noFlags"))),
  );

  const ghNote = { rate_limit: t("ghRateLimit"), error: t("ghError") }[meta.ghStatus];
  const ledger = el("div", { class: "ledger" },
    el("div", { class: "frow head" }, el("div", {}, t("col_factor")), el("div", {}, t("col_score")), el("div", {}, t("col_weight")), el("div", {}, t("col_why"))),
    ...r.factors.map((f) => {
      const notes = f.key === "development" && f.score === null && ghNote ? [ghNote] : f.notes;
      return el("div", { class: "frow" + (f.weight === 0 || f.score === null ? " off" : "") },
        el("div", { class: "fname" }, el("h3", {}, f.name), el("p", {}, f.what)),
        el("div", { class: "fscore" }, el("span", { class: "n" }, f.score === null ? t("noDataShort") : f.score.toFixed(1) + " / 10"), f.score === null ? null : el("div", { class: "bar10" }, el("i", { class: barClass(f.score), style: `width:${f.score * 10}%` }))),
        el("div", { class: "fw" }, f.weight === 0 ? "0%" : Math.round(f.effWeight) + "%", el("small", {}, f.weight === 0 ? t("notUsed") : f.score === null ? t("skipped") : t("pts", (f.contrib * 0.9).toFixed(2)))),
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
    newsPanel(),
    el("section", { class: "panel" }, el("div", { class: "section-head" }, el("h2", {}, t("breakdown")), el("span", { class: "muted", style: "font-size:.82rem" }, t("breakdownNote", !!customWeights, r.profile.label))), ledger),
    el("div", { class: "two" },
      el("section", { class: "panel" }, el("h2", { style: "margin-bottom:14px" }, t("recsFor", t("whoProfile", r.profile.label))), el("ul", { class: "recs" }, ...recs.map(([h, txt]) => el("li", {}, el("b", {}, h), el("span", {}, txt))))),
      el("section", { class: "panel" }, el("h2", { style: "margin-bottom:10px" }, t("beforeAct")),
        el("ul", { class: "recs" },
          el("li", {}, el("b", {}, t("notCovered")), el("span", {}, t("notCoveredBody"))),
          el("li", {}, el("b", {}, t("sources")), el("span", {}, link(meta.cgUrl, "CoinGecko"), meta.ghUrl ? " · " : "", meta.ghUrl ? link(meta.ghUrl, t("ghRepo")) : null, homepage ? " · " : "", homepage ? link(homepage, t("projectSite")) : null, whitepaper ? " · " : "", whitepaper ? link(whitepaper, t("whitepaper")) : null)),
          el("li", {}, el("b", {}, t("loaded")), el("span", {}, meta.loadedAt.toLocaleString(locale()) + (c.updated ? t("cgDataFrom", new Date(c.updated).toLocaleTimeString(locale())) : ""))),
        )),
    ),
  ));
}

function ago(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!isFinite(s) || s < 60) return t("justNow");
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: "auto" });
  if (s < 3600) return rtf.format(-Math.round(s / 60), "minute");
  if (s < 86400) return rtf.format(-Math.round(s / 3600), "hour");
  return rtf.format(-Math.round(s / 86400), "day");
}

function newsPanel() {
  const items = news && news.coins ? (news.coins[current.id] || []).filter((x) => safeUrl(x.url)) : [];
  const note = news && news.updated ? t("newsNote", (news.sources || []).join(", ") || "–", ago(news.updated)) : "";
  const body = news === undefined ? el("p", { class: "muted", style: "margin:0" }, t("loading"))
    : !news ? el("p", { class: "muted", style: "margin:0" }, t("newsUnavailable"))
    : !items.length ? el("p", { class: "muted", style: "margin:0" }, t("noNews"))
    : el("ul", { class: "news" }, ...items.map((x) => el("li", {},
        el("a", { href: safeUrl(x.url), target: "_blank", rel: "noopener" }, x.title),
        el("span", { class: "muted" }, [x.source, x.published ? ago(x.published) : null].filter(Boolean).join(" · ")))));
  return el("section", { class: "panel", id: "newsPanel" },
    el("div", { class: "section-head" }, el("h2", {}, t("news")), el("span", { class: "muted", style: "font-size:.82rem" }, note)),
    body,
    items.length ? el("p", { class: "muted", style: "margin:10px 0 0;font-size:.78rem" }, t("newsDisclaimer")) : null);
}

function radarPanel(r) {
  const series = [{ name: current.name, slot: 1, factors: r.factors }, ...compare.map((x, i) => ({ name: x.c.name, slot: i + 2, factors: E.score(x.c, profile(), customWeights).factors }))];
  const legend = series.length > 1 ? el("div", { class: "legend" }, ...series.map((s) => el("span", {}, el("i", { class: "sw", style: `background:var(--s${s.slot})` }), s.name))) : null;
  return el("section", { class: "panel" },
    el("div", { class: "section-head" }, el("h2", {}, t("factorProfile")), el("span", { class: "muted", style: "font-size:.82rem" }, t("radarNote"))),
    legend,
    el("div", { class: "radar-wrap" }, radar(series)),
    el("p", { class: "muted", style: "margin:0;font-size:.78rem" }, t("radarFoot")));
}

function comparePanel(r) {
  const pk = profile();
  const entries = [{ c: current, slot: 1, main: true }, ...compare.map((x, i) => ({ c: x.c, slot: i + 2 }))];
  const scored = entries.map((e) => ({ ...e, r: e.main ? r : E.score(e.c, pk, customWeights) }));
  const rowsDef = [
    ["score", t("score"), (x) => x.r.total, (v) => v.toFixed(1), true],
    ...Object.keys(E.PROFILES).filter((k) => customWeights || k !== pk).map((k) => [k, E.PROFILES[k].label, (x) => E.score(x.c, k).total, (v) => v.toFixed(1), false]),
    ...E.FACTORS.map((F) => [F.key, F.name, (x) => x.r.factors.find((f) => f.key === F.key).score, (v) => (v === null ? "–" : v.toFixed(1)), false]),
    ["mcap", t("m_mcap"), (x) => x.c.mcap, E.fmtBig, false],
    ["ch30d", t("m_30d"), (x) => x.c.ch30d, (v) => E.fmtPct(v), false],
  ];
  const head = el("tr", {}, el("th", {}, ""), ...scored.map((x) => el("th", { class: "num" },
    el("span", { class: "chead" }, el("i", { class: "sw", style: `background:var(--s${x.slot})` }), x.c.symbol),
    x.main ? null : (() => { const b = el("button", { type: "button", class: "xbtn", "aria-label": t("remove", x.c.name) }, "×"); b.addEventListener("click", () => removeCompare(x.c.id)); return b; })())));
  const body = rowsDef.map(([key, label, get, fmt, strong]) => {
    const vals = scored.map(get);
    const nums = vals.filter((v) => typeof v === "number");
    const best = scored.length > 1 && nums.length > 1 && key !== "ch30d" && key !== "mcap" ? Math.max(...nums) : null;
    return el("tr", { class: strong ? "strong" : "" }, el("th", { scope: "row" }, label), ...vals.map((v) => el("td", { class: "num" + (best !== null && v === best ? " best" : "") }, fmt(v ?? null))));
  });
  const input = el("input", { type: "text", id: "cmpCoin", list: "coinlist", placeholder: t("addCoin"), autocomplete: "off" });
  const add = el("button", { type: "button", class: "ghost", id: "cmpAdd" }, t("add"));
  const go = () => { if (input.value.trim()) addCompare(input.value).then(() => { const i = document.getElementById("cmpCoin"); if (i) i.value = ""; }); };
  add.addEventListener("click", go);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  const full = compare.length >= MAX_COMPARE;
  if (full) { input.disabled = true; add.disabled = true; input.placeholder = t("upTo3"); }
  return el("section", { class: "panel" },
    el("div", { class: "section-head" }, el("h2", {}, t("compareCoins")), el("span", { class: "muted", style: "font-size:.82rem" }, customWeights ? t("scoredCustom") : t("scoredFor", E.PROFILES[pk].label))),
    el("div", { class: "cmp-add" }, input, add),
    el("p", { class: "muted", id: "cmpMsg", style: "margin:0 0 8px;font-size:.8rem;min-height:1.2em", "aria-live": "polite" }, compareMsg || (compare.length ? "" : t("compareHint"))),
    el("div", { class: "ctable-wrap" }, el("table", { class: "ctable" }, el("thead", {}, head), el("tbody", {}, ...body))),
    scored.length > 1 ? el("p", { class: "muted", style: "margin:8px 0 0;font-size:.78rem" }, t("boldBest")) : null,
  );
}

function renderMethod() {
  const ks = Object.keys(E.PROFILES);
  const table = el("table", { class: "w" },
    el("thead", {}, el("tr", {}, el("th", {}, t("col_factor")), ...ks.map((k) => el("th", { class: "num" }, E.PROFILES[k].label)))),
    el("tbody", {}, ...E.FACTORS.map((F) => el("tr", {}, el("td", {}, F.name), ...ks.map((k) => el("td", { class: "num mono" }, E.PROFILES[k].weights[F.key] + "%"))))));
  $("methodBody").replaceChildren(
    el("p", {}, t("methodIntro")),
    el("div", {}, el("h3", { style: "margin-bottom:6px" }, t("profileWeights")), el("div", { class: "wtable-wrap" }, table)),
    el("p", {}, el("b", {}, t("thresholds") + " "), t("thresholdsBody")),
    el("p", {}, el("b", {}, t("profileRules") + " "), t("profileRulesBody")),
    el("p", {}, el("b", {}, t("teamCred") + " "), t("teamCredBody")),
  );
}

/* ---------- watchlist ---------- */
let watchPricesAt = null;
function watchButton(c) {
  const on = watch.has(c.id);
  const b = el("button", { type: "button", class: "watch-btn" + (on ? " on" : ""), id: "watchBtn", "aria-pressed": String(on), "aria-label": on ? t("watchRemoveAria", c.name) : t("watchAddAria", c.name) },
    el("span", { "aria-hidden": "true" }, on ? "★" : "☆"), " ", on ? t("watchIn") : t("watchAdd"));
  b.addEventListener("click", () => {
    if (watch.has(c.id)) watch.remove(c.id);
    else if (!watch.save(c, { logo: meta && meta.logo })) { notice("warn", t("watchFull", WATCH_MAX)); return; }
    b.replaceWith(watchButton(c));
    renderWatch();
    document.getElementById("watchBtn")?.focus();
  });
  return b;
}
function renderWatch() {
  const panel = $("watchPanel"), list = watch.list();
  const badge = $("watchCount");
  badge.hidden = !list.length; badge.textContent = String(list.length);
  $("watchOpen").classList.toggle("on", list.length > 0);
  const close = el("button", { type: "button", class: "xbtn quiz-x", "aria-label": t("quizClose") }, "×");
  close.addEventListener("click", () => $("watchDrawer").close());
  const pk = profile();
  const head = el("div", { class: "quiz-head" }, el("div", {}, el("h2", { id: "watchTitle" }, t("watchlist")),
    list.length ? el("div", { class: "muted", style: "font-size:.8rem;margin-top:2px" }, `${t("watchCount", list.length)} · ${customWeights ? t("scoredCustom") : t("scoredFor", E.PROFILES[pk].label)}`) : null), close);
  if (!list.length) { panel.replaceChildren(head, el("div", { class: "drawer-body" }, el("p", { class: "muted", style: "margin:0" }, t("watchEmpty")))); return; }
  const rows = list.map((e) => {
    const c = fromSnapshot(e.coin), r = E.score(c, pk, customWeights), [vText, vKey] = E.verdict(r.total);
    return { e, c, r, vText, vKey };
  }).sort((a, b) => b.r.total - a.r.total);
  const items = rows.map(({ e, c, r, vText, vKey }) => {
    const logo = safeUrl(e.logo);
    const open = el("button", { type: "button", class: "w-coin", "aria-label": t("watchOpenAria", c.name) },
      logo ? el("img", { src: logo, alt: "", width: 24, height: 24 }) : el("span", { class: "mono-badge sm" }, (c.symbol || "?").slice(0, 3)),
      el("span", { class: "w-name" }, el("b", {}, c.name), el("small", { class: "muted mono" }, c.symbol)));
    open.addEventListener("click", () => { $("watchDrawer").close(); analyze(c.id); window.scrollTo({ top: $("result").offsetTop - 12, behavior: "smooth" }); });
    const rm = el("button", { type: "button", class: "xbtn", "aria-label": t("watchRemoveAria", c.name) }, "×");
    rm.addEventListener("click", () => { watch.remove(c.id); renderWatch(); const wb = document.getElementById("watchBtn"); if (wb && current) wb.replaceWith(watchButton(current)); });
    return el("li", { class: "w-row" + (current && current.id === c.id ? " on" : "") },
      open,
      el("span", { class: "w-price num" }, priceFmt(c.price ?? null)),
      el("span", { class: "w-ch num" }, pctSpan(c.ch24 ?? null)),
      el("span", { class: "w-score" }, el("b", { class: "num" }, r.total.toFixed(1)), el("span", { class: "pill sm v-" + vKey }, vText)),
      rm);
  });
  const at = watchPricesAt ? t("watchPrices", watchPricesAt.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" })) : t("watchPricesOld");
  panel.replaceChildren(head, el("div", { class: "drawer-body" },
    el("ul", { class: "w-list" }, ...items),
    el("p", { class: "muted", style: "margin:12px 0 0;font-size:.78rem" }, `${at}. ${t("watchNote")}`)));
}
async function refreshWatchPrices() {
  const ids = watch.ids();
  if (!ids.length) return;
  try { watch.applyMarkets(await marketsFor(ids)); watchPricesAt = new Date(); } catch { /* keep saved prices */ }
  renderWatch();
}

/* ---------- categories ---------- */
let catKey = null, catRows = null, catSort = "mcap", catError = null;
function renderCatsNav() {
  $("catsNav").replaceChildren(el("span", { class: "cats-label" }, t("categories")),
    ...CATEGORIES.map((c) => {
      const b = el("button", { type: "button", class: "chip", "aria-haspopup": "dialog" }, t("cat_" + c.key));
      b.addEventListener("click", () => openCategory(c.key));
      return b;
    }));
}
async function openCategory(key) {
  catKey = key; catRows = null; catError = null;
  renderCategory();
  if (!$("catDrawer").open) $("catDrawer").showModal();
  try { catRows = await categoryCoins(categoryByKey(key).id); }
  catch (e) { catError = e; }
  if (catKey === key) renderCategory();
}
function renderCategory() {
  const panel = $("catPanel");
  if (!catKey) return;
  const pk = profile(), name = t("cat_" + catKey);
  const close = el("button", { type: "button", class: "xbtn quiz-x", "aria-label": t("quizClose") }, "×");
  close.addEventListener("click", () => $("catDrawer").close());
  const ranked = catRows ? rankRows(catRows, pk, customWeights, catSort) : [];
  const who = customWeights ? t("whoCustom") : t("whoProfile", E.PROFILES[pk].label);
  const head = el("div", { class: "quiz-head" }, el("div", {}, el("h2", { id: "catTitle" }, t("catTitle", name)),
    catRows ? el("div", { class: "muted", style: "font-size:.8rem;margin-top:2px" }, t("catSub", ranked.length, who)) : null), close);
  const tabs = el("div", { class: "cat-tabs", role: "group", "aria-label": t("categories") }, ...CATEGORIES.map((c) => {
    const b = el("button", { type: "button", class: "chip", "aria-pressed": String(c.key === catKey) }, t("cat_" + c.key));
    b.addEventListener("click", () => { if (c.key !== catKey) openCategory(c.key); });
    return b;
  }));
  const sort = el("div", { class: "cat-sort" }, el("span", { class: "muted" }, t("sortBy")),
    el("div", { class: "tgl" }, ...[["mcap", t("sortMcap")], ["score", t("sortScore")]].map(([k, label]) => {
      const b = el("button", { type: "button", "aria-pressed": String(catSort === k) }, label);
      b.addEventListener("click", () => { catSort = k; renderCategory(); });
      return b;
    })));
  let list;
  if (catError) { const [h, b] = errorCopy(catError); list = el("div", { class: "notice", "data-k": "warn" }, el("p", {}, el("b", {}, h)), el("p", {}, b)); }
  else if (!catRows) list = el("p", { class: "muted" }, t("loading"));
  else if (!ranked.length) list = el("p", { class: "muted" }, t("catEmpty"));
  else list = el("ul", { class: "w-list" }, ...ranked.map((x) => {
    const logo = safeUrl(x.image);
    const open = el("button", { type: "button", class: "w-coin", "aria-label": t("catOpenAria", x.name) },
      el("span", { class: "c-rank muted mono" }, x.c.rank ? "#" + x.c.rank : "–"),
      logo ? el("img", { src: logo, alt: "", width: 24, height: 24, loading: "lazy" }) : el("span", { class: "mono-badge sm" }, x.symbol.slice(0, 3)),
      el("span", { class: "w-name" }, el("b", {}, x.name), el("small", { class: "muted mono" }, x.symbol)));
    open.addEventListener("click", () => { $("catDrawer").close(); analyze(x.id); window.scrollTo({ top: $("result").offsetTop - 12, behavior: "smooth" }); });
    return el("li", { class: "w-row c-row" + (current && current.id === x.id ? " on" : "") },
      open,
      el("span", { class: "w-price num" }, priceFmt(x.c.price)),
      el("span", { class: "w-ch num" }, pctSpan(x.c.ch24)),
      el("span", { class: "w-score" }, el("b", { class: "num", title: t("sortScore") }, "≈" + x.total.toFixed(1)), el("span", { class: "pill sm v-" + x.verdict[1] }, x.verdict[0])));
  }));
  const y = panel.querySelector(".drawer-body")?.scrollTop;
  panel.replaceChildren(head, el("div", { class: "drawer-body" }, tabs, sort, list,
    catRows && ranked.length ? el("p", { class: "muted", style: "margin:12px 0 0;font-size:.78rem" }, t("quickScoreNote")) : null));
  if (y && catRows) panel.querySelector(".drawer-body").scrollTop = y;
}

/* ---------- profile quiz ---------- */
let quizAnswers = [];
let quizShowResult = false;
function setProfile(key) {
  $("p-" + key).checked = true;
  store.set("cs-profile", key);
  $("profNote").textContent = E.PROFILES[key].blurb;
  customWeights = null; renderWeights(); render(); writeUrl();
}
function renderQuiz() {
  const d = $("quiz");
  const total = QUESTIONS.length, answered = quizAnswers.filter((a) => Number.isInteger(a)).length;
  const r = quizResult(quizAnswers);
  const close = el("button", { type: "button", class: "xbtn quiz-x", "aria-label": t("quizClose") }, "×");
  close.addEventListener("click", () => d.close());
  const head = el("div", { class: "quiz-head" }, el("h2", { id: "quizTitle" }, quizShowResult ? t("quizResult") : t("quizTitle")), close);
  let body, foot;
  if (quizShowResult && r.complete) {
    const P = E.PROFILES[r.profile], top = r.points[r.profile];
    const tie = PROFILE_KEYS.filter((k) => r.points[k] === top).length > 1;
    body = el("div", { class: "quiz-body" },
      el("div", { class: "quiz-result" }, el("b", {}, P.label), el("p", {}, P.blurb)),
      el("p", { style: "margin:0" }, t("quizWhy", top) + (tie ? " " + t("quizTie") : "")),
      el("div", { class: "cmp" }, el("div", { class: "eyebrow" }, t("quizPoints")),
        ...PROFILE_KEYS.map((k) => el("div", { class: "cmp-row" + (k === r.profile ? " on" : "") }, el("span", {}, E.PROFILES[k].label), el("div", { class: "track" }, el("i", { style: `width:${(r.points[k] / total) * 100}%` })), el("span", { class: "num", style: "text-align:right" }, `${r.points[k]}/${total}`)))),
      el("p", { class: "muted", style: "margin:0;font-size:.8rem" }, t("quizNote")));
    const apply = el("button", { type: "button", class: "primary" }, t("quizApply", P.label));
    apply.addEventListener("click", () => { setProfile(r.profile); d.close(); });
    const again = el("button", { type: "button", class: "ghost" }, t("quizRetake"));
    again.addEventListener("click", () => { quizAnswers = []; quizShowResult = false; renderQuiz(); d.querySelector("input")?.focus(); });
    foot = el("div", { class: "quiz-foot" }, again, apply);
  } else {
    body = el("div", { class: "quiz-body" },
      el("p", { class: "muted", style: "margin:0" }, t("quizIntro")),
      ...QUESTIONS.map((q, qi) => el("fieldset", { class: "quiz-q" },
        el("legend", {}, el("span", { class: "quiz-n" }, String(qi + 1)), t("quiz_" + q.key)),
        ...q.options.map((_, oi) => {
          const input = el("input", { type: "radio", name: "quiz-" + q.key, value: oi });
          if (quizAnswers[qi] === oi) input.checked = true;
          input.addEventListener("change", () => { quizAnswers[qi] = oi; updateQuizFoot(); });
          return el("label", { class: "quiz-opt" }, input, el("span", {}, t(`quiz_${q.key}_${oi}`)));
        }))));
    const see = el("button", { type: "button", class: "primary", id: "quizSee" }, t("quizSee"));
    see.disabled = answered < total;
    see.addEventListener("click", () => { quizShowResult = true; renderQuiz(); d.querySelector(".quiz-foot .primary")?.focus(); });
    foot = el("div", { class: "quiz-foot" }, el("span", { class: "muted", id: "quizProg", "aria-live": "polite" }, t("quizProgress", answered, total)), see);
  }
  d.replaceChildren(el("div", { class: "quiz-card" }, head, body, foot));
}
function updateQuizFoot() {
  const n = quizAnswers.filter((a) => Number.isInteger(a)).length;
  $("quizProg").textContent = t("quizProgress", n, QUESTIONS.length);
  $("quizSee").disabled = n < QUESTIONS.length;
}

/* ---------- language & theme ---------- */
function applyStatic() {
  document.documentElement.lang = getLang();
  document.querySelectorAll("[data-i18n]").forEach((n) => { n.textContent = t(n.dataset.i18n); });
  document.querySelectorAll("[data-i18n-ph]").forEach((n) => { n.placeholder = t(n.dataset.i18nPh); });
  document.querySelectorAll("[data-i18n-aria]").forEach((n) => { n.setAttribute("aria-label", t(n.dataset.i18nAria)); });
  document.querySelectorAll("[data-lang]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === getLang())));
}
function applyLang(lang, save) {
  setLang(lang);
  if (save) store.set("cs-lang", getLang());
  applyStatic();
  $("profNote").textContent = E.PROFILES[profile()].blurb;
  renderWeights(); renderMethod(); renderCatsNav();
  if ($("quiz").open) { const y = $("quiz").querySelector(".quiz-body")?.scrollTop; renderQuiz(); const b = $("quiz").querySelector(".quiz-body"); if (b && y) b.scrollTop = y; }
  if (current) { render(); writeUrl(); }
  if (lastError) { const [h, b] = errorCopy(lastError); notice(lastError instanceof ApiError && lastError.kind === "rate_limit" ? "warn" : "bad", h, b); status("error", t(current ? "showingLast" : "noData")); }
  else if (meta) setLiveStatus();
  else status($("status").dataset.s, t($("status").dataset.s === "loading" ? "loadingMarket" : "waiting"));
}
function applyTheme(theme, save) {
  if (!THEMES.includes(theme)) theme = "system";
  if (theme === "system") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme;
  if (save) store.set("cs-theme", theme);
  document.querySelectorAll("[data-theme-btn]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.themeBtn === theme)));
}

/* ---------- boot ---------- */
function init() {
  const url = readUrl();
  const nav = (navigator.language || "").toLowerCase().startsWith("el") ? "el" : "en";
  setLang(url.lang || store.get("cs-lang") || nav);
  applyTheme(store.get("cs-theme") || "system", false);
  applyStatic();
  document.querySelectorAll("[data-lang]").forEach((b) => b.addEventListener("click", () => applyLang(b.dataset.lang, true)));
  document.querySelectorAll("[data-theme-btn]").forEach((b) => b.addEventListener("click", () => applyTheme(b.dataset.themeBtn, true)));
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
  renderCatsNav();
  $("catDrawer").addEventListener("click", (e) => { if (e.target === $("catDrawer")) $("catDrawer").close(); });
  $("watchOpen").addEventListener("click", () => { renderWatch(); $("watchDrawer").showModal(); });
  $("watchDrawer").addEventListener("click", (e) => { if (e.target === $("watchDrawer")) $("watchDrawer").close(); });
  $("quizBtn").addEventListener("click", () => { renderQuiz(); $("quiz").showModal(); });
  $("quiz").addEventListener("click", (e) => { if (e.target === $("quiz")) $("quiz").close(); }); // click on the backdrop
  $("coin").addEventListener("keydown", (e) => { if (e.key === "Enter") analyze(); });

  renderMethod();
  loadList();
  newsFeed().then((n) => { news = n; const p = document.getElementById("newsPanel"); if (p && current) p.replaceWith(newsPanel()); });
  renderWatch();
  analyze(url.coin || "bitcoin").then(async () => {
    for (const id of url.vs) { try { if (current && id !== current.id) compare.push(await loadCoin(id)); } catch { /* skip coins that fail */ } }
    if (compare.length) { render(); writeUrl(); }
    refreshWatchPrices();
  });
}

init();
