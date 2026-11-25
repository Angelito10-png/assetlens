/**
 * Data access: CoinGecko (market data) and GitHub (development activity).
 * Both public APIs allow browser calls without a key. Responses are cached in
 * sessionStorage so switching profiles or revisiting a coin costs no requests.
 */

const CG = "https://api.coingecko.com/api/v3";
const GH = "https://api.github.com";

export class ApiError extends Error {
  constructor(kind, message, retryAfter) {
    super(message);
    this.kind = kind; // "rate_limit" | "not_found" | "network" | "http"
    this.retryAfter = retryAfter || null;
  }
}

const cache = {
  get(key, maxAgeMs) {
    try {
      const hit = JSON.parse(sessionStorage.getItem(key) || "null");
      if (hit && Date.now() - hit.t < maxAgeMs) return hit.v;
    } catch { /* storage unavailable */ }
    return undefined;
  },
  set(key, v) {
    try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), v })); } catch { /* quota or blocked */ }
  },
};

async function getJson(url, { maxAgeMs = 60_000, allow202 = false } = {}) {
  const cached = cache.get(url, maxAgeMs);
  if (cached !== undefined) return cached;
  let res;
  try {
    res = await fetch(url, { headers: { Accept: "application/json" } });
  } catch (e) {
    throw new ApiError("network", "Network error. Check your connection and try again.");
  }
  if (res.status === 202 && allow202) return null; // GitHub is still computing stats
  if (res.status === 429 || (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0")) {
    const reset = Number(res.headers.get("x-ratelimit-reset"));
    const retry = Number(res.headers.get("retry-after")) || (reset ? Math.max(0, reset - Date.now() / 1000) : 60);
    throw new ApiError("rate_limit", "Rate limit reached.", retry);
  }
  if (res.status === 404) throw new ApiError("not_found", "Not found.");
  if (!res.ok) throw new ApiError("http", `Request failed (${res.status}).`);
  const json = await res.json();
  cache.set(url, json);
  return json;
}

/* ---------------- CoinGecko ---------------- */

export function topCoins() {
  return getJson(`${CG}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false&price_change_percentage=7d,30d,1y`, { maxAgeMs: 10 * 60_000 });
}

export function coinInfo(id) {
  return getJson(`${CG}/coins/${encodeURIComponent(id)}?localization=false&tickers=false&market_data=true&community_data=true&developer_data=true&sparkline=false`, { maxAgeMs: 60_000 });
}

export async function searchCoins(query) {
  const r = await getJson(`${CG}/search?query=${encodeURIComponent(query)}`, { maxAgeMs: 10 * 60_000 });
  return (r.coins || []).slice(0, 10).map((c) => ({ id: c.id, name: c.name, symbol: c.symbol, rank: c.market_cap_rank }));
}

/* ---------------- GitHub ---------------- */

/** Parse "https://github.com/owner[/repo]" into { owner, repo? }. */
export function parseGithubUrl(url) {
  const m = /^https?:\/\/(?:www\.)?github\.com\/([^/?#]+)(?:\/([^/?#]+))?/i.exec(url || "");
  if (!m) return null;
  return { owner: m[1], repo: m[2] ? m[2].replace(/\.git$/, "") : null };
}

/** Number of contributors, read from the pagination header with per_page=1 (capped by GitHub at 500 for large repos). */
async function contributorCount(full) {
  const key = `${GH}/repos/${full}/contributors#count`;
  const cached = cache.get(key, 6 * 3600_000);
  if (cached !== undefined) return cached;
  const res = await fetch(`${GH}/repos/${full}/contributors?per_page=1&anon=1`);
  if (!res.ok) return null;
  const link = res.headers.get("link") || "";
  const m = /[?&]page=(\d+)>;\s*rel="last"/.exec(link);
  const n = m ? Number(m[1]) : (await res.json()).length;
  cache.set(key, n);
  return n;
}

/**
 * Development activity for a coin, from the first GitHub link CoinGecko lists.
 * Costs 3-4 unauthenticated requests (GitHub allows 60 per hour per visitor).
 * Resolves null when the coin lists no GitHub link.
 */
export async function githubActivity(repoUrls) {
  const target = (repoUrls || []).map(parseGithubUrl).find(Boolean);
  if (!target) return null;
  let full = target.repo ? `${target.owner}/${target.repo}` : null;
  if (!full) {
    // Organisation link only: use its most-starred repository.
    const s = await getJson(`${GH}/search/repositories?q=${encodeURIComponent("org:" + target.owner)}&sort=stars&order=desc&per_page=1`, { maxAgeMs: 6 * 3600_000 });
    if (!s.items || !s.items.length) return null;
    full = s.items[0].full_name;
  }
  const repo = await getJson(`${GH}/repos/${full}`, { maxAgeMs: 3600_000 });
  const [participation, contributors] = await Promise.all([
    getJson(`${GH}/repos/${full}/stats/participation`, { maxAgeMs: 3600_000, allow202: true }).catch(() => null),
    contributorCount(full).catch(() => null),
  ]);
  const weeks = participation && Array.isArray(participation.all) ? participation.all : null;
  return {
    repo: repo.full_name,
    url: repo.html_url,
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    daysSincePush: repo.pushed_at ? (Date.now() - new Date(repo.pushed_at).getTime()) / 864e5 : null,
    commits4w: weeks ? weeks.slice(-4).reduce((a, b) => a + b, 0) : null,
    commits52w: weeks ? weeks.reduce((a, b) => a + b, 0) : null,
    contributors,
  };
}
