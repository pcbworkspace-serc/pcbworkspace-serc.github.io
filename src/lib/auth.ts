import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPPORT_EMAIL = "spaceroboticscreations@outlook.com";
const SESSION_KEY = "pcbworkspace.session.v1";
const SAVED_PROJECTS_PREFIX = "pcbworkspace.savedProjects.v2";
const RECENTS_PREFIX = "pcbworkspace.recentFiles.v2";
const LEGACY_SAVED_PROJECTS_KEY = "savedProjects";
const LEGACY_RECENTS_KEY = "pcbworkspace.recentFiles.v1";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

let supabaseClient: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error(
        "Supabase env vars missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file."
      );
    }
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: "pcbworkspace.supabase.session",
      },
    });
  }
  return supabaseClient;
}

export type AuthResult =
  | { ok: true; mode: "login"; email: string }
  | { ok: false; error: string };

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
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

export async function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  try {
    await getSupabase().auth.signOut();
  } catch {
    // ignore — best effort
  }
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

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // Map common Supabase errors to friendlier messages
      if (error.message.toLowerCase().includes("invalid login credentials")) {
        return { ok: false, error: "Wrong email or password." };
      }
      if (error.message.toLowerCase().includes("email not confirmed")) {
        return {
          ok: false,
          error: `Please confirm your email first. Contact ${SUPPORT_EMAIL} if you didn't get a confirmation email.`,
        };
      }
      return { ok: false, error: error.message };
    }

    if (!data?.user) {
      return { ok: false, error: "Authentication failed." };
    }

    localStorage.setItem(SESSION_KEY, email);
    migrateLegacyData(email);
    return { ok: true, mode: "login", email };

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not reach auth service.";
    return { ok: false, error: `${msg} Contact ${SUPPORT_EMAIL} if this persists.` };
  }
}

export function getSavedProjectsKey(email: string) {
  return SAVED_PROJECTS_PREFIX + ":" + normalizeEmail(email);
}

export function getRecentsKey(email: string) {
  return RECENTS_PREFIX + ":" + normalizeEmail(email);
}
