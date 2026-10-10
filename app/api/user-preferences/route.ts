import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { appUsers } from "@/db/schema";
import { requireApiUser } from "@/lib/auth";
import { isShareEmojiStyle } from "@/lib/share-emoji";

const themeColors = ["emerald", "ocean", "indigo", "violet", "rose", "amber"] as const;
const appearanceModes = ["light", "dark"] as const;

export async function PATCH(request: Request) {
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
  // Inventory Overview share emoji style, chosen separately for WhatsApp and Telegram.
  for (const [field, column] of [["shareEmojiWhatsapp", "shareEmojiWhatsapp"], ["shareEmojiTelegram", "shareEmojiTelegram"]] as const) {
    if (payload[field] === undefined) continue;
    if (!isShareEmojiStyle(payload[field])) return Response.json({ error: "Select a valid emoji style." }, { status: 400 });
    updates[column] = String(payload[field]);
  }
  if (payload.themeColor === undefined && payload.appearanceMode === undefined && payload.shareEmojiWhatsapp === undefined && payload.shareEmojiTelegram === undefined) {
    return Response.json({ error: "Choose a preference to update." }, { status: 400 });
  }
  const [updated] = await getDb().update(appUsers).set(updates).where(eq(appUsers.id, user.id)).returning();
  return Response.json({ themeColor: updated.themeColor, appearanceMode: updated.appearanceMode, shareEmojiWhatsapp: updated.shareEmojiWhatsapp, shareEmojiTelegram: updated.shareEmojiTelegram }, { headers: { "Cache-Control": "no-store" } });
}
