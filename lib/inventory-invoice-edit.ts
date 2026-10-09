import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, auditLog, companies, inventoryMovements, items, journalEntries, journalLines, packingListLines, transactionLines, transactions, vatCodes, warrantySlips } from "@/db/schema";
import { fullItemDescription } from "./item-description";
import { heldByOthers, heldStockMessage } from "./stock-holds";
import { averagePurchaseCosts, itemHomeCost } from "./item-cost";

// Inventory users may correct which product was sold, add free (zero-price) lines such as accessories, add stock returns
// (negative quantity, zero price), and record serial
// numbers and comments on a saved invoice. Quantities, prices, VAT, the customer and the invoice total never change, so the
// customer balance, VAT and revenue totals are untouched; only stock, cost of sales and the revenue account split move.

type Db = ReturnType<typeof getDb>;
type Invoice = typeof transactions.$inferSelect;
type Line = typeof transactionLines.$inferSelect;

const round = (value: number) => Math.round(value * 100) / 100;
const lineItemTypes = new Set(["service", "stock-part", "non-stock-part", "other-charge"]);
const fallbackVatRates: Record<string, number> = { STANDARD: 5, ZERO: 0, EXEMPT: 0, REVERSE_CHARGE: 5, IMPORT_GOODS: 5, OUT_OF_SCOPE: 0 };
const closedStatuses = new Set(["cancelled", "canceled", "void", "voided"]);
const fail = (error: string, status = 400) => Response.json({ error }, { status });

export const inventoryInvoiceFields = new Set(["kind", "id", "companyId", "revision", "editMode", "lineDetails", "appendLines", "comments"]);

export async function applyInventoryInvoiceEdit(db: Db, input: { companyId: number; actorId: number; invoice: Invoice; lines: Line[]; payload: Record<string, unknown> }) {
  const { companyId, actorId, invoice, lines, payload } = input;
  if (Object.keys(payload).some((key) => !inventoryInvoiceFields.has(key))) return fail("Inventory users may change items, add zero-price lines, serial numbers and comments only.", 403);
  if (closedStatuses.has(String(invoice.status).toLowerCase())) return fail("Cancelled or void invoices cannot be changed.", 409);
  if (!invoice.locationId) return fail("This invoice has no inventory location.", 409);
  const details = payload.lineDetails === undefined ? [] : payload.lineDetails;
  const appends = payload.appendLines === undefined ? [] : payload.appendLines;
  if (!Array.isArray(details) || !Array.isArray(appends)) return fail("Select valid invoice lines.");
  if (appends.length > 100) return fail("Add no more than 100 invoice lines at a time.");
  const invoiceComments = payload.comments === undefined ? invoice.comments : String(payload.comments);
  if (invoiceComments.length > 5000) return fail("Comments must be 5000 characters or fewer.");

  type Swap = { line: Line; itemId: number };
  const textUpdates: { line: Line; comments: string; serialNumber: string }[] = [];
  const swaps: Swap[] = [];
  const seen = new Set<number>();
  for (const raw of details) {
    if (!raw || typeof raw !== "object" || Object.keys(raw).some((key) => !["id", "comments", "serialNumber", "itemId", "fromItemId"].includes(key))) return fail("Only the item, serial numbers and comments of an invoice line can be changed.");
    const entry = raw as Record<string, unknown>;
    const line = lines.find((candidate) => candidate.id === Number(entry.id));
    if (!line || seen.has(line.id)) return fail("Select unique lines belonging to this invoice.");
    seen.add(line.id);
    const comments = entry.comments === undefined ? line.comments : String(entry.comments);
    const serialNumber = entry.serialNumber === undefined ? line.serialNumber : String(entry.serialNumber);
    if (comments.length > 2000 || serialNumber.length > 20000) return fail("Line comments or serial numbers are too long.");
    const swapping = entry.itemId !== undefined && Number(entry.itemId) !== line.itemId;
    if (swapping) {
      const itemId = Number(entry.itemId);
      if (!Number.isInteger(itemId) || itemId <= 0) return fail("Select a valid replacement item.");
      // The editor sends the item it saw; a different saved item means someone changed the line meanwhile.
      if (Number(entry.fromItemId) !== line.itemId) return fail("This invoice line changed. Reopen the invoice before saving.", 409);
      if (!line.itemId || line.isFreightCharge || Number(line.quantity) <= 0) return fail(`Only item sale lines can change item (${line.description.split("\n")[0]}).`, 409);
      swaps.push({ line, itemId });
    } else if (line.serialNumber && serialNumber !== line.serialNumber && !serialNumber.startsWith(line.serialNumber + "\n")) {
      return fail("Keep existing serial numbers on unchanged items; add new ones on new lines.", 403);
    }
    if (swapping || comments !== line.comments || serialNumber !== line.serialNumber) textUpdates.push({ line, comments, serialNumber: swapping && entry.serialNumber === undefined ? "" : serialNumber });
  }
  const appended = appends.map((raw) => {
    const entry = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    return { itemId: Number(entry.itemId), quantity: Number(entry.quantity), comments: String(entry.comments ?? ""), serialNumber: String(entry.serialNumber ?? ""), unitPrice: Number(entry.unitPrice ?? 0), keys: Object.keys(entry) };
  });
  if (appended.some((line) => line.keys.some((key) => !["itemId", "quantity", "comments", "serialNumber", "unitPrice"].includes(key)))) return fail("New lines take an item, quantity, serial numbers and comments only.");
  if (appended.some((line) => line.unitPrice !== 0)) return fail("Inventory users may add zero-price lines only. Ask an accountant to add charged items.", 403);
  // A negative quantity is a stock return: the item comes back into stock at zero selling price.
  if (appended.some((line) => !Number.isInteger(line.itemId) || line.itemId <= 0 || !Number.isFinite(line.quantity) || line.quantity === 0 || Math.abs(line.quantity) > 1_000_000)) return fail("Select an item and a quantity for every new line.");
  if (!swaps.length && !appended.length && !textUpdates.length && invoiceComments === invoice.comments) return fail("Nothing to save.");

  if (swaps.length) {
    if (invoice.salesSourceId || invoice.sourceTransactionId) return fail("This invoice is linked to a sales order or estimate. Ask an accountant to change items through the source document.", 409);
    const swapIds = swaps.map((swap) => swap.line.id);
    const [packed] = await db.select({ id: packingListLines.id }).from(packingListLines).where(inArray(packingListLines.invoiceLineId, swapIds)).limit(1);
    if (packed) return fail("Remove the line from its packing list before changing its item.", 409);
    const [warranty] = await db.select({ id: warrantySlips.id }).from(warrantySlips).where(inArray(warrantySlips.invoiceLineId, swapIds)).limit(1);
    if (warranty) return fail("A warranty slip is linked to this line. Its item cannot be changed.", 409);
  }

  const oldItemIds = swaps.map((swap) => swap.line.itemId!);
  const newItemIds = [...swaps.map((swap) => swap.itemId), ...appended.map((line) => line.itemId)];
  const itemIds = [...new Set([...oldItemIds, ...newItemIds])];
  const itemRows = itemIds.length ? await db.select().from(items).where(and(eq(items.companyId, companyId), inArray(items.id, itemIds))).orderBy(asc(items.id)).for("update") : [];
  const itemById = new Map(itemRows.map((item) => [item.id, item]));
  for (const id of newItemIds) {
    const item = itemById.get(id);
    if (!item || item.locationId !== invoice.locationId) return fail("Select items from this invoice's inventory.");
    if (item.status === "inactive") return fail(`${item.sku} ${item.name} is inactive.`, 409);
    if (!lineItemTypes.has(item.itemType)) return fail("Select stock, non-stock, service or other-charge items only.");
  }
  if (appended.some((line) => line.quantity < 0 && itemById.get(line.itemId)?.itemType !== "stock-part")) return fail("Stock returns require a stock item.");

  const exchangeRate = Number(invoice.exchangeRate || 1);
  const configured = await db.select({ code: vatCodes.code, rate: vatCodes.rate }).from(vatCodes).where(and(eq(vatCodes.companyId, companyId), eq(vatCodes.active, true)));
  const vatRates = configured.length ? Object.fromEntries(configured.map((entry) => [entry.code, Number(entry.rate)])) : fallbackVatRates;
  // Cost basis matches stock returns: what the item was bought for (average purchase cost, else last purchase price,
  // else its saved cost excluding recoverable purchase VAT), in the invoice currency.
  const averages = await averagePurchaseCosts([...itemById.keys()]);
  const unitCostFor = (item: typeof items.$inferSelect) => {
    const purchaseVat = Number(vatRates[item.purchaseVatCode] || 0);
    const homeCost = itemHomeCost(item, averages, purchaseVat);
    return Number.isFinite(homeCost) && homeCost > 0 ? homeCost / exchangeRate : 0;
  };

  const requested = new Map<number, number>();
  const take = (itemId: number, quantity: number) => requested.set(itemId, round((requested.get(itemId) ?? 0) + quantity));
  for (const swap of swaps) { take(swap.itemId, Number(swap.line.quantity)); take(swap.line.itemId!, -Number(swap.line.quantity)); }
  for (const line of appended) take(line.itemId, line.quantity);
  const shortage = [...requested].map(([id, quantity]) => ({ item: itemById.get(id)!, quantity })).find(({ item, quantity }) => item?.itemType === "stock-part" && quantity > 0 && quantity > Number(item.quantity));
  if (shortage) return fail(`Not enough stock. ${shortage.item.sku} ${shortage.item.name}: available ${shortage.item.quantity}, needed ${shortage.quantity}.`, 409);
  // Stock on hold for another sales rep stays reserved; the invoice's own sales rep may use it.
  const held = await heldByOthers([...requested.keys()], invoice.salesman);
  const heldShortage = [...requested].map(([id, quantity]) => ({ item: itemById.get(id)!, quantity })).find(({ item, quantity }) => item?.itemType === "stock-part" && quantity > 0 && quantity > Number(item.quantity) - (held.get(item.id) ?? 0));
  if (heldShortage) return fail(`Stock is on hold for another sales rep. ${heldStockMessage(heldShortage.item, held.get(heldShortage.item.id) ?? 0, heldShortage.quantity)}`, 409);

  const accountRows = await db.select().from(accounts).where(eq(accounts.companyId, companyId));
  const [company] = await db.select({ baseCurrency: companies.baseCurrency }).from(companies).where(eq(companies.id, companyId)).limit(1);
  const roleAccount = (role: string, fallback: string) => {
    const candidates = accountRows.filter((account) => account.systemRole === role && account.active).sort((a, b) => a.id - b.id);
    return (candidates.find((account) => account.currency === company?.baseCurrency) ?? candidates.find((account) => account.currency === invoice.currency) ?? candidates[0])?.name ?? fallback;
  };
  const accountFor = (item: typeof items.$inferSelect | undefined, field: "incomeAccountId" | "cogsAccountId" | "assetAccountId", role: string, fallback: string) =>
    accountRows.find((account) => account.id === item?.[field])?.name ?? roleAccount(role, fallback);
  const adjustments = new Map<string, number>();
  const debit = (account: string, amount: number) => adjustments.set(account, round((adjustments.get(account) ?? 0) + amount));
  const movementDate = invoice.transactionDate;
  const reference = invoice.number;

  for (const swap of swaps) {
    const quantity = Number(swap.line.quantity);
    const oldItem = itemById.get(swap.line.itemId!);
    const newItem = itemById.get(swap.itemId)!;
    const income = round(Number(swap.line.subtotal) * exchangeRate);
    debit(accountFor(oldItem, "incomeAccountId", "SALES", "Sales Revenue"), income);
    debit(accountFor(newItem, "incomeAccountId", "SALES", "Sales Revenue"), -income);
    if (oldItem?.itemType === "stock-part") {
      const homeCogs = round(quantity * Number(swap.line.unitCost) * exchangeRate);
      debit(accountFor(oldItem, "cogsAccountId", "COGS", "Cost of Goods Sold"), -homeCogs);
      debit(accountFor(oldItem, "assetAccountId", "INVENTORY", "Inventory Asset"), homeCogs);
      await db.insert(inventoryMovements).values({ itemId: oldItem.id, transactionId: invoice.id, movementDate, movementType: "invoice item change", quantity, unitCost: Number(swap.line.unitCost), reference });
    }
    const unitCost = unitCostFor(newItem);
    if (newItem.itemType === "stock-part") {
      const homeCogs = round(quantity * unitCost * exchangeRate);
      debit(accountFor(newItem, "cogsAccountId", "COGS", "Cost of Goods Sold"), homeCogs);
      debit(accountFor(newItem, "assetAccountId", "INVENTORY", "Inventory Asset"), -homeCogs);
      await db.insert(inventoryMovements).values({ itemId: newItem.id, transactionId: invoice.id, movementDate, movementType: "invoice item change", quantity: -quantity, unitCost, reference });
    }
    await db.update(transactionLines).set({ itemId: newItem.id, description: fullItemDescription(newItem) || newItem.name, unitCost }).where(eq(transactionLines.id, swap.line.id));
  }

  const documentVatCode = String(lines.find((line) => !line.isFreightCharge)?.vatCode || "STANDARD");
  const documentVatRate = Number(lines.find((line) => !line.isFreightCharge)?.vatRate ?? 0);
  if (appended.length) {
    const rows = appended.map((line) => {
      const item = itemById.get(line.itemId)!;
      const isReturn = line.quantity < 0;
      return { transactionId: invoice.id, itemId: item.id, description: fullItemDescription(item) || item.name, comments: line.comments, serialNumber: line.serialNumber, quantity: line.quantity, unitPrice: 0, freightCharge: 0, isFreightCharge: false, unitCost: unitCostFor(item), vatCode: isReturn ? "ZERO" : documentVatCode, vatRate: isReturn ? 0 : documentVatRate, subtotal: 0, vatAmount: 0, total: 0 };
    });
    await db.insert(transactionLines).values(rows);
    for (const row of rows) {
      const item = itemById.get(row.itemId)!;
      if (item.itemType !== "stock-part") continue;
      const homeCogs = round(row.quantity * row.unitCost * exchangeRate);
      debit(accountFor(item, "cogsAccountId", "COGS", "Cost of Goods Sold"), homeCogs);
      debit(accountFor(item, "assetAccountId", "INVENTORY", "Inventory Asset"), -homeCogs);
      await db.insert(inventoryMovements).values({ itemId: item.id, transactionId: invoice.id, movementDate, movementType: "invoice", quantity: -row.quantity, unitCost: row.unitCost, reference });
    }
  }
  for (const [itemId, quantity] of requested) {
    if (quantity && itemById.get(itemId)?.itemType === "stock-part") await db.update(items).set({ quantity: Number(itemById.get(itemId)!.quantity) - quantity }).where(eq(items.id, itemId));
  }

  const journal = [...adjustments].filter(([, amount]) => amount !== 0);
  if (journal.length) {
    const [entry] = await db.select({ id: journalEntries.id }).from(journalEntries).where(eq(journalEntries.transactionId, invoice.id)).limit(1);
    if (!entry) return fail("The invoice journal entry is missing. Ask an accountant to repair its posting.", 409);
    await db.insert(journalLines).values(journal.map(([accountName, amount]) => ({ journalEntryId: entry.id, accountName, debit: amount > 0 ? amount : 0, credit: amount < 0 ? -amount : 0 })));
  }
  for (const update of textUpdates) await db.update(transactionLines).set({ comments: update.comments, serialNumber: update.serialNumber }).where(eq(transactionLines.id, update.line.id));
  if (invoiceComments !== invoice.comments) await db.update(transactions).set({ comments: invoiceComments }).where(eq(transactions.id, invoice.id));

  await db.insert(auditLog).values({ companyId, action: "updated", entityType: "transaction", entityId: invoice.id, details: JSON.stringify({
    mode: "inventory-invoice", actorId,
    itemChanges: swaps.map((swap) => ({ lineId: swap.line.id, from: swap.line.itemId, to: swap.itemId, quantity: Number(swap.line.quantity) })),
    addedLines: appended.map((line) => ({ itemId: line.itemId, quantity: line.quantity, stockReturn: line.quantity < 0 })),
    textChanges: textUpdates.map((update) => ({ lineId: update.line.id, before: { comments: update.line.comments, serialNumber: update.line.serialNumber } })),
    commentsChanged: invoiceComments !== invoice.comments,
  }) });
  const [record] = await db.select().from(transactions).where(eq(transactions.id, invoice.id)).limit(1);
  return Response.json({ record });
}
