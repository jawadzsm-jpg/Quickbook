import { createHash, randomBytes } from "node:crypto";

// Integration API credentials ("API keys" on screen) are random bearer tokens: "ebk_live_<32 random bytes, base64url>".
// Like session and password-reset tokens (lib/auth.ts), they carry 256 bits of entropy, so a single SHA-256 digest is the
// right way to store them — a slow password hash would only delay every API request. The first characters are kept
// separately so administrators can recognise a token in the list.
export const API_TOKEN_PREFIX = "ebk_live_";

export const apiTokenDigest = (token: string) => createHash("sha256").update(token).digest("hex");

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
