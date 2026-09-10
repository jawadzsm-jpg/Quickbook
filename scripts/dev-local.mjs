import { PGlite } from "@electric-sql/pglite";
import { mkdir, readFile, readdir, writeFile, unlink } from "node:fs/promises";
import { randomBytes, scryptSync } from "node:crypto";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";

if (process.env.NODE_ENV === "production") throw new Error("Local database mode cannot run in production.");
const directory = resolve(process.env.COMNET_LOCAL_DATA_DIR || ".local-data");
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Choose a valid local port.");
await mkdir(directory, { recursive: true, mode: 0o700 });
const lock = join(directory, "server.lock");
try {
  const pid = Number(await readFile(lock, "utf8"));
  if (Number.isInteger(pid) && pid > 0) {
    try { process.kill(pid, 0); throw new Error("This local database is already running."); }
    catch (error) { if (error.code !== "ESRCH") throw error; }
  }
  await unlink(lock);
} catch (error) { if (error.code !== "ENOENT") throw error; }
await writeFile(lock, String(process.pid), { flag: "wx", mode: 0o600 });
try {
  const database = new PGlite(join(directory, "postgres"));
  try {
    await database.exec("CREATE TABLE IF NOT EXISTS __comnet_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    for (const name of (await readdir("drizzle")).filter((name) => name.endsWith(".sql")).sort()) {
      if ((await database.query("SELECT name FROM __comnet_migrations WHERE name = $1", [name])).rows.length) continue;
      await database.transaction(async (tx) => {
        const source = await readFile(join("drizzle", name), "utf8");
        for (const statement of source.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)) await tx.exec(statement);
        await tx.query("INSERT INTO __comnet_migrations (name) VALUES ($1)", [name]);
      });
    }
    const loginPath = join(directory, "login.json");
    try { await readFile(loginPath, "utf8"); }
    catch (error) {
      if (error.code !== "ENOENT") throw error;
      const email = "local-admin@comnet.local";
      const password = randomBytes(24).toString("base64url");
      const salt = randomBytes(16);
      const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
      const created = await database.query(`INSERT INTO app_users (email, full_name, password_hash, role, active, must_change_password)
        VALUES ($1, 'Local Administrator', $2, 'all_admin', true, false) ON CONFLICT (email) DO NOTHING RETURNING id`, [email, `scrypt$16384$8$1$${salt.toString("hex")}$${hash.toString("hex")}`]);
      if (!created.rows.length) throw new Error("The local administrator exists but login.json is missing. Restore that file or choose a new COMNET_LOCAL_DATA_DIR.");
      await writeFile(loginPath, JSON.stringify({ email, password }, null, 2) + "\n", { mode: 0o600, flag: "wx" });
    }
  } finally { await database.close(); }
  console.log(`Local application: http://localhost:${port}\nLocal credentials: ${join(directory, "login.json")}`);
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    stdio: "inherit", env: { ...process.env, NODE_ENV: "development", DATABASE_URL: "", COMNET_LOCAL_DB: "1", COMNET_LOCAL_DATA_DIR: directory, NEXT_PUBLIC_APP_URL: `http://localhost:${port}` },
  });
  const stop = () => child.kill("SIGTERM");
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  const [code] = await once(child, "exit");
  process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop);
  process.exitCode = code ?? 0;
} finally { await unlink(lock).catch(() => {}); }
