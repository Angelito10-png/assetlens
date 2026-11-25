/**
 * Coin Scorecard scoring engine.
 * Pure functions only: no DOM, no network. Everything here is unit-tested in tests/engine.test.js.
 */

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// linear map of x from [x0,x1] onto [0,10]; works with x0 > x1 for "lower is better"
const lin = (x, x0, x1) => clamp(((x - x0) / (x1 - x0)) * 10, 0, 10);
const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);
const pick = (o, path) => path.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o);
const first = (o, paths) => { for (const p of paths) { const v = num(pick(o, p)); if (v !== null) return v; } return null; };
const usd = (v) => (v && typeof v === "object" ? num(v.usd) : num(v));

/**
 * Normalise a CoinGecko /coins/{id} payload (optionally merged with a /coins/markets row)
 * and optional GitHub stats from api.js into one flat object the factors read.
 */
function normalize(info, row, gh) {
  info = info || {}; row = row || {};
  const md = info.market_data || {};
  const dev = info.developer_data || {};
  const links = info.links || {};
  const g = (mdKey, rowKey) => { const a = usd(md[mdKey]); return a !== null ? a : num(row[rowKey ?? mdKey]); };
  const dates = [info.genesis_date, pick(md, "atl_date.usd") || row.atl_date, pick(md, "ath_date.usd") || row.ath_date]
    .filter(Boolean).map((d) => new Date(d)).filter((d) => !isNaN(d));
  const genesis = info.genesis_date ? new Date(info.genesis_date) : null;
  return {
    id: info.id || row.id,
    name: info.name || row.name,
    symbol: (info.symbol || row.symbol || "").toUpperCase(),
    price: g("current_price"),
    mcap: g("market_cap"),
    rank: num(info.market_cap_rank) ?? num(md.market_cap_rank) ?? num(row.market_cap_rank),
    fdv: g("fully_diluted_valuation"),
    vol24: g("total_volume"),
    circ: num(md.circulating_supply) ?? num(row.circulating_supply),
    total: num(md.total_supply) ?? num(row.total_supply),
    max: num(md.max_supply) ?? num(row.max_supply),
    ch24: num(md.price_change_percentage_24h) ?? num(row.price_change_percentage_24h),
    ch7d: num(md.price_change_percentage_7d) ?? num(row.price_change_percentage_7d_in_currency),
    ch30d: num(md.price_change_percentage_30d) ?? num(row.price_change_percentage_30d_in_currency),
    ch1y: num(md.price_change_percentage_1y) ?? num(row.price_change_percentage_1y_in_currency),
    athChange: usd(md.ath_change_percentage) ?? num(row.ath_change_percentage),
    ath: usd(md.ath) ?? num(row.ath),
    high24: usd(md.high_24h) ?? num(row.high_24h),
    low24: usd(md.low_24h) ?? num(row.low_24h),
    genesis,
    earliest: dates.length ? new Date(Math.min(...dates)) : null,
    devSource: gh ? "github" : info.developer_data ? "coingecko" : null,
    devProvided: !!(gh || info.developer_data),
    commits4w: gh ? num(gh.commits4w) : num(dev.commit_count_4_weeks),
    commits52w: gh ? num(gh.commits52w) : null,
    contributors: gh ? num(gh.contributors) : num(dev.pull_request_contributors),
    stars: gh ? num(gh.stars) : num(dev.stars),
    forks: gh ? num(gh.forks) : num(dev.forks),
    daysSincePush: gh ? num(gh.daysSincePush) : null,
    ghRepo: gh ? gh.repo : null,
    whitepaper: typeof links.whitepaper === "string" && links.whitepaper ? links.whitepaper : null,
    repos: ((links.repos_url || {}).github || []).filter(Boolean),
    homepage: (links.homepage || []).filter(Boolean)[0] || null,
    sentimentUp: num(info.sentiment_votes_up_percentage),
    watchlist: num(info.watchlist_portfolio_users),
    categories: (info.categories || []).filter(Boolean),
    updated: info.last_updated || md.last_updated || row.last_updated || null,
  };
}

const fmtPct = (v, d = 1) => (v === null ? "n/a" : (v > 0 ? "+" : "") + v.toFixed(d) + "%");
const fmtBig = (v) => {
  if (v === null) return "n/a";
  const a = Math.abs(v);
  if (a >= 1e12) return "$" + (v / 1e12).toFixed(2) + "T";
  if (a >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
  if (a >= 1e3) return "$" + (v / 1e3).toFixed(1) + "K";
  return "$" + v.toFixed(2);
};
const fmtNum = (v) => (v === null ? "n/a" : v >= 1e9 ? (v / 1e9).toFixed(2) + "B" : v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v >= 1e3 ? (v / 1e3).toFixed(1) + "K" : String(Math.round(v)));
const avg = (parts) => { const p = parts.filter((x) => x[0] !== null); if (!p.length) return null; const w = p.reduce((s, x) => s + x[1], 0); return p.reduce((s, x) => s + x[0] * x[1], 0) / w; };
const log10 = (x) => Math.log10(Math.max(x, 1e-9));

/* Each factor returns { score 0-10 | null, notes: [string], inputs: [[label, value]] } */
const FACTORS = [
  {
    key: "size", name: "Market size & liquidity",
    what: "How big and how easily traded the coin is. Large, liquid coins are harder to manipulate and easier to exit.",
    run(c) {
      const rankS = c.rank ? clamp(10 - 2 * log10(c.rank), 0, 10) : null;
      const turnover = c.vol24 !== null && c.mcap ? (c.vol24 / c.mcap) * 100 : null;
      let liqS = turnover === null ? null : turnover <= 0.3 ? 1 : turnover < 8 ? lin(log10(turnover), log10(0.3), log10(8)) : turnover <= 40 ? 10 : 6;
      const notes = [];
      if (c.rank) notes.push(`Ranked #${c.rank} by market cap (${fmtBig(c.mcap)}).`);
      if (turnover !== null) notes.push(turnover > 40 ? `Daily volume is ${turnover.toFixed(1)}% of market cap, unusually high, which can signal wash trading or a speculative spike.` : turnover < 1 ? `Daily volume is only ${turnover.toFixed(2)}% of market cap, so large orders may move the price.` : `Daily volume is ${turnover.toFixed(1)}% of market cap, a healthy level of trading.`);
      return { score: avg([[rankS, 0.6], [liqS, 0.4]]), notes, inputs: [["Rank", c.rank ? "#" + c.rank : "n/a"], ["Market cap", fmtBig(c.mcap)], ["24h volume", fmtBig(c.vol24)], ["Volume / cap", turnover === null ? "n/a" : turnover.toFixed(2) + "%"]] };
    },
  },
  {
    key: "tokenomics", name: "Tokenomics & dilution",
    what: "How much of the supply is already circulating and whether future unlocks or uncapped issuance can dilute holders.",
    run(c) {
      const cap = c.max || c.total;
      const float = c.circ && cap ? clamp(c.circ / cap, 0, 1) : null;
      const floatS = float === null ? null : lin(float, 0.15, 0.95);
      const fdvRatio = c.fdv && c.mcap ? c.fdv / c.mcap : float ? 1 / float : null;
      const dilS = fdvRatio === null ? null : lin(fdvRatio, 4, 1.05);
      const capS = c.max ? 10 : c.total ? 5 : null;
      const notes = [];
      if (float !== null) notes.push(`${(float * 100).toFixed(0)}% of the ${c.max ? "maximum" : "total"} supply is circulating.`);
      if (fdvRatio !== null) notes.push(fdvRatio > 2 ? `Fully diluted value is ${fdvRatio.toFixed(1)}x the market cap, so a large share of tokens is still to be released.` : `Fully diluted value is ${fdvRatio.toFixed(2)}x the market cap, so little dilution is left.`);
      notes.push(c.max ? `Supply is hard-capped at ${fmtNum(c.max)} tokens.` : "No maximum supply is set, so issuance can continue. Check the emission schedule.");
      return { score: avg([[floatS, 0.4], [dilS, 0.4], [capS, 0.2]]), notes, inputs: [["Circulating", fmtNum(c.circ)], ["Total", fmtNum(c.total)], ["Max", c.max ? fmtNum(c.max) : "uncapped"], ["FDV / cap", fdvRatio === null ? "n/a" : fdvRatio.toFixed(2) + "x"]] };
    },
  },
  {
    key: "momentum", name: "Price momentum",
    what: "The recent trend over 7 days, 30 days and one year.",
    run(c) {
      const s = avg([[c.ch7d === null ? null : lin(c.ch7d, -15, 20), 0.2], [c.ch30d === null ? null : lin(c.ch30d, -30, 40), 0.4], [c.ch1y === null ? null : lin(c.ch1y, -60, 150), 0.4]]);
      const notes = [];
      if (c.ch30d !== null) notes.push(`${fmtPct(c.ch30d)} over 30 days${c.ch1y !== null ? ` and ${fmtPct(c.ch1y)} over one year` : ""}.`);
      if (c.ch7d !== null) notes.push(`${fmtPct(c.ch7d)} over the last 7 days.`);
      if (s === null) notes.push("No price history is available.");
      return { score: s, notes, inputs: [["7 days", fmtPct(c.ch7d)], ["30 days", fmtPct(c.ch30d)], ["1 year", fmtPct(c.ch1y)]] };
    },
  },
  {
    key: "stability", name: "Stability & drawdown",
    what: "How far the price sits below its all-time high and how wildly it swings. Higher means calmer.",
    run(c) {
      const ddS = c.athChange === null ? null : lin(c.athChange, -95, -10);
      const range = c.high24 && c.low24 && c.price ? ((c.high24 - c.low24) / c.price) * 100 : null;
      const rangeS = range === null ? null : lin(range, 15, 1.5);
      const swingS = c.ch7d === null ? null : lin(Math.abs(c.ch7d), 30, 3);
      const notes = [];
      if (c.athChange !== null) notes.push(`Trading ${Math.abs(c.athChange).toFixed(0)}% below its all-time high of ${fmtBig(c.ath)}.`);
      if (range !== null) notes.push(`Today's high-low range is ${range.toFixed(1)}% of the price.`);
      return { score: avg([[ddS, 0.5], [rangeS, 0.25], [swingS, 0.25]]), notes, inputs: [["From ATH", fmtPct(c.athChange, 0)], ["24h range", range === null ? "n/a" : range.toFixed(1) + "%"], ["7d swing", fmtPct(c.ch7d)]] };
    },
  },
  {
    key: "development", name: "Team & development activity",
    what: "Live code activity on GitHub, used as a proxy for an active, credible team. It does not verify who the team is.",
    run(c) {
      const notes = [];
      const has = c.commits4w !== null || c.stars !== null || c.contributors !== null;
      if (!c.repos.length && !c.devProvided) {
        notes.push("The project lists no public code repository, so there is no visible evidence of an active development team.");
        return { score: 0, notes, inputs: [["Repos listed", "0"]] };
      }
      if (!c.devProvided) {
        notes.push(`The project lists ${c.repos.length} public repositor${c.repos.length === 1 ? "y" : "ies"}, but GitHub activity could not be loaded, so this factor is skipped and its weight goes to the others.`);
        return { score: null, notes, inputs: [["Repos listed", String(c.repos.length)]], missing: true };
      }
      if (!has || (c.commits4w === 0 && !c.stars && !c.contributors)) {
        notes.push(c.repos.length ? "A GitHub repository is listed but CoinGecko has no activity figures for it." : "No public code repository or developer activity is reported.");
        return { score: c.repos.length ? 3 : null, notes, inputs: [["Repos listed", String(c.repos.length)]], missing: !c.repos.length };
      }
      const commitS = c.commits4w === null ? null : lin(log10(c.commits4w + 1), 0, log10(201));
      const contribS = c.contributors === null ? null : lin(log10(c.contributors + 1), 0, log10(301));
      const starS = c.stars === null ? null : lin(log10(c.stars + 1), 1, log10(30001));
      const pushS = c.daysSincePush === null ? null : lin(c.daysSincePush, 180, 7);
      const where = c.ghRepo ? `the main repository (${c.ghRepo})` : "the project's repositories";
      notes.push(`${fmtNum(c.commits4w)} commits in the last 4 weeks${c.commits52w !== null ? ` and ${fmtNum(c.commits52w)} in the last year` : ""} on ${where}.`);
      if (c.contributors !== null) notes.push(`${c.contributors >= 500 ? "500+" : fmtNum(c.contributors)} people have contributed code, and it has ${fmtNum(c.stars)} GitHub stars.`);
      if (c.daysSincePush !== null) notes.push(c.daysSincePush <= 14 ? "Code was pushed in the last two weeks." : `Last code push was ${Math.round(c.daysSincePush)} days ago.`);
      return { score: avg([[commitS, 0.4], [contribS, 0.3], [starS, 0.15], [pushS, 0.15]]), notes, inputs: [["Commits (4 wk)", fmtNum(c.commits4w)], ["Contributors", c.contributors === null ? "n/a" : c.contributors >= 500 ? "500+" : fmtNum(c.contributors)], ["Stars", fmtNum(c.stars)], ["Source", c.devSource === "github" ? "GitHub" : "CoinGecko"]] };
    },
  },
  {
    key: "maturity", name: "Track record",
    what: "How long the coin has existed and survived market cycles.",
    run(c) {
      const ref = c.genesis || c.earliest;
      if (!ref) return { score: null, notes: ["No launch date is available."], inputs: [], missing: true };
      const yrs = (Date.now() - ref.getTime()) / (365.25 * 864e5);
      const notes = [`${c.genesis ? "Launched" : "First traded"} ${ref.getFullYear()}, about ${yrs.toFixed(1)} years ago${c.genesis ? "" : " (earliest price record, launch date not listed)"}.`];
      if (yrs >= 4) notes.push("It has lived through at least one full market cycle.");
      else notes.push("It has not yet been tested by a full bear-and-bull cycle.");
      return { score: lin(yrs, 0.5, 8), notes, inputs: [["Age", yrs.toFixed(1) + " yrs"]] };
    },
  },
  {
    key: "community", name: "Community & sentiment",
    what: "How many people follow the coin and how CoinGecko users vote on it.",
    run(c) {
      const sentS = c.sentimentUp === null ? null : lin(c.sentimentUp, 40, 90);
      const watchS = c.watchlist === null ? null : lin(log10(c.watchlist + 1), 3, log10(2e6));
      if (sentS === null && watchS === null) return { score: null, notes: ["No community data is available."], inputs: [], missing: true };
      const notes = [];
      if (c.watchlist !== null) notes.push(`${fmtNum(c.watchlist)} CoinGecko users track it in a watchlist or portfolio.`);
      if (c.sentimentUp !== null) notes.push(`${c.sentimentUp.toFixed(0)}% of today's sentiment votes are positive.`);
      return { score: avg([[watchS, 0.6], [sentS, 0.4]]), notes, inputs: [["Watchlists", fmtNum(c.watchlist)], ["Positive votes", c.sentimentUp === null ? "n/a" : c.sentimentUp.toFixed(0) + "%"]] };
    },
  },
];

/* Weights per profile. These are a first guess, marked as such in the page. */
const PROFILES = {
  aggressive: {
    label: "Aggressive", blurb: "Seeks high upside and accepts big swings and drawdowns.",
    weights: { size: 10, tokenomics: 15, momentum: 30, stability: 5, development: 20, maturity: 5, community: 15 },
  },
  defensive: {
    label: "Defensive", blurb: "Protects capital first; prefers large, liquid, proven coins.",
    weights: { size: 25, tokenomics: 15, momentum: 5, stability: 25, development: 10, maturity: 20, community: 0 },
  },
  longterm: {
    label: "Long-term", blurb: "Holds for years; cares about supply design and a team that keeps building.",
    weights: { size: 15, tokenomics: 25, momentum: 5, stability: 10, development: 25, maturity: 15, community: 5 },
  },
};

function flags(c) {
  const f = [];
  const turnover = c.vol24 !== null && c.mcap ? (c.vol24 / c.mcap) * 100 : null;
  if (c.rank && c.rank > 300) f.push(["high", `Small cap (rank #${c.rank}): thin markets and higher failure risk.`]);
  if (turnover !== null && turnover < 0.5) f.push(["high", "Very low trading volume: hard to exit a position quickly."]);
  if (turnover !== null && turnover > 60) f.push(["mid", "Volume far above market cap: possible wash trading or hype spike."]);
  const cap = c.max || c.total;
  if (c.circ && cap && c.circ / cap < 0.4) f.push(["high", `Only ${((c.circ / cap) * 100).toFixed(0)}% of supply circulating: future unlocks may pressure the price.`]);
  if (!c.max) f.push(["mid", "No supply cap: holders depend on the issuance schedule."]);
  if (c.athChange !== null && c.athChange < -85) f.push(["high", `Down ${Math.abs(c.athChange).toFixed(0)}% from its peak: a recovery is not guaranteed.`]);
  if (c.devProvided ? c.commits4w === 0 : !c.repos.length) f.push(["mid", c.devProvided ? "No recent public development activity." : "No public code repository is listed."]);
  if ((c.categories || []).some((x) => /meme/i.test(x))) f.push(["mid", "Meme coin: value relies mostly on attention, not cash flow or utility."]);
  if ((c.categories || []).some((x) => /stablecoin/i.test(x))) f.push(["info", "Stablecoin: designed to hold its peg, not to grow in value. The score measures its quality, not its upside."]);
  return f;
}

function score(c, profileKey) {
  const p = PROFILES[profileKey];
  const factors = FACTORS.map((F) => {
    const r = F.run(c);
    return { key: F.key, name: F.name, what: F.what, weight: p.weights[F.key], ...r };
  });
  const used = factors.filter((f) => f.score !== null && f.weight > 0);
  const wsum = used.reduce((s, f) => s + f.weight, 0);
  const raw = wsum ? used.reduce((s, f) => s + f.score * f.weight, 0) / wsum : 0;
  factors.forEach((f) => { f.effWeight = f.score !== null && f.weight > 0 && wsum ? (f.weight / wsum) * 100 : 0; f.contrib = f.score !== null && wsum ? (f.score * f.weight) / wsum : 0; });
  let total = 1 + raw * 0.9; // map 0-10 onto 1-10
  const caps = [];
  if (profileKey === "defensive" && c.rank && c.rank > 100) { if (total > 5) caps.push(`Capped at 5.0 because a defensive portfolio should avoid coins outside the top 100 (this one is #${c.rank}).`); total = Math.min(total, 5); }
  const noCode = (!c.repos.length && !c.devProvided) || (c.devProvided && c.commits4w === 0 && !c.stars);
  if (profileKey === "longterm" && noCode) { if (total > 6) caps.push("Capped at 6.0 because no development activity is visible, which undermines a multi-year hold."); total = Math.min(total, 6); }
  total = Math.round(total * 10) / 10;
  const missing = factors.filter((f) => f.score === null && f.weight > 0).map((f) => f.name);
  const coverage = factors.filter((f) => f.weight > 0).length ? Math.round((used.length / factors.filter((f) => f.weight > 0).length) * 100) : 0;
  return { total, raw, factors, caps, missing, coverage, flags: flags(c), profile: p, profileKey };
}

const verdict = (t) => t >= 8 ? ["Strong fit", "strong"] : t >= 6.5 ? ["Good fit", "good"] : t >= 5 ? ["Mixed", "mixed"] : t >= 3.5 ? ["Weak fit", "weak"] : ["Poor fit", "poor"];

function recommend(c, r) {
  const k = r.profileKey, t = r.total;
  const sorted = r.factors.filter((f) => f.score !== null && f.weight > 0).sort((a, b) => b.weight * (10 - b.score) - a.weight * (10 - a.score));
  const weak = sorted.filter((f) => f.score < 5).slice(0, 2);
  const strong = r.factors.filter((f) => f.score !== null && f.weight > 0 && f.score >= 7).sort((a, b) => b.contrib - a.contrib).slice(0, 2);
  const out = [];
  const role = {
    aggressive: t >= 7 ? "Fits as a high-conviction growth position. Size it so a 70% drawdown would not change your plans." : t >= 5 ? "Fits only as a small speculative position. Set an exit rule before buying." : "Does not offer enough upside signal for the risk. Keep it on a watchlist.",
    defensive: t >= 7.5 ? "Fits as a core holding candidate within your crypto allocation." : t >= 5.5 ? "Acceptable as a minor holding, but keep crypto a small share of the portfolio overall." : "Too risky for a capital-preservation strategy. Avoid or wait for a stronger track record.",
    longterm: t >= 7.5 ? "Strong candidate for a buy-and-hold position. Consider building it gradually with regular purchases." : t >= 5.5 ? "Possible long-term hold if the weak points below improve. Revisit every quarter." : "The fundamentals do not yet support a multi-year hold.",
  }[k];
  out.push(["Role in your portfolio", role]);
  if (strong.length) out.push(["What supports it", strong.map((f) => `${f.name} (${f.score.toFixed(1)}/10): ${f.notes[0]}`).join(" ")]);
  const checks = {
    size: "Check order-book depth on the exchange you would use before placing a large order.",
    tokenomics: "Read the vesting and unlock schedule; large unlocks in the next 12 months are a key risk.",
    momentum: k === "aggressive" ? "Momentum is weak. Wait for a confirmed trend change rather than catching a falling price." : "Weak momentum matters less for your profile, but avoid buying all at once.",
    stability: k === "defensive" ? "Price swings are large for a defensive portfolio. Keep the position small." : "Expect deep drawdowns; decide in advance how much loss you will tolerate.",
    development: "Look up the core team, audits and the roadmap; public code activity is low.",
    maturity: "The project is young. Look for audits, a working product and real users.",
    community: "Community interest is limited, so liquidity and attention could fade.",
  };
  weak.forEach((f) => out.push([`Watch: ${f.name.toLowerCase()}`, checks[f.key]]));
  if (r.missing.length) out.push(["Data gaps", `No data for ${r.missing.join(" and ").toLowerCase()}, so the score uses the remaining factors only. Research these yourself.`]);
  return out;
}

export { normalize, score, recommend, verdict, flags, FACTORS, PROFILES, fmtBig, fmtPct, fmtNum, lin, clamp };
