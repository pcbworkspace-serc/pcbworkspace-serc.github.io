type StoredUser = {
  email: string;
  password: string;
};

type AccessCodeRecord = {
  code: string;
  usedBy: string;
  usedAt: number;
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
const USED_ACCESS_CODES_KEY = "pcbworkspace.usedAccessCodes.v1";

const SUPPORT_EMAIL = "spaceroboticscreations@outlook.com";

const ISSUED_ACCESS_CODES = ["SERC-2026-ALPHA", "SERC-2026-BETA", "SERC-2026-GAMMA", "SERC-2026-DELTA"];

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

function normalizeAccessCode(code: string) {
  return code.trim().toUpperCase();
}

function readUsedAccessCodes(): AccessCodeRecord[] {
  try {
    const raw = localStorage.getItem(USED_ACCESS_CODES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (item): item is AccessCodeRecord =>
        !!item &&
        typeof (item as { code?: unknown }).code === "string" &&
        typeof (item as { usedBy?: unknown }).usedBy === "string" &&
        typeof (item as { usedAt?: unknown }).usedAt === "number",
    );
  } catch {
    return [];
  }
}

function writeUsedAccessCodes(records: AccessCodeRecord[]) {
  localStorage.setItem(USED_ACCESS_CODES_KEY, JSON.stringify(records));
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

export function authenticate(emailInput: string, password: string, accessCodeInput?: string): AuthResult {
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
    const accessCode = normalizeAccessCode(accessCodeInput ?? "");
    if (!accessCode) {
      return {
        ok: false,
        error: `Access code required for new accounts. Contact ${SUPPORT_EMAIL}.`,
      };
    }

    const issuedCodes = ISSUED_ACCESS_CODES.map(normalizeAccessCode);
    if (!issuedCodes.includes(accessCode)) {
      return {
        ok: false,
        error: `Invalid access code. Contact ${SUPPORT_EMAIL}.`,
      };
    }

    const usedCodes = readUsedAccessCodes();
    const alreadyUsed = usedCodes.some((record) => normalizeAccessCode(record.code) === accessCode);
    if (alreadyUsed) {
      return {
        ok: false,
        error: "This access code has already been used.",
      };
    }

    const nextUsers = [...users, { email, password }];
    writeUsers(nextUsers);
    writeUsedAccessCodes([...usedCodes, { code: accessCode, usedBy: email, usedAt: Date.now() }]);
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
