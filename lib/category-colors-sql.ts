import { getDb } from "@/db";
import { categoryColors } from "@/db/schema";

/** Saved category colours, keyed by upper-case category name. */
export async function savedCategoryColors() {
  const rows = await getDb().select({ category: categoryColors.category, color: categoryColors.color }).from(categoryColors);
  return Object.fromEntries(rows.map((row) => [row.category, row.color])) as Record<string, string>;
}
