/**
 * Pure helpers for the news build step (no network): RSS parsing, matching
 * headlines to coins, and shaping CryptoPanic results. Tested in tests/news.test.js.
 */

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export function decodeEntities(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decodeEntities(m[1]) : "";
};

/** Parse RSS 2.0 <item>s (and Atom <entry>s) into { title, url, published, summary }. */
export function parseRss(xml, source) {
  const items = [];
  for (const m of String(xml).matchAll(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi)) {
    const x = m[0];
    let url = tag(x, "link");
    if (!url) { const a = x.match(/<link[^>]*href="([^"]+)"/i); url = a ? a[1] : ""; }
    const date = new Date(tag(x, "pubDate") || tag(x, "published") || tag(x, "updated") || tag(x, "dc:date"));
    const title = tag(x, "title");
    if (!title || !/^https?:\/\//.test(url)) continue;
    items.push({ title, url, source, published: isNaN(date) ? null : date.toISOString(), summary: tag(x, "description").slice(0, 400) });
  }
  return items;
}

// Tickers that are also everyday words or too ambiguous to match on their own.
const AMBIGUOUS = new Set(["ONE", "TON", "SAFE", "GAS", "POL", "S", "IP", "MOVE", "PUMP", "TRUMP", "MORPHO", "FLOW", "SUN", "ENA", "USD", "WLD", "HYPE", "JUP", "KAS", "OM", "AR", "OP", "NEAR", "SEI", "SKY", "HT", "BGB", "LEO", "XDC", "ETC"]);
// Coin names that are also everyday words ("Just 10 accounts…", "Sky falls"). They are not matched by name.
const COMMON_NAMES = new Set(["just", "derive", "sky", "sun", "gas", "safe", "flow", "move", "pump", "story", "render", "core", "stacks", "sonic", "near", "dash", "maker", "kite", "gate", "zero", "plume", "beam", "ronin", "aster", "ethena labs"]);
// Other names people use for a coin in headlines.
const ALIASES = { ethereum: ["Ether"], "binancecoin": ["BNB"], "avalanche-2": ["Avalanche"], "shiba-inu": ["Shiba Inu"] };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Build a matcher per coin: its name (any case) or its ticker (upper case, unambiguous ones only). */
export function coinMatchers(coins) {
  return coins.map((c) => {
    const parts = [];
    const names = [(c.name || "").trim(), ...(ALIASES[c.id] || [])].filter((n) => n.length >= 3 && !COMMON_NAMES.has(n.toLowerCase()));
    for (const name of names) parts.push(new RegExp(`(^|[^\\p{L}\\p{N}])${esc(name)}(?![\\p{L}\\p{N}])`, "iu"));
    const sym = (c.symbol || "").toUpperCase();
    if (sym.length >= 3 && !AMBIGUOUS.has(sym)) parts.push(new RegExp(`(^|[^A-Za-z0-9$])\\$?${esc(sym)}(?![A-Za-z0-9])`));
    return { id: c.id, test: (text) => parts.some((re) => re.test(text)) };
  });
}

/** Ids of the coins a headline is about. Only the title counts, so passing mentions in a body don't. */
export function matchHeadline(title, matchers) {
  return matchers.filter((m) => m.test(title)).map((m) => m.id);
}

/** Turn a CryptoPanic posts response into items tagged with CoinGecko ids (via ticker). */
export function fromCryptoPanic(json, symbolToIds) {
  const out = [];
  for (const p of (json && json.results) || []) {
    const codes = (p.instruments || p.currencies || []).map((x) => String(x.code || "").toUpperCase());
    const ids = [...new Set(codes.flatMap((c) => symbolToIds[c] || []))];
    const url = /^https?:\/\//.test(p.original_url || "") ? p.original_url : /^https?:\/\//.test(p.url || "") ? p.url : p.id && p.slug ? `https://cryptopanic.com/news/${p.id}/${p.slug}` : null;
    if (!p.title || !url || !ids.length) continue;
    out.push({ ids, item: { title: decodeEntities(p.title), url, source: (p.source && (p.source.title || p.source.domain)) || "CryptoPanic", published: p.published_at || p.created_at || null } });
  }
  return out;
}

/** Group items per coin: newest first, no duplicate links or titles, at most `max` each. */
export function groupNews(tagged, max = 8) {
  const byCoin = {};
  for (const { ids, item } of tagged) for (const id of ids) (byCoin[id] ||= []).push(item);
  for (const id of Object.keys(byCoin)) {
    const seen = new Set();
    byCoin[id] = byCoin[id]
      .sort((a, b) => (b.published || "").localeCompare(a.published || ""))
      .filter((x) => {
        const t = x.title.toLowerCase();
        if (seen.has(x.url) || seen.has(t)) return false;
        seen.add(x.url); seen.add(t); return true;
      })
      .slice(0, max)
      .map(({ title, url, source, published }) => ({ title, url, source, published }));
  }
  return byCoin;
}
