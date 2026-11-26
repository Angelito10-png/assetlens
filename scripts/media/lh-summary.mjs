/** Lighthouse JSON reports → a Markdown table (docs/media/lighthouse.md). Usage: node lh-summary.mjs <dir> <out.md> */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const [dir, out] = process.argv.slice(2);
const rows = readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => {
  const j = JSON.parse(readFileSync(join(dir, f), "utf8"));
  const c = (k) => (j.categories[k] ? Math.round(j.categories[k].score * 100) : "–");
  const a = (k) => (j.audits[k] ? j.audits[k].displayValue : "–");
  return `| ${f.replace(".json", "")} | ${c("performance")} | ${c("accessibility")} | ${c("best-practices")} | ${c("seo")} | ${a("first-contentful-paint")} | ${a("largest-contentful-paint")} | ${a("cumulative-layout-shift")} |`;
});
writeFileSync(out, `# Lighthouse (mobile, simulated slow 4G)\n\nMeasured by the media workflow on ${new Date().toISOString().slice(0, 10)} against a local copy of the site with live data.\n\n| Page | Performance | Accessibility | Best practices | SEO | First paint | Largest paint | Layout shift |\n|---|---:|---:|---:|---:|---:|---:|---:|\n${rows.join("\n")}\n`);
console.log(rows.join("\n"));
