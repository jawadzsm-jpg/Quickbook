import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { categoryColors } from "@/db/schema";
import { requireApiUser } from "@/lib/auth";
import { categoryColorKey, isCategoryColor } from "@/lib/category-colors";
import { savedCategoryColors } from "@/lib/category-colors-sql";

/** Choose a category's colour, or send color "auto" to go back to the automatic colour. Users who manage inventory. */
export async function PUT(request: Request) {
  const user = await requireApiUser(request, "inventory:manage", true);
  if (user instanceof Response) return user;
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  const category = categoryColorKey(payload.category);
  if (category.length > 120) return Response.json({ error: "Choose a category." }, { status: 400 });
  if (payload.color === "auto") await getDb().delete(categoryColors).where(eq(categoryColors.category, category));
  else if (isCategoryColor(payload.color)) {
    const values = { category, color: payload.color, updatedByName: user.fullName || user.email, updatedAt: new Date().toISOString() };
    await getDb().insert(categoryColors).values(values).onConflictDoUpdate({ target: categoryColors.category, set: values });
  } else return Response.json({ error: "Choose a colour from the palette." }, { status: 400 });
  return Response.json({ categoryColors: await savedCategoryColors() }, { headers: { "Cache-Control": "no-store" } });
}
