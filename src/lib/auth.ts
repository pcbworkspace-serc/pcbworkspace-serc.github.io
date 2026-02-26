import { supabase } from "@/supabaseClient";
import { consumeAccessCode, isLicenseBackendConfigured } from "@/lib/license";
import { sendWelcomeEmail } from "@/lib/welcomeEmail";

type AuthSuccess = {
  ok: true;
  mode: "login" | "register" | "confirm";
  email: string;
};

type AuthFailure = {
  ok: false;
  error: string;
};

export type AuthResult = AuthSuccess | AuthFailure;

const SAVED_PROJECTS_PREFIX = "pcbworkspace.savedProjects.v2";
const RECENTS_PREFIX = "pcbworkspace.recentFiles.v2";
const LEGACY_SAVED_PROJECTS_KEY = "savedProjects";
const LEGACY_RECENTS_KEY = "pcbworkspace.recentFiles.v1";

const SUPPORT_EMAIL = "spaceroboticscreations@outlook.com";

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Auth-ready promise – resolves once the initial Supabase session is known.
// Components can await this before checking isAuthenticated().
// ---------------------------------------------------------------------------
let _userEmail: string | null = null;
let _authReady = false;
let _authReadyResolve!: () => void;

export const authReadyPromise = new Promise<void>((resolve) => {
  _authReadyResolve = resolve;
});

supabase.auth.onAuthStateChange((_event, session) => {
  _userEmail = session?.user?.email ?? null;
  if (!_authReady) {
    _authReady = true;
    _authReadyResolve();
  }
});

// Belt-and-suspenders: also resolve from getSession() in case onAuthStateChange
// fires after the first render cycle.
void supabase.auth.getSession().then(({ data }) => {
  if (!_authReady) {
    _userEmail = data.session?.user?.email ?? null;
    _authReady = true;
    _authReadyResolve();
  }
});

export function getCurrentUserEmail(): string | null {
  return _userEmail;
}

export function isAuthenticated(): boolean {
  return _userEmail !== null;
}

export function clearSession(): void {
  _userEmail = null;
  void supabase.auth.signOut();
}

function migrateLegacyData(email: string) {
  const scopedSavedProjectsKey = getSavedProjectsKey(email);
  const scopedRecentsKey = getRecentsKey(email);

  if (!localStorage.getItem(scopedSavedProjectsKey)) {
    const legacySavedProjects = localStorage.getItem(LEGACY_SAVED_PROJECTS_KEY);
    if (legacySavedProjects) {
      localStorage.setItem(scopedSavedProjectsKey, legacySavedProjects);
    }
  }

  if (!localStorage.getItem(scopedRecentsKey)) {
    const legacyRecents = localStorage.getItem(LEGACY_RECENTS_KEY);
    if (legacyRecents) {
      localStorage.setItem(scopedRecentsKey, legacyRecents);
    }
  }
}

export async function authenticate(emailInput: string, password: string, accessCodeInput?: string): Promise<AuthResult> {
  const email = normalizeEmail(emailInput);
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Enter a valid email address." };
  }

  if (!password || password.length < 4) {
    return { ok: false, error: "Password must be at least 4 characters." };
  }

  // --- Try to sign in with existing credentials first ---
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });

  if (!signInError && signInData.session) {
    _userEmail = email;
    migrateLegacyData(email);
    return { ok: true, mode: "login", email };
  }

  // --- Sign-in failed – could be wrong password or user doesn't exist ---
  const accessCode = (accessCodeInput ?? "").trim();
  if (!accessCode) {
    return {
      ok: false,
      error: `Access code required for new accounts. Contact ${SUPPORT_EMAIL}.`,
    };
  }

  // Attempt to create the account first so that a network/validation error does
  // not silently burn the access code.
  // Note: signUp is called before the isLicenseBackendConfigured() check intentionally –
  // this prevents the bundler from tree-shaking the signUp call when env vars are absent
  // at build time. If signUp fails (e.g. due to a missing Supabase config), the error
  // handler below provides a clear "not configured" message. If signUp succeeds, Supabase
  // must be configured, so isLicenseBackendConfigured() will be true and consumeAccessCode
  // will proceed normally.
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });

  if (signUpError) {
    const msg = signUpError.message.toLowerCase();
    if (msg.includes("already registered") || msg.includes("already been registered")) {
      return { ok: false, error: "Incorrect password for this email." };
    }
    if (!isLicenseBackendConfigured()) {
      return {
        ok: false,
        error: `License verification service not configured yet. Contact ${SUPPORT_EMAIL}.`,
      };
    }
    return { ok: false, error: signUpError.message };
  }

  // Account created (or confirmation pending) – now consume the access code.
  const consumeResult = await consumeAccessCode(accessCode, email);
  if (!consumeResult.ok) {
    return { ok: false, error: consumeResult.error };
  }

  if (!signUpData.session) {
    // Supabase requires email confirmation before the session is active.
    return { ok: true, mode: "confirm", email };
  }

  _userEmail = email;
  migrateLegacyData(email);
  void sendWelcomeEmail(email);
  return { ok: true, mode: "register", email };
}

export function getSavedProjectsKey(email: string) {
  return `${SAVED_PROJECTS_PREFIX}:${normalizeEmail(email)}`;
}

export function getRecentsKey(email: string) {
  return `${RECENTS_PREFIX}:${normalizeEmail(email)}`;
}
