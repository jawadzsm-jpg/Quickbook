// Integration API v1 query parameters (no server imports, so tests can load it).

export const encodeCursor = (sku: string) => Buffer.from(sku, "utf8").toString("base64url");
export const decodeCursor = (cursor: string) => Buffer.from(cursor, "base64url").toString("utf8");

export type ProductQuery = { limit: number; cursor: string; updatedSince: string | null; category: string; inventory: string; includeInactive: boolean; sku?: string };

/** Validate list parameters; returns the query or an error message. */
export function parseProductQuery(url: URL): ProductQuery | string {
  const params = url.searchParams;
  const limit = params.has("limit") ? Number(params.get("limit")) : 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) return "limit must be a whole number from 1 to 200.";
  const updatedSinceRaw = params.get("updated_since");
  const updatedSince = updatedSinceRaw ? new Date(updatedSinceRaw) : null;
  if (updatedSince && Number.isNaN(updatedSince.getTime())) return "updated_since must be an ISO 8601 date-time, e.g. 2026-10-11T08:00:00Z.";
  const status = params.get("status") ?? "active";
  if (status !== "active" && status !== "all") return "status must be \"active\" or \"all\".";
  let cursor = "";
  try { cursor = params.get("cursor") ? decodeCursor(params.get("cursor")!) : ""; } catch { return "cursor is not valid."; }
  return { limit, cursor, updatedSince: updatedSince?.toISOString() ?? null, category: (params.get("category") ?? "").trim(), inventory: (params.get("inventory") ?? "").trim(), includeInactive: status === "all" };
}
