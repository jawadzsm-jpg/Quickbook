import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, auditLog, companies, exchangeRates, inventoryLocations, inventoryMovements, items, journalEntries, journalLines, transactionLines, transactions } from "@/db/schema";
import { canAccessCompany, requireApiUser, type SessionUser } from "@/lib/auth";
import { readJsonBody } from "@/lib/api";
import { RequestError, failureResponse } from "@/lib/errors";
import { averagePurchaseCosts, itemHomeCost } from "@/lib/item-cost";
import { guardFiledPeriod } from "@/lib/period-lock";
import { skuWrite } from "@/lib/sku-locks";
import { adjustWarehouseStock, resolveDocumentWarehouse, warehouseQuantities, warehouseSummaries } from "@/lib/warehouses";
import { MAX_ADJUSTMENT_LINES, STOCK_ADJUSTMENT_TYPE, adjustmentJournal, adjustmentTypeComment, adjustmentTypeFromComment, adjustmentTotals, adjustmentTypeLabels, changesValue, isAdjustmentType, planAdjustmentLine, roundMoney, type AdjustmentLinePlan } from "@/lib/stock-adjustment";

// Stock adjustments (Admin Controls → Stock adjustments): administrators change the quantity and/or total value of many
// items of one inventory. Each adjustment is a transaction of type "inventory adjustment" with one line per item, stock
// movements, and a balanced journal between the items' inventory asset accounts and the chosen adjustment account.

type LineDetail = { sku: string; itemNumber: string; name: string; quantityOnHand: number; newQuantity: number; currentValue: number; newValue: number; unitCost: number; newUnitCost: number; oldCost: number; assetAccountId: number };
const parseDetail = (comments: string): Partial<LineDetail> => { try { return JSON.parse(comments) as Partial<LineDetail>; } catch { return {}; } };
const isoDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const positiveId = (value: unknown) => { const id = Number(value); return Number.isSafeInteger(id) && id > 0 ? id : 0; };

async function adminFor(request: Request, companyId: number, mutating: boolean): Promise<SessionUser | Response> {
  const user = await requireApiUser(request, true, mutating);
  if (user instanceof Response) return user;
  if (!companyId || !canAccessCompany(user, companyId)) return Response.json({ error: "You do not have access to this company." }, { status: 403 });
  return user;
}

/** The inventory asset account an item posts to: its own linked asset account, else the company's home-currency Inventory account. */
async function assetAccounts(companyId: number, baseCurrency: string, rows: Array<{ assetAccountId: number | null }>) {
  const db = getDb();
  const linkedIds = [...new Set(rows.map((row) => row.assetAccountId).filter((id): id is number => Boolean(id)))];
  const linked = linkedIds.length ? await db.select().from(accounts).where(and(eq(accounts.companyId, companyId), eq(accounts.active, true), inArray(accounts.id, linkedIds))) : [];
  const [fallback] = await db.select().from(accounts).where(and(eq(accounts.companyId, companyId), eq(accounts.systemRole, "INVENTORY"), eq(accounts.currency, baseCurrency), eq(accounts.active, true))).limit(1);
  return (assetAccountId: number | null) => linked.find((account) => account.id === assetAccountId) ?? fallback;
}

async function nextReference(companyId: number) {
  const rows = await getDb().select({ number: transactions.number }).from(transactions).where(and(eq(transactions.companyId, companyId), eq(transactions.type, STOCK_ADJUSTMENT_TYPE)));
  const used = new Set(rows.map((row) => row.number.toUpperCase()));
  const highest = rows.reduce((max, row) => Math.max(max, Number(/^ADJ-(\d+)$/i.exec(row.number)?.[1] ?? 0)), 0);
  let next = highest + 1;
  while (used.has(`ADJ-${next}`)) next += 1;
  return `ADJ-${next}`;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const companyId = positiveId(url.searchParams.get("companyId"));
    const user = await adminFor(request, companyId, false);
    if (user instanceof Response) return user;
    const db = getDb();
    const [company] = await db.select({ id: companies.id, name: companies.name, baseCurrency: companies.baseCurrency }).from(companies).where(and(eq(companies.id, companyId), eq(companies.active, true))).limit(1);
    if (!company) return Response.json({ error: "Company not found." }, { status: 404 });
    const locations = await db.select({ id: inventoryLocations.id, name: inventoryLocations.name, code: inventoryLocations.code }).from(inventoryLocations).where(and(eq(inventoryLocations.companyId, companyId), eq(inventoryLocations.active, true))).orderBy(asc(inventoryLocations.name));
    const requestedLocation = positiveId(url.searchParams.get("locationId"));
    const locationId = locations.some((location) => location.id === requestedLocation) ? requestedLocation : locations[0]?.id ?? 0;
    const warehouses = locationId ? (await warehouseSummaries(db, companyId, locationId)).filter((warehouse) => warehouse.active).map(({ id, name, code, isDefault }) => ({ id, name, code, isDefault })) : [];
    const requestedWarehouse = positiveId(url.searchParams.get("warehouseId"));
    const warehouse = warehouses.find((entry) => entry.id === requestedWarehouse) ?? warehouses.find((entry) => entry.isDefault) ?? null;
    const accountRows = await db.select({ id: accounts.id, code: accounts.code, name: accounts.name, type: accounts.type, currency: accounts.currency, systemRole: accounts.systemRole }).from(accounts)
      .where(and(eq(accounts.companyId, companyId), eq(accounts.active, true), or(isNull(accounts.systemRole), ne(accounts.systemRole, "INVENTORY")))).orderBy(asc(accounts.code), asc(accounts.name));
    const defaultAccount = accountRows.find((account) => account.code === "5030") ?? accountRows.find((account) => account.name.toLowerCase() === "inventory adjustments");
    const rates = await db.select({ currency: exchangeRates.currencyCode, rate: exchangeRates.rate }).from(exchangeRates).where(and(eq(exchangeRates.companyId, companyId), eq(exchangeRates.active, true))).orderBy(asc(exchangeRates.currencyCode));
    const stock = locationId ? await db.select({ id: items.id, sku: items.sku, itemNumber: items.itemNumber, name: items.name, description: items.description, category: items.category, partNumber: items.partNumber, upcNumber: items.upcNumber, quantity: items.quantity, cost: items.cost, lastPurchasePrice: items.lastPurchasePrice, amountsIncludeVat: items.amountsIncludeVat, assetAccountId: items.assetAccountId }).from(items)
      .where(and(eq(items.companyId, companyId), eq(items.locationId, locationId), eq(items.itemType, "stock-part"), eq(items.status, "active"))).orderBy(asc(items.name)) : [];
    const averages = await averagePurchaseCosts(stock.map((item) => item.id));
    const inWarehouse = warehouse && !warehouse.isDefault ? await warehouseQuantities(db, warehouse.id, stock.map((item) => item.id)) : null;
    const defaultQuantities = warehouses.length > 1 ? await warehouseQuantities(db, warehouses.find((entry) => entry.isDefault)?.id, stock.map((item) => item.id)) : null;
    const assetFor = await assetAccounts(companyId, company.baseCurrency, stock);
    const itemRows = stock.map((item) => ({
      id: item.id, sku: item.sku, itemNumber: item.itemNumber ?? "", name: item.name, description: item.description, category: item.category, partNumber: item.partNumber, upcNumber: item.upcNumber,
      // Total in the inventory; warehouseQuantity is what the selected warehouse holds (quantity adjustments change it).
      quantity: Number(item.quantity), warehouseQuantity: inWarehouse ? inWarehouse.get(item.id) ?? 0 : defaultQuantities?.get(item.id) ?? Number(item.quantity),
      unitCost: roundMoney(itemHomeCost(item, averages)), assetAccount: assetFor(item.assetAccountId)?.name ?? "",
    }));
    const history = await db.select().from(transactions).where(and(eq(transactions.companyId, companyId), eq(transactions.type, STOCK_ADJUSTMENT_TYPE))).orderBy(desc(transactions.transactionDate), desc(transactions.id)).limit(100);
    const historyLines = history.length ? await db.select().from(transactionLines).where(inArray(transactionLines.transactionId, history.map((row) => row.id))).orderBy(asc(transactionLines.id)) : [];
    const locationNames = new Map(locations.map((location) => [location.id, location.name]));
    const adjustments = history.map((row) => ({
      id: row.id, reference: row.number, date: row.transactionDate, type: adjustmentTypeFromComment(row.comments), account: row.account, memo: row.memo, currency: row.currency, exchangeRate: row.exchangeRate, totalValue: row.baseTotal, documentTotal: row.total,
      locationId: row.locationId, locationName: locationNames.get(row.locationId ?? 0) ?? "", createdAt: row.createdAt,
      lines: historyLines.filter((line) => line.transactionId === row.id).map((line) => { const detail = parseDetail(line.comments); return { itemId: line.itemId, description: line.description, sku: detail.sku ?? "", quantityOnHand: detail.quantityOnHand ?? 0, newQuantity: detail.newQuantity ?? 0, quantityDifference: line.quantity, currentValue: detail.currentValue ?? 0, newValue: detail.newValue ?? 0, valueDifference: roundMoney((detail.newValue ?? 0) - (detail.currentValue ?? 0)), newUnitCost: detail.newUnitCost ?? line.unitCost }; }),
    }));
    return Response.json({ company, locations, locationId, warehouses, warehouseId: warehouse?.id ?? null, accounts: accountRows, defaultAccountId: defaultAccount?.id ?? null, exchangeRates: rates, items: itemRows, adjustments, nextReference: await nextReference(companyId), today: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" }) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failureResponse(error, randomUUID(), "/api/stock-adjustments"); }
}

async function handlePOST(request: Request) {
  const payload = await readJsonBody(request, 1_000_000) as Record<string, unknown>;
  const companyId = positiveId(payload.companyId);
  const user = await adminFor(request, companyId, true);
  if (user instanceof Response) return user;
  const db = getDb();
  const type = payload.type;
  if (!isAdjustmentType(type)) throw new RequestError("Choose an adjustment type.");
  const date = payload.date;
  if (!isoDate(date)) throw new RequestError("Enter a valid adjustment date.");
  const memo = String(payload.memo ?? "").trim();
  if (memo.length > 1000) throw new RequestError("The memo is too long (1,000 characters at most).");
  const inputLines = Array.isArray(payload.lines) ? payload.lines.filter((line): line is Record<string, unknown> => Boolean(line) && typeof line === "object") : [];
  if (!inputLines.length || inputLines.length > MAX_ADJUSTMENT_LINES) throw new RequestError(`Add 1 to ${MAX_ADJUSTMENT_LINES} items.`);
  const itemIds = inputLines.map((line) => positiveId(line.itemId));
  if (itemIds.some((id) => !id) || new Set(itemIds).size !== itemIds.length) throw new RequestError("Select each item once.");

  const [company] = await db.select().from(companies).where(and(eq(companies.id, companyId), eq(companies.active, true))).limit(1);
  if (!company) throw new RequestError("Company not found.", 404);
  const locationId = positiveId(payload.locationId);
  const [location] = await db.select().from(inventoryLocations).where(and(eq(inventoryLocations.id, locationId), eq(inventoryLocations.companyId, companyId), eq(inventoryLocations.active, true))).limit(1);
  if (!location) throw new RequestError("Select an active inventory of this company.");
  const warehouse = await resolveDocumentWarehouse(db, companyId, locationId, payload.warehouseId);
  if ("error" in warehouse) throw new RequestError(warehouse.error);
  if (changesValue(type) && !warehouse.isDefault) throw new RequestError("Value adjustments change the whole inventory. Choose the default warehouse.");

  const currency = String(payload.currency ?? company.baseCurrency).trim().toUpperCase();
  const exchangeRate = currency === company.baseCurrency ? 1 : Number(payload.exchangeRate);
  if (!/^[A-Z]{3}$/.test(currency) || !Number.isFinite(exchangeRate) || exchangeRate <= 0 || exchangeRate > 1e6) throw new RequestError("Choose a currency and a positive exchange rate.");
  if (currency !== company.baseCurrency) {
    const [rate] = await db.select({ id: exchangeRates.id }).from(exchangeRates).where(and(eq(exchangeRates.companyId, companyId), eq(exchangeRates.currencyCode, currency), eq(exchangeRates.active, true))).limit(1);
    if (!rate) throw new RequestError(`Add ${currency} under Management > Currencies before using it.`);
  }

  const [adjustmentAccount] = await db.select().from(accounts).where(and(eq(accounts.id, positiveId(payload.accountId)), eq(accounts.companyId, companyId), eq(accounts.active, true))).limit(1);
  if (!adjustmentAccount) throw new RequestError("Choose an active adjustment account of this company.");
  if (adjustmentAccount.systemRole === "INVENTORY") throw new RequestError("The adjustment account cannot be the inventory asset account. Choose an expense or cost of goods sold account such as Inventory Adjustments.");

  const reference = String(payload.reference ?? "").trim() || await nextReference(companyId);
  if (reference.length > 40) throw new RequestError("The reference is too long (40 characters at most).");
  const [duplicate] = await db.select({ id: transactions.id }).from(transactions).where(and(eq(transactions.companyId, companyId), eq(transactions.type, STOCK_ADJUSTMENT_TYPE), sql`upper(${transactions.number}) = ${reference.toUpperCase()}`)).limit(1);
  if (duplicate) throw new RequestError(`Reference ${reference} is already used by another stock adjustment.`, 409);

  const locked = await guardFiledPeriod(request, companyId, [date], `create stock adjustment ${reference}`, user);
  if (locked) return locked;

  const rows = await db.select().from(items).where(and(eq(items.companyId, companyId), eq(items.locationId, locationId), inArray(items.id, itemIds))).orderBy(asc(items.id)).for("update");
  const byId = new Map(rows.map((row) => [row.id, row]));
  const averages = await averagePurchaseCosts(itemIds);
  const warehouseStock = await warehouseQuantities(db, warehouse.id, itemIds);
  const assetFor = await assetAccounts(companyId, company.baseCurrency, rows);
  const planned: Array<{ item: typeof rows[number]; plan: AdjustmentLinePlan; assetAccountId: number }> = [];
  for (const [index, line] of inputLines.entries()) {
    const item = byId.get(itemIds[index]);
    if (!item || item.itemType !== "stock-part" || item.status !== "active") throw new RequestError("Select active stock items of this inventory.");
    const label = `${item.sku} · ${item.name}`;
    const onHand = changesValue(type) ? Number(item.quantity) : warehouseStock.get(item.id) ?? 0;
    if (line.expectedQuantity !== undefined && Math.abs(Number(line.expectedQuantity) - onHand) > 0.000001) throw new RequestError(`The quantity on hand of ${label} changed while you were editing. Reload and review it.`, 409);
    const plan = planAdjustmentLine(type, { quantity: onHand, unitCost: itemHomeCost(item, averages) }, { newQuantity: line.newQuantity as number, quantityDifference: line.quantityDifference as number, newValue: line.newValue as number }, exchangeRate);
    if ("error" in plan) throw new RequestError(`${label}: ${plan.error}`);
    // Stock leaving the default warehouse must still be there (other warehouses keep their own quantities).
    if ((warehouseStock.get(item.id) ?? 0) + plan.quantityDifference < -0.000001) throw new RequestError(`${label}: ${warehouse.name} holds only ${warehouseStock.get(item.id) ?? 0}.`);
    const asset = assetFor(item.assetAccountId);
    if (!asset && plan.valueDifference) throw new RequestError(`Link an active inventory asset account in ${company.baseCurrency} (Chart of Accounts) before adjusting ${label}.`, 409);
    planned.push({ item, plan, assetAccountId: asset?.id ?? 0 });
  }

  const totals = adjustmentTotals(planned.map((entry) => entry.plan));
  const documentTotal = roundMoney(totals.totalValue / exchangeRate);
  const [record] = await db.insert(transactions).values({
    companyId, locationId, warehouseId: warehouse.id, number: reference, type: STOCK_ADJUSTMENT_TYPE, party: adjustmentAccount.name, account: adjustmentAccount.name,
    transactionDate: date, status: "posted", memo, comments: adjustmentTypeComment(type), subtotal: documentTotal, vatRate: 0, vatAmount: 0, total: documentTotal,
    currency, exchangeRate, baseTotal: totals.totalValue, createdByUserId: user.id,
  }).returning();
  for (const { item, plan, assetAccountId } of planned) {
    const detail: LineDetail = { sku: item.sku, itemNumber: item.itemNumber ?? "", name: item.name, quantityOnHand: plan.quantityOnHand, newQuantity: plan.newQuantity, currentValue: plan.currentValue, newValue: plan.newValue, unitCost: plan.unitCost, newUnitCost: plan.newUnitCost, oldCost: item.cost, assetAccountId };
    const lineTotal = roundMoney(plan.valueDifference / exchangeRate);
    await db.insert(transactionLines).values({ transactionId: record.id, itemId: item.id, description: `${item.sku} · ${item.name}`, comments: JSON.stringify(detail), quantity: plan.quantityDifference, unitPrice: 0, unitCost: plan.newUnitCost, vatCode: "OUT_OF_SCOPE", vatRate: 0, subtotal: lineTotal, vatAmount: 0, total: lineTotal });
    if (plan.quantityDifference) {
      await db.update(items).set({ quantity: sql`${items.quantity} + ${plan.quantityDifference}` }).where(eq(items.id, item.id));
      await adjustWarehouseStock(db, warehouse.id, item.id, plan.quantityDifference);
      await db.insert(inventoryMovements).values({ itemId: item.id, transactionId: record.id, movementDate: date, movementType: STOCK_ADJUSTMENT_TYPE, quantity: plan.quantityDifference, unitCost: plan.unitCost, reference, warehouseId: warehouse.id });
    }
    // A value adjustment sets the item's saved unit cost (home currency).
    if (changesValue(type) && plan.newQuantity > 0) await db.update(items).set({ cost: plan.newUnitCost }).where(eq(items.id, item.id));
  }
  const journal = adjustmentJournal(planned.filter((entry) => entry.assetAccountId).map((entry) => ({ assetAccountId: entry.assetAccountId, valueDifference: entry.plan.valueDifference })), adjustmentAccount.id, exchangeRate);
  if (journal.length) {
    const names = new Map((await db.select({ id: accounts.id, name: accounts.name }).from(accounts).where(inArray(accounts.id, journal.map((line) => line.accountId)))).map((account) => [account.id, account.name]));
    const [entry] = await db.insert(journalEntries).values({ companyId, locationId, transactionId: record.id, entryDate: date, reference, description: `Stock adjustment (${adjustmentTypeLabels[type]})${memo ? `: ${memo.slice(0, 200)}` : ""}`, currency, exchangeRate }).returning();
    await db.insert(journalLines).values(journal.map((line) => ({ journalEntryId: entry.id, accountId: line.accountId, accountName: names.get(line.accountId) ?? "", debit: line.debit, credit: line.credit, originalDebit: line.originalDebit, originalCredit: line.originalCredit })));
  }
  await db.insert(auditLog).values({ companyId, action: "created", entityType: "stock_adjustment", entityId: record.id, details: JSON.stringify({ reference, type, userId: user.id, userName: user.fullName || user.email, locationId, warehouseId: warehouse.id, account: adjustmentAccount.name, currency, exchangeRate, totalValue: totals.totalValue, lines: planned.map(({ item, plan }) => ({ itemId: item.id, sku: item.sku, ...plan })) }) });
  return Response.json({ adjustment: { id: record.id, reference, totalValue: totals.totalValue, lineCount: totals.lineCount } }, { status: 201 });
}

async function handleDELETE(request: Request) {
  const payload = await readJsonBody(request, 10_000) as Record<string, unknown>;
  const companyId = positiveId(payload.companyId);
  const user = await adminFor(request, companyId, true);
  if (user instanceof Response) return user;
  const reason = String(payload.reason ?? "").trim();
  if (!reason || reason.length > 1000) throw new RequestError("Write a reason for deleting the adjustment (1,000 characters at most).");
  const db = getDb();
  const [record] = await db.select().from(transactions).where(and(eq(transactions.id, positiveId(payload.id)), eq(transactions.companyId, companyId), eq(transactions.type, STOCK_ADJUSTMENT_TYPE))).for("update");
  if (!record) throw new RequestError("Stock adjustment not found.", 404);
  const locked = await guardFiledPeriod(request, companyId, [record.transactionDate], `delete stock adjustment ${record.number}`, user);
  if (locked) return locked;
  const lines = await db.select().from(transactionLines).where(eq(transactionLines.transactionId, record.id));
  const movements = await db.select().from(inventoryMovements).where(eq(inventoryMovements.transactionId, record.id));
  const itemIds = [...new Set([...lines.map((line) => line.itemId), ...movements.map((movement) => movement.itemId)].filter((id): id is number => Boolean(id)))].sort((a, b) => a - b);
  const stock = itemIds.length ? await db.select().from(items).where(inArray(items.id, itemIds)).orderBy(asc(items.id)).for("update") : [];
  // Stock the adjustment added must still be on hand (in its warehouse) before it can be taken back out.
  for (const movement of movements) if (movement.quantity > 0) {
    const item = stock.find((row) => row.id === movement.itemId);
    const inWarehouse = (await warehouseQuantities(db, movement.warehouseId, [movement.itemId])).get(movement.itemId) ?? 0;
    if (!item || item.quantity - movement.quantity < -0.000001 || inWarehouse - movement.quantity < -0.000001) throw new RequestError(`Cannot delete ${record.number}: the stock it added for ${item?.name ?? "an item"} has already been used or moved.`, 409);
  }
  for (const movement of movements) {
    await db.update(items).set({ quantity: sql`${items.quantity} - ${movement.quantity}` }).where(eq(items.id, movement.itemId));
    await adjustWarehouseStock(db, movement.warehouseId, movement.itemId, -movement.quantity);
  }
  // A value adjustment set the saved cost; put the earlier cost back unless something else changed it since.
  if (changesValue(adjustmentTypeFromComment(record.comments))) for (const line of lines) {
    const detail = parseDetail(line.comments);
    const item = stock.find((row) => row.id === line.itemId);
    if (item && typeof detail.oldCost === "number" && Math.abs(item.cost - Number(detail.newUnitCost)) < 0.00005) await db.update(items).set({ cost: detail.oldCost }).where(eq(items.id, item.id));
  }
  // Lines, movements and the journal are removed with the document; the audit log keeps what it was.
  await db.delete(transactions).where(eq(transactions.id, record.id));
  await db.insert(auditLog).values({ companyId, action: "deleted", entityType: "stock_adjustment", entityId: record.id, details: JSON.stringify({ reference: record.number, reason, userId: user.id, userName: user.fullName || user.email, date: record.transactionDate, totalValue: record.baseTotal, lines: lines.map((line) => ({ itemId: line.itemId, description: line.description, quantity: line.quantity, total: line.total })), stockReversed: true }) });
  return Response.json({ ok: true });
}

export const POST = skuWrite("stock-adjustments", handlePOST);
export const DELETE = skuWrite("stock-adjustments", handleDELETE);
