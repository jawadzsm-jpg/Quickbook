import { config } from "dotenv";
import { Client, neonConfig } from "@neondatabase/serverless";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

config({ path: ".env.local" });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing");
neonConfig.webSocketConstructor = WebSocket;
const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10_000 });
await client.connect();
try {
  await client.query("SELECT pg_advisory_lock(76382194)");
  await client.query(`CREATE TABLE IF NOT EXISTS __comnet_migrations (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const files = readdirSync("drizzle").filter((name) => name.endsWith(".sql")).sort();
  for (const name of files) {
    const applied = await client.query("SELECT name FROM __comnet_migrations WHERE name = $1", [name]);
    if (applied.rows.length) continue;
    const statements = readFileSync(join("drizzle", name), "utf8").split("--> statement-breakpoint").map((statement) => statement.trim()).filter(Boolean);
    await client.query("BEGIN");
    try {
      for (const statement of statements) await client.query(statement);
      await client.query("INSERT INTO __comnet_migrations (name) VALUES ($1)", [name]);
      await client.query("COMMIT");
      console.log(`Applied ${name}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  await client.end();
}
