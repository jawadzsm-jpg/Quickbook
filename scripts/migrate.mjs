import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

config({ path: ".env.local" });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing");
const sql = neon(process.env.DATABASE_URL);

await sql`CREATE TABLE IF NOT EXISTS __comnet_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
)`;

const files = readdirSync("drizzle").filter((name) => name.endsWith(".sql")).sort();
for (const name of files) {
  const applied = await sql`SELECT name FROM __comnet_migrations WHERE name = ${name}`;
  if (applied.length) continue;
  const statements = readFileSync(join("drizzle", name), "utf8")
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
  for (const statement of statements) await sql.query(statement, []);
  await sql`INSERT INTO __comnet_migrations (name) VALUES (${name})`;
  console.log(`Applied ${name}`);
}
