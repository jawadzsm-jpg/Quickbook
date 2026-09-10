import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key));
  });
}

export async function hashPassword(password: string) {
  if (!password || password.length > 128) throw new Error("Invalid password length.");
  const salt = randomBytes(16);
  const hash = await derive(password, salt);
  return `scrypt$16384$8$1$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  if (!password || password.length > 128 || !/^scrypt\$16384\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(stored)) return false;
  const parts = stored.split("$");
  const actual = await derive(password, Buffer.from(parts[4], "hex"));
  return timingSafeEqual(Buffer.from(parts[5], "hex"), actual);
}
