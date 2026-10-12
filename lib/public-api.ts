import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { apiKeys, companies } from "@/db/schema";
import { apiTokenDigest, apiTokenFromHeaders } from "@/lib/api-keys";
import { consumeRateLimit } from "@/lib/rate-limit";
import { encodeCursor, type ProductQuery } from "@/lib/public-api-query";
import { offerRemaining } from "@/lib/item-offers";
import { offerSoldQuantity } from "@/lib/item-offers-sql";

export { parseProductQuery } from "@/lib/public-api-query";

// Integration API v1: read-only product data for websites, authenticated with a company API key.
export const API_RATE_LIMIT = 120; // requests per key per minute

export type ApiClient = { keyId: number; companyId: number; currency: string };

const headers = (extra: Record<string, string> = {}) => ({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra });
export const apiError = (status: number, code: string, message: string, extra: Record<string, string> = {}) =>
  Response.json({ error: { code, message } }, { status, headers: headers(extra) });
export const apiJson = (data: unknown, extra: Record<string, string> = {}) => Response.json(data, { headers: headers(extra) });

/** Check the API key and the per-key rate limit; returns the client or an error response. */
export async function authenticateApi(request: Request): Promise<ApiClient | Response> {
  const token = apiTokenFromHeaders(request.headers);
  if (!token) {
    const blocked = await consumeRateLimit("api:invalid", 600, 60);
    if (!blocked.allowed) return apiError(429, "rate_limited", "Too many requests.", { "Retry-After": String(blocked.retryAfter) });
    return apiError(401, "invalid_api_key", "Send a valid API key as \"Authorization: Bearer <key>\".", { "WWW-Authenticate": "Bearer" });
  }
  const db = getDb();
  const [row] = await db.select({ id: apiKeys.id, companyId: apiKeys.companyId, lastUsedAt: apiKeys.lastUsedAt, currency: companies.baseCurrency })
    .from(apiKeys).innerJoin(companies, eq(apiKeys.companyId, companies.id))
    .where(and(eq(apiKeys.keyHash, apiTokenDigest(token)), isNull(apiKeys.revokedAt), eq(companies.active, true))).limit(1);
  if (!row) {
    const blocked = await consumeRateLimit("api:invalid", 600, 60);
    if (!blocked.allowed) return apiError(429, "rate_limited", "Too many requests.", { "Retry-After": String(blocked.retryAfter) });
    return apiError(401, "invalid_api_key", "This API key is not valid or has been revoked.", { "WWW-Authenticate": "Bearer" });
  }
  const budget = await consumeRateLimit(`api:key:${row.id}`, API_RATE_LIMIT, 60);
  if (!budget.allowed) return apiError(429, "rate_limited", `Rate limit is ${API_RATE_LIMIT} requests per minute per key.`, { "Retry-After": String(budget.retryAfter) });
  // Record use at most once a minute.
  if (!row.lastUsedAt || Date.now() - apiTime(row.lastUsedAt) > 60_000) await db.update(apiKeys).set({ lastUsedAt: new Date().toISOString() }).where(eq(apiKeys.id, row.id));
  return { keyId: row.id, companyId: row.companyId, currency: row.currency };
}

/** Database timestamps ("2026-10-11 13:44:28+04" or Date) as milliseconds. */
export const apiTime = (value: unknown) => value instanceof Date ? value.getTime() : new Date(String(value).replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00")).getTime();
export const apiIso = (value: unknown) => value === null || value === undefined ? null : new Date(apiTime(value)).toISOString();

type Row = Record<string, unknown>;

/** One page of products for the client's company. Products are grouped by SKU across the company's inventories. */
export async function listProducts(client: ApiClient, query: ProductQuery) {
  const db = getDb();
  const filters = sql`i.company_id = ${client.companyId} AND l.active = true
    ${query.includeInactive ? sql`` : sql`AND i.status = 'active'`}
    ${query.category ? sql`AND upper(trim(i.category)) = upper(${query.category})` : sql``}
    ${query.inventory ? sql`AND upper(l.code) = upper(${query.inventory})` : sql``}`;
  // An offer starting, ending, being created or ended early counts as a product change.
  const changedSince = query.updatedSince ? sql`HAVING max(i.updated_at) > ${query.updatedSince}::timestamptz OR bool_or(EXISTS (
      SELECT 1 FROM item_offers o WHERE o.item_id = i.id AND (o.created_at > ${query.updatedSince}::timestamptz OR o.ended_at > ${query.updatedSince}::timestamptz
        OR (o.starts_at > ${query.updatedSince}::timestamptz AND o.starts_at <= now()) OR (o.ends_at > ${query.updatedSince}::timestamptz AND o.ends_at <= now()))))` : sql``;
  const skuRows = (await db.execute(sql`SELECT i.sku FROM items i JOIN inventory_locations l ON l.id = i.location_id AND l.company_id = i.company_id
    WHERE ${filters} ${query.sku !== undefined ? sql`AND i.sku = ${query.sku}` : sql`AND i.sku > ${query.cursor}`}
    GROUP BY i.sku ${changedSince} ORDER BY i.sku LIMIT ${query.limit + 1}`)).rows;
  const hasMore = skuRows.length > query.limit;
  const skus = skuRows.slice(0, query.limit).map((row) => String(row.sku));
  if (!skus.length) return { products: [], nextCursor: null };
  const items = (await db.execute(sql`SELECT i.id, i.sku, i.item_number, i.name, i.category, i.description, i.specifications, i.part_number, i.upc_number,
      i.quantity, i.sales_price, i.amounts_include_vat, i.status, i.weight_kg, i.length_cm, i.width_cm, i.height_cm, i.created_at, i.updated_at,
      l.code AS location_code, l.name AS location_name,
      COALESCE((SELECT sum(h.quantity) FROM stock_holds h WHERE h.item_id = i.id AND h.released_at IS NULL AND h.expires_at > now()), 0) AS held
    FROM items i JOIN inventory_locations l ON l.id = i.location_id AND l.company_id = i.company_id
    WHERE ${filters} AND i.sku IN (${sql.join(skus.map((sku) => sql`${sku}`), sql`, `)}) ORDER BY i.sku, l.id`)).rows;
  const ids = items.map((item) => Number(item.id));
  // Running offers only; a limited offer whose quantity is sold is over.
  const offers = (await db.execute(sql`SELECT item_id, offer_price, offer_quantity, ${offerSoldQuantity} AS sold, starts_at, ends_at FROM item_offers
    WHERE item_id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)}) AND ended_at IS NULL AND starts_at <= now() AND ends_at > now()
      AND (offer_quantity IS NULL OR ${offerSoldQuantity} < offer_quantity) ORDER BY starts_at`)).rows;
  const offerByItem = new Map(offers.map((offer) => [Number(offer.item_id), offer]));
  const grouped = new Map<string, Row[]>();
  for (const item of items) grouped.set(String(item.sku), [...(grouped.get(String(item.sku)) ?? []), item]);
  return {
    products: skus.filter((sku) => grouped.has(sku)).map((sku) => productJson(grouped.get(sku)!, offerByItem, client.currency)),
    nextCursor: hasMore ? encodeCursor(skus[skus.length - 1]) : null,
  };
}

function specifications(value: unknown) {
  try {
    const parsed = JSON.parse(String(value ?? "[]")) as Array<{ label?: unknown; value?: unknown }>;
    return Array.isArray(parsed) ? parsed.map((entry) => ({ name: String(entry?.label ?? "").trim(), value: String(entry?.value ?? "").trim() })).filter((entry) => entry.name && entry.value) : [];
  } catch { return []; }
}

const round = (value: number) => Math.round(value * 100) / 100;

/** The public product shape. Never includes cost, purchase prices, suppliers or accounts. */
function productJson(rows: Row[], offerByItem: Map<number, Row>, currency: string) {
  const first = rows[0];
  const offer = rows.map((row) => offerByItem.get(Number(row.id))).find(Boolean);
  const inventories = rows.map((row) => {
    const quantity = Number(row.quantity) || 0;
    return { code: String(row.location_code), name: String(row.location_name), quantity, available: Math.max(0, quantity - (Number(row.held) || 0)), price: round(Number(row.sales_price) || 0), status: String(row.status) };
  });
  const updated = Math.max(...rows.map((row) => apiTime(row.updated_at)));
  return {
    sku: String(first.sku),
    item_number: first.item_number ? String(first.item_number) : null,
    name: String(first.name),
    category: String(first.category ?? "").trim() || "GENERAL",
    description: String(first.description ?? ""),
    specifications: specifications(first.specifications),
    part_number: String(first.part_number ?? "") || null,
    upc: String(first.upc_number ?? "") || null,
    status: rows.some((row) => row.status === "active") ? "active" : "inactive",
    price: { amount: round(Number(first.sales_price) || 0), currency, includes_vat: first.amounts_include_vat === true },
    offer: offer ? { price: round(Number(offer.offer_price)), starts_at: apiIso(offer.starts_at), ends_at: apiIso(offer.ends_at), quantity: offer.offer_quantity == null ? null : Number(offer.offer_quantity), remaining: offerRemaining({ offerQuantity: offer.offer_quantity == null ? null : Number(offer.offer_quantity), soldQuantity: Number(offer.sold) }) } : null,
    stock: { quantity: inventories.reduce((sum, entry) => sum + entry.quantity, 0), available: inventories.reduce((sum, entry) => sum + entry.available, 0), inventories },
    weight_kg: Number(first.weight_kg) || null,
    dimensions_cm: Number(first.length_cm) || Number(first.width_cm) || Number(first.height_cm) ? { length: Number(first.length_cm) || 0, width: Number(first.width_cm) || 0, height: Number(first.height_cm) || 0 } : null,
    created_at: apiIso(first.created_at),
    updated_at: Number.isFinite(updated) ? new Date(updated).toISOString() : null,
  };
}

/** Categories used by the company's active items, with their Inventory Overview colours. */
export async function listCategories(client: ApiClient) {
  const rows = (await getDb().execute(sql`SELECT upper(trim(i.category)) AS name, count(DISTINCT i.sku)::int AS products FROM items i
    JOIN inventory_locations l ON l.id = i.location_id AND l.company_id = i.company_id
    WHERE i.company_id = ${client.companyId} AND l.active = true AND i.status = 'active' GROUP BY 1 ORDER BY 1`)).rows;
  return rows.map((row) => ({ name: String(row.name || "GENERAL"), products: Number(row.products) }));
}
