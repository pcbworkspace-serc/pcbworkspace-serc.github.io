import { supabase, isSupabaseConfigured } from "@/supabaseClient";

type ConsumeCodeResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
    };

const SUPPORT_EMAIL = "spaceroboticscreations@outlook.com";

export function isLicenseBackendConfigured() {
  return isSupabaseConfigured();
}

function normalizeCode(code: string) {
  return code.trim().toUpperCase();
}

export async function consumeAccessCode(accessCodeInput: string, email: string): Promise<ConsumeCodeResult> {
  const accessCode = normalizeCode(accessCodeInput);
  if (!accessCode) {
    return { ok: false, error: "Access code is required." };
  }

  if (!isLicenseBackendConfigured()) {
    return {
      ok: false,
      error: `License verification service not configured yet. Contact ${SUPPORT_EMAIL}.`,
    };
  }

  const { data: codeRow, error: lookupError } = await supabase
    .from("access_codes")
    .select("code, is_used")
    .eq("code", accessCode)
    .maybeSingle();

  if (lookupError) {
    return { ok: false, error: "Could not verify access code right now. Please try again." };
  }

  if (!codeRow) {
    return { ok: false, error: `Invalid access code. Contact ${SUPPORT_EMAIL}.` };
  }

  if (codeRow.is_used) {
    return { ok: false, error: "This access code has already been used." };
  }

  const { data: consumedRows, error: consumeError } = await supabase
    .from("access_codes")
    .update({
      is_used: true,
      used_by: email,
      used_at: new Date().toISOString(),
    })
    .eq("code", accessCode)
    .eq("is_used", false)
    .select("code");

  if (consumeError) {
    return { ok: false, error: "Could not consume access code right now. Please try again." };
  }

  if (!consumedRows || consumedRows.length === 0) {
    return { ok: false, error: "This access code has already been used." };
  }

  return { ok: true };
}
