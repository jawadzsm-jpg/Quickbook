import { categoryColor } from "@/lib/category-colors";
import { savedCategoryColors } from "@/lib/category-colors-sql";
import { apiError, apiJson, authenticateApi, listCategories } from "@/lib/public-api";

/** GET /api/v1/categories — categories of the company's active products, with their colours. */
export async function GET(request: Request) {
  const client = await authenticateApi(request);
  if (client instanceof Response) return client;
  try {
    const [categories, saved] = await Promise.all([listCategories(client), savedCategoryColors()]);
    return apiJson({ data: categories.map((category) => { const color = categoryColor(category.name, saved); return { ...category, color: { id: color.id, background: color.fill, text: color.ink } }; }) });
  } catch {
    return apiError(500, "server_error", "Could not load categories. Try again shortly.");
  }
}
