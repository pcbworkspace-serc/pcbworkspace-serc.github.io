type StoredUser = {
  email: string;
  password: string;
};

type AuthSuccess = {
  ok: true;
  mode: "login" | "register";
  email: string;
};

type AuthFailure = {
  ok: false;
  error: string;
};

export type AuthResult = AuthSuccess | AuthFailure;

const USERS_KEY = "pcbworkspace.users.v1";
const SESSION_KEY = "pcbworkspace.session.v1";
const SAVED_PROJECTS_PREFIX = "pcbworkspace.savedProjects.v2";
const RECENTS_PREFIX = "pcbworkspace.recentFiles.v2";
const LEGACY_SAVED_PROJECTS_KEY = "savedProjects";
const LEGACY_RECENTS_KEY = "pcbworkspace.recentFiles.v1";

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function readUsers(): StoredUser[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (item): item is StoredUser =>
        !!item &&
        typeof (item as { email?: unknown }).email === "string" &&
        typeof (item as { password?: unknown }).password === "string",
    );
  } catch {
    return [];
  }
}

function writeUsers(users: StoredUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
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

export function authenticate(emailInput: string, password: string): AuthResult {
  const email = normalizeEmail(emailInput);
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Enter a valid email address." };
  }

  if (!password || password.length < 4) {
    return { ok: false, error: "Password must be at least 4 characters." };
  }

  const users = readUsers();
  const existingUser = users.find((user) => normalizeEmail(user.email) === email);

  if (!existingUser) {
    const nextUsers = [...users, { email, password }];
    writeUsers(nextUsers);
    localStorage.setItem(SESSION_KEY, email);
    migrateLegacyData(email);
    return { ok: true, mode: "register", email };
  }

  if (existingUser.password !== password) {
    return { ok: false, error: "Incorrect password for this email." };
  }

  localStorage.setItem(SESSION_KEY, email);
  migrateLegacyData(email);
  return { ok: true, mode: "login", email };
}

export function getSavedProjectsKey(email: string) {
  return `${SAVED_PROJECTS_PREFIX}:${normalizeEmail(email)}`;
}

export function getRecentsKey(email: string) {
  return `${RECENTS_PREFIX}:${normalizeEmail(email)}`;
}
