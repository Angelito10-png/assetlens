/**
 * The stocks and ETFs the markets scorecard covers. A fixed list keeps the
 * daily data snapshot small and lets every number be checked.
 *
 * Stocks: large US companies that file with the SEC under US GAAP, grouped by
 * GICS sector. ETFs: popular US-listed funds. ETF facts (expense ratio,
 * holdings, top-10 weight, inception, top holdings) are copied by hand from the
 * issuers' fact sheets and change slowly; ETF_FACTS_AS_OF says when.
 */

export const SECTORS = ["tech", "comm", "discretionary", "staples", "health", "financials", "industrials", "energy", "utilities", "realestate", "materials"];

/** [ticker, name, sector] */
export const STOCKS = [
  ["AAPL", "Apple", "tech"], ["MSFT", "Microsoft", "tech"], ["NVDA", "NVIDIA", "tech"], ["AVGO", "Broadcom", "tech"],
  ["ORCL", "Oracle", "tech"], ["CRM", "Salesforce", "tech"], ["ADBE", "Adobe", "tech"], ["AMD", "Advanced Micro Devices", "tech"],
  ["CSCO", "Cisco", "tech"], ["INTC", "Intel", "tech"], ["QCOM", "Qualcomm", "tech"], ["TXN", "Texas Instruments", "tech"],
  ["IBM", "IBM", "tech"], ["NOW", "ServiceNow", "tech"], ["INTU", "Intuit", "tech"], ["MU", "Micron", "tech"], ["PLTR", "Palantir", "tech"],
  ["GOOGL", "Alphabet", "comm"], ["META", "Meta Platforms", "comm"], ["NFLX", "Netflix", "comm"], ["DIS", "Walt Disney", "comm"],
  ["T", "AT&T", "comm"], ["VZ", "Verizon", "comm"], ["CMCSA", "Comcast", "comm"],
  ["AMZN", "Amazon", "discretionary"], ["TSLA", "Tesla", "discretionary"], ["HD", "Home Depot", "discretionary"], ["MCD", "McDonald's", "discretionary"],
  ["NKE", "Nike", "discretionary"], ["SBUX", "Starbucks", "discretionary"], ["LOW", "Lowe's", "discretionary"], ["BKNG", "Booking Holdings", "discretionary"], ["TJX", "TJX Companies", "discretionary"],
  ["WMT", "Walmart", "staples"], ["PG", "Procter & Gamble", "staples"], ["KO", "Coca-Cola", "staples"], ["PEP", "PepsiCo", "staples"],
  ["COST", "Costco", "staples"], ["PM", "Philip Morris", "staples"], ["MO", "Altria", "staples"], ["CL", "Colgate-Palmolive", "staples"], ["MDLZ", "Mondelez", "staples"],
  ["LLY", "Eli Lilly", "health"], ["UNH", "UnitedHealth", "health"], ["JNJ", "Johnson & Johnson", "health"], ["ABBV", "AbbVie", "health"],
  ["MRK", "Merck", "health"], ["PFE", "Pfizer", "health"], ["TMO", "Thermo Fisher", "health"], ["ABT", "Abbott", "health"], ["AMGN", "Amgen", "health"], ["ISRG", "Intuitive Surgical", "health"],
  ["JPM", "JPMorgan Chase", "financials"], ["BAC", "Bank of America", "financials"], ["WFC", "Wells Fargo", "financials"], ["GS", "Goldman Sachs", "financials"],
  ["MS", "Morgan Stanley", "financials"], ["V", "Visa", "financials"], ["MA", "Mastercard", "financials"], ["AXP", "American Express", "financials"],
  ["BLK", "BlackRock", "financials"], ["SCHW", "Charles Schwab", "financials"], ["PYPL", "PayPal", "financials"],
  ["CAT", "Caterpillar", "industrials"], ["GE", "GE Aerospace", "industrials"], ["HON", "Honeywell", "industrials"], ["UPS", "UPS", "industrials"],
  ["BA", "Boeing", "industrials"], ["RTX", "RTX", "industrials"], ["LMT", "Lockheed Martin", "industrials"], ["DE", "Deere", "industrials"], ["UNP", "Union Pacific", "industrials"],
  ["XOM", "Exxon Mobil", "energy"], ["CVX", "Chevron", "energy"], ["COP", "ConocoPhillips", "energy"], ["SLB", "SLB", "energy"], ["EOG", "EOG Resources", "energy"],
  ["NEE", "NextEra Energy", "utilities"], ["DUK", "Duke Energy", "utilities"], ["SO", "Southern Company", "utilities"], ["D", "Dominion Energy", "utilities"],
  ["PLD", "Prologis", "realestate"], ["AMT", "American Tower", "realestate"], ["O", "Realty Income", "realestate"], ["SPG", "Simon Property", "realestate"],
  ["LIN", "Linde", "materials"], ["SHW", "Sherwin-Williams", "materials"], ["FCX", "Freeport-McMoRan", "materials"], ["NEM", "Newmont", "materials"], ["DOW", "Dow", "materials"],
];

export const ETF_CATEGORIES = ["us_broad", "intl", "growth", "dividend", "sector", "bonds", "realestate", "commodity", "thematic"];
export const ETF_FACTS_AS_OF = "2025";

/**
 * ETF facts from issuer fact sheets (approximate, as of ETF_FACTS_AS_OF).
 * er = expense ratio in %, holdings = number of holdings, top10 = weight of the
 * ten largest holdings in %, aum = assets in $bn, since = inception year,
 * top = largest holdings by ticker (used to spot overlap in a portfolio),
 * sectors = rough sector split in % for equity funds (used by the portfolio analyst).
 */
export const ETFS = [
  { t: "SPY", name: "SPDR S&P 500 ETF Trust", cat: "us_broad", issuer: "State Street", er: 0.0945, holdings: 503, top10: 37, aum: 630, since: 1993, top: ["NVDA", "MSFT", "AAPL", "AMZN", "META", "AVGO", "GOOGL"], sectors: { tech: 33, financials: 13, discretionary: 10, comm: 10, health: 9, industrials: 8, staples: 5, energy: 3, utilities: 2, realestate: 2, materials: 2 } },
  { t: "VOO", name: "Vanguard S&P 500 ETF", cat: "us_broad", issuer: "Vanguard", er: 0.03, holdings: 505, top10: 37, aum: 680, since: 2010, top: ["NVDA", "MSFT", "AAPL", "AMZN", "META", "AVGO", "GOOGL"], sectors: { tech: 33, financials: 13, discretionary: 10, comm: 10, health: 9, industrials: 8, staples: 5, energy: 3, utilities: 2, realestate: 2, materials: 2 } },
  { t: "IVV", name: "iShares Core S&P 500 ETF", cat: "us_broad", issuer: "BlackRock", er: 0.03, holdings: 504, top10: 37, aum: 620, since: 2000, top: ["NVDA", "MSFT", "AAPL", "AMZN", "META", "AVGO", "GOOGL"], sectors: { tech: 33, financials: 13, discretionary: 10, comm: 10, health: 9, industrials: 8, staples: 5, energy: 3, utilities: 2, realestate: 2, materials: 2 } },
  { t: "VTI", name: "Vanguard Total Stock Market ETF", cat: "us_broad", issuer: "Vanguard", er: 0.03, holdings: 3550, top10: 32, aum: 480, since: 2001, top: ["NVDA", "MSFT", "AAPL", "AMZN", "META", "AVGO", "GOOGL"], sectors: { tech: 32, financials: 13, discretionary: 10, comm: 9, health: 9, industrials: 9, staples: 5, energy: 3, utilities: 2, realestate: 3, materials: 2 } },
  { t: "DIA", name: "SPDR Dow Jones Industrial Average ETF", cat: "us_broad", issuer: "State Street", er: 0.16, holdings: 30, top10: 55, aum: 37, since: 1998, top: ["GS", "MSFT", "HD", "CAT", "V", "UNH"], sectors: { financials: 26, tech: 20, industrials: 14, discretionary: 14, health: 11, staples: 6, comm: 4, materials: 2, energy: 3 } },
  { t: "IWM", name: "iShares Russell 2000 ETF", cat: "us_broad", issuer: "BlackRock", er: 0.19, holdings: 1970, top10: 4, aum: 65, since: 2000, top: [], sectors: { financials: 18, industrials: 17, health: 16, tech: 14, discretionary: 10, realestate: 6, energy: 5, materials: 4, utilities: 3, staples: 3, comm: 3 } },
  { t: "VT", name: "Vanguard Total World Stock ETF", cat: "intl", issuer: "Vanguard", er: 0.06, holdings: 9800, top10: 20, aum: 50, since: 2008, top: ["NVDA", "MSFT", "AAPL", "AMZN", "META"], sectors: { tech: 26, financials: 16, industrials: 11, discretionary: 11, health: 9, comm: 8, staples: 6, energy: 4, materials: 4, utilities: 3, realestate: 3 } },
  { t: "VXUS", name: "Vanguard Total International Stock ETF", cat: "intl", issuer: "Vanguard", er: 0.05, holdings: 8600, top10: 10, aum: 100, since: 2011, top: [], sectors: { financials: 22, industrials: 15, tech: 14, discretionary: 11, health: 8, staples: 6, materials: 7, comm: 6, energy: 5, utilities: 3, realestate: 3 } },
  { t: "VEA", name: "Vanguard FTSE Developed Markets ETF", cat: "intl", issuer: "Vanguard", er: 0.03, holdings: 3900, top10: 10, aum: 140, since: 2007, top: [], sectors: { financials: 22, industrials: 18, health: 10, discretionary: 10, tech: 10, staples: 7, materials: 7, comm: 5, energy: 5, utilities: 3, realestate: 3 } },
  { t: "VWO", name: "Vanguard FTSE Emerging Markets ETF", cat: "intl", issuer: "Vanguard", er: 0.07, holdings: 6000, top10: 25, aum: 90, since: 2005, top: [], sectors: { financials: 22, tech: 22, discretionary: 13, comm: 9, industrials: 8, materials: 6, energy: 5, staples: 5, health: 4, utilities: 3, realestate: 3 } },
  { t: "EFA", name: "iShares MSCI EAFE ETF", cat: "intl", issuer: "BlackRock", er: 0.35, holdings: 720, top10: 13, aum: 60, since: 2001, top: [], sectors: { financials: 23, industrials: 18, health: 11, discretionary: 10, tech: 8, staples: 8, materials: 6, comm: 5, energy: 4, utilities: 4, realestate: 2 } },
  { t: "EEM", name: "iShares MSCI Emerging Markets ETF", cat: "intl", issuer: "BlackRock", er: 0.70, holdings: 1200, top10: 26, aum: 18, since: 2003, top: [], sectors: { tech: 24, financials: 23, discretionary: 13, comm: 10, industrials: 7, materials: 6, energy: 4, staples: 4, health: 3, utilities: 3, realestate: 2 } },
  { t: "QQQ", name: "Invesco QQQ Trust", cat: "growth", issuer: "Invesco", er: 0.20, holdings: 101, top10: 52, aum: 360, since: 1999, top: ["NVDA", "MSFT", "AAPL", "AMZN", "AVGO", "META", "GOOGL", "TSLA", "NFLX", "COST"], sectors: { tech: 52, comm: 16, discretionary: 14, staples: 5, health: 5, industrials: 4, utilities: 1, materials: 1, energy: 1, financials: 1 } },
  { t: "QQQM", name: "Invesco NASDAQ 100 ETF", cat: "growth", issuer: "Invesco", er: 0.15, holdings: 101, top10: 52, aum: 55, since: 2020, top: ["NVDA", "MSFT", "AAPL", "AMZN", "AVGO", "META", "GOOGL", "TSLA", "NFLX", "COST"], sectors: { tech: 52, comm: 16, discretionary: 14, staples: 5, health: 5, industrials: 4, utilities: 1, materials: 1, energy: 1, financials: 1 } },
  { t: "VUG", name: "Vanguard Growth ETF", cat: "growth", issuer: "Vanguard", er: 0.04, holdings: 165, top10: 60, aum: 180, since: 2004, top: ["NVDA", "MSFT", "AAPL", "AMZN", "META", "AVGO", "GOOGL", "TSLA"], sectors: { tech: 55, discretionary: 17, comm: 12, industrials: 5, health: 4, financials: 5, staples: 1, materials: 1 } },
  { t: "VTV", name: "Vanguard Value ETF", cat: "dividend", issuer: "Vanguard", er: 0.04, holdings: 335, top10: 21, aum: 200, since: 2004, top: ["JPM", "XOM", "WMT", "JNJ", "PG", "HD"], sectors: { financials: 23, health: 15, industrials: 14, staples: 11, tech: 9, energy: 7, utilities: 6, discretionary: 5, materials: 4, comm: 3, realestate: 3 } },
  { t: "SCHD", name: "Schwab U.S. Dividend Equity ETF", cat: "dividend", issuer: "Schwab", er: 0.06, holdings: 103, top10: 41, aum: 70, since: 2011, top: ["CVX", "COP", "PEP", "KO", "MO", "ABBV", "AMGN", "VZ", "CSCO", "TXN"], sectors: { energy: 19, staples: 19, health: 15, industrials: 12, financials: 9, tech: 9, discretionary: 8, comm: 5, materials: 3, utilities: 1 } },
  { t: "VIG", name: "Vanguard Dividend Appreciation ETF", cat: "dividend", issuer: "Vanguard", er: 0.05, holdings: 340, top10: 32, aum: 95, since: 2006, top: ["AVGO", "MSFT", "AAPL", "JPM", "LLY", "V", "MA", "COST", "WMT"], sectors: { tech: 27, financials: 22, health: 14, industrials: 11, staples: 11, discretionary: 6, materials: 4, utilities: 3, energy: 2 } },
  { t: "VYM", name: "Vanguard High Dividend Yield ETF", cat: "dividend", issuer: "Vanguard", er: 0.06, holdings: 580, top10: 24, aum: 65, since: 2006, top: ["AVGO", "JPM", "XOM", "WMT", "PG", "JNJ", "HD", "ABBV"], sectors: { financials: 21, tech: 13, health: 12, industrials: 12, staples: 12, energy: 9, utilities: 7, discretionary: 6, comm: 4, materials: 3, realestate: 1 } },
  { t: "JEPI", name: "JPMorgan Equity Premium Income ETF", cat: "dividend", issuer: "JPMorgan", er: 0.35, holdings: 125, top10: 17, aum: 40, since: 2020, top: [], sectors: { tech: 15, health: 14, financials: 13, industrials: 13, staples: 11, discretionary: 9, comm: 6, utilities: 6, energy: 4, materials: 3, realestate: 3 } },
  { t: "XLK", name: "Technology Select Sector SPDR", cat: "sector", issuer: "State Street", er: 0.08, holdings: 70, top10: 62, aum: 75, since: 1998, top: ["NVDA", "MSFT", "AAPL", "AVGO", "ORCL", "CRM"], sectors: { tech: 100 } },
  { t: "VGT", name: "Vanguard Information Technology ETF", cat: "sector", issuer: "Vanguard", er: 0.09, holdings: 320, top10: 60, aum: 95, since: 2004, top: ["NVDA", "MSFT", "AAPL", "AVGO", "ORCL", "CRM"], sectors: { tech: 100 } },
  { t: "SMH", name: "VanEck Semiconductor ETF", cat: "sector", issuer: "VanEck", er: 0.35, holdings: 26, top10: 72, aum: 25, since: 2011, top: ["NVDA", "AVGO", "AMD", "QCOM", "TXN", "MU", "INTC"], sectors: { tech: 100 } },
  { t: "XLF", name: "Financial Select Sector SPDR", cat: "sector", issuer: "State Street", er: 0.08, holdings: 73, top10: 55, aum: 50, since: 1998, top: ["JPM", "V", "MA", "BAC", "WFC", "GS"], sectors: { financials: 100 } },
  { t: "XLV", name: "Health Care Select Sector SPDR", cat: "sector", issuer: "State Street", er: 0.08, holdings: 61, top10: 55, aum: 35, since: 1998, top: ["LLY", "UNH", "JNJ", "ABBV", "MRK", "TMO"], sectors: { health: 100 } },
  { t: "XLE", name: "Energy Select Sector SPDR", cat: "sector", issuer: "State Street", er: 0.08, holdings: 23, top10: 75, aum: 28, since: 1998, top: ["XOM", "CVX", "COP", "EOG", "SLB"], sectors: { energy: 100 } },
  { t: "BND", name: "Vanguard Total Bond Market ETF", cat: "bonds", issuer: "Vanguard", er: 0.03, holdings: 11000, top10: 4, aum: 130, since: 2007, top: [], sectors: null },
  { t: "AGG", name: "iShares Core U.S. Aggregate Bond ETF", cat: "bonds", issuer: "BlackRock", er: 0.03, holdings: 12500, top10: 4, aum: 125, since: 2003, top: [], sectors: null },
  { t: "TLT", name: "iShares 20+ Year Treasury Bond ETF", cat: "bonds", issuer: "BlackRock", er: 0.15, holdings: 40, top10: 40, aum: 50, since: 2002, top: [], sectors: null },
  { t: "VNQ", name: "Vanguard Real Estate ETF", cat: "realestate", issuer: "Vanguard", er: 0.13, holdings: 155, top10: 45, aum: 35, since: 2004, top: ["PLD", "AMT", "O", "SPG"], sectors: { realestate: 100 } },
  { t: "GLD", name: "SPDR Gold Shares", cat: "commodity", issuer: "State Street", er: 0.40, holdings: 1, top10: 100, aum: 100, since: 2004, top: [], sectors: null },
  { t: "IAU", name: "iShares Gold Trust", cat: "commodity", issuer: "BlackRock", er: 0.25, holdings: 1, top10: 100, aum: 45, since: 2005, top: [], sectors: null },
  { t: "ARKK", name: "ARK Innovation ETF", cat: "thematic", issuer: "ARK Invest", er: 0.75, holdings: 40, top10: 60, aum: 6, since: 2014, top: ["TSLA", "PLTR"], sectors: { tech: 40, discretionary: 20, health: 20, comm: 12, financials: 8 } },
  { t: "IBIT", name: "iShares Bitcoin Trust", cat: "thematic", issuer: "BlackRock", er: 0.25, holdings: 1, top10: 100, aum: 70, since: 2024, top: [], sectors: null, crypto: "bitcoin" },
];

/** Asset classes for the portfolio analyst: what each ETF category mostly is. */
export const ETF_ASSET_CLASS = { us_broad: "equity", intl: "equity", growth: "equity", dividend: "equity", sector: "equity", thematic: "equity", realestate: "equity", bonds: "bonds", commodity: "gold" };

export const stockByTicker = (tk) => STOCKS.find((s) => s[0] === tk) || null;
export const etfByTicker = (tk) => ETFS.find((e) => e.t === tk) || null;
export const ALL_TICKERS = [...STOCKS.map((s) => s[0]), ...ETFS.map((e) => e.t)];
