import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { getDb, withWriteTransaction } from "@/db";
import { inventoryLocations, items, transactionLines, stockTransfers, inventoryCheckLines, inventoryCheckReports } from "@/db/schema";
import { canAccessCompany, requireApiUser, type SessionUser } from "@/lib/auth";
import { readJsonBody } from "@/lib/api";
import { RequestError, failureResponse } from "@/lib/errors";

export type LockInput = { resource: string; [key: string]: unknown };
const ids = (values: unknown[]) => [...new Set(values.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
const objects = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.filter((v) => v && typeof v === "object") : [];
const key = (location: number, sku: string) => JSON.stringify([location, sku.trim().toUpperCase()]);

/** Resolve identities on the server, including both sides of transfers and document reversals. */
export async function skuKeys(input: LockInput, user: SessionUser) {
  const db = getDb();
  const found = new Set<string>();
  const checkedLocations = new Set<number>();
  const itemIds = ids([input.itemId, ...objects(input.lines).map((l) => l.itemId)]);
  const add = async (locationId: number, sku: string) => {
    if (!sku.trim() || !locationId) return;
    if (!checkedLocations.has(locationId)) {
      const [location] = await db.select().from(inventoryLocations).where(eq(inventoryLocations.id, locationId));
      if (!location || !canAccessCompany(user, location.companyId)) throw new RequestError("Inventory is unavailable in your assigned companies.", 403);
      checkedLocations.add(locationId);
    }
    found.add(key(locationId, sku));
  };
  if (input.resource === "records") {
    if (input.kind === "items") {
      itemIds.push(...ids([input.id, input.duplicateItemId]));
      if (typeof input.sku === "string") await add(Number(input.locationId), input.sku);
    }
    if (input.kind === "transactions") {
      const documents = ids([input.id, input.sourceTransactionId]);
      const lineIds = ids(objects(input.lines).flatMap((l) => [l.sourceLineId, l.orderLineId]));
      const sourceLines = [
        ...(documents.length ? await db.select().from(transactionLines).where(inArray(transactionLines.transactionId, documents)) : []),
        ...(lineIds.length ? await db.select().from(transactionLines).where(inArray(transactionLines.id, lineIds)) : []),
      ];
      itemIds.push(...ids(sourceLines.map((l) => l.itemId)));
    }
  } else if (["stock-pricing", "stock-revaluation", "item-logistics"].includes(input.resource)) {
    itemIds.push(...ids(objects(input.records).map((r) => r.itemId ?? r.id)));
  } else if (input.resource === "transfers") {
    if (Number(input.id) > 0) {
      const [transfer] = await db.select().from(stockTransfers).where(eq(stockTransfers.id, Number(input.id)));
      if (transfer) { await add(transfer.sourceLocationId, transfer.sku); await add(transfer.destinationLocationId, transfer.sku); }
    }
    for (const line of objects(input.lines)) {
      const [item] = await db.select().from(items).where(eq(items.id, Number(line.itemId) || 0));
      if (item) await add(Number(line.destinationLocationId), item.sku);
    }
  } else if (input.resource === "inventory-check-reports") {
    if (Number(input.id) > 0) {
      const [report] = await db.select().from(inventoryCheckReports).where(eq(inventoryCheckReports.id, Number(input.id)));
      if (report) for (const line of await db.select().from(inventoryCheckLines).where(eq(inventoryCheckLines.reportId, report.id))) await add(report.locationId, line.sku);
    } else if (Number(input.locationId) > 0) {
      for (const item of await db.select().from(items).where(eq(items.locationId, Number(input.locationId)))) await add(item.locationId!, item.sku);
    }
  } else throw new RequestError("Unknown inventory workflow.");
  const unique = ids(itemIds);
  if (unique.length) for (const item of await db.select().from(items).where(inArray(items.id, unique))) {
    const destination = input.resource === "records" && (input.purchaseOrderId || input.salesSourceId) ? Number(input.locationId) : item.locationId!;
    await add(destination, item.sku);
  }
  return [...found].sort();
}

export async function reserveSkus(keys: string[], userId: number, token: string, requireExisting = false) {
  if (!keys.length) return;
  const values = sql.join(keys.map((lockKey) => sql`(${lockKey})`), sql`, `);
  const list = sql.join(keys.map((lockKey) => sql`${lockKey}`), sql`, `);
  // Transaction locks reject overlapping saves instead of waiting and overwriting.
  const mutex = await getDb().execute(sql`select pg_try_advisory_xact_lock(hashtextextended(lock_key, 17341)) as acquired from (select column1 as lock_key from (values ${values}) as names order by column1) as sorted`);
  if (mutex.rows.some((row) => !row.acquired)) throw new RequestError("This SKU is being used in this inventory. Try again after the other user finishes.", 409);
  if (requireExisting) {
    const owned = await getDb().execute(sql`select lock_key from sku_work_locks where lock_key in (${list}) and user_id=${userId} and token=${token} and expires_at > clock_timestamp() for update`);
    if (owned.rows.length !== keys.length) throw new RequestError("The SKU reservation is unavailable or expired. Close and reopen the form to refresh before saving.", 409);
  }
  const rows = sql.join(keys.map((lockKey) => sql`(${lockKey},${userId},${token},clock_timestamp() + interval '120 seconds')`), sql`, `);
  const result = await getDb().execute(sql`insert into sku_work_locks (lock_key,user_id,token,expires_at) values ${rows}
    on conflict (lock_key) do update set user_id=excluded.user_id, token=excluded.token, expires_at=excluded.expires_at
    where sku_work_locks.expires_at <= clock_timestamp() or (sku_work_locks.user_id=${userId} and sku_work_locks.token=${token}) returning lock_key`);
  if (result.rows.length !== keys.length) throw new RequestError("This SKU is already being used by another user in this inventory. Close this form and try again when they finish.", 409);
}
export async function releaseOtherSkus(keys: string[], userId: number, token: string) {
  if (!keys.length) return releaseSkus(userId, token);
  const list = sql.join(keys.map((lockKey) => sql`${lockKey}`), sql`, `);
  await getDb().execute(sql`delete from sku_work_locks where user_id=${userId} and token=${token} and lock_key not in (${list})`);
}
export async function releaseSkus(userId: number, token: string) {
  await getDb().execute(sql`delete from sku_work_locks where user_id=${userId} and token=${token}`);
}
export function skuWrite(resource: string, handler: (request: Request) => Promise<Response>) {
  return async (request: Request) => {
    try {
      const user = await requireApiUser(request, false, true);
      if (user instanceof Response) return user;
      const payload = await readJsonBody(request.clone(), 2_000_000);
      const token = request.headers.get("X-SKU-Lock") || randomUUID();
      return await withWriteTransaction(async () => {
        const keys = await skuKeys({ ...payload, resource }, user);
        await reserveSkus(keys, user.id, token, Boolean(request.headers.get("X-SKU-Lock")));
        const response = await handler(request);
        if (!request.headers.get("X-SKU-Lock")) await releaseSkus(user.id, token);
        return response;
      });
    } catch (error) { return failureResponse(error, randomUUID(), new URL(request.url).pathname); }
  };
}
