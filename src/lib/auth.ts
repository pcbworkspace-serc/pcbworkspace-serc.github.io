const SUPPORT_EMAIL = "spaceroboticscreations@outlook.com";
const SESSION_KEY = "pcbworkspace.session.v1";
const SAVED_PROJECTS_PREFIX = "pcbworkspace.savedProjects.v2";
const RECENTS_PREFIX = "pcbworkspace.recentFiles.v2";
const LEGACY_SAVED_PROJECTS_KEY = "savedProjects";
const LEGACY_RECENTS_KEY = "pcbworkspace.recentFiles.v1";

const SUPABASE_URL = "https://khqvffquritcnznusfcp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtocXZmZnF1cml0Y256bnVzZmNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMTUyODUsImV4cCI6MjA4NzY5MTI4NX0.PNkqYM41fpff_Dr6h-9nnZyEDnlLMijsRaFlv7Aei9A";

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

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/authenticate-user`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ email, password }),
    });

    const result = await response.json();

    if (!result.ok) {
      return { ok: false, error: result.error ?? "Authentication failed." };
    }

    localStorage.setItem(SESSION_KEY, email);
    migrateLegacyData(email);
    return { ok: true, mode: "login", email };

  } catch {
    return { ok: false, error: `Could not reach auth service. Contact ${SUPPORT_EMAIL}.` };
  }
}

export function getSavedProjectsKey(email: string) {
  return SAVED_PROJECTS_PREFIX + ":" + normalizeEmail(email);
}

export function getRecentsKey(email: string) {
  return RECENTS_PREFIX + ":" + normalizeEmail(email);
}
