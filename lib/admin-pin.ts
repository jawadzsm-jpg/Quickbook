import { pbkdf2, randomBytes, timingSafeEqual } from "node:crypto";

const ITERATIONS = 120_000;
const KEY_LENGTH = 32;
export const isValidAdminPin = (pin: string) => /^\d{4,12}$/.test(pin);

function derive(pin: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    pbkdf2(pin, salt, ITERATIONS, KEY_LENGTH, "sha256", (error, key) => error ? reject(error) : resolve(key));
  });
}

export async function hashAdminPin(pin: string) {
  if (!isValidAdminPin(pin)) throw new Error("Invalid PIN.");
  const salt = randomBytes(16);
  const hash = await derive(pin, salt);
  return `pbkdf2$${ITERATIONS}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyAdminPin(pin: string, storedHash: string) {
  if (!isValidAdminPin(pin)) return false;
  const [scheme, iterations, saltText, hashText, extra] = storedHash.split("$");
  if (scheme !== "pbkdf2" || iterations !== String(ITERATIONS) || !saltText || !hashText || extra !== undefined) return false;
  const salt = Buffer.from(saltText, "base64");
  const expected = Buffer.from(hashText, "base64");
  if (salt.length !== 16 || expected.length !== KEY_LENGTH || salt.toString("base64") !== saltText || expected.toString("base64") !== hashText) return false;
  return timingSafeEqual(expected, await derive(pin, salt));
}
