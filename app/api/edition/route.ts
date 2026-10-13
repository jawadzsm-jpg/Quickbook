import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { requireApiUser } from "@/lib/auth";
import { editionBlockers, editionDetails, isEdition } from "@/lib/edition";
import { currentEdition, editionUsage } from "@/lib/edition-server";

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

/** EasyBook edition and current usage (administrators). */
export async function GET(request: Request) {
  const user = await requireApiUser(request, true);
  if (user instanceof Response) return user;
  const [edition, usage] = await Promise.all([currentEdition(), editionUsage()]);
  return json({ edition, usage, canChange: user.role === "all_admin" });
}

/** Change the edition (All-Admin). Refused while more companies, inventories or warehouses are active than it allows. */
export async function PUT(request: Request) {
  const user = await requireApiUser(request, true, true);
  if (user instanceof Response) return user;
  if (user.role !== "all_admin") return json({ error: "Only an All-Admin can change the EasyBook edition." }, 403);
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return json({ error: "Invalid request." }, 400); }
  if (!isEdition(payload.edition)) return json({ error: "Choose a valid edition." }, 400);
  const edition = payload.edition;
  const usage = await editionUsage();
  const blockers = editionBlockers(edition, usage);
  if (blockers.length) return json({ error: `${editionDetails[edition].label} cannot be used yet. ${blockers.join(" ")}`, blockers, usage }, 409);
  await getDb().execute(sql`INSERT INTO app_settings (id, edition, updated_at, updated_by) VALUES (1, ${edition}, now(), ${user.email})
    ON CONFLICT (id) DO UPDATE SET edition = EXCLUDED.edition, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by`);
  return json({ edition, usage, canChange: true });
}
