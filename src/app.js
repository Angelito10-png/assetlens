import * as E from "./engine.js";
import { topCoins, coinInfo, searchCoins, githubActivity, ApiError } from "./api.js";

const $ = (id) => document.getElementById(id);
const QUICK = [["bitcoin", "Bitcoin"], ["ethereum", "Ethereum"], ["solana", "Solana"], ["chainlink", "Chainlink"], ["dogecoin", "Dogecoin"], ["pepe", "Pepe"]];
let coins = [];
let current = null; // normalised coin
let meta = null; // { loadedAt, ghStatus, logo, cgUrl, ghUrl }

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
  return { coin: p.get("coin"), profile: p.get("profile") };
}
function writeUrl() {
  if (!current) return;
  const p = new URLSearchParams({ coin: current.id, profile: profile() });
  history.replaceState(null, "", `${location.pathname}?${p}`);
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

async function analyze(idArg) {
  const id = idArg || (await resolveId($("coin").value));
  if (!id) { notice("warn", "Choose a coin first", "Type a name or ticker, or pick one of the shortcuts."); return; }
  $("go").disabled = true;
  status("loading", "Loading market data…");
  try {
    const info = await coinInfo(id);
    const row = (coins.find((c) => c.id === id) || {}).row;
    status("loading", "Loading GitHub activity…");
    let gh = null, ghStatus = "ok";
    try {
      gh = await githubActivity(((info.links || {}).repos_url || {}).github);
      if (!gh) ghStatus = "none";
    } catch (e) {
      ghStatus = e instanceof ApiError && e.kind === "rate_limit" ? "rate_limit" : "error";
    }
    current = E.normalize(info, row, gh);
    meta = { loadedAt: new Date(), ghStatus, logo: safeUrl((info.image || {}).small), cgUrl: `https://www.coingecko.com/en/coins/${encodeURIComponent(info.id)}`, ghUrl: gh ? safeUrl(gh.url) : null };
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
  const c = current, pk = profile(), r = E.score(c, pk), [vText, vKey] = E.verdict(r.total);
  const all = Object.keys(E.PROFILES).map((k) => [k, E.score(c, k).total]);

  const badge = meta.logo ? el("img", { class: "logo", src: meta.logo, alt: "", width: 40, height: 40 }) : el("div", { class: "mono-badge" }, c.symbol.slice(0, 4));
  const card = el("div", { class: "panel scorecard" },
    el("div", { class: "coin-id" }, badge, el("div", { style: "text-align:left" }, el("h2", {}, c.name), el("div", { class: "muted mono", style: "font-size:.8rem" }, c.symbol + (c.rank ? " · rank #" + c.rank : "")))),
    dial(r.total, vKey),
    el("span", { class: "pill v-" + vKey }, `${vText} for a ${r.profile.label.toLowerCase()} investor`),
    r.caps.length ? el("p", { class: "caps" }, ...r.caps) : null,
    el("div", { class: "cmp" }, el("div", { class: "eyebrow" }, "Same coin, other profiles"),
      ...all.map(([k, t]) => el("div", { class: "cmp-row" + (k === pk ? " on" : "") }, el("span", {}, E.PROFILES[k].label), el("div", { class: "track" }, el("i", { style: `width:${((t - 1) / 9) * 100}%` })), el("span", { class: "num", style: "text-align:right" }, t.toFixed(1))))),
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
    el("section", { class: "panel" }, el("div", { class: "section-head" }, el("h2", {}, "Score breakdown"), el("span", { class: "muted", style: "font-size:.82rem" }, `Weights for the ${r.profile.label.toLowerCase()} profile · score = 1 + 0.9 × weighted average`)), ledger),
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
  document.querySelectorAll('input[name="profile"]').forEach((r) => r.addEventListener("change", () => { store.set("cs-profile", profile()); setProfNote(); render(); writeUrl(); }));
  $("go").addEventListener("click", () => analyze());
  $("coin").addEventListener("keydown", (e) => { if (e.key === "Enter") analyze(); });

  renderMethod();
  loadList();
  analyze(url.coin || "bitcoin");
}

init();
