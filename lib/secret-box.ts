import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// AES-256-GCM encryption for secrets kept in the database (SMTP password / turboSMTP secret, authenticator-app keys).
// Set SMTP_ENCRYPTION_KEY (32+ random characters) in production: secrets are then encrypted with it ("v2"), separate
// from the database credential. Without it the key is derived from DATABASE_URL ("v1"), which anyone holding the
// database credential could also derive. v1 values stay readable and are re-encrypted as v2 the next time they are saved.

const derive = (secret: string) => createHash("sha256").update(secret).digest();
const dedicatedKey = () => { const value = process.env.SMTP_ENCRYPTION_KEY || ""; return value.length >= 32 ? derive(value) : null; };
// The local PGlite database (scripts/dev-local.mjs) has no DATABASE_URL; development uses a fixed key there instead.
const developmentKey = () => (process.env.NODE_ENV !== "production" && process.env.COMNET_LOCAL_DB === "1" ? "comnet-local-development-only-secret-key" : "");
const legacyKey = () => {
  const value = process.env.SMTP_ENCRYPTION_KEY || process.env.DATABASE_URL || developmentKey();
  if (value.length < 32) throw new Error("Secret encryption is not configured.");
  return derive(value);
};

/** True when secrets are protected by a key separate from the database credential. */
export const hasDedicatedSecretKey = () => dedicatedKey() !== null;

export function encryptSecret(value: string) {
  const key = dedicatedKey();
  const version = key ? "v2" : "v1";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key ?? legacyKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [version, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

function open(key: Buffer, iv: string, tag: string, encrypted: string) {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

export function decryptSecret(value: string) {
  const [version, iv, tag, encrypted] = value.split(".");
  if (!iv || !tag || !encrypted) throw new Error("The saved secret is invalid.");
  if (version === "v2") {
    const key = dedicatedKey();
    if (!key) throw new Error("SMTP_ENCRYPTION_KEY is not set, so the saved secret cannot be read.");
    return open(key, iv, tag, encrypted);
  }
  if (version !== "v1") throw new Error("The saved secret is invalid.");
  // v1: written with the dedicated key when it was already set, otherwise with the DATABASE_URL-derived key.
  const key = dedicatedKey();
  if (key) { try { return open(key, iv, tag, encrypted); } catch { /* written before the dedicated key existed */ } }
  return open(derive(process.env.DATABASE_URL || developmentKey()), iv, tag, encrypted);
}
