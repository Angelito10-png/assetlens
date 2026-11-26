/**
 * What the help assistant knows: short, checked explanations of the app and its terms,
 * in English and Greek. Used two ways:
 *  - without AI (signed out, or the AI service is off): the best matches are shown as the answer;
 *  - with AI: the best matches are sent along with the question, so answers stay grounded in the app.
 */

export const KB = [
  // ---- the app ----
  { id: "score", k: "score scoring 1 10 rating verdict βαθμος βαθμολογια ετυμηγορια πως βγαινει",
    en: ["How is the score calculated?", "Each factor gets a sub-score from 0 to 10 using fixed thresholds. Your investor profile sets how much each factor counts. The weighted average becomes the final score: 1 + 0.9 × average, so the scale runs from 1 to 10. Missing data is skipped and its weight is shared among the other factors; the page shows the data coverage."],
    el: ["Πώς βγαίνει ο βαθμός;", "Κάθε παράγοντας παίρνει υποβαθμό από 0 ως 10 με σταθερά όρια. Το προφίλ επενδυτή ορίζει πόσο μετράει ο καθένας. Ο σταθμισμένος μέσος όρος γίνεται ο τελικός βαθμός: 1 + 0,9 × μέσος όρος, άρα η κλίμακα πάει από 1 ως 10. Ό,τι λείπει παραλείπεται και το βάρος του μοιράζεται στους υπόλοιπους· η σελίδα δείχνει πόσο πλήρη είναι τα δεδομένα."] },
  { id: "profiles", k: "profile aggressive defensive long-term longterm προφιλ επιθετικο αμυντικο μακροπροθεσμο τυπος επενδυτη quiz κουιζ",
    en: ["What do the investor profiles mean?", "Aggressive: chases growth and momentum and accepts big swings. Defensive: wants stability, low volatility, healthy finances and income. Long-term: holds for many years and cares about quality, low costs and durable growth. The same asset can score well for one profile and poorly for another. Not sure? The 5-question quiz picks one for you."],
    el: ["Τι σημαίνουν τα προφίλ επενδυτή;", "Επιθετικό: κυνηγά ανάπτυξη και momentum και αντέχει μεγάλες διακυμάνσεις. Αμυντικό: θέλει σταθερότητα, χαμηλή μεταβλητότητα, υγιή οικονομικά και εισόδημα. Μακροπρόθεσμο: κρατά για πολλά χρόνια και νοιάζεται για ποιότητα, χαμηλό κόστος και διαρκή ανάπτυξη. Η ίδια επένδυση μπορεί να βαθμολογείται καλά για ένα προφίλ και άσχημα για άλλο. Δεν είσαι σίγουρος; Το κουίζ 5 ερωτήσεων το διαλέγει για σένα."] },
  { id: "weights", k: "weights adjust sliders custom βαρη ρυθμιση βαρων sliders αλλαγη",
    en: ["Can I change how much each factor counts?", "Yes. Open “Adjust weights” under the controls and move the sliders. The score recalculates immediately, and the link in the address bar keeps your weights so you can share them."],
    el: ["Μπορώ να αλλάξω πόσο μετράει κάθε παράγοντας;", "Ναι. Άνοιξε το «Ρύθμιση βαρών» κάτω από τις επιλογές και μετακίνησε τα sliders. Ο βαθμός ξαναϋπολογίζεται αμέσως, και ο σύνδεσμος στη γραμμή διευθύνσεων κρατά τα βάρη σου για να τα μοιραστείς."] },
  { id: "coverage", k: "coverage missing data n/a no data καλυψη δεδομενα λειπουν ελλιπη",
    en: ["What does data coverage mean?", "It is the share of the score's weight that is backed by real numbers. If a source has no value (for example no prices without a key, or a coin with no public code), that factor is skipped instead of guessed, and coverage drops. Low coverage means treat the score with more caution."],
    el: ["Τι σημαίνει κάλυψη δεδομένων;", "Είναι το ποσοστό του βάρους του βαθμού που στηρίζεται σε πραγματικά νούμερα. Αν μια πηγή δεν έχει τιμή (π.χ. τιμές χωρίς κλειδί ή νόμισμα χωρίς δημόσιο κώδικα), ο παράγοντας παραλείπεται αντί να μαντεύεται και η κάλυψη πέφτει. Χαμηλή κάλυψη σημαίνει ότι ο βαθμός θέλει περισσότερη προσοχή."] },
  { id: "compare", k: "compare comparison side by side radar συγκριση συγκρινω διπλα ραντάρ radar",
    en: ["How do I compare assets?", "After analysing one asset, add up to two more in the compare box. The radar chart overlays their shapes and a table shows every factor, with the best value in each row marked."],
    el: ["Πώς συγκρίνω επενδύσεις;", "Αφού αναλύσεις μία, πρόσθεσε έως δύο ακόμα στο πεδίο σύγκρισης. Το γράφημα ραντάρ δείχνει τα σχήματά τους μαζί και ένας πίνακας δείχνει κάθε παράγοντα, με την καλύτερη τιμή σε κάθε γραμμή σημειωμένη."] },
  { id: "watchlist", k: "watchlist star favourites save λιστα παρακολουθησης αστερι αγαπημενα",
    en: ["What is the watchlist?", "Click the star to keep an asset in your watchlist. The star button at the top opens it with each asset's price, daily change and score for your profile. It is saved in your browser and, when you are logged in, in your account."],
    el: ["Τι είναι η λίστα παρακολούθησης;", "Πάτα το αστέρι για να κρατήσεις μια επένδυση στη λίστα. Το κουμπί με το αστέρι πάνω την ανοίγει με τιμή, ημερήσια μεταβολή και βαθμό για το προφίλ σου. Αποθηκεύεται στον browser και, όταν είσαι συνδεδεμένος, στον λογαριασμό σου."] },
  { id: "avkey", k: "alpha vantage key api prices price key κλειδι τιμες χωρις τιμες",
    en: ["Why do I need an Alpha Vantage key?", "Free price providers don't allow their prices to be republished on a public site, so the app asks you for your own free Alpha Vantage key (25 calls a day). Prices are fetched by your browser and cached for 20 hours. Without a key, stocks are scored on fundamentals only and the price-based factors are skipped. Your key stays in your browser and is never saved to your account."],
    el: ["Γιατί χρειάζομαι κλειδί Alpha Vantage;", "Οι δωρεάν πάροχοι τιμών δεν επιτρέπουν να αναδημοσιεύονται οι τιμές τους σε δημόσια σελίδα, οπότε η εφαρμογή ζητά το δικό σου δωρεάν κλειδί Alpha Vantage (25 κλήσεις τη μέρα). Οι τιμές φορτώνονται από τον browser σου και κρατιούνται για 20 ώρες. Χωρίς κλειδί οι μετοχές βαθμολογούνται μόνο με τα θεμελιώδη και οι παράγοντες τιμών παραλείπονται. Το κλειδί μένει στον browser σου και δεν αποθηκεύεται ποτέ στον λογαριασμό."] },
  { id: "sec", k: "sec edgar filings 10-k 10-q fundamentals source data πηγη δεδομενων καταθεσεις θεμελιωδη",
    en: ["Where do the stock numbers come from?", "From the companies' official filings with the US SEC (EDGAR), read automatically when the site is published. Revenue, profit, debt, cash flow and share counts use the latest twelve months where the quarterly reports allow it."],
    el: ["Από πού βγαίνουν τα νούμερα των μετοχών;", "Από τις επίσημες καταθέσεις των εταιρειών στην αμερικανική SEC (EDGAR), που διαβάζονται αυτόματα όταν δημοσιεύεται η σελίδα. Έσοδα, κέρδη, χρέος, ταμειακές ροές και πλήθος μετοχών αφορούν τους τελευταίους δώδεκα μήνες όπου το επιτρέπουν οι τριμηνιαίες αναφορές."] },
  { id: "portfolio", k: "portfolio analyst holdings add check χαρτοφυλακιο αναλυτης θεσεις ελεγχος",
    en: ["How does the portfolio check work?", "Add what you hold (stocks, ETFs, commodity funds, crypto) with the value of each and choose a profile. A rule-based analyst looks through funds into what they own and lists what works, what doesn't and what to fix, in order of impact: concentration, overlap, fees, risk, missing diversification. The portfolio score is the value-weighted score of the holdings minus points for serious problems."],
    el: ["Πώς δουλεύει ο έλεγχος χαρτοφυλακίου;", "Πρόσθεσε τι έχεις (μετοχές, ETF, ταμεία εμπορευμάτων, crypto) με την αξία του καθενός και διάλεξε προφίλ. Ένας αναλυτής με κανόνες κοιτάζει μέσα στα ταμεία τι κατέχουν και γράφει τι δουλεύει, τι όχι και τι να διορθώσεις, με σειρά σημασίας: συγκέντρωση, επικαλύψεις, χρεώσεις, ρίσκο, έλλειψη διασποράς. Ο βαθμός χαρτοφυλακίου είναι ο σταθμισμένος με την αξία βαθμός των θέσεων μείον πόντους για σοβαρά προβλήματα."] },
  { id: "account", k: "account login sign up password sync save λογαριασμος συνδεση εγγραφη κωδικος αποθηκευση συγχρονισμος",
    en: ["What does an account save?", "Your portfolio, both watchlists, investor profile, investing plan, language and theme, so they follow you to any device. Without an account everything stays in this browser. Use “Forgot your password?” in the login window to reset it."],
    el: ["Τι αποθηκεύει ο λογαριασμός;", "Το χαρτοφυλάκιο, τις δύο λίστες παρακολούθησης, το προφίλ επενδυτή, το επενδυτικό πλάνο, τη γλώσσα και το θέμα, ώστε να σε ακολουθούν σε κάθε συσκευή. Χωρίς λογαριασμό όλα μένουν σε αυτόν τον browser. Για νέο κωδικό πάτα «Ξέχασες τον κωδικό;» στο παράθυρο σύνδεσης."] },
  { id: "fng", k: "fear greed index sentiment φοβος απληστια δεικτης συναισθημα",
    en: ["What is the Fear & Greed index?", "A 0–100 gauge of crypto market mood from alternative.me, built from volatility, momentum, social media and Bitcoin dominance. Low values mean fear, high values greed. It describes mood, not where prices will go."],
    el: ["Τι είναι ο δείκτης Fear & Greed;", "Ένας δείκτης 0–100 για τη διάθεση της αγοράς crypto από το alternative.me, που βγαίνει από μεταβλητότητα, momentum, social media και κυριαρχία του Bitcoin. Χαμηλές τιμές σημαίνουν φόβο, υψηλές απληστία. Περιγράφει τη διάθεση, όχι πού θα πάνε οι τιμές."] },

  // ---- crypto terms ----
  { id: "mcap", k: "market cap capitalization κεφαλαιοποιηση market cap rank κατάταξη",
    en: ["What is market cap?", "Price × coins (or shares) in circulation: what the market values the whole asset at. Larger, more established assets tend to be less volatile and easier to trade."],
    el: ["Τι είναι η κεφαλαιοποίηση (market cap);", "Τιμή × νομίσματα (ή μετοχές) σε κυκλοφορία: πόσο αποτιμά η αγορά όλη την επένδυση. Οι μεγαλύτερες και πιο καθιερωμένες τείνουν να έχουν μικρότερη μεταβλητότητα και να αγοραπωλούνται πιο εύκολα."] },
  { id: "fdv", k: "fdv fully diluted valuation circulating supply max supply dilution unlock tokenomics πληρως αραιωμενη αραιωση κυκλοφορουσα προσφορα",
    en: ["What are FDV, circulating supply and tokenomics?", "Circulating supply is the coins trading today; max supply is the most that will ever exist. Fully diluted valuation (FDV) is price × all coins that will exist. When FDV is far above market cap, many coins are still to be released, which can push the price down (dilution). Tokenomics is how a coin's supply is created and distributed."],
    el: ["Τι είναι FDV, κυκλοφορούσα προσφορά και tokenomics;", "Κυκλοφορούσα προσφορά είναι τα νομίσματα που διακινούνται σήμερα· μέγιστη προσφορά είναι όσα θα υπάρξουν ποτέ. Η πλήρως αραιωμένη αποτίμηση (FDV) είναι τιμή × όλα τα νομίσματα που θα υπάρξουν. Όταν το FDV είναι πολύ πάνω από το market cap, πολλά νομίσματα θα κυκλοφορήσουν ακόμα και μπορεί να πιέσουν την τιμή (αραίωση). Tokenomics είναι το πώς δημιουργείται και μοιράζεται η προσφορά ενός νομίσματος."] },
  { id: "volume", k: "volume liquidity trading volume ογκος ρευστοτητα συναλλαγων",
    en: ["What do volume and liquidity mean?", "Volume is how much is traded in a day. Liquidity is how easily you can buy or sell without moving the price. The app compares daily volume with market cap: very low volume makes an asset harder to exit."],
    el: ["Τι σημαίνουν όγκος και ρευστότητα;", "Όγκος είναι πόσα αγοραπωλούνται σε μια μέρα. Ρευστότητα είναι πόσο εύκολα αγοράζεις ή πουλάς χωρίς να κινήσεις την τιμή. Η εφαρμογή συγκρίνει τον ημερήσιο όγκο με το market cap: πολύ χαμηλός όγκος κάνει πιο δύσκολη την έξοδο."] },
  { id: "ath", k: "ath all time high drawdown from high πτωση απο κορυφη υψηλο ολων των εποχων",
    en: ["What is ATH and drawdown?", "ATH is the all-time high price. Drawdown is how far the price is below a previous peak, in %. A −70% drawdown means the asset would need to more than triple to get back to its high."],
    el: ["Τι είναι ATH και drawdown;", "ATH είναι η υψηλότερη τιμή όλων των εποχών. Drawdown είναι πόσο κάτω από μια προηγούμενη κορυφή βρίσκεται η τιμή, σε %. Drawdown −70% σημαίνει ότι η επένδυση πρέπει να υπερτριπλασιαστεί για να ξαναπιάσει την κορυφή."] },
  { id: "dev", k: "github development commits contributors team code ομαδα αναπτυξη κωδικας προγραμματιστες",
    en: ["Why does GitHub activity matter for crypto?", "Neither data source says who runs a project, so recent code activity (commits, contributors, stars, last update) stands in for whether a team is actively building. A coin with no public code scores 0 on development, and its long-term score is capped at 6."],
    el: ["Γιατί μετράει η δραστηριότητα στο GitHub για τα crypto;", "Καμία πηγή δεν λέει ποιος τρέχει ένα project, οπότε η πρόσφατη δραστηριότητα κώδικα (commits, συνεισφέροντες, αστέρια, τελευταία ενημέρωση) δείχνει αν μια ομάδα χτίζει ενεργά. Νόμισμα χωρίς δημόσιο κώδικα παίρνει 0 στην ανάπτυξη και ο μακροπρόθεσμος βαθμός του έχει ανώτατο όριο το 6."] },
  { id: "momentum", k: "momentum trend performance returns τασης ορμη αποδοση αποδοσεις",
    en: ["What is momentum?", "How strongly the price has been moving lately (for example over 7 days, 30 days, 1 year, or versus the 40-week average). It weighs a lot for aggressive investors and little for defensive ones. Past moves don't guarantee future ones."],
    el: ["Τι είναι το momentum;", "Πόσο έντονα κινείται η τιμή τελευταία (π.χ. σε 7 μέρες, 30 μέρες, 1 χρόνο ή σε σχέση με τον μέσο όρο 40 εβδομάδων). Μετράει πολύ για επιθετικούς επενδυτές και λίγο για αμυντικούς. Οι παλιές κινήσεις δεν εγγυώνται τις μελλοντικές."] },

  // ---- stock terms ----
  { id: "pe", k: "pe p/e price earnings ratio valuation αποτιμηση ακριβη φθηνη pe ratio λογος τιμης κερδη",
    en: ["What is P/E?", "Price ÷ earnings per share: how many years of today's profit you pay for. A high P/E means the market expects strong growth (or the stock is expensive); a low P/E can mean cheap or troubled. Compare within the same sector. Loss-making companies have no meaningful P/E."],
    el: ["Τι είναι το P/E;", "Τιμή ÷ κέρδη ανά μετοχή: πόσα χρόνια σημερινών κερδών πληρώνεις. Υψηλό P/E σημαίνει ότι η αγορά περιμένει μεγάλη ανάπτυξη (ή ότι η μετοχή είναι ακριβή)· χαμηλό μπορεί να σημαίνει φθηνή ή προβληματική. Σύγκρινε μέσα στον ίδιο κλάδο. Οι ζημιογόνες εταιρείες δεν έχουν ουσιαστικό P/E."] },
  { id: "ps", k: "price sales p/s fcf free cash flow yield p/b book value ελευθερες ταμειακες ροες λογιστικη αξια",
    en: ["What are price/sales, free-cash-flow yield and P/B?", "Price/sales compares the company's value with its revenue (useful when profits are small). Free-cash-flow yield is the cash left after investment ÷ company value: higher is cheaper. P/B is price ÷ book value (assets minus debts), used for banks and REITs."],
    el: ["Τι είναι τιμή/πωλήσεις, απόδοση ελεύθερων ταμειακών ροών και P/B;", "Τιμή/πωλήσεις συγκρίνει την αξία της εταιρείας με τα έσοδά της (χρήσιμο όταν τα κέρδη είναι μικρά). Απόδοση ελεύθερων ταμειακών ροών είναι τα μετρητά που μένουν μετά τις επενδύσεις ÷ αξία εταιρείας: όσο υψηλότερη τόσο φθηνότερη. P/B είναι τιμή ÷ λογιστική αξία (ενεργητικό μείον χρέη), για τράπεζες και REITs."] },
  { id: "margins", k: "margin net margin operating margin roe return on equity profitability περιθωριο κερδους αποδοση ιδιων κεφαλαιων κερδοφορια",
    en: ["What are margins and ROE?", "Net margin is profit ÷ revenue; operating margin is profit from the core business ÷ revenue. ROE (return on equity) is profit ÷ shareholders' equity: how well the company turns owners' money into profit. Higher and stable is better."],
    el: ["Τι είναι τα περιθώρια και το ROE;", "Καθαρό περιθώριο είναι κέρδη ÷ έσοδα· λειτουργικό περιθώριο είναι τα κέρδη της κύριας δραστηριότητας ÷ έσοδα. ROE (απόδοση ιδίων κεφαλαίων) είναι κέρδη ÷ ίδια κεφάλαια: πόσο καλά η εταιρεία κάνει τα χρήματα των μετόχων κέρδος. Όσο υψηλότερα και σταθερότερα τόσο καλύτερα."] },
  { id: "debt", k: "debt to equity leverage financial health cash χρεος μοχλευση οικονομικη υγεια μετρητα",
    en: ["What does financial health measure?", "Mainly debt ÷ equity and cash versus debt (for banks, equity ÷ assets). Less debt and more cash mean the company can survive bad years without raising money or cutting dividends. It weighs most for defensive investors."],
    el: ["Τι μετράει η οικονομική υγεία;", "Κυρίως χρέος ÷ ίδια κεφάλαια και μετρητά έναντι χρέους (για τράπεζες, ίδια κεφάλαια ÷ ενεργητικό). Λιγότερο χρέος και περισσότερα μετρητά σημαίνουν ότι η εταιρεία αντέχει κακές χρονιές χωρίς να αντλεί χρήματα ή να κόβει μερίσματα. Μετράει περισσότερο για αμυντικούς επενδυτές."] },
  { id: "dividend", k: "dividend yield payout ratio income μερισμα αποδοση μερισματος ποσοστο διανομης εισοδημα",
    en: ["What are dividend yield and payout ratio?", "Dividend yield is yearly dividends ÷ price. Payout ratio is the share of profit paid out as dividends. A very high payout (near or above 100%) can mean the dividend is at risk of being cut."],
    el: ["Τι είναι απόδοση μερίσματος και ποσοστό διανομής;", "Απόδοση μερίσματος είναι τα ετήσια μερίσματα ÷ τιμή. Ποσοστό διανομής είναι το μέρος των κερδών που μοιράζεται ως μέρισμα. Πολύ υψηλό ποσοστό (κοντά ή πάνω από 100%) μπορεί να σημαίνει ότι το μέρισμα κινδυνεύει να κοπεί."] },
  { id: "risk", k: "volatility beta risk standard deviation μεταβλητοτητα κινδυνος ρισκο βητα beta διακυμανση",
    en: ["What are volatility and beta?", "Volatility is how much the price swings, as a yearly %, from weekly returns. Beta compares a stock's moves with the S&P 500 (SPY): 1 moves like the market, 1.5 about 50% more, 0.5 about half. Higher numbers mean a bumpier ride."],
    el: ["Τι είναι μεταβλητότητα και beta;", "Μεταβλητότητα είναι πόσο αυξομειώνεται η τιμή, ως ετήσιο %, από τις εβδομαδιαίες αποδόσεις. Το beta συγκρίνει τις κινήσεις μιας μετοχής με το S&P 500 (SPY): 1 κινείται όπως η αγορά, 1,5 περίπου 50% περισσότερο, 0,5 περίπου μισό. Μεγαλύτερα νούμερα σημαίνουν πιο ανώμαλη διαδρομή."] },

  // ---- funds & commodities ----
  { id: "etf", k: "etf fund index fund ταμειο δεικτη etf τι ειναι",
    en: ["What is an ETF?", "An exchange-traded fund: one share that holds a basket of investments (for example the 500 companies of the S&P 500) and trades like a stock. ETFs are scored on cost, diversification, size, performance, risk, income and track record."],
    el: ["Τι είναι ένα ETF;", "Ένα διαπραγματεύσιμο ταμείο: μία μετοχή που κατέχει ένα καλάθι επενδύσεων (π.χ. τις 500 εταιρείες του S&P 500) και αγοραπωλείται σαν μετοχή. Τα ETF βαθμολογούνται σε κόστος, διασπορά, μέγεθος, απόδοση, ρίσκο, εισόδημα και ιστορικό."] },
  { id: "er", k: "expense ratio fee cost ter χρεωση κοστος ετησια χρεωση εξοδα",
    en: ["What is the expense ratio?", "The yearly fee a fund charges, as a % of your money. 0.03% costs €3 a year on €10,000; 0.75% costs €75. Over decades the difference compounds, which is why cost weighs most for long-term investors."],
    el: ["Τι είναι το expense ratio (ετήσια χρέωση);", "Η ετήσια χρέωση ενός ταμείου ως % των χρημάτων σου. Το 0,03% κοστίζει 3€ τον χρόνο στα 10.000€· το 0,75% κοστίζει 75€. Σε δεκαετίες η διαφορά πολλαπλασιάζεται, γι' αυτό το κόστος μετράει περισσότερο για μακροπρόθεσμους επενδυτές."] },
  { id: "aum", k: "aum assets under management holdings top 10 diversification concentration διασπορα συγκεντρωση μεγεθος ταμειου",
    en: ["What do AUM, holdings and top-10 weight mean?", "AUM is how much money the fund manages; bigger funds are less likely to close and trade more easily. Holdings is how many investments it owns. Top-10 weight is the share in its ten largest positions: a high share means less diversification."],
    el: ["Τι σημαίνουν AUM, θέσεις και βάρος top-10;", "AUM είναι πόσα χρήματα διαχειρίζεται το ταμείο· τα μεγαλύτερα κλείνουν σπανιότερα και αγοραπωλούνται ευκολότερα. Θέσεις είναι πόσες επενδύσεις κατέχει. Βάρος top-10 είναι το μερίδιο στις δέκα μεγαλύτερες θέσεις: υψηλό μερίδιο σημαίνει λιγότερη διασπορά."] },
  { id: "commodity", k: "commodity gold silver copper oil gas physical futures k-1 roll contango εμπορευματα χρυσος ασημι χαλκος πετρελαιο φυσικο μεταλλο συμβολαια",
    en: ["How are commodities like gold scored?", "Through commodity ETFs, on cost, structure, hedge value, trend, size, risk and track record. Physical funds hold metal in a vault (best structure). Futures funds hold contracts that must be rolled each month, which can erode returns over years; some also issue a US K-1 tax form. Long-term scores of futures funds are capped at 6. Commodities pay no dividends."],
    el: ["Πώς βαθμολογούνται εμπορεύματα όπως ο χρυσός;", "Μέσω ETF εμπορευμάτων, σε κόστος, δομή, αξία αντιστάθμισης, τάση, μέγεθος, ρίσκο και ιστορικό. Τα φυσικά ταμεία κρατούν μέταλλο σε θησαυροφυλάκιο (καλύτερη δομή). Τα ταμεία futures κρατούν συμβόλαια που ανανεώνονται κάθε μήνα, κάτι που μπορεί να τρώει την απόδοση με τα χρόνια· κάποια βγάζουν και αμερικανικό φορολογικό έντυπο K-1. Ο μακροπρόθεσμος βαθμός των ταμείων futures έχει όριο το 6. Τα εμπορεύματα δεν δίνουν μέρισμα."] },
  { id: "hedge", k: "hedge inflation protection safe haven αντισταθμιση πληθωρισμος προστασια ασφαλες καταφυγιο",
    en: ["What is hedge value?", "How well an asset has protected investors when inflation rose or stock markets fell. Gold has the strongest record, then silver and broad commodity baskets; oil and natural gas the weakest. A small gold position (3–15%) counts as a strength for defensive and long-term portfolios."],
    el: ["Τι είναι η αξία αντιστάθμισης;", "Πόσο καλά έχει προστατέψει μια επένδυση όταν ανέβαινε ο πληθωρισμός ή έπεφταν οι μετοχές. Ο χρυσός έχει το καλύτερο ιστορικό, μετά το ασήμι και τα ευρεία καλάθια εμπορευμάτων· πετρέλαιο και φυσικό αέριο το πιο αδύναμο. Μια μικρή θέση σε χρυσό (3–15%) μετράει ως πλεονέκτημα για αμυντικά και μακροπρόθεσμα χαρτοφυλάκια."] },

  // ---- investing ----
  { id: "dca", k: "dca dollar cost averaging monthly investing regular μηνιαια επενδυση μεσος ορος κοστους τακτικη",
    en: ["What is DCA (monthly investing)?", "Investing the same amount on a fixed day every month, whatever the price. You buy more when prices are low and less when they are high, and you don't have to guess the right moment. It suits investing from a salary. Use the calculator on the “How to invest” page to see how a plan could grow."],
    el: ["Τι είναι το DCA (μηνιαία επένδυση);", "Επενδύεις το ίδιο ποσό σε σταθερή μέρα κάθε μήνα, όποια κι αν είναι η τιμή. Αγοράζεις περισσότερα όταν οι τιμές είναι χαμηλά και λιγότερα όταν είναι ψηλά, χωρίς να μαντεύεις τη σωστή στιγμή. Ταιριάζει σε επένδυση από τον μισθό. Δες στον υπολογιστή της σελίδας «Πώς να επενδύσεις» πού μπορεί να φτάσει ένα πλάνο."] },
  { id: "lump", k: "lump sum all at once εφαπαξ ολα μαζι μονομιας",
    en: ["Is it better to invest all at once or monthly?", "If you already have the money and a long horizon, investing at once has historically beaten spreading it over a year about two times out of three, because markets rise more often than they fall. Spreading it over 6–12 months lowers the regret if prices drop right after. The calculator shows both side by side."],
    el: ["Είναι καλύτερα να επενδύσω όλα μαζί ή κάθε μήνα;", "Αν έχεις ήδη τα χρήματα και μακρύ ορίζοντα, η εφάπαξ επένδυση έχει νικήσει ιστορικά το μοίρασμα σε έναν χρόνο περίπου δύο φορές στις τρεις, γιατί οι αγορές ανεβαίνουν πιο συχνά απ' ό,τι πέφτουν. Το μοίρασμα σε 6–12 μήνες μειώνει τη στενοχώρια αν οι τιμές πέσουν αμέσως μετά. Ο υπολογιστής δείχνει και τα δύο δίπλα δίπλα."] },
  { id: "calculator", k: "calculator plan goal target return compound interest inflation real value υπολογιστης πλανο στοχος αποδοση ανατοκισμος πληθωρισμος σημερινα χρηματα",
    en: ["How does the investing calculator work?", "Enter a monthly amount, years, expected yearly return, a starting amount and inflation. It compounds monthly and shows money put in, final value, gain and the value in today's money. In goal mode it tells you the monthly amount needed for a target and the return needed with your current amount. Returns are a smooth average, not a forecast."],
    el: ["Πώς δουλεύει ο υπολογιστής επένδυσης;", "Βάζεις μηνιαίο ποσό, χρόνια, αναμενόμενη ετήσια απόδοση, αρχικό ποσό και πληθωρισμό. Ανατοκίζει μηνιαία και δείχνει τι έβαλες, την τελική αξία, το κέρδος και την αξία σε σημερινά χρήματα. Σε λειτουργία στόχου σου λέει πόσα χρειάζεται να βάζεις τον μήνα και τι απόδοση χρειάζεται με το τωρινό ποσό. Οι αποδόσεις είναι ομαλός μέσος όρος, όχι πρόβλεψη."] },
  { id: "backtest", k: "backtest history real prices past test δοκιμη ιστορικο πραγματικες τιμες παρελθον",
    en: ["What does the backtest show?", "What investing a fixed amount on the first trading week of every month in a real fund or stock would have done over up to 20 years, with dividends reinvested, compared with investing the same total on day one. It also shows the worst moment, when the plan was furthest below the money put in. It needs your Alpha Vantage key for prices."],
    el: ["Τι δείχνει η δοκιμή σε ιστορικό;", "Τι θα γινόταν αν επένδυες σταθερό ποσό την πρώτη εβδομάδα κάθε μήνα σε ένα πραγματικό ταμείο ή μετοχή για έως 20 χρόνια, με επανεπένδυση μερισμάτων, σε σύγκριση με το να έβαζες όλο το ποσό την πρώτη μέρα. Δείχνει και τη χειρότερη στιγμή, όταν το πλάνο ήταν πιο κάτω από τα χρήματα που είχαν μπει. Χρειάζεται το κλειδί σου Alpha Vantage για τις τιμές."] },
  { id: "rebalance", k: "rebalancing rebalance allocation mix core satellite επανεξισορροπηση αναλογια πυρηνας δορυφοροι κατανομη",
    en: ["What are rebalancing and core-and-satellite?", "Rebalancing: once a year you sell a little of what grew and buy what fell, to return to the mix you chose (e.g. 70% stocks, 30% bonds). Core and satellite: most of the money in a broad, cheap fund, and a small part in your own picks. Both keep risk where you decided."],
    el: ["Τι είναι επανεξισορρόπηση και πυρήνας-δορυφόροι;", "Επανεξισορρόπηση: μία φορά τον χρόνο πουλάς λίγο από ό,τι ανέβηκε και αγοράζεις ό,τι έπεσε, για να επιστρέψεις στην αναλογία που διάλεξες (π.χ. 70% μετοχές, 30% ομόλογα). Πυρήνας και δορυφόροι: τα περισσότερα χρήματα σε ένα ευρύ, φθηνό ταμείο και ένα μικρό μέρος σε δικές σου επιλογές. Και τα δύο κρατούν το ρίσκο εκεί που αποφάσισες."] },
  { id: "diversify", k: "diversification diversify concentration overlap correlation διασπορα επικαλυψη συσχετιση συγκεντρωση",
    en: ["Why does diversification matter?", "Spreading money across many companies, sectors, countries and asset types means one bad investment can't sink the whole portfolio. Owning NVDA next to a Nasdaq fund that already holds it adds overlap, not diversification; the portfolio analyst flags this."],
    el: ["Γιατί μετράει η διασπορά;", "Όταν μοιράζεις τα χρήματα σε πολλές εταιρείες, κλάδους, χώρες και είδη επενδύσεων, μία κακή επιλογή δεν βουλιάζει όλο το χαρτοφυλάκιο. Αν έχεις NVDA δίπλα σε ένα ταμείο Nasdaq που ήδη την κατέχει, προσθέτεις επικάλυψη, όχι διασπορά· ο αναλυτής χαρτοφυλακίου το επισημαίνει."] },
  { id: "advice", k: "should i buy sell recommend advice invest now αγορασω πουλησω συμβουλη να παρω αξιζει",
    en: ["Should I buy this?", "AssetLens doesn't tell anyone to buy or sell. It shows how well an asset fits a profile today and why, so you can judge for yourself. Scores don't predict prices. For decisions about your own money, consider a licensed financial adviser."],
    el: ["Να το αγοράσω;", "Το AssetLens δεν λέει σε κανέναν να αγοράσει ή να πουλήσει. Δείχνει πόσο ταιριάζει μια επένδυση σε ένα προφίλ σήμερα και γιατί, για να κρίνεις μόνος σου. Οι βαθμοί δεν προβλέπουν τιμές. Για αποφάσεις με τα δικά σου χρήματα, σκέψου έναν αδειοδοτημένο σύμβουλο."] },
];

/** Lower case, no Greek accents, letters and digits only. */
export const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/ς/g, "σ").replace(/[^\p{L}\p{N}/.\-]+/gu, " ").trim();
const STOP = new Set("the a an is are what how why does do of to in on for and or it i my me can this that with be τι πως γιατι ειναι το τα η ο οι να και σε με για απο μου μια ενα την τον της των στο στη στην σημαινει σημαινουν mean means meaning πεσ explain εξηγησε".split(" ").map(norm));
const words = (s) => norm(s).split(" ").filter((w) => w.length > 1 && !STOP.has(w));
const stem = (w) => (w.length > 5 ? w.slice(0, w.length - 2) : w); // rough: "volatility"≈"volatili", "μεταβλητοτητα"≈"μεταβλητοτη"

/** Best entries for a question: [{ id, q, a, score }], best first. */
export function searchKb(question, lang = "en", n = 3) {
  const qs = words(question).map(stem);
  if (!qs.length) return [];
  return KB.map((e) => {
    const keys = norm(e.k + " " + e.en[0] + " " + e.el[0]);
    const body = norm(e.en[1] + " " + e.el[1]);
    let score = 0;
    for (const w of qs) { if (keys.includes(w)) score += 3; else if (body.includes(w)) score += 1; }
    const [q, a] = e[lang] || e.en;
    return { id: e.id, q, a, score: score / Math.sqrt(qs.length) };
  }).filter((x) => x.score >= 1).sort((a, b) => b.score - a.score).slice(0, n);
}

/** Starter questions for each page. */
export const STARTERS = {
  home: ["score", "profiles", "account"],
  crypto: ["fdv", "dev", "score"],
  markets: ["pe", "avkey", "commodity"],
  portfolio: ["portfolio", "diversify", "hedge"],
  invest: ["dca", "lump", "calculator"],
};
export const starters = (page, lang) => (STARTERS[page] || STARTERS.home).map((id) => { const e = KB.find((x) => x.id === id); return e ? (e[lang] || e.en)[0] : null; }).filter(Boolean);
