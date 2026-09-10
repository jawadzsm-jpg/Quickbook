import { config } from "dotenv";
import { randomBytes, scryptSync } from "node:crypto";
import { Client, neonConfig } from "@neondatabase/serverless";

config({ path: ".env.local" });
const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD ?? "";
if (!process.env.DATABASE_URL || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 12 || password.length > 128) {
  throw new Error("Set DATABASE_URL, ADMIN_EMAIL and a 12–128 character ADMIN_PASSWORD. No credentials were changed.");
}
const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
const passwordHash = `scrypt$16384$8$1$${salt.toString("hex")}$${hash.toString("hex")}`;
neonConfig.webSocketConstructor = WebSocket;
const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10_000 });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query("LOCK TABLE app_users IN EXCLUSIVE MODE");
  const existing = await client.query("SELECT id FROM app_users WHERE active = true AND role = 'all_admin' LIMIT 1");
  if (existing.rows.length) throw new Error("An active All-Admin already exists. Use user management to change access.");
  const result = await client.query(`INSERT INTO app_users (email, full_name, password_hash, role, active, must_change_password)
    VALUES ($1, 'Administrator', $2, 'all_admin', true, true)
    ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'all_admin', active = true, must_change_password = true, updated_at = now()
    RETURNING id`, [email, passwordHash]);
  await client.query("DELETE FROM auth_sessions WHERE user_id = $1", [result.rows[0].id]);
  await client.query("COMMIT");
  console.log("All-Admin initialized. Sign in and change the temporary password.");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally { await client.end(); }
