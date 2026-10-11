import { randomBytes, scryptSync } from "node:crypto";

// Integration API credentials ("API keys" on screen) are random bearer tokens: "ebk_live_<32 random bytes, base64url>".
// Only a digest is stored. It uses scrypt, a password-hashing function, with a low cost: the tokens carry 256 bits of
// entropy, so a high work factor adds nothing but delay to every request. The fixed salt keeps the digest deterministic
// so a token can be looked up directly. The first characters are kept separately so administrators can recognise it.
export const API_TOKEN_PREFIX = "ebk_live_";

const DIGEST_SALT = "easybook-integration-api-token-v1";
export const apiTokenDigest = (token: string) => scryptSync(token, DIGEST_SALT, 32, { N: 4096, r: 8, p: 1 }).toString("hex");

export function generateApiToken() {
  const token = `${API_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  return { token, tokenPrefix: token.slice(0, API_TOKEN_PREFIX.length + 6), tokenDigest: apiTokenDigest(token) };
}

/** The token from "Authorization: Bearer <token>" or "X-API-Key: <token>", if it has the right shape. */
export function apiTokenFromHeaders(headers: Headers) {
  const bearer = headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const token = (bearer ?? headers.get("x-api-key") ?? "").trim();
  return new RegExp(`^${API_TOKEN_PREFIX}[A-Za-z0-9_-]{43}$`).test(token) ? token : null;
}
