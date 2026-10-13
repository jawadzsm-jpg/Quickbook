import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Authenticator-app codes (TOTP, RFC 6238: HMAC-SHA1, 6 digits, 30-second steps) and one-time backup codes.

const STEP_SECONDS = 30;
const DIGITS = 6;
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Buffer) {
  let bits = 0, value = 0, output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { output += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(text: string) {
  const clean = text.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0, value = 0;
  const bytes: number[] = [];
  for (const character of clean) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("Invalid authenticator key.");
    value = (value << 5) | index; bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(bytes);
}

/** A new 160-bit key, shown to the user once as a QR code / text for their authenticator app. */
export const newTotpSecret = () => base32Encode(randomBytes(20));

export const currentStep = (now = Date.now()) => Math.floor(now / 1000 / STEP_SECONDS);

export function totpCode(secret: string, step: number) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const binary = ((hmac[offset] & 127) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

/**
 * The time step a 6-digit code matches (current step ± 1 for clock drift), or null. Steps at or before `lastStep`
 * are refused, so a code cannot be used twice.
 */
export function verifyTotp(secret: string, code: string, lastStep = 0, now = Date.now()) {
  const digits = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(digits)) return null;
  const step = currentStep(now);
  for (const candidate of [step - 1, step, step + 1]) {
    if (candidate <= lastStep) continue;
    const expected = Buffer.from(totpCode(secret, candidate));
    if (timingSafeEqual(expected, Buffer.from(digits))) return candidate;
  }
  return null;
}

export function otpauthUri(issuer: string, account: string, secret: string) {
  const label = `${issuer}:${account}`;
  return `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

const digestCode = (code: string) => createHash("sha256").update(code.toUpperCase().replace(/[\s-]/g, "")).digest("hex");

/** Ten one-time backup codes (xxxxx-xxxxx); only their SHA-256 digests are stored. */
export function newBackupCodes() {
  const codes = Array.from({ length: 10 }, () => { const text = base32Encode(randomBytes(7)).slice(0, 10); return `${text.slice(0, 5)}-${text.slice(5)}`; });
  return { codes, digests: codes.map(digestCode) };
}

/** Remaining digests after using `code`, or null when it is not an unused backup code. */
export function redeemBackupCode(digests: string[], code: string) {
  const digest = digestCode(code);
  const index = digests.findIndex((entry) => entry.length === digest.length && timingSafeEqual(Buffer.from(entry), Buffer.from(digest)));
  return index < 0 ? null : digests.filter((_, position) => position !== index);
}
