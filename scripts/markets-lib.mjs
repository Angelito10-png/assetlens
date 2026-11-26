/**
 * Pure helpers for the markets snapshot (scripts/fetch-markets.mjs):
 * fundamentals from SEC EDGAR "companyfacts" JSON and recent filings from the
 * "submissions" JSON. No network here, so everything is unit-tested.
 */

const DAY = 864e5;
const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);
const r2 = (v) => (v === null ? null : Math.round(v * 100) / 100);

/* ------------------------------------------------------------ fundamentals */

const days = (a, b) => (Date.parse(b) - Date.parse(a)) / DAY;

/** Facts of one us-gaap concept in a unit, deduplicated by period (latest filing wins). */
function factsOf(cf, concept, unit = "USD") {
  const node = cf && cf.facts && ((cf.facts["us-gaap"] || {})[concept] || (cf.facts.dei || {})[concept]);
  const list = node && node.units && node.units[unit];
  if (!Array.isArray(list)) return [];
  const byPeriod = new Map();
  for (const f of list) {
    if (num(f.val) === null || !f.end || !/^10-[KQ]/.test(f.form || "")) continue;
    const key = (f.start || "") + "|" + f.end;
    const prev = byPeriod.get(key);
    if (!prev || (f.filed || "") > (prev.filed || "")) byPeriod.set(key, f);
  }
  return [...byPeriod.values()].sort((a, b) => (a.end < b.end ? -1 : a.end > b.end ? 1 : 0));
}

/**
 * The concept, among several candidate names, that has the most recent data.
 * For flows, a concept with fiscal-year values beats one with only quarters,
 * since companies sometimes tag a few quarters under a different name.
 */
function bestConcept(cf, concepts, unit, flow = false) {
  const lastEnd = (f, annualOnly) => { const l = annualOnly ? f.filter((x) => x.start && days(x.start, x.end) > 350) : f; return l.length ? l[l.length - 1].end : "0000"; }; // "0000" so a concept without annual data never wins on the date of its quarters
  let best = [];
  for (const c of concepts) {
    const f = factsOf(cf, c, unit);
    if (!f.length) continue;
    const key = (x) => (flow ? lastEnd(x, true) + "|" : "") + lastEnd(x, false);
    if (!best.length || key(f) > key(best)) best = f;
  }
  return best;
}

/**
 * For a flow concept (revenue, income, cash flow): fiscal-year values (newest
 * first) and a trailing-twelve-month value = last fiscal year + this year's
 * year-to-date − last year's year-to-date.
 */
export function flowSeries(facts) {
  const annual = facts.filter((f) => f.start && days(f.start, f.end) > 350 && days(f.start, f.end) < 380).sort((a, b) => (a.end < b.end ? 1 : -1));
  // keep one value per fiscal-year end
  const years = [];
  for (const f of annual) if (!years.some((y) => Math.abs(days(y.end, f.end)) < 60)) years.push(f);
  if (!years.length) return { years: [], ttm: null, ttmEnd: null };
  const fy = years[0];
  const ytd = facts.filter((f) => f.start && f.end > fy.end && days(f.start, f.end) < 350 && days(f.start, f.end) > 80 && Math.abs(days(fy.end, f.start)) < 15)
    .sort((a, b) => (a.end < b.end ? 1 : -1))[0];
  let ttm = fy.val, ttmEnd = fy.end;
  if (ytd) {
    const len = days(ytd.start, ytd.end);
    const prior = facts.find((f) => f.start && Math.abs(days(f.end, ytd.end) - 365) < 12 && Math.abs(days(f.start, f.end) - len) < 12);
    if (prior) { ttm = fy.val + ytd.val - prior.val; ttmEnd = ytd.end; }
  }
  return { years: years.map((y) => ({ end: y.end, val: y.val })), ttm, ttmEnd };
}

/** Latest value of an instant concept (balance sheet), with its date. */
function latestInstant(facts) {
  const inst = facts.filter((f) => !f.start);
  return inst.length ? inst[inst.length - 1] : null;
}

/**
 * Shares outstanding: the cover-page count (dei) when it is recent, otherwise
 * the latest diluted weighted-average count. Some filings tag the weighted
 * count in millions by mistake, so values under a million are ignored.
 */
function pickShares(weighted, dei, bsDate) {
  const ok = weighted.filter((f) => f.val > 1e6);
  const w = ok.length ? ok[ok.length - 1].val : null;
  // Companies with several share classes report one class on the cover page; the diluted count covers all of them.
  if (dei && dei.val > 1e6 && (!bsDate || Math.abs(days(dei.end, bsDate)) < 200) && !(w && dei.val < 0.8 * w)) return dei.val;
  // An old cover-page count (Visa's dates from 2010) is worse than none.
  return w ?? (dei && dei.val > 1e6 && (!bsDate || Math.abs(days(dei.end, bsDate)) < 400) ? dei.val : null);
}

const REVENUE = ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet", "RevenueFromContractWithCustomerIncludingAssessedTax", "RevenuesNetOfInterestExpense", "SalesRevenueGoodsNet"];

/**
 * SEC companyfacts JSON → the fundamentals the stock factors read. Flows are
 * trailing twelve months where the filings allow it, otherwise the last fiscal
 * year; growth compares fiscal years. Values the filings don't carry are null.
 */
export function fundamentals(cf) {
  if (!cf || !cf.facts) return null;
  const flow = (concepts, unit) => flowSeries(bestConcept(cf, concepts, unit, true));
  const rev = flow(REVENUE), ni = flow(["NetIncomeLoss", "ProfitLoss"]), op = flow(["OperatingIncomeLoss"]);
  const gp = flow(["GrossProfit"]);
  const eps = flow(["EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted", "EarningsPerShareBasic"], "USD/shares");
  const ocf = flow(["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"]);
  const capex = flow(["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"]);
  const shares = bestConcept(cf, ["WeightedAverageNumberOfDilutedSharesOutstanding"], "shares").filter((f) => f.start);
  const sharesDei = latestInstant(bestConcept(cf, ["EntityCommonStockSharesOutstanding"], "shares"));
  const equityF = latestInstant(bestConcept(cf, ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"]));
  const assetsF = latestInstant(bestConcept(cf, ["Assets"]));
  const cashF = latestInstant(bestConcept(cf, ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"]));
  const bsDate = equityF ? equityF.end : assetsF ? assetsF.end : null;
  // Debt at the latest balance-sheet date (or, failing that, the last annual report).
  // Companies tag debt in different ways, so try the total first, then long-term + short-term parts.
  const at = (concepts) => {
    for (const maxDays of [100, 400]) for (const c of concepts) { const f = latestInstant(factsOf(cf, c)); if (f && bsDate && Math.abs(days(f.end, bsDate)) < maxDays) return f.val; }
    return null;
  };
  const sum = (...v) => (v.some((x) => x !== null) ? v.reduce((a, x) => a + (x || 0), 0) : null);
  const total = at(["DebtLongtermAndShorttermCombinedAmount"]);
  const ltFull = at(["LongTermDebt"]);
  const st = sum(at(["ShortTermBorrowings"]), at(["CommercialPaper"]), at(["OtherShortTermBorrowings"]));
  const nonCur = sum(at(["LongTermDebtNoncurrent", "LongTermDebtAndCapitalLeaseObligations", "LongTermDebtAndCapitalLeaseObligationsNoncurrent"]), at(["LongTermNotesPayable"]), at(["UnsecuredLongTermDebt"]), at(["SecuredLongTermDebt"]), at(["SubordinatedDebt"]), at(["SecuredDebt"]));
  const cur = at(["DebtCurrent"]) ?? sum(at(["LongTermDebtCurrent", "LongTermDebtAndCapitalLeaseObligationsCurrent"]), at(["NotesPayableCurrent"]), at(["UnsecuredDebtCurrent"]), st);
  let debt = total ?? (ltFull !== null ? ltFull + (st || 0) : sum(nonCur, cur));
  const DEBT_TAGS = ["DebtLongtermAndShorttermCombinedAmount", "LongTermDebt", "LongTermDebtNoncurrent", "LongTermDebtAndCapitalLeaseObligations", "LongTermNotesPayable", "DebtCurrent", "ShortTermBorrowings", "CommercialPaper", "UnsecuredLongTermDebt", "SecuredDebt", "ConvertibleNotesPayable"];
  const debtFree = debt === null && !DEBT_TAGS.some((c) => factsOf(cf, c).length);
  if (debtFree) debt = 0; // the company has never reported borrowings
  const g = (s, k = 1) => (s.years.length > k && s.years[k].val > 0 ? (s.years[0].val / s.years[k].val) ** (1 / k) * 100 - 100 : null);
  const fresh = (s) => (s.ttmEnd && bsDate && days(s.ttmEnd, bsDate) > 500 ? null : s.ttm); // ignore concepts the company stopped reporting
  const revenue = fresh(rev), netIncome = fresh(ni);
  const sharesN = pickShares(shares, sharesDei, bsDate);
  return {
    entity: cf.entityName || null,
    periodEnd: rev.ttmEnd || ni.ttmEnd || bsDate,
    fiscalYearEnd: (rev.years[0] || ni.years[0] || {}).end || null,
    revenue, netIncome, opIncome: fresh(op), grossProfit: fresh(gp),
    eps: fresh(eps) ?? (netIncome !== null && sharesN ? netIncome / sharesN : null), fcf: fresh(ocf) !== null ? fresh(ocf) - (fresh(capex) || 0) : null,
    revGrowth: r2(g(rev)), revCagr3: r2(g(rev, 3)), epsGrowth: eps.years.length > 1 && eps.years[1].val > 0 ? r2((eps.years[0].val / eps.years[1].val - 1) * 100) : null,
    niGrowth: r2(g(ni)),
    shares: sharesN, debtFree,
    equity: equityF ? equityF.val : null, assets: assetsF ? assetsF.val : null, cash: cashF ? cashF.val : null, debt,
    balanceDate: bsDate,
  };
}

const FORM_KEYS = { "10-K": "annual", "10-Q": "quarterly", "8-K": "event", "DEF 14A": "proxy" };
/**
 * SEC "submissions" JSON → the company's latest filings (annual and quarterly
 * reports, material-event 8-Ks, proxy statements), newest first, with links
 * to the filing documents on sec.gov.
 */
export function recentFilings(sub, max = 6) {
  const r = sub && sub.filings && sub.filings.recent;
  if (!r || !Array.isArray(r.form)) return [];
  const cik = String(Number(sub.cik));
  const out = [];
  for (let i = 0; i < r.form.length && out.length < max; i++) {
    const form = r.form[i];
    if (!FORM_KEYS[form]) continue;
    const acc = String(r.accessionNumber[i] || "");
    const doc = r.primaryDocument && r.primaryDocument[i];
    if (!/^[\d-]+$/.test(acc)) continue;
    const base = `https://www.sec.gov/Archives/edgar/data/${cik}/${acc.replace(/-/g, "")}/`;
    out.push({ form, kind: FORM_KEYS[form], date: r.filingDate[i] || null, items: form === "8-K" ? String((r.items && r.items[i]) || "") : "", url: doc && /^[\w.-]+$/.test(doc) ? base + doc : base });
  }
  return out;
}
