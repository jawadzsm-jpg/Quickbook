import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

const ITERATIONS = 120_000;
const KEY_LENGTH = 32;

export function isValidAdminPin(pin: string) {
  return /^\d{4,12}$/.test(pin);
}

export function hashAdminPin(pin: string) {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(pin, salt, ITERATIONS, KEY_LENGTH, "sha256");
  return `pbkdf2$${ITERATIONS}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyAdminPin(pin: string, storedHash: string) {
  const [scheme, iterationText, saltText, hashText] = storedHash.split("$");
  const iterations = Number(iterationText);
  if (scheme !== "pbkdf2" || !Number.isInteger(iterations) || iterations <= 0 || !saltText || !hashText) return false;
  try {
    const expected = Buffer.from(hashText, "base64");
    const actual = pbkdf2Sync(pin, Buffer.from(saltText, "base64"), iterations, expected.length, "sha256");
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
