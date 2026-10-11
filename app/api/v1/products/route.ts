import { apiError, apiJson, authenticateApi, listProducts, parseProductQuery } from "@/lib/public-api";

/** GET /api/v1/products — a page of products (grouped by SKU), with stock, price and any running Today Offer. */
export async function GET(request: Request) {
  const client = await authenticateApi(request);
  if (client instanceof Response) return client;
  const query = parseProductQuery(new URL(request.url));
  if (typeof query === "string") return apiError(400, "invalid_parameter", query);
  try {
    const { products, nextCursor } = await listProducts(client, query);
    return apiJson({ data: products, has_more: nextCursor !== null, next_cursor: nextCursor });
  } catch {
    return apiError(500, "server_error", "Could not load products. Try again shortly.");
  }
}
