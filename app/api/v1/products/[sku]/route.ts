import { apiError, apiJson, authenticateApi, listProducts } from "@/lib/public-api";

/** GET /api/v1/products/{sku} — one product, including inactive ones (so a website can unpublish it). */
export async function GET(request: Request, context: { params: Promise<{ sku: string }> }) {
  const client = await authenticateApi(request);
  if (client instanceof Response) return client;
  const sku = decodeURIComponent((await context.params).sku ?? "").trim();
  if (!sku || sku.length > 120) return apiError(400, "invalid_parameter", "Give the product SKU in the URL.");
  try {
    const { products } = await listProducts(client, { limit: 1, cursor: "", updatedSince: null, category: "", inventory: "", includeInactive: true, sku });
    return products[0] ? apiJson({ data: products[0] }) : apiError(404, "not_found", `No product with SKU ${sku}.`);
  } catch {
    return apiError(500, "server_error", "Could not load the product. Try again shortly.");
  }
}
