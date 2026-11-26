/** Home page: what AssetLens does, its sections, how to use it. Static text from i18n-site.js. */
import { t, getLang } from "./i18n.js?v=__V__";
import "./i18n-markets.js?v=__V__";
import { $, el, initChrome } from "./ui.js?v=__V__";

const ICONS = {
  crypto: '<circle cx="12" cy="12" r="8.5"/><path d="M9.5 8h4a2 2 0 0 1 0 4h-4m0 0h4.5a2 2 0 0 1 0 4H9.5m0-8v8m1.5-9.5v1.5m0 8v1.5"/>',
  markets: '<path d="M4 19V5m0 14h16"/><path d="M7 15l4-4 3 3 5-6"/>',
  portfolio: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5V12l6 6"/>',
  invest: '<path d="M4 19h16"/><rect x="5.5" y="13" width="3" height="6"/><rect x="10.5" y="9" width="3" height="10"/><rect x="15.5" y="5" width="3" height="14"/>',
};
const SECTIONS = [["crypto", "crypto.html"], ["markets", "markets.html"], ["portfolio", "portfolio.html"], ["invest", "invest.html"]];
const href = (p) => p + (getLang() !== "en" ? "?lang=" + getLang() : "");

function icon(k) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true"); s.setAttribute("class", "card-ic");
  s.innerHTML = ICONS[k]; // fixed markup above, no user data
  return s;
}

function render() {
  document.title = t("h_title");
  $("homeCards").replaceChildren(...SECTIONS.map(([k, p]) => el("a", { class: "card panel", href: href(p) },
    icon(k), el("h3", {}, t("h_c_" + k)), el("p", { class: "muted" }, t("h_c_" + k + "Txt")), el("span", { class: "card-go" }, t("h_open") + " →"))));
  $("homeSteps").replaceChildren(...[1, 2, 3, 4, 5].map((n) => el("li", {}, el("b", {}, t("h_step" + n)), el("span", { class: "muted" }, t("h_step" + n + "Txt")))));
  $("homeTrust").replaceChildren(...[1, 2, 3].map((n) => el("div", { class: "card panel flat" }, el("h3", {}, t("h_trust" + n)), el("p", { class: "muted" }, t("h_trust" + n + "Txt")))));
  document.querySelectorAll(".hero-cta a[data-nav]").forEach((a) => { a.href = href(a.dataset.nav); });
}

initChrome(render);
render();
