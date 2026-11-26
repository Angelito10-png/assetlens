/**
 * Help assistant: a "?" button on every page that opens a small chat.
 * - Signed in (and accounts on): the question, what is on screen and the matching help entries
 *   go to the "ask" Supabase Edge Function, which asks the AI and enforces a daily limit.
 * - Otherwise, or if the AI is unavailable: the best matching entries of the app's own help
 *   (help-kb.js) are shown, so the assistant always answers something useful.
 */
import { t, getLang } from "./i18n.js?v=__V__";
import "./i18n-site.js?v=__V__";
// The help text (about 40 KB) loads only when the visitor first opens the assistant.
let kbMod = null;
const loadKb = () => (kbMod ||= import("./help-kb.js?v=__V__"));
import { accountsEnabled } from "./config.js?v=__V__";
import { getClient, signedInUser, openAccount } from "./account.js?v=__V__";

/* ---------------------------------------------------------------- pure helpers (unit-tested) */

/** Which section the visitor is on. */
export function pageKey(path) {
  const f = String(path || "").split("/").pop() || "index.html";
  return { "": "home", "index.html": "home", "crypto.html": "crypto", "markets.html": "markets", "portfolio.html": "portfolio", "invest.html": "invest" }[f] || "home";
}

/**
 * Tiny, safe Markdown subset for answers → blocks: [{ type: "p" | "ul" | "ol", items: [[{ b, text }]] }].
 * Only paragraphs, "- " / "1. " lists and **bold**; everything is rendered later with textContent.
 */
export function parseAnswer(text) {
  const inline = (s) => String(s).split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part) => (/^\*\*[^*]+\*\*$/.test(part) ? { b: true, text: part.slice(2, -2) } : { b: false, text: part.replace(/\*\*/g, "") }));
  const blocks = [];
  for (const raw of String(text || "").replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line) { blocks.push(null); continue; }
    const ul = line.match(/^[-*•]\s+(.*)$/), ol = line.match(/^\d+[.)]\s+(.*)$/);
    const type = ul ? "ul" : ol ? "ol" : "p";
    const body = inline(ul ? ul[1] : ol ? ol[1] : line.replace(/^#+\s*/, ""));
    const last = blocks[blocks.length - 1];
    if (last && last.type === type && type !== "p") last.items.push(body);
    else if (last && last.type === "p" && type === "p") last.items.push([{ b: false, text: " " }, ...body]);
    else blocks.push({ type, items: [body] });
  }
  return blocks.filter(Boolean).map((b) => (b.type === "p" ? { type: "p", items: [b.items.flat()] } : b));
}

/** What the visitor sees, as short text for the AI (the result panel or calculator output). */
export function screenText(doc, max = 2200) {
  const pick = ["#result", "#calcOut", "#btBody"].map((s) => doc.querySelector(s)).filter(Boolean);
  const text = pick.map((n) => (n.innerText || n.textContent || "")).join("\n").replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim();
  return text.slice(0, max);
}

/* ---------------------------------------------------------------- UI */

const h = (tag, attrs, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; if (k === "class") n.className = v; else n.setAttribute(k, v === true ? "" : v); }
  for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid.nodeType ? kid : String(kid));
  return n;
};
const richText = (text) => parseAnswer(text).map((b) => {
  const runs = (items) => items.map((r) => (r.b ? h("b", {}, r.text) : r.text));
  return b.type === "p" ? h("p", {}, runs(b.items[0])) : h(b.type, {}, ...b.items.map((it) => h("li", {}, runs(it))));
});

let panel = null, log = null, input = null, sendBtn = null, chips = null, busy = false;
const history = []; // [{ role: "user" | "model", text }]

function addMsg(who, ...content) {
  const m = h("div", { class: "hb-msg " + who }, ...content);
  log.append(m);
  log.scrollTop = log.scrollHeight;
  return m;
}

function kbAnswer(matches, lead) {
  if (!matches.length) return [h("p", {}, t("hb_noMatch"))];
  const [best, ...rest] = matches;
  return [
    lead ? h("p", { class: "hb-lead" }, lead) : null,
    h("p", {}, h("b", {}, best.q)), ...richText(best.a),
    rest.length ? h("div", { class: "hb-more" }, h("span", { class: "muted" }, t("hb_more")), ...rest.map((x) => {
      const b = h("button", { type: "button", class: "hb-chip" }, x.q);
      b.addEventListener("click", () => ask(x.q));
      return b;
    })) : null,
  ];
}

function loginNudge() {
  const b = h("button", { type: "button", class: "linkbtn" }, t("hb_loginBtn"));
  b.addEventListener("click", () => openAccount("login"));
  return h("p", { class: "hb-nudge muted" }, t("hb_loginAi"), " ", b);
}

async function ask(question) {
  question = String(question || "").trim().slice(0, 500);
  if (!question || busy) return;
  const lang = getLang();
  addMsg("hb-me", question);
  input.value = "";
  chips.hidden = true;
  const { searchKb } = await loadKb();
  const matches = searchKb(question, lang, 3);
  const user = accountsEnabled() ? signedInUser() : null;
  if (!user) {
    addMsg("hb-bot", ...kbAnswer(matches), accountsEnabled() ? loginNudge() : null);
    return;
  }
  busy = true; sendBtn.disabled = true;
  const wait = addMsg("hb-bot hb-pending", h("p", { class: "muted" }, t("hb_thinking")));
  let lead = t("hb_err_off"), why = "network";
  try {
    const sb = await getClient();
    const { data, error } = await sb.functions.invoke("ask", {
      body: { q: question, lang, page: pageKey(location.pathname), context: screenText(document), kb: searchKb(question, lang, 4).map(({ q, a }) => ({ q, a })), history: history.slice(-6) },
    });
    let payload = data;
    if (error) why = (error.context && error.context.status) ? "http " + error.context.status : (error.name || "error");
    if (error && error.context && typeof error.context.json === "function") { try { payload = await error.context.json(); } catch { /* not JSON */ } }
    if (payload && payload.answer) {
      wait.remove();
      const left = payload.limit && payload.used ? Math.max(0, payload.limit - payload.used) : null;
      addMsg("hb-bot hb-ai", ...richText(payload.answer), h("div", { class: "hb-meta muted" }, h("span", { class: "hb-tag" }, t("hb_aiTag")), left !== null ? " " + t("hb_left", left) : ""));
      history.push({ role: "user", text: question }, { role: "model", text: payload.answer });
      return;
    }
    const code = payload && payload.error;
    if (code) why = String(code) + (payload.status ? " " + payload.status : "") + (payload.reason ? " " + payload.reason : "");
    if (code === "limit") lead = t("hb_err_limit", payload.limit || 15);
    else if (code === "busy") lead = t("hb_err_busy");
    else if (code === "blocked") { wait.remove(); addMsg("hb-bot", h("p", {}, t("hb_err_blocked"))); return; }
  } catch { /* network or function missing: fall back to the help text */ } finally { busy = false; sendBtn.disabled = false; }
  wait.remove();
  if (lead === t("hb_err_off")) lead += " [" + why + "]";
  addMsg("hb-bot", ...kbAnswer(matches, matches.length ? lead : null));
}

async function renderChips() {
  const { starters } = await loadKb();
  chips.replaceChildren(h("span", { class: "muted" }, t("hb_try")), ...starters(pageKey(location.pathname), getLang()).map((q) => {
    const b = h("button", { type: "button", class: "hb-chip" }, q);
    b.addEventListener("click", () => ask(q));
    return b;
  }));
}

function build() {
  const fab = h("button", { type: "button", class: "hb-fab", "aria-haspopup": "dialog", "aria-expanded": "false", title: t("hb_open"), "aria-label": t("hb_open") }, h("span", { "aria-hidden": "true" }, "?"));
  log = h("div", { class: "hb-log", role: "log", "aria-live": "polite" });
  input = h("input", { type: "text", class: "hb-in", maxlength: "500", autocomplete: "off", placeholder: t("hb_ph"), "aria-label": t("hb_ph") });
  sendBtn = h("button", { type: "submit", class: "primary hb-send", "aria-label": t("hb_send") }, "↑");
  chips = h("div", { class: "hb-chips" });
  const form = h("form", { class: "hb-form" }, input, sendBtn);
  form.addEventListener("submit", (e) => { e.preventDefault(); ask(input.value); });
  const x = h("button", { type: "button", class: "xbtn quiz-x", "aria-label": t("hb_close") }, "×");
  panel = h("section", { class: "hb-panel", role: "dialog", "aria-label": t("hb_title"), hidden: true },
    h("div", { class: "hb-head" }, h("b", {}, t("hb_title")), x),
    log, chips, form, h("p", { class: "hb-note muted" }, t("hb_note")));
  const toggle = (open) => {
    panel.hidden = !open; fab.setAttribute("aria-expanded", String(open)); fab.classList.toggle("on", open);
    if (open) { if (!log.childElementCount) { addMsg("hb-bot", h("p", {}, t("hb_hello"))); renderChips(); } input.focus(); }
  };
  fab.addEventListener("click", () => toggle(panel.hidden));
  x.addEventListener("click", () => { toggle(false); fab.focus(); });
  panel.addEventListener("keydown", (e) => { if (e.key === "Escape") { toggle(false); fab.focus(); } });
  document.body.append(panel, fab);
  // labels follow the language toggle
  document.querySelectorAll("[data-lang]").forEach((b) => b.addEventListener("click", () => setTimeout(() => {
    fab.title = fab.ariaLabel = t("hb_open"); input.placeholder = t("hb_ph"); panel.querySelector(".hb-head b").textContent = t("hb_title");
    panel.querySelector(".hb-note").textContent = t("hb_note"); if (!chips.hidden) renderChips();
  })));
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build); else build();
}
