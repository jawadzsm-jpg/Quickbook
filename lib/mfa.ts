import "server-only";

import { decryptSecret } from "./secret-box";
import { redeemBackupCode, verifyTotp } from "./totp";

type MfaUser = { mfaEnabled: boolean; mfaSecretEncrypted: string; mfaBackupCodes: string; mfaLastStep: number };

const digestsOf = (value: string) => { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.map(String) : []; } catch { return []; } };
export const backupCodesLeft = (user: Pick<MfaUser, "mfaBackupCodes">) => digestsOf(user.mfaBackupCodes).length;

/**
 * Checks a second-factor code: a 6-digit authenticator code (not reused) or an unused backup code. Returns the
 * app_users fields to save when it matches (the used step, or the remaining backup codes), or null.
 */
export function checkSecondFactor(user: MfaUser, code: string): { mfaLastStep: number } | { mfaBackupCodes: string } | null {
  if (!user.mfaEnabled || !user.mfaSecretEncrypted) return null;
  const value = code.trim();
  if (/^\d{3}\s?\d{3}$/.test(value)) {
    const step = verifyTotp(decryptSecret(user.mfaSecretEncrypted), value, Number(user.mfaLastStep) || 0);
    return step === null ? null : { mfaLastStep: step };
  }
  const remaining = redeemBackupCode(digestsOf(user.mfaBackupCodes), value);
  return remaining ? { mfaBackupCodes: JSON.stringify(remaining) } : null;
}

export const mfaCleared = { mfaEnabled: false, mfaSecretEncrypted: "", mfaPendingSecretEncrypted: "", mfaBackupCodes: "[]", mfaLastStep: 0, mfaEnabledAt: null };
