import { apiRoute } from "@/lib/api";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { appUsers } from "@/db/schema";
import { requireApiUser } from "@/lib/auth";

const themeColors = ["emerald", "ocean", "indigo", "violet", "rose", "amber"] as const;
const appearanceModes = ["light", "dark"] as const;

async function handlePATCH(request: Request) {
  const user = await requireApiUser(request, false, true);
  if (user instanceof Response) return user;
  const payload = await request.json() as Record<string, unknown>;
  const updates: Partial<typeof appUsers.$inferInsert> = { updatedAt: new Date().toISOString() };
  if (payload.themeColor !== undefined) {
    const themeColor = String(payload.themeColor);
    if (!themeColors.includes(themeColor as typeof themeColors[number])) {
      return Response.json({ error: "Select a valid interface color." }, { status: 400 });
    }
    updates.themeColor = themeColor;
  }
  if (payload.appearanceMode !== undefined) {
    const appearanceMode = String(payload.appearanceMode);
    if (!appearanceModes.includes(appearanceMode as typeof appearanceModes[number])) {
      return Response.json({ error: "Select light or dark mode." }, { status: 400 });
    }
    updates.appearanceMode = appearanceMode as typeof appearanceModes[number];
  }
  if (payload.themeColor === undefined && payload.appearanceMode === undefined) {
    return Response.json({ error: "Choose a preference to update." }, { status: 400 });
  }
  const [updated] = await getDb().update(appUsers).set(updates).where(eq(appUsers.id, user.id)).returning();
  return Response.json({ themeColor: updated.themeColor, appearanceMode: updated.appearanceMode }, { headers: { "Cache-Control": "no-store" } });
}

export const PATCH = apiRoute(handlePATCH);
