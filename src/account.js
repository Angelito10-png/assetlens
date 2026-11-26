/**
 * Accounts: log in / sign up with Supabase (email + password), and keep the visitor's
 * saved data (portfolio, watchlists, profile, plan, language, theme) in one row per user.
 *
 * Everything keeps working from localStorage; an account only mirrors those keys.
 * On log in, what the account holds wins and anything missing is filled from this browser;
 * afterwards every change to a synced key is pushed (debounced).
 * Without SUPABASE_URL / SUPABASE_ANON_KEY (see config.js) the button explains that data
 * stays in the browser.
 */
import { t, getLang } from "./i18n.js?v=__V__";
import "./i18n-site.js?v=__V__";
import { SUPABASE_URL, SUPABASE_ANON_KEY, accountsEnabled } from "./config.js?v=__V__";

export const SYNC_KEYS = ["pf-holdings", "cs-watchlist", "ms-watchlist", "cs-profile", "dca-plan", "cs-lang", "cs-theme"];
const SDK = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm";
const TABLE = "user_data";

/* ---------------------------------------------------------------- pure helpers (unit-tested) */

/** The synced keys present in a storage-like object ({ getItem }). */
export function snapshot(storage) {
  const out = {};
  for (const k of SYNC_KEYS) {
    let v = null;
    try { v = storage.getItem(k); } catch { /* blocked */ }
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

/**
 * Merge on log in. The account wins for keys it has; keys only this browser has are kept.
 * → { data, writeLocal: {k: v} (keys to change in this browser), push: boolean (account is missing something) }
 */
export function mergeOnLogin(local, remote) {
  const r = remote && typeof remote === "object" ? remote : {};
  const data = {}, writeLocal = {};
  let push = false;
  for (const k of SYNC_KEYS) {
    const has = typeof r[k] === "string";
    if (has) { data[k] = r[k]; if (local[k] !== r[k]) writeLocal[k] = r[k]; }
    else if (typeof local[k] === "string") { data[k] = local[k]; push = true; }
  }
  return { data, writeLocal, push };
}

export const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || "").trim());
export const validPassword = (p) => typeof p === "string" && p.length >= 8;

/** Supabase auth error → our message key. */
export function errorKey(err) {
  const m = String((err && (err.code || err.message)) || "").toLowerCase();
  if (/invalid_credentials|invalid login/.test(m)) return "ac_err_creds";
  if (/user_already_exists|already registered|already exists/.test(m)) return "ac_err_exists";
  if (/email_not_confirmed|not confirmed/.test(m)) return "ac_err_confirm";
  if (/rate|too many|over_email_send_rate_limit/.test(m)) return "ac_err_rate";
  if (/fetch|network|failed to/.test(m)) return "ac_err_net";
  if (/weak_password|password/.test(m)) return "ac_err_pw";
  return null;
}

/* ---------------------------------------------------------------- client */

let client = null, user = null, lastSync = null, syncState = "idle", syncErr = "", pushTimer = null, recovering = false;
const errText = (e) => String((e && (e.message || e.code)) || e || "").slice(0, 160);

async function getClient() {
  if (client) return client;
  const { createClient } = await import(SDK);
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return client;
}

function local() { try { return localStorage; } catch { return { getItem: () => null, setItem() {} }; } }

async function pullAndMerge() {
  const sb = await getClient();
  const { data: row, error } = await sb.from(TABLE).select("data").eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  const m = mergeOnLogin(snapshot(local()), row && row.data);
  const changed = Object.keys(m.writeLocal);
  for (const k of changed) rawSet(k, m.writeLocal[k]);
  if (m.push || !row) await push(true);
  else { lastSync = Date.now(); syncState = "ok"; syncErr = ""; }
  return changed.length > 0;
}

async function push(now) {
  if (!user) return;
  if (!now) { clearTimeout(pushTimer); pushTimer = setTimeout(() => push(true), 1500); return; }
  syncState = "saving"; renderPanel();
  try {
    const sb = await getClient();
    const { error } = await sb.from(TABLE).upsert({ user_id: user.id, data: snapshot(local()), updated_at: new Date().toISOString() });
    if (error) throw error;
    lastSync = Date.now(); syncState = "ok"; syncErr = "";
  } catch (e) { syncState = "error"; syncErr = errText(e); }
  renderPanel();
}

/* Mirror writes to synced keys. The apps write localStorage directly, so the hook sits on Storage. */
let rawSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* blocked */ } };
function hookStorage() {
  const S = window.Storage && window.Storage.prototype;
  if (!S || S.__alHooked) return;
  const set = S.setItem, del = S.removeItem;
  rawSet = (k, v) => { try { set.call(localStorage, k, v); } catch { /* blocked */ } };
  S.setItem = function (k, v) { set.call(this, k, v); if (this === window.localStorage && SYNC_KEYS.includes(k)) push(false); };
  S.removeItem = function (k) { del.call(this, k); if (this === window.localStorage && SYNC_KEYS.includes(k)) push(false); };
  S.__alHooked = true;
}

/* ---------------------------------------------------------------- UI */

const h = (tag, attrs, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; if (k === "class") n.className = v; else n.setAttribute(k, v === true ? "" : v); }
  for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid.nodeType ? kid : String(kid));
  return n;
};

let btn = null, dlg = null, view = "login", msg = null;

function renderButton() {
  if (!btn) return;
  btn.textContent = user ? (user.email || t("ac_account")).split("@")[0] : t("ac_login");
  btn.title = user ? t("ac_signedInAs", user.email) : t("ac_login");
  btn.classList.toggle("in", !!user);
}

function field(id, label, type, extra) {
  return h("div", { class: "ac-field" }, h("label", { class: "l", for: id }, label), h("input", { id, type, class: "ac-input", required: true, ...extra }));
}

function renderPanel() {
  renderButton();
  if (!dlg || !dlg.open) return;
  const card = dlg.querySelector(".ac-card");
  const head = (title) => h("div", { class: "quiz-head" }, h("h2", { id: "acTitle" }, title), closeX());
  const note = msg ? h("p", { class: "ac-msg " + (msg.err ? "err" : "ok"), role: msg.err ? "alert" : "status" }, msg.text) : null;
  let body;
  if (!accountsEnabled()) {
    body = [head(t("ac_account")), h("div", { class: "ac-body" }, h("p", {}, t("ac_off")), h("p", { class: "muted" }, t("ac_offLocal")))];
  } else if (recovering) {
    const f = h("form", { class: "ac-body", novalidate: true },
      field("acPw", t("ac_password2"), "password", { autocomplete: "new-password", minlength: 8 }), h("p", { class: "muted ac-hint" }, t("ac_pwHint")), note,
      h("button", { class: "primary", type: "submit" }, t("ac_savePw")));
    f.addEventListener("submit", (e) => { e.preventDefault(); savePassword(f.querySelector("#acPw").value); });
    body = [head(t("ac_newPw")), f];
  } else if (user) {
    const out = h("button", { type: "button", class: "ghost" }, t("ac_logout"));
    out.addEventListener("click", logout);
    const wipe = h("button", { type: "button", class: "linkbtn ac-wipe" }, t("ac_wipe"));
    wipe.addEventListener("click", wipeData);
    const st = syncState === "saving" ? t("ac_syncing") : syncState === "error" ? t("ac_syncErr") : lastSync ? t("ac_synced", new Date(lastSync).toLocaleTimeString(getLang() === "el" ? "el-GR" : "en-US", { hour: "2-digit", minute: "2-digit" })) : "";
    body = [head(t("ac_account")), h("div", { class: "ac-body" },
      h("p", {}, h("b", {}, t("ac_signedInAs", user.email))),
      st ? h("p", { class: "muted ac-sync" + (syncState === "error" ? " err" : "") }, st) : null,
      syncState === "error" && syncErr ? h("p", { class: "muted ac-hint" }, syncErr) : null,
      h("p", { class: "muted" }, t("ac_whatSaved")), note,
      h("div", { class: "ac-row" }, out, wipe))];
  } else if (view === "reset") {
    const f = h("form", { class: "ac-body", novalidate: true }, field("acEmail", t("ac_email"), "email", { autocomplete: "email" }), note,
      h("button", { class: "primary", type: "submit" }, t("ac_sendReset")), switchLink("", t("ac_back"), "login"));
    f.addEventListener("submit", (e) => { e.preventDefault(); sendReset(f.querySelector("#acEmail").value); });
    body = [head(t("ac_forgot")), f];
  } else {
    const up = view === "signup";
    const f = h("form", { class: "ac-body", novalidate: true },
      h("p", { class: "muted" }, t("ac_why")),
      field("acEmail", t("ac_email"), "email", { autocomplete: "email" }),
      field("acPw", t("ac_password"), "password", { autocomplete: up ? "new-password" : "current-password", minlength: 8 }),
      up ? h("p", { class: "muted ac-hint" }, t("ac_pwHint")) : null, note,
      h("button", { class: "primary", type: "submit" }, up ? t("ac_signup") : t("ac_login")),
      up ? switchLink(t("ac_haveYes"), t("ac_login"), "login") : switchLink(t("ac_haveNo"), t("ac_signup"), "signup"),
      up ? null : switchLink("", t("ac_forgot"), "reset"));
    f.addEventListener("submit", (e) => { e.preventDefault(); submit(up, f.querySelector("#acEmail").value, f.querySelector("#acPw").value); });
    body = [head(up ? t("ac_titleUp") : t("ac_titleIn")), f];
  }
  // keep what the visitor typed when the form is redrawn (an error message, a language switch)
  const typed = {};
  card.querySelectorAll("input[id]").forEach((i) => { typed[i.id] = i.value; });
  card.replaceChildren(...body);
  card.querySelectorAll("input[id]").forEach((i) => { if (typed[i.id]) i.value = typed[i.id]; });
  const first = card.querySelector("input");
  if (first && !card.contains(document.activeElement)) first.focus();
}

function closeX() {
  const b = h("button", { type: "button", class: "xbtn quiz-x", "aria-label": t("ac_close") }, "×");
  b.addEventListener("click", () => dlg.close());
  return b;
}
function switchLink(lead, label, to) {
  const b = h("button", { type: "button", class: "linkbtn" }, label);
  b.addEventListener("click", () => { view = to; msg = null; renderPanel(); });
  return h("p", { class: "ac-switch muted" }, lead ? lead + " " : "", b);
}

const say = (key, ...a) => { msg = { err: true, text: t(key, ...a) }; renderPanel(); };
const fail = (e) => { const k = errorKey(e); if (k) say(k); else say("ac_err_other", (e && e.message) || "?"); };
const busy = (on) => dlg && dlg.querySelectorAll("button, input").forEach((x) => { x.disabled = on; });

async function submit(up, email, pw) {
  email = String(email || "").trim();
  if (!validEmail(email)) return say("ac_err_email");
  if (!validPassword(pw)) return say("ac_err_pw");
  busy(true);
  try {
    const sb = await getClient();
    const redirect = location.origin + location.pathname;
    const res = up ? await sb.auth.signUp({ email, password: pw, options: { emailRedirectTo: redirect } }) : await sb.auth.signInWithPassword({ email, password: pw });
    if (res.error) throw res.error;
    // Supabase answers a sign-up for an existing email with a user that has no identities
    if (up && res.data.user && Array.isArray(res.data.user.identities) && res.data.user.identities.length === 0) return say("ac_err_exists");
    if (up && !res.data.session) { msg = { err: false, text: t("ac_checkMail", email) }; view = "login"; renderPanel(); return; }
    msg = null; // onAuthStateChange takes it from here
  } catch (e) { fail(e); } finally { busy(false); }
}

async function sendReset(email) {
  email = String(email || "").trim();
  if (!validEmail(email)) return say("ac_err_email");
  busy(true);
  try {
    const sb = await getClient();
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    if (error) throw error;
    msg = { err: false, text: t("ac_resetSent", email) }; renderPanel();
  } catch (e) { fail(e); } finally { busy(false); }
}

async function savePassword(pw) {
  if (!validPassword(pw)) return say("ac_err_pw");
  busy(true);
  try {
    const sb = await getClient();
    const { error } = await sb.auth.updateUser({ password: pw });
    if (error) throw error;
    recovering = false; msg = { err: false, text: t("ac_pwSaved") }; renderPanel();
  } catch (e) { fail(e); } finally { busy(false); }
}

async function logout() {
  const sb = await getClient();
  clearTimeout(pushTimer);
  await sb.auth.signOut();
  msg = null; view = "login"; renderPanel();
}

async function wipeData() {
  if (!user) return;
  busy(true);
  try {
    const sb = await getClient();
    const { error } = await sb.from(TABLE).delete().eq("user_id", user.id);
    if (error) throw error;
    lastSync = null; syncState = "idle"; msg = { err: false, text: t("ac_wiped") };
  } catch (e) { fail(e); } finally { busy(false); renderPanel(); }
}

/** Open the account dialog (also used by the home page's "Create an account" button). */
export function openAccount(which = "login") {
  if (!dlg) return;
  if (!user) view = which;
  msg = null;
  dlg.showModal();
  renderPanel();
  // a save that failed earlier (offline, database not ready yet) is retried when the panel opens
  if (user && syncState === "error") pullAndMerge().then(() => renderPanel()).catch((e) => { syncState = "error"; syncErr = errText(e); renderPanel(); });
}

/** Add the account button next to the section links and restore a saved session. */
export function mountAccount() {
  const nav = document.querySelector("nav.sections");
  if (!nav || document.getElementById("acctBtn")) return;
  const bar = h("div", { class: "topbar" });
  nav.replaceWith(bar);
  btn = h("button", { type: "button", id: "acctBtn", class: "acct-btn", "aria-haspopup": "dialog" });
  bar.append(nav, btn);
  dlg = h("dialog", { class: "quiz ac-dlg", "aria-labelledby": "acTitle" }, h("div", { class: "quiz-card ac-card" }));
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  document.body.append(dlg);
  btn.addEventListener("click", () => openAccount("login"));
  document.querySelectorAll("[data-account]").forEach((b) => b.addEventListener("click", () => openAccount(b.dataset.account || "signup")));
  // the language toggle re-renders labels
  document.querySelectorAll("[data-lang]").forEach((b) => b.addEventListener("click", () => setTimeout(renderPanel)));
  renderButton();
  if (!accountsEnabled()) return;
  hookStorage();
  getClient().then((sb) => {
    sb.auth.onAuthStateChange((event, session) => {
      const was = user;
      user = session ? session.user : null;
      if (event === "PASSWORD_RECOVERY") { recovering = true; if (!dlg.open) dlg.showModal(); }
      renderPanel();
      if (user && (!was || was.id !== user.id)) {
        // defer: Supabase asks not to await other calls inside this callback
        setTimeout(() => pullAndMerge().then((changed) => {
          // the page read its data before the account's arrived: reload once to show it
          if (changed && !sessionStorage.getItem("al-synced-" + user.id)) { sessionStorage.setItem("al-synced-" + user.id, "1"); location.reload(); }
          else { sessionStorage.setItem("al-synced-" + user.id, "1"); renderPanel(); }
        }).catch((e) => { syncState = "error"; syncErr = errText(e); renderPanel(); }), 0);
        if (dlg.open && !recovering && event === "SIGNED_IN") setTimeout(() => dlg.close(), 600);
      }
      if (!user && was) { sessionStorage.removeItem("al-synced-" + was.id); }
    });
  }).catch(() => { /* SDK unreachable: the site keeps working from this browser */ });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountAccount); else mountAccount();
}
