# Coin Scorecard

Score any cryptocurrency from 1 to 10 for **your** investor profile (aggressive, defensive or long-term), using live market data from CoinGecko and development activity from GitHub. Every point of the score is explained: you see each factor's sub-score, its weight for your profile, and the raw numbers behind it.

**Live demo:** https://angelito10-png.github.io/coin-scorecard/

![Coin Scorecard showing Chainlink scored for a long-term investor](docs/screenshot.png)

> This is a portfolio project and an analysis aid, not financial advice.

## What it does

1. You pick a coin (any of the thousands listed on CoinGecko) and an investor profile.
2. The app loads live market data from CoinGecko, then finds the project's main GitHub repository and loads its commit, contributor and star counts.
3. Seven factors are scored from 0 to 10 with fixed, documented thresholds.
4. Your profile decides how much each factor counts. The weighted average becomes a 1 to 10 score with a verdict (strong fit, good fit, mixed, weak fit, poor fit).
5. You get risk flags, recommendations for your profile, and the same coin's score under the other two profiles.
6. **Adjust weights** with sliders and watch the score recompute live, or start from any profile and tune it.
7. A **radar chart** shows the coin's shape across the seven factors at a glance.
8. **Compare** up to three coins side by side: overlaid radar shapes plus a table of every score, with the best value in each row marked.
9. **English and Greek.** Every text, including factor explanations, risk flags and recommendations, comes from a translation dictionary (`src/i18n.js`). The language follows your browser and can be switched at any time.
10. **Light and dark themes**, following your system setting or chosen by hand.
11. **Latest news** for the selected coin: recent headlines from CryptoPanic and major crypto news sites, refreshed every 3 hours.

Results are shareable: the URL carries the coin, profile, custom weights and compared coins, for example `?coin=ethereum&profile=defensive&vs=solana,chainlink&lang=el`.

## Scoring model

| Factor | What it measures | Aggressive | Defensive | Long-term |
|---|---|---:|---:|---:|
| Market size & liquidity | Market-cap rank, daily volume relative to market cap | 10% | 25% | 15% |
| Tokenomics & dilution | Share of supply circulating, fully diluted value vs market cap, supply cap | 15% | 15% | 25% |
| Price momentum | 7-day, 30-day and 1-year price change | 30% | 5% | 5% |
| Stability & drawdown | Distance from all-time high, daily range, weekly swing | 5% | 25% | 10% |
| Team & development | GitHub commits (4 weeks), contributors, stars, last push | 20% | 10% | 25% |
| Track record | Years since launch | 5% | 20% | 15% |
| Community & sentiment | CoinGecko watchlists, positive sentiment votes | 15% | 0% | 5% |

Design choices worth calling out:

- **Missing data is skipped, not punished.** If a source fails or doesn't report a value, that factor is dropped and its weight is shared among the rest. The page shows a data-coverage figure so you know how complete the score is.
- **Absence of code is information.** A coin that lists no public repository scores 0 on development, and its long-term score is capped at 6.
- **Profile rules.** Defensive scores are capped at 5 outside the top 100 coins.
- **Final score = 1 + 0.9 × weighted average**, so the scale runs from 1 to 10.

Limits: neither source says who runs a project, so GitHub activity stands in for team credibility. The app cannot detect anonymous teams, past scandals, missing audits or token unlock dates.

## Architecture

No framework, no chart library, no build step, no backend. The radar chart is hand-built SVG. It is a static site of plain ES modules, so it deploys anywhere.

```
index.html          page shell
styles.css          design tokens (light and dark themes) and layout
src/engine.js       scoring engine: pure functions, no DOM or network
src/i18n.js         English and Greek dictionaries, t() lookup
src/api.js          CoinGecko and GitHub clients with sessionStorage caching and rate-limit handling
scripts/            build step that collects news headlines (runs in GitHub Actions)
src/app.js          UI: coin search, weight sliders, SVG radar chart, comparison, URL state
tests/              unit tests for the engine, a regression test on real captured API data, and translation checks
```

- **Separation of concerns:** the scoring engine is pure and fully unit-tested; the UI only renders what it returns.
- **Rate limits:** CoinGecko's free API allows a few calls per minute, and GitHub allows 60 anonymous calls per hour. Responses are cached per session, and each analysis uses one CoinGecko call and three or four GitHub calls. When a limit is hit, the app says so and keeps the rest of the score.
- **Safety:** all data is rendered with `textContent` (never `innerHTML`), and links from the APIs are only used when they start with `http(s)://`.

## Run it locally

```bash
npm test     # 22 unit tests, Node 20+
npm start    # serves the site at http://localhost:3000
```

Any static file server works, since the browser calls the public APIs directly.

## Deployment

Every push to `main`, and a schedule every 3 hours, runs the tests and deploys to GitHub Pages (`.github/workflows/pages.yml`).

### News without exposing an API key

CryptoPanic needs a private API key and does not accept calls from browsers, so the page never calls it. Instead, the deploy job runs `scripts/fetch-news.mjs`, which reads the key from the `CRYPTOPANIC_TOKEN` repository secret, collects headlines and publishes only those as `news.json` next to the site. It also reads the public RSS feeds of several crypto news sites and matches headlines to coins by name or ticker, so news still works when no key is set. If every source fails, the deploy still goes ahead and the page says news is unavailable.

## License

MIT
