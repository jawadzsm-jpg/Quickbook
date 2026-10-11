import { createHash, randomBytes } from "node:crypto";

// Integration API keys look like "ebk_live_<32 random bytes, base64url>". Only the SHA-256 digest is stored; the first
// characters are kept separately so administrators can recognise a key in the list.
export const API_KEY_PREFIX = "ebk_live_";

export function generateApiKey() {
  const key = `${API_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
  return { key, keyPrefix: key.slice(0, API_KEY_PREFIX.length + 6), keyHash: hashApiKey(key) };
}

export const hashApiKey = (key: string) => createHash("sha256").update(key).digest("hex");

/** The key from "Authorization: Bearer <key>" or "X-API-Key: <key>", if it has the right shape. */
export function apiKeyFromHeaders(headers: Headers) {
  const bearer = headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const key = (bearer ?? headers.get("x-api-key") ?? "").trim();
  return new RegExp(`^${API_KEY_PREFIX}[A-Za-z0-9_-]{43}$`).test(key) ? key : null;
}
