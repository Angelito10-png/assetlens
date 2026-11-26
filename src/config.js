/**
 * Account settings. The deploy job fills these from the repository variables
 * SUPABASE_URL and SUPABASE_ANON_KEY (the anon / publishable key is meant for browsers:
 * row-level security in the database decides what each signed-in user can read and write).
 * Left as placeholders, the site works without accounts and keeps data in the browser.
 */
export const SUPABASE_URL = "__SUPABASE_URL__";
export const SUPABASE_ANON_KEY = "__SUPABASE_ANON_KEY__";
export const accountsEnabled = () => /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 20 && !SUPABASE_ANON_KEY.startsWith("__");
