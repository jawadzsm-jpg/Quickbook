import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { appUsers } from "@/db/schema";
import { requireApiUser } from "@/lib/auth";

const themeColors = ["emerald", "ocean", "indigo", "violet", "rose", "amber"] as const;

export async function PATCH(request: Request) {
  const user = await requireApiUser(request, false, true);
  if (user instanceof Response) return user;
  const payload = await request.json() as Record<string, unknown>;
  const themeColor = String(payload.themeColor ?? "");
  if (!themeColors.includes(themeColor as typeof themeColors[number])) {
    return Response.json({ error: "Select a valid interface color." }, { status: 400 });
  }
  const [updated] = await getDb().update(appUsers).set({ themeColor, updatedAt: new Date().toISOString() }).where(eq(appUsers.id, user.id)).returning({ themeColor: appUsers.themeColor });
  return Response.json({ themeColor: updated.themeColor }, { headers: { "Cache-Control": "no-store" } });
}
