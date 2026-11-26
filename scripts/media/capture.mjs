/**
 * Screenshots, a demo video and a GIF of AssetLens, for the README and the CV.
 * Runs in GitHub Actions (.github/workflows/media.yml) against a local copy of the site,
 * with live data from the same free APIs the site uses.
 *
 * Usage: node scripts/media/capture.mjs <baseUrl> <outDir>
 * Optional env: DEMO_AV_KEY, a free Alpha Vantage key used only inside this run's throwaway browser,
 * so the stock and portfolio pages show prices. It never appears on screen or in any file.
 */
import { chromium } from "playwright";
import { mkdirSync, renameSync, readdirSync, statSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const BASE = (process.argv[2] || "http://localhost:8080").replace(/\/$/, "");
const OUT = process.argv[3] || "docs/media";
const KEY = process.env.DEMO_AV_KEY || "";
const PORTFOLIO = "h=e:VOO:10000,e:QQQ:6000,e:BND:4000,c:bitcoin:2000";
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("[capture]", ...a);

async function settle(page, sel, timeout = 45000) {
  try { await page.waitForLoadState("networkidle", { timeout: 20000 }); } catch { /* live APIs can keep a socket open */ }
  if (sel) { try { await page.waitForSelector(sel, { timeout }); } catch { log("timed out waiting for", sel, "on", page.url()); } }
  await sleep(1200);
}
async function seed(page) {
  await page.goto(BASE + "/index.html");
  await page.evaluate((key) => { localStorage.setItem("cs-theme", "light"); if (key) localStorage.setItem("ms-av-key", key); }, KEY);
}
const shot = async (page, name, el) => {
  try {
    if (el) { const h = await page.$(el); if (h) { await h.scrollIntoViewIfNeeded(); await h.screenshot({ path: join(OUT, name) }); log(name); return; } }
    await page.screenshot({ path: join(OUT, name) }); log(name);
  } catch (e) { log("failed", name, e.message); }
};
const scrollTo = async (page, sel, offset = 80) => { await page.evaluate(([s, o]) => { const e = document.querySelector(s); if (e) window.scrollTo({ top: e.getBoundingClientRect().top + scrollY - o, behavior: "smooth" }); }, [sel, offset]); await sleep(900); };

/* ---------------------------------------------------------------- screenshots */
async function screenshots(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5 });
  const p = await ctx.newPage();
  await seed(p);

  await p.goto(BASE + "/index.html"); await settle(p, "#homeCards .card, #homeCards > *");
  await shot(p, "home.png");

  await p.goto(BASE + "/crypto.html?coin=bitcoin&profile=longterm"); await settle(p, "#result .scorecard");
  await scrollTo(p, "#result"); await shot(p, "crypto.png");
  await scrollTo(p, "#result .ledger", 120); await shot(p, "crypto-factors.png");
  await scrollTo(p, "#sbt"); await settle(p, "#sbt .k-answer", 20000); await shot(p, "score-backtest.png", "#sbt");

  await p.goto(BASE + "/markets.html?t=AAPL&profile=defensive"); await settle(p, "#result .scorecard");
  await scrollTo(p, "#result"); await shot(p, "stocks.png");

  await p.goto(BASE + "/portfolio.html?" + PORTFOLIO + "&profile=longterm"); await settle(p, "#phPanel", 90000);
  await scrollTo(p, "#result"); await shot(p, "portfolio.png");
  await shot(p, "portfolio-history.png", "#phPanel");

  await p.goto(BASE + "/invest.html"); await settle(p, "#calcBody > *");
  await shot(p, "invest.png", "#calc");

  await p.goto(BASE + "/crypto.html?coin=ethereum&profile=aggressive"); await settle(p, "#result .scorecard");
  await p.click(".hb-fab"); await sleep(400);
  await p.fill(".hb-in", "What does FDV mean?"); await p.press(".hb-in", "Enter"); await sleep(1500);
  await shot(p, "help-assistant.png");
  const state = await ctx.storageState(); // keeps the downloaded prices, so the video doesn't spend the free key's calls again
  await ctx.close();

  const dark = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5, colorScheme: "dark" });
  const d = await dark.newPage();
  await d.goto(BASE + "/crypto.html?coin=solana&profile=defensive&lang=el"); await settle(d, "#result .scorecard");
  await scrollTo(d, "#result"); await shot(d, "dark-greek.png");
  await dark.close();

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const m = await phone.newPage();
  await m.goto(BASE + "/crypto.html?coin=bitcoin&profile=longterm"); await settle(m, "#result .scorecard");
  await scrollTo(m, "#result", 16); await shot(m, "phone.png");
  await phone.close();
  return state;
}

/* ---------------------------------------------------------------- demo video (~75 s, captions on screen) */
async function caption(page, text) {
  await page.evaluate((t) => {
    let c = document.getElementById("demo-cap");
    if (!c) {
      c = document.createElement("div"); c.id = "demo-cap";
      c.style.cssText = "position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:9999;max-width:80%;padding:12px 20px;border-radius:12px;background:rgba(10,20,28,.88);color:#fff;font:600 20px/1.35 Inter,system-ui,sans-serif;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.35);pointer-events:none";
      document.body.append(c);
    }
    c.textContent = t; c.style.display = t ? "block" : "none";
  }, text);
}
const glide = async (page, px, steps = 12) => { for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, px / steps); await sleep(70); } await sleep(500); };

async function video(browser, storageState) {
  const dir = join(OUT, "_video");
  rmSync(dir, { recursive: true, force: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir, size: { width: 1280, height: 720 } }, storageState });
  const p = await ctx.newPage();
  if (!storageState) await seed(p);
  await p.goto(BASE + "/index.html"); await settle(p, "#homeCards > *");
  await caption(p, "AssetLens scores crypto, stocks, ETFs and commodities from 1 to 10 for your investor profile");
  await sleep(3500); await glide(p, 500); await sleep(1500);

  await p.goto(BASE + "/crypto.html?coin=bitcoin&profile=longterm"); await settle(p, "#result .scorecard");
  await caption(p, "Pick a coin: live CoinGecko and GitHub data become a score with its reasons");
  await scrollTo(p, "#result"); await sleep(3000);
  await caption(p, "Switch profile and the same coin is judged differently");
  await p.click('label:has(#p-aggressive)'); await sleep(2500);
  await p.click('label:has(#p-defensive)'); await sleep(2500);
  await caption(p, "Every factor shows the numbers behind it");
  await scrollTo(p, "#result .ledger", 100); await sleep(3500);
  await caption(p, "Backtest: did high-scoring coins actually do better afterwards?");
  await scrollTo(p, "#sbt", 40); await settle(p, "#sbt .k-answer", 15000); await sleep(4000);

  await p.goto(BASE + "/markets.html?t=AAPL&profile=defensive"); await settle(p, "#result .scorecard");
  await caption(p, "Stocks and ETFs: SEC filings and prices, scored the same transparent way");
  await scrollTo(p, "#result"); await sleep(3500); await glide(p, 600); await sleep(1500);

  await p.goto(BASE + "/portfolio.html?" + PORTFOLIO + "&profile=longterm"); await settle(p, "#phPanel", 90000);
  await caption(p, "Portfolio: a rule-based analyst explains what works, what doesn't and what to fix");
  await scrollTo(p, "#result"); await sleep(4000);
  await caption(p, "…and how this mix did against the S&P 500");
  await scrollTo(p, "#phPanel", 40); await sleep(2000);
  await p.click("#phPanel .ph-years button:nth-child(2)").catch(() => {}); await sleep(3000);

  await p.goto(BASE + "/invest.html"); await settle(p, "#calcBody > *");
  await caption(p, "How to invest: strategies in plain words, a monthly-investing calculator and a backtest");
  await scrollTo(p, "#calc", 40); await sleep(4000);

  await caption(p, "A help assistant answers questions about the app and its terms");
  await p.click(".hb-fab"); await sleep(600);
  await p.type(".hb-in", "What is dollar-cost averaging?", { delay: 35 }); await p.press(".hb-in", "Enter"); await sleep(4000);
  await p.click(".hb-panel .xbtn").catch(() => {});

  await caption(p, "In English and Greek, light and dark, on desktop and phone");
  await p.click('[data-lang="el"]'); await sleep(1500);
  await p.click('[data-theme-btn="dark"]'); await sleep(2500);
  await caption(p, "AssetLens · free data, open source, educational, not financial advice");
  await sleep(3500);
  await ctx.close();

  const file = readdirSync(dir).find((f) => f.endsWith(".webm"));
  const webm = join(dir, file);
  const ff = (args) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });
  ff(["-i", webm, "-c:v", "libx264", "-preset", "slow", "-crf", "28", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", join(OUT, "demo.mp4")]);
  // README GIF: the crypto part, smaller and slower-moving
  ff(["-ss", "6", "-t", "24", "-i", webm, "-vf", "fps=8,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[pal];[b][pal]paletteuse=dither=bayer:bayer_scale=4", join(OUT, "demo.gif")]);
  renameSync(webm, join(OUT, "_last.webm"));
  rmSync(dir, { recursive: true, force: true });
  rmSync(join(OUT, "_last.webm"), { force: true });
  for (const f of ["demo.mp4", "demo.gif"]) log(f, Math.round(statSync(join(OUT, f)).size / 1024) + " KB");
}

const browser = await chromium.launch();
try {
  const state = process.env.SKIP_SHOTS !== "1" ? await screenshots(browser) : null;
  if (process.env.SKIP_VIDEO !== "1") await video(browser, state);
} finally { await browser.close(); }
