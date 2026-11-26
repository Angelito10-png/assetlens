/**
 * Translations for the score backtest (crypto page) and the portfolio history (portfolio page).
 * Merged into the app dictionaries like i18n-site.js.
 */
import { LANGS } from "./i18n.js?v=__V__";

const en = {
  // ---- score backtest ----
  sb_title: "Did high scores pay off?",
  sb_intro: (n, u, h) => `A test of the score against the past: on ${n} dates over the last year, the ${u} largest coins were scored using only the data available on that day, split into thirds by score, and each third was followed for the next ${h} days.`,
  sb_profile: (p) => `Results for the ${p} profile (change it above).`,
  sb_win: (p, k, m, gap, h) => `For the ${p} profile, the top-scoring third beat the bottom third on ${k} of ${m} dates, by ${gap} percentage points on average over ${h} days.`,
  sb_mixed: (p, k, m) => `For the ${p} profile the result is mixed: the top-scoring third beat the bottom third on ${k} of ${m} dates, so the score did not reliably pick the better performers in this period.`,
  sb_lose: (p, k, m, gap) => `For the ${p} profile the score did not help in this period: the top-scoring third beat the bottom third on only ${k} of ${m} dates and trailed it by ${gap} percentage points on average.`,
  sb_btc: (k, m) => `Against simply holding Bitcoin, the top third did better on ${k} of ${m} dates.`,
  sb_ic: (v) => `Rank correlation between score and later return: ${v} on average (0 means no link, 1 a perfect one; in finance, a steady 0.05 to 0.1 is already notable).`,
  sb_k_top: "Top third", sb_k_bottom: "Bottom third", sb_k_all: "All coins", sb_k_btc: "Bitcoin",
  sb_k_avg: (h) => `average return over ${h} days`,
  sb_chartTitle: (d) => `Scored on ${d}, held until today`,
  sb_chartNote: "Growth of each group with equal amounts in every coin, compared with holding Bitcoin.",
  sb_chartAria: "Growth of the top-scoring third, the bottom third and Bitcoin since the scoring date",
  sb_dates: "Every scoring date",
  sb_col_date: "Scored on", sb_col_top: "Top third", sb_col_bottom: "Bottom third", sb_col_btc: "Bitcoin", sb_col_ic: "Rank corr.",
  sb_picks: (d) => `Coins scored on ${d}`,
  sb_col_coin: "Coin", sb_col_score: "Score then", sb_col_ret: "Return since", sb_col_group: "Group",
  sb_g_top: "top", sb_g_mid: "middle", sb_g_bottom: "bottom",
  sb_method: "How this test works, and its limits",
  sb_m1: "Only price, market cap and volume history are freely available for past dates, so the score here uses three of the seven factors: size, momentum and stability. Tokenomics, development, maturity and community are left out, because their past values can't be rebuilt. The live score uses all seven.",
  sb_m2: "\"Distance from the high\" uses the highest price in the year of data, not the true all-time high, and the one-year change isn't available.",
  sb_m3: (u) => `Survivorship bias: the coins are today's ${u} largest (without stablecoins and wrapped tokens). Coins that collapsed and left the top are missing, which flatters every group's return.`,
  sb_m4: (e, h) => `Scoring dates are ${e} days apart but each group is held for ${h} days, so the windows overlap and the results are not independent. One year (the free data limit) is a single market phase. Past results say little about the future.`,
  sb_m5: "Stocks and ETFs aren't included yet: the free price licence doesn't allow publishing their price history. The same test can switch on for them once that is approved.",
  sb_source: (d) => `Data: CoinGecko, rebuilt weekly (last on ${d}). Educational, not investment advice.`,
  sb_missing: "The backtest hasn't been built yet. It is computed once a week when the site is published.",

  // ---- portfolio history ----
  ph_title: "How this mix did",
  ph_note: (d) => `Today's mix, as if bought on ${d} and held without rebalancing, with dividends reinvested.`,
  ph_years: (n) => (n === 1 ? "1 year" : `${n} years`),
  ph_port: "Your mix", ph_spy: "S&P 500 (SPY)",
  ph_aria: "Growth of the portfolio compared with the S&P 500",
  ph_r_total: "Return", ph_r_cagr: "Return a year", ph_r_dd: "Largest drop", ph_r_vol: "Volatility a year",
  ph_short: (syms, d) => `Starts on ${d}: ${syms} has no older prices (crypto has one year of free history).`,
  ph_missing: (syms) => `Left out (no prices loaded): ${syms}. Add an Alpha Vantage key below to include them.`,
  ph_noBench: "Add an Alpha Vantage key below to compare with the S&P 500.",
  ph_covered: (p) => `Covers ${p}% of the portfolio's value.`,
  ph_none: "No price history is loaded yet. Add an Alpha Vantage key below (stocks and ETFs) or crypto holdings to see the history.",
  ph_vs: (d) => (d >= 0 ? `${d.toFixed(1)} points ahead of the S&P 500` : `${Math.abs(d).toFixed(1)} points behind the S&P 500`),
  ph_ddNote: "Largest drop: the worst fall from a peak to a later low. Volatility: how much weekly returns swing, scaled to a year.",
};

const el = {
  // ---- score backtest ----
  sb_title: "Τα υψηλά σκορ απέδωσαν;",
  sb_intro: (n, u, h) => `Ένα τεστ του σκορ στο παρελθόν: σε ${n} ημερομηνίες του τελευταίου έτους, τα ${u} μεγαλύτερα νομίσματα βαθμολογήθηκαν μόνο με τα στοιχεία που υπήρχαν εκείνη τη μέρα, χωρίστηκαν σε τρίτα με βάση το σκορ, και κάθε τρίτο παρακολουθήθηκε για τις επόμενες ${h} μέρες.`,
  sb_profile: (p) => `Αποτελέσματα για το προφίλ ${p} (αλλάζει από πάνω).`,
  sb_win: (p, k, m, gap, h) => `Για το προφίλ ${p}, το τρίτο με τα υψηλότερα σκορ ξεπέρασε το χαμηλότερο τρίτο σε ${k} από ${m} ημερομηνίες, κατά ${gap} ποσοστιαίες μονάδες κατά μέσο όρο σε ${h} μέρες.`,
  sb_mixed: (p, k, m) => `Για το προφίλ ${p} το αποτέλεσμα είναι μικτό: το υψηλότερο τρίτο ξεπέρασε το χαμηλότερο σε ${k} από ${m} ημερομηνίες, άρα το σκορ δεν ξεχώρισε σταθερά τα καλύτερα νομίσματα σε αυτή την περίοδο.`,
  sb_lose: (p, k, m, gap) => `Για το προφίλ ${p} το σκορ δεν βοήθησε σε αυτή την περίοδο: το υψηλότερο τρίτο ξεπέρασε το χαμηλότερο μόνο σε ${k} από ${m} ημερομηνίες και έμεινε πίσω κατά ${gap} ποσοστιαίες μονάδες κατά μέσο όρο.`,
  sb_btc: (k, m) => `Σε σχέση με το να κρατάς απλώς Bitcoin, το υψηλότερο τρίτο τα πήγε καλύτερα σε ${k} από ${m} ημερομηνίες.`,
  sb_ic: (v) => `Συσχέτιση κατάταξης ανάμεσα σε σκορ και μετέπειτα απόδοση: ${v} κατά μέσο όρο (0 σημαίνει καμία σχέση, 1 τέλεια· στα οικονομικά, ένα σταθερό 0,05 έως 0,1 θεωρείται ήδη αξιόλογο).`,
  sb_k_top: "Υψηλό τρίτο", sb_k_bottom: "Χαμηλό τρίτο", sb_k_all: "Όλα τα νομίσματα", sb_k_btc: "Bitcoin",
  sb_k_avg: (h) => `μέση απόδοση σε ${h} μέρες`,
  sb_chartTitle: (d) => `Βαθμολογία στις ${d}, διακράτηση ως σήμερα`,
  sb_chartNote: "Πορεία κάθε ομάδας με ίσα ποσά σε κάθε νόμισμα, σε σύγκριση με το να κρατάς Bitcoin.",
  sb_chartAria: "Πορεία του υψηλού τρίτου, του χαμηλού τρίτου και του Bitcoin από την ημερομηνία βαθμολογίας",
  sb_dates: "Όλες οι ημερομηνίες βαθμολογίας",
  sb_col_date: "Βαθμολογία", sb_col_top: "Υψηλό τρίτο", sb_col_bottom: "Χαμηλό τρίτο", sb_col_btc: "Bitcoin", sb_col_ic: "Συσχ. κατάταξης",
  sb_picks: (d) => `Τα νομίσματα όπως βαθμολογήθηκαν στις ${d}`,
  sb_col_coin: "Νόμισμα", sb_col_score: "Σκορ τότε", sb_col_ret: "Απόδοση από τότε", sb_col_group: "Ομάδα",
  sb_g_top: "υψηλό", sb_g_mid: "μεσαίο", sb_g_bottom: "χαμηλό",
  sb_method: "Πώς γίνεται το τεστ και τα όριά του",
  sb_m1: "Για παλιές ημερομηνίες υπάρχει δωρεάν μόνο ιστορικό τιμής, κεφαλαιοποίησης και όγκου, οπότε το σκορ εδώ χρησιμοποιεί τρεις από τους επτά παράγοντες: μέγεθος, momentum και σταθερότητα. Τα tokenomics, η ανάπτυξη, η ωριμότητα και η κοινότητα μένουν έξω, γιατί οι παλιές τιμές τους δεν μπορούν να ανακατασκευαστούν. Το ζωντανό σκορ χρησιμοποιεί και τους επτά.",
  sb_m2: "Η «απόσταση από το υψηλό» μετράει από την υψηλότερη τιμή του έτους δεδομένων, όχι από το πραγματικό ιστορικό υψηλό, και η μεταβολή ενός έτους δεν είναι διαθέσιμη.",
  sb_m3: (u) => `Μεροληψία επιβίωσης: τα νομίσματα είναι τα ${u} μεγαλύτερα σήμερα (χωρίς stablecoins και wrapped tokens). Όσα κατέρρευσαν και βγήκαν από την κορυφή λείπουν, κάτι που φουσκώνει την απόδοση όλων των ομάδων.`,
  sb_m4: (e, h) => `Οι ημερομηνίες βαθμολογίας απέχουν ${e} μέρες, αλλά κάθε ομάδα κρατιέται ${h} μέρες, άρα τα διαστήματα επικαλύπτονται και τα αποτελέσματα δεν είναι ανεξάρτητα. Ένα έτος (το όριο των δωρεάν δεδομένων) είναι μία μόνο φάση της αγοράς. Τα παλιά αποτελέσματα λένε λίγα για το μέλλον.`,
  sb_m5: "Οι μετοχές και τα ETF δεν περιλαμβάνονται ακόμα: η δωρεάν άδεια τιμών δεν επιτρέπει να δημοσιεύεται το ιστορικό τους. Το ίδιο τεστ μπορεί να ενεργοποιηθεί και γι' αυτά όταν εγκριθεί.",
  sb_source: (d) => `Δεδομένα: CoinGecko, ανανεώνεται κάθε εβδομάδα (τελευταία στις ${d}). Εκπαιδευτικό, όχι επενδυτική συμβουλή.`,
  sb_missing: "Το backtest δεν έχει υπολογιστεί ακόμα. Υπολογίζεται μία φορά την εβδομάδα, όταν δημοσιεύεται το site.",

  // ---- portfolio history ----
  ph_title: "Πώς τα πήγε αυτό το μείγμα",
  ph_note: (d) => `Το σημερινό μείγμα, σαν να είχε αγοραστεί στις ${d} και να κρατήθηκε χωρίς αναπροσαρμογή, με επανεπένδυση μερισμάτων.`,
  ph_years: (n) => (n === 1 ? "1 έτος" : `${n} έτη`),
  ph_port: "Το μείγμα σου", ph_spy: "S&P 500 (SPY)",
  ph_aria: "Πορεία του χαρτοφυλακίου σε σύγκριση με το S&P 500",
  ph_r_total: "Απόδοση", ph_r_cagr: "Απόδοση ανά έτος", ph_r_dd: "Μεγαλύτερη πτώση", ph_r_vol: "Μεταβλητότητα ανά έτος",
  ph_short: (syms, d) => `Ξεκινά στις ${d}: για ${syms} δεν υπάρχουν παλαιότερες τιμές (τα κρυπτονομίσματα έχουν ένα έτος δωρεάν ιστορικού).`,
  ph_missing: (syms) => `Εκτός (δεν φορτώθηκαν τιμές): ${syms}. Πρόσθεσε κλειδί Alpha Vantage παρακάτω για να μπουν κι αυτά.`,
  ph_noBench: "Πρόσθεσε κλειδί Alpha Vantage παρακάτω για σύγκριση με το S&P 500.",
  ph_covered: (p) => `Καλύπτει το ${p}% της αξίας του χαρτοφυλακίου.`,
  ph_none: "Δεν έχει φορτωθεί ακόμα ιστορικό τιμών. Πρόσθεσε κλειδί Alpha Vantage παρακάτω (μετοχές και ETF) ή κρυπτονομίσματα για να δεις το ιστορικό.",
  ph_vs: (d) => (d >= 0 ? `${d.toFixed(1)} μονάδες πάνω από το S&P 500` : `${Math.abs(d).toFixed(1)} μονάδες κάτω από το S&P 500`),
  ph_ddNote: "Μεγαλύτερη πτώση: η χειρότερη πτώση από μια κορυφή σε μεταγενέστερο χαμηλό. Μεταβλητότητα: πόσο κυμαίνονται οι εβδομαδιαίες αποδόσεις, αναγμένο σε έτος.",
};

Object.assign(LANGS.en, en);
Object.assign(LANGS.el, el);
export const BACKTEST_KEYS = { en, el };
