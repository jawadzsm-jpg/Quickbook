import { verifyAdminPin } from "./admin-pin";
import { consumeRateLimit, rateLimitBlocked } from "./rate-limit";

// Admin PIN guesses: 5 wrong PINs per user per company and 20 per company in 15 minutes, then every PIN is refused
// until the window ends. Only wrong PINs count, so normal overrides are never blocked.
const WINDOW_SECONDS = 900;
const PER_USER = 5;
const PER_COMPANY = 20;

export type PinCheck = { ok: true } | { ok: false; blocked: boolean; retryAfter: number };

export async function checkAdminPin(companyId: number, userId: number, pin: string, storedHash: string): Promise<PinCheck> {
  const userBucket = `pin-fail:${companyId}:${userId}`, companyBucket = `pin-fail:${companyId}`;
  const [byUser, byCompany] = await Promise.all([rateLimitBlocked(userBucket, PER_USER), rateLimitBlocked(companyBucket, PER_COMPANY)]);
  if (byUser.blocked || byCompany.blocked) return { ok: false, blocked: true, retryAfter: Math.max(byUser.retryAfter, byCompany.retryAfter) };
  if (pin && storedHash && verifyAdminPin(pin, storedHash)) return { ok: true };
  await Promise.all([consumeRateLimit(userBucket, PER_USER, WINDOW_SECONDS), consumeRateLimit(companyBucket, PER_COMPANY, WINDOW_SECONDS)]);
  return { ok: false, blocked: false, retryAfter: 0 };
}

export const pinBlockedMessage = (retryAfter: number) => `Too many wrong Admin PIN attempts. Try again in ${Math.max(1, Math.ceil(retryAfter / 60))} minutes.`;
