import { createClient } from "@supabase/supabase-js";

const SUPPORT_EMAIL = "spaceroboticscreations@outlook.com";
const SESSION_KEY = "pcbworkspace.session.v1";
const SAVED_PROJECTS_PREFIX = "pcbworkspace.savedProjects.v2";
const RECENTS_PREFIX = "pcbworkspace.recentFiles.v2";
const LEGACY_SAVED_PROJECTS_KEY = "savedProjects";
const LEGACY_RECENTS_KEY = "pcbworkspace.recentFiles.v1";

export type AuthResult =
  | { ok: true; mode: "login"; email: string }
  | { ok: false; error: string };

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getSupabaseClient() {
  const url = (import.meta.env.VITE_SUPABASE_URL ?? "").trim();
  const key = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();
  if (!url || !key) return null;
  return createClient(url, key);
}

export function getCurrentUserEmail() {
  const stored = localStorage.getItem(SESSION_KEY);
  if (!stored) return null;
  const normalized = normalizeEmail(stored);
  return normalized.length > 0 ? normalized : null;
}

export function isAuthenticated() {
  return !!getCurrentUserEmail();
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function migrateLegacyData(email: string) {
  const scopedSavedKey = getSavedProjectsKey(email);
  const scopedRecentsKey = getRecentsKey(email);
  if (!localStorage.getItem(scopedSavedKey)) {
    const legacy = localStorage.getItem(LEGACY_SAVED_PROJECTS_KEY);
    if (legacy) localStorage.setItem(scopedSavedKey, legacy);
  }
  if (!localStorage.getItem(scopedRecentsKey)) {
    const legacy = localStorage.getItem(LEGACY_RECENTS_KEY);
    if (legacy) localStorage.setItem(scopedRecentsKey, legacy);
  }
}

export async function authenticate(
  emailInput: string,
  password: string,
): Promise<AuthResult> {
  const email = normalizeEmail(emailInput);
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (!password || password.length < 4) {
    return { ok: false, error: "Password must be at least 4 characters." };
  }
  const client = getSupabaseClient();
  if (!client) {
    return { ok: false, error: "Auth service not configured. Contact " + SUPPORT_EMAIL };
  }
  const { data, error } = await client
    .from("team_users")
    .select("email, password")
    .eq("email", email)
    .maybeSingle();
  if (error) {
    return { ok: false, error: "Could not reach auth service. Try again." };
  }
  if (!data) {
    return { ok: false, error: "No account found for this email. Contact " + SUPPORT_EMAIL };
  }
  if (data.password !== password) {
    return { ok: false, error: "Incorrect password." };
  }
  localStorage.setItem(SESSION_KEY, email);
  migrateLegacyData(email);
  return { ok: true, mode: "login", email };
}

export function getSavedProjectsKey(email: string) {
  return SAVED_PROJECTS_PREFIX + ":" + normalizeEmail(email);
}

export function getRecentsKey(email: string) {
  return RECENTS_PREFIX + ":" + normalizeEmail(email);
}
