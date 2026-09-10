import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export async function consumeRateLimit(bucket: string, limit: number, seconds: number) {
  const result = await getDb().execute(sql`
    INSERT INTO auth_rate_limits (bucket, attempts, reset_at) VALUES (${bucket}, 1, now() + ${seconds} * interval '1 second')
    ON CONFLICT (bucket) DO UPDATE SET
      attempts = CASE WHEN auth_rate_limits.reset_at <= now() THEN 1 ELSE LEAST(auth_rate_limits.attempts + 1, ${limit + 1}) END,
      reset_at = CASE WHEN auth_rate_limits.reset_at <= now() THEN now() + ${seconds} * interval '1 second' ELSE auth_rate_limits.reset_at END
    RETURNING attempts, GREATEST(1, CEIL(EXTRACT(EPOCH FROM (reset_at - now()))))::int AS retry_after
  `);
  const row = result.rows[0];
  return { allowed: Number(row.attempts) <= limit, retryAfter: Number(row.retry_after), attempts: Number(row.attempts) };
}

export async function limitLogin(email: string) {
  // A shared database budget works across instances without trusting spoofable proxy headers.
  const global = await consumeRateLimit("login:global", 300, 60);
  if (global.attempts === 1) await getDb().execute(sql`DELETE FROM auth_rate_limits WHERE reset_at < now() - interval '1 day'`);
  const budget = global.allowed
    ? await consumeRateLimit(`login:email:${createHash("sha256").update(email).digest("hex")}`, 30, 900)
    : global;
  if (!budget.allowed) return Response.json({ error: "Too many sign-in attempts. Please try again later." }, { status: 429, headers: { "Retry-After": String(budget.retryAfter) } });
  return null;
}
