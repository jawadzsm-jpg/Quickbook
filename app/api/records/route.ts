import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import {
  accounts, auditLog, companySettings, contacts, inventoryLocations, inventoryMovements, items, journalEntries,
  journalLines, transactionLines, transactions, vatCodes,
} from "../../../db/schema";
import { verifyAdminPin } from "../../../lib/admin-pin";
import { hasPermission, requireApiUser, type Permission, type SessionUser } from "@/lib/auth";

type RecordKind = "transactions" | "contacts" | "items" | "accounts";
type InputLine = { itemId?: number | string | null; description?: string; quantity?: number | string; unitPrice?: number | string; unitCost?: number | string; vatCode?: string; vatRate?: number | string };

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected database error";
  return message.includes("does not exist") ? "The accounting database is being updated. Please refresh in a moment." : message;
}

const round = (value: number) => Math.round(value * 100) / 100;
const fallbackVatRates: Record<string, number> = { STANDARD: 5, ZERO: 0, EXEMPT: 0, OUT_OF_SCOPE: 0 };
const accountRoles = ["BANK", "AR", "AP", "INVENTORY", "INPUT_VAT", "OUTPUT_VAT", "EQUITY", "SALES", "OTHER_INCOME", "COGS", "PURCHASES", "EXPENSE", "PAYROLL", "SUSPENSE"];

function writePermission(kind: RecordKind, payload: Record<string, unknown>): Permission | "admin" {
  if (kind === "items") return "inventory:manage";
  if (kind === "accounts") return "accounting:manage";
  if (kind === "contacts") {
    if (payload.type === "customer") return "customers:manage";
    if (payload.type === "vendor") return "vendors:manage";
    return "admin";
  }
  const type = String(payload.type ?? "");
  if (["invoice", "estimate", "sales order", "sales receipt", "credit memo", "customer payment"].includes(type)) return "sales:write";
  if (["bill", "purchase order", "vendor credit", "bill payment", "vendor payment"].includes(type)) return "purchases:write";
  if (["expense", "deposit", "cheque", "transfer", "opening balance", "journal entry"].includes(type)) return "banking:write";
  return "accounting:manage";
}

function mayWrite(user: SessionUser, permission: Permission | "admin") {
  return permission === "admin" ? user.role === "admin" : hasPermission(user, permission);
}

async function createUniqueItemSku() {
  const db = getDb();
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const sku = crypto.randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase();
    const match = await db.select({ id: items.id }).from(items).where(eq(items.sku, sku)).limit(1);
    if (!match.length) return sku;
  }
  throw new Error("Could not generate a unique SKU. Please try again.");
}

export async function GET(request: Request) {
  const authorization = await requireApiUser(request, "workspace:read");
  if (authorization instanceof Response) return authorization;
  try {
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind") as RecordKind | null;
    const id = Number(url.searchParams.get("id"));
    const companyId = Number(url.searchParams.get("companyId"));
    const locationId = Number(url.searchParams.get("locationId"));
    if (!Number.isInteger(companyId) || companyId <= 0) return Response.json({ error: "Select a company." }, { status: 400 });
    const db = getDb();
    if (kind === "transactions" && id) {
      const [record] = await db.select().from(transactions).where(and(eq(transactions.id, id), eq(transactions.companyId, companyId)));
      if (!record) return Response.json({ error: "Transaction not found." }, { status: 404 });
      const lines = await db.select().from(transactionLines).where(eq(transactionLines.transactionId, id)).orderBy(asc(transactionLines.id));
      const journal = await db.select({
        accountName: journalLines.accountName, debit: journalLines.debit, credit: journalLines.credit,
      }).from(journalLines).innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id)).where(eq(journalEntries.transactionId, id)).orderBy(asc(journalLines.id));
      return Response.json({ record, lines, journal });
    }
    if (kind === "contacts") return Response.json({ records: await db.select().from(contacts).where(eq(contacts.companyId, companyId)).orderBy(asc(contacts.name)) });
    if (kind === "items") return Response.json({ records: await db.select().from(items).where(and(eq(items.companyId, companyId), eq(items.locationId, locationId))).orderBy(asc(items.name)) });
    if (kind === "accounts") {
      const accountRows = await db.select().from(accounts).where(eq(accounts.companyId, companyId)).orderBy(asc(accounts.code));
      const journalFilter = Number.isInteger(locationId) && locationId > 0 ? and(eq(journalEntries.companyId, companyId), eq(journalEntries.locationId, locationId)) : eq(journalEntries.companyId, companyId);
      const balances = await db.select({ name: journalLines.accountName, debit: sql<number>`sum(${journalLines.debit})`, credit: sql<number>`sum(${journalLines.credit})` }).from(journalLines).innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id)).where(journalFilter).groupBy(journalLines.accountName);
      const ledger = new Map(balances.map((balance) => [balance.name, { debit: Number(balance.debit ?? 0), credit: Number(balance.credit ?? 0) }]));
      const creditNormal = new Set(["Income", "Other Income", "Loan", "Credit Card", "Equity", "Accounts Payable", "Other Current Liability", "Long Term Liability"]);
      return Response.json({ records: accountRows.map((account) => { const activity = ledger.get(account.name) ?? { debit: 0, credit: 0 }; const movement = creditNormal.has(account.type) ? activity.credit - activity.debit : activity.debit - activity.credit; return { ...account, balance: round(Number(account.balance) + movement) }; }) });
    }
    const transactionFilter = Number.isInteger(locationId) && locationId > 0 ? and(eq(transactions.companyId, companyId), eq(transactions.locationId, locationId)) : eq(transactions.companyId, companyId);
    return Response.json({ records: await db.select().from(transactions).where(transactionFilter).orderBy(desc(transactions.transactionDate), desc(transactions.id)).limit(500) });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authorization = await requireApiUser(request, false, true);
  if (authorization instanceof Response) return authorization;
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const kind = payload.kind as RecordKind;
    if (!mayWrite(authorization, writePermission(kind, payload))) return Response.json({ error: "Your role does not allow this action." }, { status: 403 });
    const companyId = Number(payload.companyId);
    const locationId = Number(payload.locationId);
    if (!Number.isInteger(companyId) || companyId <= 0) return Response.json({ error: "Select a company." }, { status: 400 });
    const db = getDb();

    if (kind === "contacts") {
      const name = String(payload.name ?? "").trim();
      if (!name) return Response.json({ error: "Name is required." }, { status: 400 });
      if (payload.type === "customer") {
        const required = [payload.company, payload.phone, payload.whatsapp, payload.country, payload.reseller, payload.planet, payload.currency];
        if (required.some((value) => !String(value ?? "").trim())) return Response.json({ error: "Complete all required customer fields." }, { status: 400 });
      }
      if (payload.type === "vendor") {
        const required = [payload.company, payload.phone, payload.country, payload.currency];
        if (required.some((value) => !String(value ?? "").trim())) return Response.json({ error: "Complete all required vendor fields." }, { status: 400 });
      }
      const [record] = await db.insert(contacts).values({
        companyId, type: (payload.type as "customer" | "vendor" | "employee") ?? "customer", name,
        company: String(payload.company ?? ""), billingName: String(payload.billingName ?? name),
        email: String(payload.email ?? ""), phone: String(payload.phone ?? ""), whatsapp: String(payload.whatsapp ?? ""),
        country: String(payload.country ?? ""), trn: String(payload.trn ?? ""), reseller: String(payload.reseller ?? "Reseller"),
        planet: String(payload.planet ?? "No"), passport: String(payload.passport ?? ""), currency: String(payload.currency ?? "AED"),
        description: String(payload.description ?? ""), balance: Number(payload.balance ?? 0),
      }).returning();
      return Response.json({ record }, { status: 201 });
    }

    if (kind === "items") {
      if (!Number.isInteger(locationId) || locationId <= 0) return Response.json({ error: "Select an inventory location." }, { status: 400 });
      const duplicateItemId = Number(payload.duplicateItemId);
      if (Number.isInteger(duplicateItemId) && duplicateItemId > 0) {
        const [source] = await db.select().from(items).where(and(eq(items.id, duplicateItemId), eq(items.companyId, companyId), eq(items.locationId, locationId)));
        if (!source) return Response.json({ error: "The item to duplicate was not found." }, { status: 404 });
        const sku = await createUniqueItemSku();
        const [created] = await db.insert(items).values({
          companyId, locationId, sku, name: source.name, category: source.category, description: source.description,
          specifications: source.specifications, quantity: 0, reorderPoint: source.reorderPoint,
          salesPrice: source.salesPrice, cost: source.cost, lastPurchasePrice: source.lastPurchasePrice, status: source.status,
        }).returning();
        const [record] = await db.update(items).set({ itemNumber: String(13000 + created.id) }).where(eq(items.id, created.id)).returning();
        await db.insert(auditLog).values({ companyId, action: "duplicated", entityType: "item", entityId: record.id, details: `${source.sku} duplicated as ${record.sku}; opening quantity 0` });
        return Response.json({ record }, { status: 201 });
      }
      const specifications = Array.from({ length: 30 }, (_, index) => ({
        label: String(payload[`specLabel${index}`] ?? "").trim(),
        value: String(payload[`specValue${index}`] ?? "").trim(),
      })).filter((specification) => specification.label && specification.value);
      const specificationValue = (label: string) => specifications.find((specification) => specification.label.toLowerCase() === label.toLowerCase())?.value ?? "";
      const category = String(payload.category ?? "General").trim() || "General";
      const sku = await createUniqueItemSku();
      const name = String(payload.name ?? "").trim() || [specificationValue("Brand"), specificationValue("Model") || specificationValue("Part Number")].filter(Boolean).join(" ") || `${category} Item`;
      // Keep labels in structured specifications for editing/filtering; the customer-facing description contains values only.
      const description = specifications.map((specification) => specification.value).join(" | ");
      const [created] = await db.insert(items).values({
        companyId, locationId, name, sku, category, description,
        specifications: JSON.stringify(specifications), quantity: Number(payload.quantity ?? 0),
        reorderPoint: Number(payload.reorderPoint ?? 0), salesPrice: Number(payload.salesPrice ?? 0), cost: Number(payload.cost ?? 0),
      }).returning();
      const [record] = await db.update(items).set({ itemNumber: String(13000 + created.id) }).where(eq(items.id, created.id)).returning();
      return Response.json({ record }, { status: 201 });
    }

    if (kind === "accounts") {
      const name = String(payload.name ?? "").trim();
      const code = String(payload.code ?? "").trim();
      if (!name || !code) return Response.json({ error: "Account code and name are required." }, { status: 400 });
      const parentAccountId = Number(payload.parentAccountId);
      const requestedRole = String(payload.systemRole ?? "").trim().toUpperCase();
      const systemRole = accountRoles.includes(requestedRole) ? requestedRole : null;
      if (Number.isInteger(parentAccountId) && parentAccountId > 0) {
        const [parent] = await db.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.id, parentAccountId), eq(accounts.companyId, companyId))).limit(1);
        if (!parent) return Response.json({ error: "Select a valid parent account from this company." }, { status: 400 });
      }
      if (systemRole) {
        const [linked] = await db.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.companyId, companyId), eq(accounts.systemRole, systemRole))).limit(1);
        if (linked) return Response.json({ error: "That system use is already linked to another account." }, { status: 409 });
      }
      const [record] = await db.insert(accounts).values({ companyId, code, name, type: String(payload.type ?? "Expense"), systemRole, parentAccountId: Number.isInteger(parentAccountId) && parentAccountId > 0 ? parentAccountId : null, balance: Number(payload.balance ?? 0) }).returning();
      return Response.json({ record }, { status: 201 });
    }

    const party = String(payload.party ?? "").trim();
    const type = String(payload.type ?? "invoice");
    const rawLines = Array.isArray(payload.lines) ? payload.lines as InputLine[] : [];
    const configuredVatCodes = await db.select({ code: vatCodes.code, rate: vatCodes.rate }).from(vatCodes).where(and(eq(vatCodes.companyId, companyId), eq(vatCodes.active, true)));
    const vatRates = configuredVatCodes.length ? Object.fromEntries(configuredVatCodes.map((vatCode) => [vatCode.code, Number(vatCode.rate)])) : fallbackVatRates;
    const prepared = rawLines.map((line) => {
      const quantity = Number(line.quantity ?? 1);
      const unitPrice = Number(line.unitPrice ?? 0);
      const unitCost = Number(line.unitCost ?? 0);
      const requestedVatCode = String(line.vatCode ?? (Number(line.vatRate ?? payload.vatRate ?? 5) === 5 ? "STANDARD" : "ZERO")).trim().toUpperCase();
      const vatCode = Object.hasOwn(vatRates, requestedVatCode) ? requestedVatCode : Object.hasOwn(vatRates, "STANDARD") ? "STANDARD" : Object.keys(vatRates)[0];
      const vatRate = vatRates[vatCode];
      const subtotal = round(quantity * unitPrice);
      const vatAmount = round(subtotal * vatRate / 100);
      return { itemId: line.itemId ? Number(line.itemId) : null, description: String(line.description ?? "").trim(), quantity, unitPrice, unitCost, vatCode, vatRate, subtotal, vatAmount, total: round(subtotal + vatAmount) };
    }).filter((line) => line.description || line.itemId || line.subtotal > 0);
    if (!prepared.length && Number(payload.total) > 0) {
      const subtotal = Number(payload.total);
      const requestedVatCode = Number(payload.vatRate ?? 5) === 5 ? "STANDARD" : "ZERO";
      const vatCode = Object.hasOwn(vatRates, requestedVatCode) ? requestedVatCode : Object.keys(vatRates)[0];
      const vatRate = vatRates[vatCode];
      prepared.push({ itemId: null, description: String(payload.memo ?? type), quantity: 1, unitPrice: subtotal, unitCost: 0, vatCode, vatRate, subtotal, vatAmount: round(subtotal * vatRate / 100), total: round(subtotal * (1 + vatRate / 100)) });
    }
    if (!party || !prepared.length || prepared.some((line) => !Number.isFinite(line.quantity) || line.quantity <= 0 || !Number.isFinite(line.unitPrice) || line.unitPrice < 0)) {
      return Response.json({ error: "Party and at least one valid document line are required." }, { status: 400 });
    }
    if (prepared.some((line) => line.itemId !== null && (!Number.isInteger(line.itemId) || line.itemId <= 0))) {
      return Response.json({ error: "Select a valid inventory item on every stock line." }, { status: 400 });
    }
    const stockReducing = ["invoice", "sales receipt"].includes(type);
    let usedAdminNegativeStockOverride = false;
    if (stockReducing) {
      if (!Number.isInteger(locationId) || locationId <= 0) return Response.json({ error: "Select an inventory before creating the document." }, { status: 400 });
      const requestedByItem = new Map<number, number>();
      for (const line of prepared) if (line.itemId) requestedByItem.set(line.itemId, (requestedByItem.get(line.itemId) ?? 0) + line.quantity);
      const itemIds = [...requestedByItem.keys()];
      if (itemIds.length) {
        const available = await db.select({ id: items.id, sku: items.sku, name: items.name, quantity: items.quantity }).from(items).where(and(eq(items.companyId, companyId), eq(items.locationId, locationId), inArray(items.id, itemIds)));
        if (available.length !== itemIds.length) return Response.json({ error: "One or more selected items do not belong to this company inventory." }, { status: 400 });
        const wantsOverride = payload.allowNegativeStock === true || String(payload.allowNegativeStock) === "true";
        let overrideApproved = false;
        if (wantsOverride) {
          const suppliedPin = String(payload.adminOverridePin ?? "");
          const [settings] = await db.select({ pinHash: companySettings.negativeStockPinHash }).from(companySettings).where(eq(companySettings.companyId, companyId)).limit(1);
          if (!settings?.pinHash) return Response.json({ error: "Admin PIN is not configured. Open Management > Admin Controls." }, { status: 403 });
          if (!verifyAdminPin(suppliedPin, settings.pinHash)) return Response.json({ error: "Incorrect admin PIN. Negative stock was not allowed." }, { status: 403 });
          overrideApproved = true;
          usedAdminNegativeStockOverride = true;
        }
        if (!overrideApproved) {
          const shortages = available.filter((item) => Number(item.quantity) < (requestedByItem.get(item.id) ?? 0));
          if (shortages.length) {
            const detail = shortages.map((item) => `${item.sku} ${item.name}: available ${item.quantity}, requested ${requestedByItem.get(item.id)}`).join("; ");
            return Response.json({ error: `Invoice blocked to prevent negative stock. ${detail}` }, { status: 409 });
          }
        }
      }
    }
    const subtotal = round(prepared.reduce((sum, line) => sum + line.subtotal, 0));
    const vatAmount = round(prepared.reduce((sum, line) => sum + line.vatAmount, 0));
    const total = round(subtotal + vatAmount);
    const currency = String(payload.currency ?? "AED").trim().toUpperCase();
    const exchangeRate = Number(payload.exchangeRate ?? 1);
    if (!/^[A-Z]{3}$/.test(currency) || !Number.isFinite(exchangeRate) || exchangeRate <= 0) return Response.json({ error: "Choose a valid currency and exchange rate." }, { status: 400 });
    const baseSubtotal = round(subtotal * exchangeRate);
    const baseVatAmount = round(vatAmount * exchangeRate);
    const baseTotal = round(total * exchangeRate);
    const transactionDate = String(payload.transactionDate ?? new Date().toISOString().slice(0, 10));
    let number = String(payload.number ?? `TX-${Date.now()}`);
    if (type === "invoice") {
      if (!Number.isInteger(locationId) || locationId <= 0) return Response.json({ error: "Select an inventory before creating the invoice." }, { status: 400 });
      const [sequence] = await db.update(inventoryLocations).set({ nextInvoiceNumber: sql`${inventoryLocations.nextInvoiceNumber} + 1` }).where(and(eq(inventoryLocations.id, locationId), eq(inventoryLocations.companyId, companyId))).returning();
      if (!sequence) return Response.json({ error: "The selected inventory was not found." }, { status: 404 });
      const companyPrefix = `C${String(companyId).padStart(3, "0")}`;
      number = `${companyPrefix}-${sequence.invoicePrefix}-INV-${String(sequence.nextInvoiceNumber - 1).padStart(4, "0")}`;
    }
    const [record] = await db.insert(transactions).values({
      companyId, locationId: Number.isInteger(locationId) ? locationId : null, number, type, party,
      salesman: String(payload.salesman ?? ""), isImport: payload.isImport === true || String(payload.isImport) === "true",
      transactionDate, dueDate: String(payload.dueDate ?? ""),
      account: String(payload.account ?? "Accounts Receivable"), status: String(payload.status ?? "open"), memo: String(payload.memo ?? ""),
      subtotal, vatRate: Number(payload.vatRate ?? 5), vatAmount, total, currency, exchangeRate, baseTotal,
    }).returning();
    await db.insert(transactionLines).values(prepared.map((line) => ({ ...line, transactionId: record.id })));

    const nonPosting = ["estimate", "sales order", "purchase order"].includes(type);
    const linkedRows = await db.select({ name: accounts.name, systemRole: accounts.systemRole }).from(accounts).where(and(eq(accounts.companyId, companyId), eq(accounts.active, true)));
    const linkedAccounts = Object.fromEntries(linkedRows.filter((account) => account.systemRole).map((account) => [account.systemRole!, account.name]));
    const postingAccountRole = linkedRows.find((account) => account.name.toLowerCase() === record.account.toLowerCase())?.systemRole ?? "";
    if (!nonPosting) {
      const [entry] = await db.insert(journalEntries).values({ companyId, locationId: Number.isInteger(locationId) && locationId > 0 ? locationId : null, transactionId: record.id, entryDate: transactionDate, reference: number, description: `${type}: ${party}` }).returning();
      const baseLines = postingLines(type, record.account, baseSubtotal, baseVatAmount, baseTotal, linkedAccounts);
      const cogs = ["invoice", "sales receipt"].includes(type) ? round(prepared.reduce((sum, line) => sum + line.quantity * line.unitCost, 0) * exchangeRate) : 0;
      if (cogs) baseLines.push({ accountName: linkedAccounts.COGS ?? "Cost of Goods Sold", debit: cogs, credit: 0 }, { accountName: linkedAccounts.INVENTORY ?? "Inventory Asset", debit: 0, credit: cogs });
      await db.insert(journalLines).values(baseLines.map((line) => ({ ...line, journalEntryId: entry.id })));
    }

    if (!nonPosting) {
      const direction = ["invoice", "sales receipt"].includes(type) ? -1 : type === "bill" ? 1 : 0;
      if (direction) for (const line of prepared.filter((entry) => entry.itemId)) {
        const quantity = direction * line.quantity;
        await db.update(items).set(type === "bill" ? { quantity: sql`${items.quantity} + ${quantity}`, lastPurchasePrice: line.unitPrice } : { quantity: sql`${items.quantity} + ${quantity}` }).where(eq(items.id, line.itemId!));
        await db.insert(inventoryMovements).values({ itemId: line.itemId!, transactionId: record.id, movementDate: transactionDate, movementType: type, quantity, unitCost: line.unitCost, reference: number });
      }
      const balanceChange = contactBalanceChange(type, total, postingAccountRole);
      const contactType = ["invoice", "sales receipt", "customer payment", "credit memo"].includes(type) ? "customer" : "vendor";
      if (balanceChange) await db.update(contacts).set({ balance: sql`${contacts.balance} + ${balanceChange}` }).where(and(eq(contacts.companyId, companyId), eq(contacts.name, party), eq(contacts.type, contactType)));
    }
    await db.insert(auditLog).values({ companyId, action: "created", entityType: "transaction", entityId: record.id, details: `${number} ${type}; ${prepared.length} line(s)${usedAdminNegativeStockOverride ? "; admin negative-stock override used" : ""}` });
    return Response.json({ record }, { status: 201 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const authorization = await requireApiUser(request, "inventory:manage", true);
  if (authorization instanceof Response) return authorization;
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    if (payload.kind !== "items") return Response.json({ error: "Only inventory items can be updated here." }, { status: 400 });
    const id = Number(payload.id);
    const companyId = Number(payload.companyId);
    if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "A valid item is required." }, { status: 400 });
    const db = getDb();
    const [existing] = await db.select().from(items).where(and(eq(items.id, id), eq(items.companyId, companyId)));
    if (!existing) return Response.json({ error: "Item not found." }, { status: 404 });
    const specifications = Array.from({ length: 30 }, (_, index) => ({
      label: String(payload[`specLabel${index}`] ?? "").trim(),
      value: String(payload[`specValue${index}`] ?? "").trim(),
    })).filter((specification) => specification.label && specification.value);
    const specificationValue = (label: string) => specifications.find((specification) => specification.label.toLowerCase() === label.toLowerCase())?.value ?? "";
    const category = String(payload.category ?? existing.category).trim() || existing.category;
    const generatedName = [specificationValue("Brand"), specificationValue("Model") || specificationValue("Part Number")].filter(Boolean).join(" ");
    const [record] = await db.update(items).set({
      category,
      sku: existing.sku,
      name: generatedName || existing.name,
      // Keep labels in structured specifications for editing/filtering; the customer-facing description contains values only.
      description: specifications.map((specification) => specification.value).join(" | "),
      specifications: JSON.stringify(specifications),
    }).where(eq(items.id, id)).returning();
    await db.insert(auditLog).values({ companyId, action: "updated", entityType: "item", entityId: id, details: `${record.sku} ${record.name}` });
    return Response.json({ record });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

function contactBalanceChange(type: string, total: number, accountRole = "") {
  if (type === "invoice" || type === "bill") return total;
  if (type === "cheque" && accountRole === "AP") return -total;
  if (["customer payment", "credit memo", "bill payment", "vendor payment", "vendor credit"].includes(type)) return -total;
  return 0;
}

function postingLines(type: string, account: string, subtotal: number, vatAmount: number, total: number, linked: Record<string, string>) {
  const named = (role: string, fallback: string) => linked[role] ?? fallback;
  if (["invoice", "sales receipt"].includes(type)) return [
    { accountName: type === "invoice" ? named("AR", "Accounts Receivable") : named("BANK", "Business Bank"), debit: total, credit: 0 },
    { accountName: named("SALES", "Sales Revenue"), debit: 0, credit: subtotal },
    ...(vatAmount ? [{ accountName: named("OUTPUT_VAT", "VAT Payable"), debit: 0, credit: vatAmount }] : []),
  ];
  if (type === "customer payment") return [{ accountName: named("BANK", "Business Bank"), debit: total, credit: 0 }, { accountName: named("AR", "Accounts Receivable"), debit: 0, credit: total }];
  if (type === "bill") return [
    { accountName: account || named("PURCHASES", "Purchases"), debit: subtotal, credit: 0 },
    ...(vatAmount ? [{ accountName: named("INPUT_VAT", "Recoverable VAT"), debit: vatAmount, credit: 0 }] : []),
    { accountName: named("AP", "Accounts Payable"), debit: 0, credit: total },
  ];
  if (["bill payment", "vendor payment"].includes(type)) return [{ accountName: named("AP", "Accounts Payable"), debit: total, credit: 0 }, { accountName: named("BANK", "Business Bank"), debit: 0, credit: total }];
  if (["expense", "cheque"].includes(type)) return [
    { accountName: account || named("EXPENSE", "Operating Expenses"), debit: subtotal, credit: 0 },
    ...(vatAmount ? [{ accountName: named("INPUT_VAT", "Recoverable VAT"), debit: vatAmount, credit: 0 }] : []),
    { accountName: named("BANK", "Business Bank"), debit: 0, credit: total },
  ];
  if (type === "deposit") return [{ accountName: named("BANK", "Business Bank"), debit: total, credit: 0 }, { accountName: account || named("OTHER_INCOME", "Other Income"), debit: 0, credit: total }];
  return [{ accountName: account || named("SUSPENSE", "Suspense"), debit: total, credit: 0 }, { accountName: named("EQUITY", "Opening Balance Equity"), debit: 0, credit: total }];
}

export async function DELETE(request: Request) {
  const authorization = await requireApiUser(request, true, true);
  if (authorization instanceof Response) return authorization;
  try {
    const { kind, id, companyId } = (await request.json()) as { kind: RecordKind; id: number; companyId: number };
    const db = getDb();
    if (kind === "contacts") await db.delete(contacts).where(and(eq(contacts.id, id), eq(contacts.companyId, companyId)));
    else if (kind === "items") await db.delete(items).where(and(eq(items.id, id), eq(items.companyId, companyId)));
    else if (kind === "accounts") {
      const [account] = await db.select({ name: accounts.name, systemRole: accounts.systemRole }).from(accounts).where(and(eq(accounts.id, id), eq(accounts.companyId, companyId))).limit(1);
      if (account?.systemRole) return Response.json({ error: "Linked system accounts cannot be deleted." }, { status: 409 });
      if (account) {
        const [activity] = await db.select({ id: journalLines.id }).from(journalLines).innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id)).where(and(eq(journalEntries.companyId, companyId), eq(journalLines.accountName, account.name))).limit(1);
        if (activity) return Response.json({ error: "Accounts with journal activity cannot be deleted." }, { status: 409 });
      }
      await db.delete(accounts).where(and(eq(accounts.id, id), eq(accounts.companyId, companyId)));
    }
    else {
      const [record] = await db.select().from(transactions).where(and(eq(transactions.id, id), eq(transactions.companyId, companyId)));
      if (record) {
        const movements = await db.select().from(inventoryMovements).where(eq(inventoryMovements.transactionId, id));
        for (const movement of movements) await db.update(items).set({ quantity: sql`${items.quantity} - ${movement.quantity}` }).where(eq(items.id, movement.itemId));
        const [postingAccount] = await db.select({ systemRole: accounts.systemRole }).from(accounts).where(and(eq(accounts.companyId, companyId), eq(accounts.name, record.account))).limit(1);
        const balanceChange = contactBalanceChange(record.type, record.total, postingAccount?.systemRole ?? "");
        const contactType = ["invoice", "sales receipt", "customer payment", "credit memo"].includes(record.type) ? "customer" : "vendor";
        if (balanceChange) await db.update(contacts).set({ balance: sql`${contacts.balance} - ${balanceChange}` }).where(and(eq(contacts.companyId, companyId), eq(contacts.name, record.party), eq(contacts.type, contactType)));
        await db.delete(transactions).where(eq(transactions.id, id));
        await db.insert(auditLog).values({ companyId, action: "deleted", entityType: "transaction", entityId: id, details: `${record.number} reversed` });
      }
    }
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
