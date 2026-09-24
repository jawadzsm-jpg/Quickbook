import { skuWrite } from "@/lib/sku-locks";
import { refreshSalesSource, salesSourceLines, salesInventoryLines } from "@/lib/sales-invoicing";
import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, withWriteTransaction } from "../../../db";
import {
  accounts, auditLog, companies, companySettings, contacts, exchangeRates, inventoryLocations, inventoryMovements, items, journalEntries,
  journalLines, transactionLines, transactions, vatCodes, billPaymentAllocations, invoicePaymentAllocations, purchaseReceiptAllocations, salesInvoiceAllocations,
} from "../../../db/schema";
import { verifyAdminPin } from "../../../lib/admin-pin";
import { customerConflict, validInternationalPhone } from "../../../lib/customer-identity";
import { canAccessCompany, isAdministrator, hasPermission, requireApiUser, type Permission, type SessionUser } from "@/lib/auth";
import { normalizeComparableText, uppercaseText } from "@/lib/text-normalization";

type RecordKind = "transactions" | "contacts" | "items" | "accounts";
type InputLine = { comments?: string; serialNumber?: string; freightCharge?: number | string; isFreightCharge?: boolean; orderLineId?: number; sourceLineId?: number; itemId?: number | string | null; description?: string; quantity?: number | string; unitPrice?: number | string; unitCost?: number | string; vatCode?: string; vatRate?: number | string };

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected database error";
  return message.includes("does not exist") ? "The accounting database is being updated. Please refresh in a moment." : message;
}

const round = (value: number) => Math.round(value * 100) / 100;
const fallbackVatRates: Record<string, number> = { STANDARD: 5, ZERO: 0, EXEMPT: 0, OUT_OF_SCOPE: 0 };
const accountRoles = ["BANK", "AR", "AP", "INVENTORY", "INPUT_VAT", "OUTPUT_VAT", "EQUITY", "SALES", "OTHER_INCOME", "COGS", "PURCHASES", "EXPENSE", "PAYROLL", "SUSPENSE"];
const accountTypeValues = new Set(["Income", "Expense", "Cost of Goods Sold", "Other Income", "Other Expense", "Fixed Asset", "Bank", "Loan", "Credit Card", "Equity", "Accounts Receivable", "Other Current Asset", "Other Asset", "Accounts Payable", "Other Current Liability", "Long Term Liability"]);
const compatibleAccountTypes: Record<string, Set<string>> = {
  BANK: new Set(["Bank"]), AR: new Set(["Accounts Receivable"]), AP: new Set(["Accounts Payable"]),
  INVENTORY: new Set(["Other Current Asset", "Other Asset"]), INPUT_VAT: new Set(["Other Current Asset"]),
  OUTPUT_VAT: new Set(["Other Current Liability"]), EQUITY: new Set(["Equity"]), SALES: new Set(["Income"]),
  OTHER_INCOME: new Set(["Other Income", "Income"]), COGS: new Set(["Cost of Goods Sold"]),
  PURCHASES: new Set(["Expense", "Cost of Goods Sold"]), EXPENSE: new Set(["Expense", "Other Expense"]),
  PAYROLL: new Set(["Expense"]), SUSPENSE: new Set(["Other Current Asset", "Other Asset", "Expense"]),
};
const itemTypeValues = new Set(["service", "stock-part", "non-stock-part", "other-charge", "subtotal", "group", "discount", "payment", "vat-item", "vat-group"]);
const documentLineItemTypes = new Set(["service", "stock-part", "non-stock-part", "other-charge"]);
const normalizedItemType = (value: unknown) => itemTypeValues.has(String(value ?? "")) ? String(value) : "stock-part";
const optionalId = (value: unknown) => { const id = Number(value); return Number.isInteger(id) && id > 0 ? id : null; };

function writePermission(kind: RecordKind, payload: Record<string, unknown>): Permission | "admin" {
  if (kind === "items") return "inventory:manage";
  if (kind === "accounts") return "accounting:manage";
  if (kind === "contacts") {
    if (payload.type === "customer") return "customers:manage";
    if (payload.type === "vendor") return "vendors:manage";
    return "admin";
  }
  const type = String(payload.type ?? "");
  if (["invoice", "quotation", "estimate", "proforma invoice", "sales order", "sales receipt", "statement charge", "finance charge", "credit memo", "customer payment"].includes(type)) return "sales:write";
  if (["bill", "purchase order", "item receipt", "received item bill", "vendor credit", "bill payment", "vendor payment"].includes(type)) return "purchases:write";
  if (["expense", "deposit", "cheque", "credit card charge", "cheque order", "transfer", "opening balance", "journal entry"].includes(type)) return "banking:write";
  return "accounting:manage";
}

function mayWrite(user: SessionUser, permission: Permission | "admin") {
  return permission === "admin" ? isAdministrator(user) : hasPermission(user, permission);
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

async function ensureCurrencyControlAccount(companyId: number, role: "AR" | "AP", currency: string) {
  const db = getDb();
  const [existing] = await db.select().from(accounts).where(and(
    eq(accounts.companyId, companyId),
    eq(accounts.systemRole, role),
    eq(accounts.currency, currency),
  )).limit(1);
  if (existing) {
    if (existing.active) return { account: existing, created: false };
    const [account] = await db.update(accounts).set({ active: true }).where(eq(accounts.id, existing.id)).returning();
    return { account, created: false };
  }

  const baseCode = `${role}-${currency}`;
  const [codeConflict] = await db.select({ id: accounts.id }).from(accounts).where(and(
    eq(accounts.companyId, companyId),
    eq(accounts.code, baseCode),
  )).limit(1);
  const code = codeConflict ? `${baseCode}-${crypto.randomUUID().replaceAll("-", "").slice(0, 4).toUpperCase()}` : baseCode;
  const name = `${role === "AR" ? "Accounts Receivable" : "Accounts Payable"} - ${currency}`;

  try {
    const [account] = await db.insert(accounts).values({
      companyId,
      code,
      name,
      type: role === "AR" ? "Accounts Receivable" : "Accounts Payable",
      systemRole: role,
      currency,
      balance: 0,
      active: true,
    }).returning();
    return { account, created: true };
  } catch (error) {
    const [account] = await db.select().from(accounts).where(and(
      eq(accounts.companyId, companyId),
      eq(accounts.systemRole, role),
      eq(accounts.currency, currency),
    )).limit(1);
    if (account) return { account, created: false };
    throw error;
  }
}

function purchaseRevision(record: typeof transactions.$inferSelect, lines: { id: number; comments?: string; serialNumber?: string }[]) {
  return createHash("sha256").update(JSON.stringify([record, lines.map((line) => [line.id, line.comments || "", line.serialNumber || ""])])).digest("hex");
}

async function billPaidAmount(billId: number, excludingPaymentId = 0) {
  const [row] = await getDb().select({ paid: sql<number>`coalesce(sum(${transactions.total}), 0)` }).from(transactions).where(and(eq(transactions.billId, billId), sql`${transactions.id} <> ${excludingPaymentId}`));
  const [allocated] = await getDb().select({ paid: sql<number>`coalesce(sum(${billPaymentAllocations.amount}), 0)` }).from(billPaymentAllocations).where(and(eq(billPaymentAllocations.billId, billId), sql`${billPaymentAllocations.paymentId} <> ${excludingPaymentId}`));
  return round(Number(row.paid) + Number(allocated.paid));
}

async function refreshBillStatus(billId: number) {
  const db = getDb();
  const [bill] = await db.select().from(transactions).where(eq(transactions.id, billId));
  if (!bill) return;
  const paid = await billPaidAmount(billId);
  const status = paid >= round(bill.total) ? "paid" : paid > 0 ? "partially paid" : bill.dueDate && bill.dueDate < new Date().toISOString().slice(0, 10) ? "overdue" : "open";
  await db.update(transactions).set({ status }).where(eq(transactions.id, billId));
}

function paymentDisplayRecord<T extends { type: string; status: string; total: number }>(record: T): T {
  return ["customer payment", "cheque", "transfer"].includes(record.type) && record.total > 0 && record.status === "open" ? { ...record, status: "paid" } : record;
}

async function invoicePaidAmount(invoiceId: number, excludingPaymentId = 0) {
  const [row] = await getDb().select({ paid: sql<number>`coalesce(sum(${invoicePaymentAllocations.amount}), 0)` }).from(invoicePaymentAllocations).where(and(eq(invoicePaymentAllocations.invoiceId, invoiceId), sql`${invoicePaymentAllocations.paymentId} <> ${excludingPaymentId}`));
  return round(Number(row.paid));
}

async function refreshInvoiceStatus(invoiceId: number) {
  const db = getDb();
  const [invoice] = await db.select().from(transactions).where(eq(transactions.id, invoiceId));
  if (!invoice) return;
  const paid = await invoicePaidAmount(invoiceId);
  const status = paid >= round(invoice.total) ? "paid" : paid > 0 ? "partially paid" : invoice.dueDate && invoice.dueDate < new Date().toISOString().slice(0, 10) ? "overdue" : "open";
  await db.update(transactions).set({ status, paidAt: status === "paid" ? invoice.paidAt || new Date().toISOString() : null }).where(eq(transactions.id, invoiceId));
}

async function purchaseReceiptLines(orderId: number) {
  const db = getDb();
  const lines = await db.select().from(transactionLines).where(eq(transactionLines.transactionId, orderId)).orderBy(asc(transactionLines.id));
  const allocations = lines.length ? await db.select().from(purchaseReceiptAllocations).where(inArray(purchaseReceiptAllocations.orderLineId, lines.map((line) => line.id))) : [];
  return lines.map((line) => {
    const received = allocations.filter((entry) => entry.orderLineId === line.id).reduce((sum, entry) => sum + entry.quantity, 0);
    return { ...line, received, remaining: Math.max(0, Math.round((line.quantity - received) * 1000000) / 1000000) };
  });
}

async function refreshPurchaseOrder(orderId: number) {
  const lines = await purchaseReceiptLines(orderId);
  const status = lines.length && lines.every((line) => line.remaining <= 0) ? "received" : lines.some((line) => line.received > 0) ? "partially received" : "open";
  await getDb().update(transactions).set({ status }).where(eq(transactions.id, orderId));
}

export async function GET(request: Request) {
  const authorization = await requireApiUser(request, "workspace:read");
  if (authorization instanceof Response) return authorization;
  try {
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind") as RecordKind | "vendor-history" | "unpaid-bills" | "unpaid-invoices" | "open-sales-documents" | "open-purchase-orders" | "purchase-return-bills" | "po-receiving" | "sales-invoicing" | null;
    const id = Number(url.searchParams.get("id"));
    const companyId = Number(url.searchParams.get("companyId"));
    const locationId = Number(url.searchParams.get("locationId"));
    if (!Number.isInteger(companyId) || companyId <= 0) return Response.json({ error: "Select a company." }, { status: 400 });
    if (!canAccessCompany(authorization, companyId)) return Response.json({ error: "You do not have access to this company." }, { status: 403 });
    const db = getDb();
    if (kind === "open-sales-documents") {
      if (!canAccessCompany(authorization, companyId)) return Response.json({ error: "You do not have access to this company." }, { status: 403 });
      const party = url.searchParams.get("party");
      if (!party) return Response.json({ error: "Select a customer." }, { status: 400 });
      const documents = await db.select({ id: transactions.id, type: transactions.type, number: transactions.number, transactionDate: transactions.transactionDate, total: transactions.total, currency: transactions.currency, memo: transactions.memo, inventory: inventoryLocations.name }).from(transactions)
        .leftJoin(inventoryLocations, eq(transactions.locationId, inventoryLocations.id))
        .where(and(eq(transactions.companyId, companyId), eq(transactions.party, party), inArray(transactions.type, ["estimate", "proforma invoice", "sales order"]), sql`${transactions.convertedInvoiceId} IS NULL`, inArray(transactions.status, ["open", "draft", "pending", "overdue", "sent", "accepted", "approved", "partially invoiced"]),
          sql`EXISTS (SELECT 1 FROM transaction_lines sl WHERE sl.transaction_id = ${transactions.id} AND sl.quantity > COALESCE((SELECT SUM(a.quantity) FROM sales_invoice_allocations a WHERE a.source_line_id = sl.id), 0))`))
        .orderBy(asc(transactions.transactionDate), asc(transactions.id));
      return Response.json({ documents }, { headers: { "Cache-Control": "no-store" } });
    }
    if (kind === "sales-invoicing") {
      if (!canAccessCompany(authorization, companyId)) return Response.json({ error: "You do not have access to this company." }, { status: 403 });
      const sourceId = Number(url.searchParams.get("sourceId"));
      if (!Number.isSafeInteger(sourceId) || sourceId <= 0) return Response.json({ error: "Select an estimate, proforma invoice or sales order." }, { status: 400 });
      const [source] = await db.select().from(transactions).where(and(eq(transactions.id, sourceId), eq(transactions.companyId, companyId), inArray(transactions.type, ["estimate", "proforma invoice", "sales order"])));
      if (!source) return Response.json({ error: "Sales document not found." }, { status: 404 });
      const locations = await db.select({ id: inventoryLocations.id, name: inventoryLocations.name }).from(inventoryLocations).where(eq(inventoryLocations.companyId, companyId)).orderBy(asc(inventoryLocations.name));
      const selectedLocation = url.searchParams.has("locationId") ? locationId : source.locationId;
      if (!locations.some((location) => location.id === selectedLocation)) return Response.json({ error: "Select an inventory in this company." }, { status: 400 });
      const invoices = await db.select({ id: transactions.id, number: transactions.number, transactionDate: transactions.transactionDate, total: transactions.total, currency: transactions.currency, locationId: transactions.locationId }).from(transactions).where(and(eq(transactions.companyId, companyId), eq(transactions.salesSourceId, sourceId))).orderBy(asc(transactions.id));
      return Response.json({ source, locations, locationId: selectedLocation, lines: await salesInventoryLines(sourceId, companyId, selectedLocation!), invoices }, { headers: { "Cache-Control": "no-store" } });
    }
    if (kind === "open-purchase-orders") {
      if (!canAccessCompany(authorization, companyId)) return Response.json({ error: "You do not have access to this company." }, { status: 403 });
      const party = url.searchParams.get("party");
      if (!party) return Response.json({ error: "Select a vendor." }, { status: 400 });
      const orders = await db.select({ status: transactions.status, id: transactions.id, number: transactions.number, transactionDate: transactions.transactionDate, currency: transactions.currency, memo: transactions.memo, inventory: inventoryLocations.name }).from(transactions)
        .leftJoin(inventoryLocations, eq(transactions.locationId, inventoryLocations.id))
        .where(and(eq(transactions.companyId, companyId), eq(transactions.party, party), eq(transactions.type, "purchase order"), sql`${transactions.convertedInvoiceId} IS NULL`, inArray(transactions.status, ["open", "pending", "overdue", "partially received"]),
          sql`EXISTS (SELECT 1 FROM transaction_lines pol WHERE pol.transaction_id = ${transactions.id} AND pol.quantity > COALESCE((SELECT SUM(pra.quantity) FROM purchase_receipt_allocations pra WHERE pra.order_line_id = pol.id), 0))`))
        .orderBy(asc(transactions.transactionDate), asc(transactions.id));
      return Response.json({ orders }, { headers: { "Cache-Control": "no-store" } });
    }
    if (kind === "purchase-return-bills") {
      if (!canAccessCompany(authorization, companyId)) return Response.json({ error: "You do not have access to this company." }, { status: 403 });
      const party = String(url.searchParams.get("party") || "").trim();
      const currency = String(url.searchParams.get("currency") || "").trim().toUpperCase();
      if (!party || !currency || !Number.isSafeInteger(locationId) || locationId <= 0) return Response.json({ error: "Select a vendor, inventory and currency." }, { status: 400 });
      const bills = await db.select({ id: transactions.id, number: transactions.number, transactionDate: transactions.transactionDate, currency: transactions.currency }).from(transactions).where(and(eq(transactions.companyId, companyId), eq(transactions.locationId, locationId), eq(transactions.party, party), eq(transactions.currency, currency), eq(transactions.type, "bill"))).orderBy(desc(transactions.transactionDate), desc(transactions.id));
      if (!bills.length) return Response.json({ records: [] }, { headers: { "Cache-Control": "no-store" } });
      const billIds = bills.map((bill) => bill.id);
      const purchased = await db.select({ id: transactionLines.id, transactionId: transactionLines.transactionId, itemId: transactionLines.itemId, description: transactionLines.description, quantity: transactionLines.quantity, unitPrice: transactionLines.unitPrice, unitCost: transactionLines.unitCost, vatCode: transactionLines.vatCode, vatRate: transactionLines.vatRate }).from(transactionLines).where(inArray(transactionLines.transactionId, billIds)).orderBy(asc(transactionLines.id));
      const returnDocuments = await db.select({ id: transactions.id, billId: transactions.billId }).from(transactions).where(and(eq(transactions.companyId, companyId), eq(transactions.type, "vendor credit"), inArray(transactions.billId, billIds)));
      const returnedLines = returnDocuments.length ? await db.select({ transactionId: transactionLines.transactionId, itemId: transactionLines.itemId, description: transactionLines.description, quantity: transactionLines.quantity }).from(transactionLines).where(inArray(transactionLines.transactionId, returnDocuments.map((document) => document.id))) : [];
      const returnedByBillAndLine = new Map<string, number>();
      for (const line of returnedLines) {
        const billId = returnDocuments.find((document) => document.id === line.transactionId)?.billId;
        const key = `${billId}:${line.itemId ?? 0}:${line.description.trim().toLowerCase()}`;
        returnedByBillAndLine.set(key, round((returnedByBillAndLine.get(key) ?? 0) + Number(line.quantity)));
      }
      const records = bills.map((bill) => ({ ...bill, lines: purchased.filter((line) => line.transactionId === bill.id && !/freight charges/i.test(line.description)).map((line) => { const key = `${bill.id}:${line.itemId ?? 0}:${line.description.trim().toLowerCase()}`; return { sourceLineId: line.id, itemId: line.itemId, description: line.description, remaining: round(Number(line.quantity) - (returnedByBillAndLine.get(key) ?? 0)), unitPrice: Number(line.unitPrice), unitCost: Number(line.unitCost), vatCode: line.vatCode, vatRate: Number(line.vatRate) }; }).filter((line) => line.remaining > 0) })).filter((bill) => bill.lines.length > 0);
      return Response.json({ records }, { headers: { "Cache-Control": "no-store" } });
    }
    if (kind === "po-receiving") {
      if (!canAccessCompany(authorization, companyId)) return Response.json({ error: "You do not have access to this company." }, { status: 403 });
      const orderId = Number(url.searchParams.get("orderId"));
      if (!Number.isSafeInteger(orderId) || orderId <= 0) return Response.json({ error: "Select a purchase order." }, { status: 400 });
      const [order] = await db.select().from(transactions).where(and(eq(transactions.id, orderId), eq(transactions.companyId, companyId), eq(transactions.type, "purchase order")));
      if (!order) return Response.json({ error: "Purchase order not found." }, { status: 404 });
      const locations = await db.select({ id: inventoryLocations.id, name: inventoryLocations.name }).from(inventoryLocations).where(eq(inventoryLocations.companyId, companyId)).orderBy(asc(inventoryLocations.name));
      return Response.json({ order, locations, lines: await purchaseReceiptLines(orderId) }, { headers: { "Cache-Control": "no-store" } });
    }
    if (kind === "unpaid-bills") {
      if (!canAccessCompany(authorization, companyId)) return Response.json({ error: "You do not have access to this company." }, { status: 403 });
      const party = url.searchParams.get("party");
      const currency = url.searchParams.get("currency");
      if (!party || !currency || !Number.isSafeInteger(locationId) || locationId <= 0) return Response.json({ error: "Select a vendor, inventory and currency." }, { status: 400 });
      const [location] = await db.select({ id: inventoryLocations.id }).from(inventoryLocations).where(and(eq(inventoryLocations.id, locationId), eq(inventoryLocations.companyId, companyId)));
      if (!location) return Response.json({ error: "Inventory does not belong to this company." }, { status: 400 });
      const paymentId = Number(url.searchParams.get("paymentId")) || 0;
      const [editingPayment] = paymentId ? await db.select().from(transactions).where(and(eq(transactions.id, paymentId), eq(transactions.companyId, companyId), inArray(transactions.type, ["bill payment", "cheque"]))) : [];
      const bills = await db.select({ id: transactions.id, number: transactions.number, transactionDate: transactions.transactionDate, dueDate: transactions.dueDate, status: transactions.status, total: transactions.total }).from(transactions).where(and(eq(transactions.companyId, companyId), eq(transactions.locationId, locationId), eq(transactions.party, party), eq(transactions.currency, currency), inArray(transactions.type, ["bill", "received item bill"]), sql`(${transactions.status} in ('open', 'overdue', 'pending', 'partially paid') or ${transactions.id} = ${editingPayment?.billId ?? 0})`)).orderBy(asc(transactions.transactionDate), asc(transactions.id));
      const payments = await db.select({ billId: transactions.billId, total: transactions.total }).from(transactions).where(and(eq(transactions.companyId, companyId), inArray(transactions.type, ["bill payment", "cheque"]), sql`${transactions.id} <> ${editingPayment?.id ?? 0}`));
      const allocatedBills = await db.select({ billId: billPaymentAllocations.billId, amount: billPaymentAllocations.amount }).from(billPaymentAllocations).innerJoin(transactions, eq(transactions.id, billPaymentAllocations.paymentId)).where(and(eq(transactions.companyId, companyId), sql`${transactions.id} <> ${editingPayment?.id ?? 0}`));
      const records = bills.map((bill) => { const paid = round(payments.filter((payment) => payment.billId === bill.id).reduce((sum, payment) => sum + payment.total, 0) + allocatedBills.filter((payment) => payment.billId === bill.id).reduce((sum, payment) => sum + payment.amount, 0)); return { ...bill, paid, remaining: round(bill.total - paid) }; }).filter((bill) => bill.remaining > 0);

      return Response.json({ records }, { headers: { "Cache-Control": "no-store" } });
    }
    if (kind === "unpaid-invoices") {
      if (!canAccessCompany(authorization, companyId)) return Response.json({ error: "You do not have access to this company." }, { status: 403 });
      const party = url.searchParams.get("party");
      const currency = url.searchParams.get("currency");
      if (!party || !currency || !Number.isSafeInteger(locationId) || locationId <= 0) return Response.json({ error: "Select a customer, inventory and currency." }, { status: 400 });
      const [location] = await db.select({ id: inventoryLocations.id }).from(inventoryLocations).where(and(eq(inventoryLocations.id, locationId), eq(inventoryLocations.companyId, companyId)));
      if (!location) return Response.json({ error: "Inventory does not belong to this company." }, { status: 400 });
      const paymentId = Number(url.searchParams.get("paymentId")) || 0;
      const [editingPayment] = paymentId ? await db.select().from(transactions).where(and(eq(transactions.id, paymentId), eq(transactions.companyId, companyId), eq(transactions.type, "customer payment"))) : [];
      const invoices = await db.select({ id: transactions.id, number: transactions.number, transactionDate: transactions.transactionDate, dueDate: transactions.dueDate, status: transactions.status, total: transactions.total }).from(transactions).where(and(eq(transactions.companyId, companyId), eq(transactions.locationId, locationId), eq(transactions.party, party), eq(transactions.currency, currency), inArray(transactions.type, ["invoice"]), sql`(${transactions.status} in ('open', 'overdue', 'pending', 'partially paid') or ${transactions.id} = ${editingPayment?.invoiceId ?? 0})`)).orderBy(asc(transactions.transactionDate), asc(transactions.id));
      const payments = await db.select({ invoiceId: invoicePaymentAllocations.invoiceId, total: invoicePaymentAllocations.amount }).from(invoicePaymentAllocations).innerJoin(transactions, eq(transactions.id, invoicePaymentAllocations.paymentId)).where(and(eq(transactions.companyId, companyId), sql`${transactions.id} <> ${editingPayment?.id ?? 0}`));
      const records = invoices.map((invoice) => { const paid = round(payments.filter((payment) => payment.invoiceId === invoice.id).reduce((sum, payment) => sum + payment.total, 0)); return { ...invoice, paid, remaining: round(invoice.total - paid) }; }).filter((invoice) => invoice.remaining > 0);

      return Response.json({ records }, { headers: { "Cache-Control": "no-store" } });
    }
    if (kind === "vendor-history") {
      if (!isAdministrator(authorization) || !canAccessCompany(authorization, companyId)) return Response.json({ error: "Only company administrators can view vendor history." }, { status: 403 });
      const history = await db.select().from(auditLog).where(and(eq(auditLog.companyId, companyId), eq(auditLog.entityType, "vendor"))).orderBy(desc(auditLog.id)).limit(200);
      return Response.json({ history }, { headers: { "Cache-Control": "no-store" } });
    }
    if (kind === "transactions" && id) {
      const [record] = await db.select().from(transactions).where(and(eq(transactions.id, id), eq(transactions.companyId, companyId)));
      if (!record) return Response.json({ error: "Transaction not found." }, { status: 404 });
      const lines = await db.select({
        id: transactionLines.id,
        transactionId: transactionLines.transactionId,
        itemId: transactionLines.itemId,
        description: transactionLines.description,
        comments: transactionLines.comments,
        serialNumber: transactionLines.serialNumber,
        quantity: transactionLines.quantity,
        unitPrice: transactionLines.unitPrice,
        unitCost: transactionLines.unitCost,
        freightCharge: transactionLines.freightCharge,
        isFreightCharge: transactionLines.isFreightCharge,
        vatCode: transactionLines.vatCode,
        vatRate: transactionLines.vatRate,
        subtotal: transactionLines.subtotal,
        vatAmount: transactionLines.vatAmount,
        total: transactionLines.total,
        itemNumber: items.itemNumber,
        sku: items.sku,
        specifications: items.specifications,
        hsCode: items.hsCode,
        countryOfOrigin: items.countryOfOrigin,
        dimensionText: items.dimensionText,
        lengthCm: items.lengthCm,
        widthCm: items.widthCm,
        heightCm: items.heightCm,
        weightKg: items.weightKg,
      }).from(transactionLines).leftJoin(items, eq(transactionLines.itemId, items.id)).where(eq(transactionLines.transactionId, id)).orderBy(asc(transactionLines.id));
      const journal = await db.select({
        accountName: journalLines.accountName, debit: journalLines.debit, credit: journalLines.credit,
      }).from(journalLines).innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id)).where(eq(journalEntries.transactionId, id)).orderBy(asc(journalLines.id));
      const linkedSourceId = record.sourceTransactionId || record.purchaseOrderId || record.salesSourceId || (record.type === "vendor credit" ? record.billId : null);
      const [sourceDocument] = linkedSourceId ? await db.select({ number: transactions.number, type: transactions.type }).from(transactions).where(eq(transactions.id, linkedSourceId)).limit(1) : [];
      const [convertedDocument] = record.convertedInvoiceId ? await db.select({ number: transactions.number, type: transactions.type }).from(transactions).where(eq(transactions.id, record.convertedInvoiceId)).limit(1) : [];
      const customerType = ["invoice", "quotation", "estimate", "proforma invoice", "sales order", "sales receipt", "statement charge", "finance charge", "customer payment", "credit memo"].includes(record.type) ? "customer" : "vendor";
      const [partyContact] = await db.select().from(contacts).where(and(eq(contacts.companyId, companyId), eq(contacts.type, customerType), eq(contacts.name, record.party))).limit(1);
      const invoiceBalance = record.type === "invoice" ? (record.status === "paid" ? 0 : round(record.total - await invoicePaidAmount(record.id))) : undefined;
      return Response.json({ revision: purchaseRevision(record, lines), record: { ...paymentDisplayRecord(record), ...(invoiceBalance !== undefined ? { balance: invoiceBalance } : {}), sourceDocumentNumber: sourceDocument?.number ?? "", sourceDocumentType: sourceDocument?.type ?? "", convertedDocumentNumber: convertedDocument?.number ?? "", convertedDocumentType: convertedDocument?.type ?? "", convertedInvoiceNumber: convertedDocument?.type === "invoice" ? convertedDocument.number : "" }, lines, journal, partyContact: partyContact ?? null });
    }
    if (kind === "contacts") return Response.json({ records: await db.select().from(contacts).where(eq(contacts.companyId, companyId)).orderBy(asc(contacts.name)) });
    if (kind === "items") {
      const records = await db.select().from(items).where(and(eq(items.companyId, companyId), eq(items.locationId, locationId))).orderBy(asc(items.name));
      const purchaseCostLines = await db.select({
        itemId: transactionLines.itemId,
        quantity: transactionLines.quantity,
        unitPrice: transactionLines.unitPrice,
        freightCharge: transactionLines.freightCharge,
        exchangeRate: transactions.exchangeRate,
      }).from(transactionLines)
        .innerJoin(transactions, eq(transactionLines.transactionId, transactions.id))
        .where(and(
          eq(transactions.companyId, companyId),
          eq(transactions.locationId, locationId),
          inArray(transactions.type, ["bill", "item receipt"]),
          sql`${transactionLines.itemId} IS NOT NULL`,
        ));
      const weightedCosts = new Map<number, { quantity: number; value: number }>();
      for (const line of purchaseCostLines) {
        if (!line.itemId || Number(line.quantity) <= 0) continue;
        const old = weightedCosts.get(line.itemId) ?? { quantity: 0, value: 0 };
        const quantity = Number(line.quantity);
        weightedCosts.set(line.itemId, {
          quantity: old.quantity + quantity,
          value: old.value + (quantity * Number(line.unitPrice) + Number(line.freightCharge || 0)) * Number(line.exchangeRate),
        });
      }
      const openPoLines = await db.select({ id: transactionLines.id, itemId: transactionLines.itemId, quantity: transactionLines.quantity }).from(transactionLines)
        .innerJoin(transactions, eq(transactionLines.transactionId, transactions.id))
        .where(and(eq(transactions.companyId, companyId), eq(transactions.locationId, locationId), eq(transactions.type, "purchase order"), inArray(transactions.status, ["open", "pending", "overdue", "partially received"]), sql`${transactionLines.itemId} IS NOT NULL`));
      const allocations = openPoLines.length ? await db.select({ orderLineId: purchaseReceiptAllocations.orderLineId, quantity: purchaseReceiptAllocations.quantity }).from(purchaseReceiptAllocations).where(inArray(purchaseReceiptAllocations.orderLineId, openPoLines.map((line) => line.id))) : [];
      const receivedByLine = new Map<number, number>();
      for (const allocation of allocations) receivedByLine.set(allocation.orderLineId, (receivedByLine.get(allocation.orderLineId) ?? 0) + Number(allocation.quantity));
      const onPoByItem = new Map<number, number>();
      for (const line of openPoLines) if (line.itemId) onPoByItem.set(line.itemId, (onPoByItem.get(line.itemId) ?? 0) + Math.max(0, Number(line.quantity) - (receivedByLine.get(line.id) ?? 0)));
      return Response.json({ records: records.map((item) => {
        const weighted = weightedCosts.get(item.id);
        const averageCost = weighted && weighted.quantity > 0 ? round(weighted.value / weighted.quantity) : round(Number(item.lastPurchasePrice) || Number(item.cost) || 0);
        return { ...item, averageCost, onPo: round(onPoByItem.get(item.id) ?? 0) };
      }) });
    }
    if (kind === "accounts") {
      const journalFilter = Number.isInteger(locationId) && locationId > 0 ? and(eq(journalEntries.companyId, companyId), eq(journalEntries.locationId, locationId)) : eq(journalEntries.companyId, companyId);
      const [accountRows, [accountCompany], currentRates, balanceLines] = await Promise.all([
        db.select().from(accounts).where(eq(accounts.companyId, companyId)).orderBy(asc(accounts.code)),
        db.select({ baseCurrency: companies.baseCurrency }).from(companies).where(eq(companies.id, companyId)).limit(1),
        db.select({ currencyCode: exchangeRates.currencyCode, rate: exchangeRates.rate }).from(exchangeRates).where(and(eq(exchangeRates.companyId, companyId), eq(exchangeRates.active, true))),
        db.select({ name: journalLines.accountName, entryCurrency: journalEntries.currency, exchangeRate: journalEntries.exchangeRate, debit: journalLines.debit, credit: journalLines.credit, originalDebit: journalLines.originalDebit, originalCredit: journalLines.originalCredit }).from(journalLines).innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id)).where(journalFilter),
      ]);
      const duplicateNames = new Set(accountRows.filter((account, index, rows) => rows.some((other, otherIndex) => otherIndex !== index && other.name === account.name)).map((account) => account.name));
      const creditNormal = new Set(["Income", "Other Income", "Loan", "Credit Card", "Equity", "Accounts Payable", "Other Current Liability", "Long Term Liability"]);
      const rateMap = new Map(currentRates.map((rate) => [String(rate.currencyCode).toUpperCase(), Number(rate.rate)]));
      return Response.json({ records: accountRows.map((account) => {
        const accountCurrency = String(account.currency || accountCompany?.baseCurrency || "AED").toUpperCase();
        const baseCurrency = String(accountCompany?.baseCurrency || "AED").toUpperCase();
        const matched = balanceLines.filter((line) => {
          if (line.name !== account.name) return false;
          if (!duplicateNames.has(account.name)) return true;
          return String(line.entryCurrency || baseCurrency).toUpperCase() === accountCurrency;
        });
        const activity = matched.reduce((total, line) => {
          const entryCurrency = String(line.entryCurrency || baseCurrency).toUpperCase();
          const rate = Number(line.exchangeRate || 1);
          const nativeDebit = accountCurrency === baseCurrency ? Number(line.debit) : entryCurrency === accountCurrency ? Number(line.originalDebit ?? (rate > 0 ? Number(line.debit) / rate : line.debit)) : 0;
          const nativeCredit = accountCurrency === baseCurrency ? Number(line.credit) : entryCurrency === accountCurrency ? Number(line.originalCredit ?? (rate > 0 ? Number(line.credit) / rate : line.credit)) : 0;
          return { debit: total.debit + nativeDebit, credit: total.credit + nativeCredit, baseDebit: total.baseDebit + Number(line.debit), baseCredit: total.baseCredit + Number(line.credit) };
        }, { debit: 0, credit: 0, baseDebit: 0, baseCredit: 0 });
        const movement = creditNormal.has(account.type) ? activity.credit - activity.debit : activity.debit - activity.credit;
        const baseMovement = creditNormal.has(account.type) ? activity.baseCredit - activity.baseDebit : activity.baseDebit - activity.baseCredit;
        const openingRate = accountCurrency === baseCurrency ? 1 : rateMap.get(accountCurrency) ?? 0;
        return { ...account, balance: round(Number(account.balance) + movement), baseBalance: round(Number(account.balance) * openingRate + baseMovement) };
      }) });
    }
    const transactionFilter = Number.isInteger(locationId) && locationId > 0 ? and(eq(transactions.companyId, companyId), eq(transactions.locationId, locationId)) : eq(transactions.companyId, companyId);
    return Response.json({ records: (await db.select().from(transactions).where(transactionFilter).orderBy(desc(transactions.transactionDate), desc(transactions.id)).limit(500)).map(paymentDisplayRecord) });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

async function handlePOST(request: Request) {
  const payload = await request.clone().json();
  if (["contacts", "accounts", "items"].includes(payload.kind)) return withWriteTransaction(async () => {
    if (process.env.COMNET_LOCAL_DB !== "1" && Number.isInteger(Number(payload.companyId))) {
      await getDb().execute(sql`select pg_advisory_xact_lock(731459, ${Number(payload.companyId)})`);
    }
    return saveNewRecord(request);
  });
  if (payload.kind === "transactions" && ["bill payment", "customer payment", "cheque"].includes(payload.type)) return withWriteTransaction(() => saveNewRecord(request));
  return saveNewRecord(request);
}

// Called for edits only inside the locked, atomic PATCH transaction.
async function saveNewRecord(request: Request, replacing?: typeof transactions.$inferSelect) {
  const authorization = await requireApiUser(request, false, true);
  if (authorization instanceof Response) return authorization;
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const kind = payload.kind as RecordKind;
    if (!["transactions", "contacts", "items", "accounts"].includes(kind)) return Response.json({ error: "Invalid record kind." }, { status: 400 });
    if (!mayWrite(authorization, writePermission(kind, payload))) return Response.json({ error: "Your role does not allow this action." }, { status: 403 });
    const companyId = Number(payload.companyId);
    const locationId = Number(payload.locationId);
    if (!Number.isInteger(companyId) || companyId <= 0) return Response.json({ error: "Select a company." }, { status: 400 });
    if (!canAccessCompany(authorization, companyId)) return Response.json({ error: "You do not have access to this company." }, { status: 403 });
    const db = getDb();
    // Verify the credential before dispatching on any client-selected record type.
    const [stockSettings] = await db.select({ pinHash: companySettings.negativeStockPinHash }).from(companySettings).where(eq(companySettings.companyId, companyId)).limit(1);
    const stockPinVerified = verifyAdminPin(String(payload.adminOverridePin ?? ""), stockSettings?.pinHash ?? "");

    if (kind === "contacts") {
      const name = String(payload.name ?? "").trim();
      const contactType = (payload.type as "customer" | "vendor" | "employee") ?? "customer";
      const currency = String(payload.currency ?? "AED").trim().toUpperCase();
      if (!name) return Response.json({ error: "Name is required." }, { status: 400 });
      if (payload.type === "customer") {
        const required = [payload.company, payload.phone, payload.whatsapp, payload.country, payload.reseller, payload.planet, payload.currency];
        if (required.some((value) => !String(value ?? "").trim())) return Response.json({ error: "Complete all required customer fields." }, { status: 400 });
        const phone = String(payload.phone).trim();
        const whatsapp = String(payload.whatsapp).trim();
        const trn = String(payload.trn ?? "").trim();
        if (!validInternationalPhone(phone) || !validInternationalPhone(whatsapp)) return Response.json({ error: "Contact and WhatsApp numbers must include + and a country code (7–15 digits)." }, { status: 400 });
        if (trn && !/^\d{15}$/.test(trn)) return Response.json({ error: "TRN must contain exactly 15 digits." }, { status: 400 });
        const customers = await db.select({ id: contacts.id, name: contacts.name, company: contacts.company, phone: contacts.phone, whatsapp: contacts.whatsapp, trn: contacts.trn }).from(contacts).where(and(eq(contacts.companyId, companyId), eq(contacts.type, "customer")));
        const conflict = customerConflict({ name, company: String(payload.company).trim(), phone, whatsapp, trn }, customers);
        if (conflict) return Response.json({ error: conflict }, { status: 409 });
      }
      if (payload.type === "vendor") {
        const required = [payload.company, payload.phone, payload.country, payload.currency];
        if (required.some((value) => !String(value ?? "").trim())) return Response.json({ error: "Complete all required vendor fields." }, { status: 400 });
      }
      if (contactType !== "customer") {
        const contactsOfType = await db.select({ id: contacts.id, name: contacts.name, company: contacts.company }).from(contacts).where(and(eq(contacts.companyId, companyId), eq(contacts.type, contactType)));
        const companyName = String(payload.company ?? "").trim();
        const duplicate = contactsOfType.find((contact) => normalizeComparableText(contact.name) === normalizeComparableText(name)
          || contactType === "vendor" && Boolean(companyName) && normalizeComparableText(contact.company) === normalizeComparableText(companyName));
        if (duplicate) return Response.json({ error: "Another record already uses this name or company." }, { status: 409 });
      }
      let ledgerAccountId: number | null = null;
      let generatedAccount: { id: number; code: string; name: string; currency: string } | null = null;
      if (contactType === "customer" || contactType === "vendor") {
        const requiredRole = contactType === "customer" ? "AR" : "AP";
        const requestedAccountId = Number(payload.ledgerAccountId);
        const [selectedAccount] = Number.isInteger(requestedAccountId) && requestedAccountId > 0
          ? await db.select().from(accounts).where(and(eq(accounts.id, requestedAccountId), eq(accounts.companyId, companyId), eq(accounts.systemRole, requiredRole), eq(accounts.currency, currency), eq(accounts.active, true))).limit(1)
          : [];
        if (selectedAccount) ledgerAccountId = selectedAccount.id;
        else {
          const ensured = await ensureCurrencyControlAccount(companyId, requiredRole, currency);
          ledgerAccountId = ensured.account.id;
          if (ensured.created) generatedAccount = { id: ensured.account.id, code: ensured.account.code, name: ensured.account.name, currency: ensured.account.currency };
        }
      }
      const [record] = await db.insert(contacts).values({
        companyId, type: contactType, name,
        company: String(payload.company ?? ""), billingName: String(payload.billingName ?? name),
        email: String(payload.email ?? ""), phone: String(payload.phone ?? "").trim(), whatsapp: String(payload.whatsapp ?? "").trim(),
        country: String(payload.country ?? ""), trn: String(payload.trn ?? "").trim(), reseller: String(payload.reseller ?? "Reseller"),
        planet: String(payload.planet ?? "No"), passport: String(payload.passport ?? ""), currency, ledgerAccountId,
        description: String(payload.description ?? ""), balance: Number(payload.balance ?? 0),
      }).returning();
      return Response.json({ record, generatedAccount }, { status: 201 });
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
          specifications: source.specifications, hsCode: source.hsCode, countryOfOrigin: source.countryOfOrigin, dimensionText: source.dimensionText,
          lengthCm: source.lengthCm, widthCm: source.widthCm, heightCm: source.heightCm, weightKg: source.weightKg, quantity: 0, itemType: source.itemType, reorderPoint: source.reorderPoint,
          salesPrice: source.salesPrice, cost: source.cost, purchaseVatCode: source.purchaseVatCode, cogsAccountId: source.cogsAccountId, preferredSupplierId: source.preferredSupplierId,
          salesVatCode: source.salesVatCode, incomeAccountId: source.incomeAccountId, assetAccountId: source.assetAccountId, amountsIncludeVat: source.amountsIncludeVat,
          lastPurchasePrice: source.lastPurchasePrice, status: source.status,
        }).returning();
        const [record] = await db.update(items).set({ itemNumber: String(13000 + created.id) }).where(eq(items.id, created.id)).returning();
        await db.insert(auditLog).values({ companyId, action: "duplicated", entityType: "item", entityId: record.id, details: `${source.sku} duplicated as ${record.sku}; opening quantity 0` });
        return Response.json({ record }, { status: 201 });
      }
      const specifications = Array.from({ length: 30 }, (_, index) => ({
        label: String(payload[`specLabel${index}`] ?? "").trim(),
        value: uppercaseText(payload[`specValue${index}`]),
      })).filter((specification) => specification.label && specification.value);
      const specificationValue = (label: string) => specifications.find((specification) => specification.label.toLowerCase() === label.toLowerCase())?.value ?? "";
      const category = uppercaseText(payload.category) || "GENERAL";
      const sku = await createUniqueItemSku();
      const name = uppercaseText(payload.name) || uppercaseText([specificationValue("Brand"), specificationValue("Model") || specificationValue("Part Number")].filter(Boolean).join(" ")) || `${category} ITEM`;
      const existingItems = await db.select({ id: items.id, name: items.name }).from(items).where(eq(items.companyId, companyId));
      if (existingItems.some((item) => normalizeComparableText(item.name) === normalizeComparableText(name))) return Response.json({ error: "An item with this name already exists." }, { status: 409 });
      // Keep labels in structured specifications for editing/filtering; the customer-facing description contains values only.
      const description = specifications.map((specification) => specification.value).filter((value) => value.trim().toLowerCase() !== "no").join(" | ");
      const parsedWeight = Number.parseFloat(specificationValue("Weight"));
      const itemType = normalizedItemType(payload.itemType);
      const purchaseVatCode = String(payload.purchaseVatCode ?? "STANDARD").trim().toUpperCase();
      const salesVatCode = String(payload.salesVatCode ?? "STANDARD").trim().toUpperCase();
      const cogsAccountId = optionalId(payload.cogsAccountId);
      const preferredSupplierId = optionalId(payload.preferredSupplierId);
      const incomeAccountId = optionalId(payload.incomeAccountId);
      const assetAccountId = itemType === "stock-part" ? optionalId(payload.assetAccountId) : null;
      const accountIds = [...new Set([cogsAccountId, incomeAccountId, assetAccountId].filter((id): id is number => id !== null))];
      const linkedAccounts = accountIds.length ? await db.select({ id: accounts.id, type: accounts.type, systemRole: accounts.systemRole, name: accounts.name }).from(accounts).where(and(eq(accounts.companyId, companyId), eq(accounts.active, true), inArray(accounts.id, accountIds))) : [];
      if (linkedAccounts.length !== accountIds.length) return Response.json({ error: "Select active item accounts from this company’s Chart of Accounts." }, { status: 400 });
      if (assetAccountId) {
        const assetAccount = linkedAccounts.find((account) => account.id === assetAccountId);
        if (!assetAccount || (assetAccount.systemRole !== "INVENTORY" && !/inventory asset/i.test(assetAccount.name))) {
          return Response.json({ error: "Stock Asset Account must be the Inventory Asset account from Chart of Accounts." }, { status: 400 });
        }
      }
      if (incomeAccountId) {
        const incomeAccount = linkedAccounts.find((account) => account.id === incomeAccountId);
        if (!incomeAccount || !["Income", "Other Income"].includes(incomeAccount.type)) {
          return Response.json({ error: "Income Account must be an Income account from Chart of Accounts." }, { status: 400 });
        }
      }
      if (cogsAccountId) {
        const costAccount = linkedAccounts.find((account) => account.id === cogsAccountId);
        const validCost = itemType === "stock-part"
          ? costAccount?.type === "Cost of Goods Sold"
          : Boolean(costAccount && ["Cost of Goods Sold", "Expense", "Other Expense"].includes(costAccount.type));
        if (!validCost) {
          return Response.json({ error: itemType === "stock-part" ? "Stock COGS Account must be a Cost of Goods Sold account." : "Purchase account must be an Expense or Cost of Goods Sold account." }, { status: 400 });
        }
      }
      if (preferredSupplierId) {
        const [supplier] = await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.id, preferredSupplierId), eq(contacts.companyId, companyId), eq(contacts.type, "vendor"), eq(contacts.status, "active"))).limit(1);
        if (!supplier) return Response.json({ error: "Select an active preferred supplier from this company." }, { status: 400 });
      }
      const activeVatCodes = await db.select({ code: vatCodes.code }).from(vatCodes).where(and(eq(vatCodes.companyId, companyId), eq(vatCodes.active, true)));
      if (activeVatCodes.length && [purchaseVatCode, salesVatCode].some((code) => !activeVatCodes.some((entry) => entry.code === code))) return Response.json({ error: "Select active purchase and sales VAT codes for this company." }, { status: 400 });
      const quantity = itemType === "stock-part" ? Number(payload.quantity ?? 0) : 0;
      const reorderPoint = itemType === "stock-part" ? Number(payload.reorderPoint ?? 0) : 0;
      const salesPrice = Number(payload.salesPrice ?? 0);
      const cost = Number(payload.cost ?? 0);
      if (![quantity, reorderPoint, salesPrice, cost].every((value) => Number.isFinite(value) && value >= 0)) return Response.json({ error: "Quantity, reorder point, cost and sales price must be non-negative numbers." }, { status: 400 });
      const [created] = await db.insert(items).values({
        companyId, locationId, name, sku, category, description,
        specifications: JSON.stringify(specifications), countryOfOrigin: specificationValue("Country of Origin").toUpperCase(),
        dimensionText: specificationValue("Dimensions"), weightKg: Number.isFinite(parsedWeight) ? parsedWeight : 0, quantity, itemType, reorderPoint, salesPrice, cost,
        purchaseVatCode, cogsAccountId, preferredSupplierId, salesVatCode, incomeAccountId, assetAccountId,
        amountsIncludeVat: payload.amountsIncludeVat === true || String(payload.amountsIncludeVat) === "true",
        status: String(payload.status) === "inactive" ? "inactive" : "active",
      }).returning();
      const [record] = await db.update(items).set({ itemNumber: String(13000 + created.id) }).where(eq(items.id, created.id)).returning();
      return Response.json({ record }, { status: 201 });
    }

    if (kind === "accounts") {
      const name = String(payload.name ?? "").trim();
      const code = uppercaseText(payload.code);
      if (!name || !code) return Response.json({ error: "Account code and name are required." }, { status: 400 });
      const companyAccounts = await db.select({ name: accounts.name, code: accounts.code }).from(accounts).where(eq(accounts.companyId, companyId));
      if (companyAccounts.some((account) => normalizeComparableText(account.name) === normalizeComparableText(name))) return Response.json({ error: "Another account already uses this name." }, { status: 409 });
      if (companyAccounts.some((account) => normalizeComparableText(account.code) === normalizeComparableText(code))) return Response.json({ error: "Account code already exists." }, { status: 409 });
      const parentAccountId = Number(payload.parentAccountId);
      const requestedRole = String(payload.systemRole ?? "").trim().toUpperCase();
      const systemRole = accountRoles.includes(requestedRole) ? requestedRole : null;
      const currency = String(payload.currency ?? "AED").trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency)) return Response.json({ error: "Choose a valid three-letter account currency." }, { status: 400 });
      if (Number.isInteger(parentAccountId) && parentAccountId > 0) {
        const [parent] = await db.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.id, parentAccountId), eq(accounts.companyId, companyId))).limit(1);
        if (!parent) return Response.json({ error: "Select a valid parent account from this company." }, { status: 400 });
      }
      if (systemRole) {
        const filters = systemRole === "AR" || systemRole === "AP"
          ? and(eq(accounts.companyId, companyId), eq(accounts.systemRole, systemRole), eq(accounts.currency, currency))
          : and(eq(accounts.companyId, companyId), eq(accounts.systemRole, systemRole));
        const [linked] = await db.select({ id: accounts.id }).from(accounts).where(filters).limit(1);
        if (linked) return Response.json({ error: systemRole === "AR" || systemRole === "AP" ? `That ${currency} control account is already linked.` : "That system use is already linked to another account." }, { status: 409 });
      }
      const [record] = await db.insert(accounts).values({ companyId, code, name, type: String(payload.type ?? "Expense"), systemRole, currency, parentAccountId: Number.isInteger(parentAccountId) && parentAccountId > 0 ? parentAccountId : null, balance: Number(payload.balance ?? 0) }).returning();
      if (systemRole === "AR" || systemRole === "AP") {
        await db.update(contacts).set({ ledgerAccountId: record.id }).where(and(eq(contacts.companyId, companyId), eq(contacts.type, systemRole === "AR" ? "customer" : "vendor"), eq(contacts.currency, currency), sql`${contacts.ledgerAccountId} IS NULL`));
      }
      return Response.json({ record }, { status: 201 });
    }

    const type = String(payload.type ?? "invoice");
    const terms = String(payload.terms ?? "").trim();
    if (terms.length > 200) return Response.json({ error: "Payment terms must be no more than 200 characters." }, { status: 400 });
    const comments = ["invoice", "bill"].includes(type) ? String(payload.comments ?? replacing?.comments ?? "") : "";
    const serialNumber = ["invoice", "bill"].includes(type) ? String(payload.serialNumber ?? replacing?.serialNumber ?? "") : "";
    const conversionSourceId = ["invoice", "bill"].includes(type) ? Number(payload.sourceTransactionId) : NaN;
    let rawLines = Array.isArray(payload.lines) ? payload.lines as InputLine[] : [];
    if (Number.isInteger(conversionSourceId) && conversionSourceId > 0) {
      const [source] = await db.select().from(transactions).where(and(eq(transactions.id, conversionSourceId), eq(transactions.companyId, companyId))).for("update");
      const validSalesConversion = type === "invoice" && ["quotation", "estimate", "proforma invoice", "sales order"].includes(source?.type ?? "");
      const validPurchaseConversion = type === "bill" && source?.type === "purchase order";
      if (!source || (!validSalesConversion && !validPurchaseConversion)) return Response.json({ error: type === "bill" ? "Only a purchase order can be converted to a supplier bill." : "Only a quotation, estimate, proforma invoice, or sales order can be converted to an invoice." }, { status: 400 });
      if (validSalesConversion && (await salesSourceLines(source.id)).some((line) => line.invoiced > 0)) return Response.json({ error: "This document has partial invoices. Use Save Invoice for the remaining quantities." }, { status: 409 });
      if (validPurchaseConversion && (await purchaseReceiptLines(source.id)).some((line) => line.received > 0)) return Response.json({ error: "This PO has item receipts. Finish receiving on the same PO; do not convert the full PO to a stock-posting bill." }, { status: 409 });
      if (source.convertedInvoiceId || source.status === "converted") return Response.json({ error: "This document has already been converted." }, { status: 409 });
      if (source.locationId !== locationId) return Response.json({ error: "Create the new document from the same inventory as the source document." }, { status: 400 });
      rawLines = await db.select().from(transactionLines).where(eq(transactionLines.transactionId, conversionSourceId)).orderBy(asc(transactionLines.id));
      payload.party = source.party;
      payload.salesman = source.salesman;
      payload.terms = source.terms;
      payload.currency = source.currency;
      payload.exchangeRate = source.exchangeRate;
      if (type === "invoice") payload.account = source.account;
      payload.memo = [source.memo, `Converted from ${source.type} ${source.number}`].filter(Boolean).join(" · ");
    }
    const salesSourceId = payload.salesSourceId ? Number(payload.salesSourceId) : null;
    const salesAllocations: { sourceLineId: number; quantity: number }[] = [];
    if (salesSourceId !== null) {
      if (type !== "invoice" || replacing || payload.sourceTransactionId || !Number.isSafeInteger(salesSourceId) || salesSourceId <= 0) return Response.json({ error: "Select a valid source for this invoice." }, { status: 400 });
      const [source] = await db.select().from(transactions).where(and(eq(transactions.id, salesSourceId), eq(transactions.companyId, companyId))).for("update");
      if (!source || !["estimate", "proforma invoice", "sales order"].includes(source.type)) return Response.json({ error: "Select an estimate, proforma invoice or sales order in this company." }, { status: 400 });
      if (source.convertedInvoiceId || !["open", "draft", "pending", "overdue", "sent", "accepted", "approved", "partially invoiced"].includes(source.status)) return Response.json({ error: "This sales document is not open for invoicing." }, { status: 409 });
      if (!Number.isSafeInteger(locationId) || locationId <= 0) return Response.json({ error: "Select an invoice inventory." }, { status: 400 });
      const [location] = await db.select({ id: inventoryLocations.id }).from(inventoryLocations).where(and(eq(inventoryLocations.id, locationId), eq(inventoryLocations.companyId, companyId)));
      if (!location) return Response.json({ error: "Select an inventory in this company." }, { status: 400 });
      const date = String(payload.transactionDate ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) return Response.json({ error: "Enter a valid invoice date." }, { status: 400 });
      const sourceLines = await salesInventoryLines(source.id, companyId, locationId);
      const ids = rawLines.map((line) => Number(line.sourceLineId));
      if (!ids.length || new Set(ids).size !== ids.length) return Response.json({ error: "Select unique source lines to invoice." }, { status: 400 });
      const rate = Number(source.exchangeRate);
      if (!Number.isFinite(rate) || rate <= 0) return Response.json({ error: "Correct the source exchange rate before invoicing." }, { status: 400 });
      const invoiceLines: InputLine[] = [];
      for (const input of rawLines) {
        const line = sourceLines.find((entry) => entry.id === Number(input.sourceLineId));
        const quantity = Number(input.quantity);
        if (!line || !Number.isFinite(quantity) || quantity <= 0 || quantity > line.remaining) return Response.json({ error: "Invoice a positive quantity no greater than the remaining quantity. Refresh the source document." }, { status: 409 });
        if (line.itemId && !line.stockItemId) return Response.json({ error: "An ordered item is unavailable in this inventory. Choose another inventory or invoice other items." }, { status: 409 });
        salesAllocations.push({ sourceLineId: line.id, quantity });
        invoiceLines.push({ ...line, comments: input.comments, serialNumber: input.serialNumber, itemId: line.itemId ? line.stockItemId : null, quantity, unitCost: line.itemId ? line.homeCost / rate : line.unitCost });
      }
      rawLines = invoiceLines;
      payload.party = source.party; payload.salesman = source.salesman; payload.terms = source.terms; payload.currency = source.currency; payload.exchangeRate = source.exchangeRate;
      payload.account = source.account; payload.status = "open"; payload.allowNegativeStock = false;
      payload.memo = [source.memo, String(payload.memo ?? ""), `Invoiced from ${source.type} ${source.number}`].filter(Boolean).join(" · ");
    }
    const purchaseOrderId = payload.purchaseOrderId ? Number(payload.purchaseOrderId) : null;
    const receiptAllocations: { orderLineId: number; quantity: number }[] = [];
    if (purchaseOrderId !== null) {
      if (!["item receipt", "bill"].includes(type) || payload.sourceTransactionId || replacing || !Number.isSafeInteger(purchaseOrderId) || purchaseOrderId <= 0) return Response.json({ error: "Select a valid purchase order for this item receipt." }, { status: 400 });
      const [order] = await db.select().from(transactions).where(and(eq(transactions.id, purchaseOrderId), eq(transactions.companyId, companyId))).for("update");
      if (!order || order.type !== "purchase order") return Response.json({ error: "Select a purchase order from this company." }, { status: 400 });
      if (!Number.isSafeInteger(locationId) || locationId <= 0) return Response.json({ error: "Select a receiving inventory." }, { status: 400 });
      const [receivingLocation] = await db.select({ id: inventoryLocations.id }).from(inventoryLocations).where(and(eq(inventoryLocations.id, locationId), eq(inventoryLocations.companyId, companyId)));
      if (!receivingLocation) return Response.json({ error: "Select a receiving inventory from this company." }, { status: 400 });
      if (order.convertedInvoiceId || !["open", "pending", "overdue", "partially received"].includes(order.status)) return Response.json({ error: "This purchase order is not open for receiving." }, { status: 409 });
      const orderLines = await purchaseReceiptLines(order.id);
      const ids = rawLines.map((line) => Number(line.orderLineId));
      if (!ids.length || new Set(ids).size !== ids.length) return Response.json({ error: "Select unique purchase order lines to receive." }, { status: 400 });
      const receivedLines: InputLine[] = [];
      for (const input of rawLines) {
        const line = orderLines.find((entry) => entry.id === Number(input.orderLineId));
        const quantity = Number(input.quantity);
        if (!line || !Number.isFinite(quantity) || quantity <= 0 || quantity > line.remaining) return Response.json({ error: "Receive a positive quantity no greater than the remaining PO quantity. Refresh the purchase order." }, { status: 409 });
        receiptAllocations.push({ orderLineId: line.id, quantity });
        let receiptItemId = line.itemId;
        if (line.itemId && order.locationId !== locationId) {
          const [sourceItem] = await db.select().from(items).where(and(eq(items.id, line.itemId), eq(items.companyId, companyId), eq(items.locationId, order.locationId!)));
          if (!sourceItem) return Response.json({ error: "The ordered item is no longer available in the PO inventory." }, { status: 409 });
          await db.insert(items).values({ ...sourceItem, id: undefined, createdAt: undefined, locationId, quantity: 0 }).onConflictDoNothing({ target: [items.companyId, items.locationId, items.sku] });
          const [destinationItem] = await db.select({ id: items.id }).from(items).where(and(eq(items.companyId, companyId), eq(items.locationId, locationId), eq(items.sku, sourceItem.sku)));
          if (!destinationItem) throw new Error("Could not prepare the item in the receiving inventory.");
          receiptItemId = destinationItem.id;
        }
        receivedLines.push({ ...line, comments: input.comments, serialNumber: input.serialNumber, itemId: receiptItemId, quantity });
      }
      rawLines = receivedLines;
      payload.party = order.party; payload.currency = order.currency; payload.exchangeRate = order.exchangeRate;
      payload.salesman = order.salesman; payload.account = type === "bill" ? String(payload.account || "Purchases") : "Suspense"; payload.status = "open";
      payload.memo = [order.memo, String(payload.memo || ""), `Received from PO ${order.number}`].filter(Boolean).join(" · ");
    }
    let purchaseReturnBillId: number | null = null;
    if (type === "vendor credit") {
      purchaseReturnBillId = Number(payload.billId);
      if (!Number.isSafeInteger(purchaseReturnBillId) || purchaseReturnBillId <= 0) return Response.json({ error: "Select the original supplier bill for this purchase return." }, { status: 400 });
      const [sourceBill] = await db.select().from(transactions).where(and(eq(transactions.id, purchaseReturnBillId), eq(transactions.companyId, companyId), eq(transactions.type, "bill"))).for("update");
      if (!sourceBill || sourceBill.locationId !== locationId) return Response.json({ error: "Select a supplier bill from this company and inventory." }, { status: 400 });
      if (!rawLines.length || rawLines.some((line) => !Number.isSafeInteger(Number(line.sourceLineId)) || Number(line.sourceLineId) <= 0)) return Response.json({ error: "Choose return lines from the original supplier bill." }, { status: 400 });
      const sourceLines = await db.select().from(transactionLines).where(eq(transactionLines.transactionId, sourceBill.id)).orderBy(asc(transactionLines.id));
      const sourceById = new Map(sourceLines.map((line) => [line.id, line]));
      const returnDocuments = await db.select({ id: transactions.id }).from(transactions).where(and(eq(transactions.companyId, companyId), eq(transactions.type, "vendor credit"), eq(transactions.billId, sourceBill.id), sql`${transactions.id} <> ${replacing?.id ?? 0}`));
      const priorLines = returnDocuments.length ? await db.select().from(transactionLines).where(inArray(transactionLines.transactionId, returnDocuments.map((document) => document.id))) : [];
      const lineKey = (line: { itemId: number | null; description: string }) => `${line.itemId ?? 0}:${line.description.trim().toLowerCase()}`;
      const purchasedByKey = new Map<string, number>();
      const returnedByKey = new Map<string, number>();
      const requestedByKey = new Map<string, number>();
      for (const line of sourceLines) purchasedByKey.set(lineKey(line), round((purchasedByKey.get(lineKey(line)) ?? 0) + Number(line.quantity)));
      for (const line of priorLines) returnedByKey.set(lineKey(line), round((returnedByKey.get(lineKey(line)) ?? 0) + Number(line.quantity)));
      const validatedLines: InputLine[] = [];
      for (const input of rawLines) {
        const source = sourceById.get(Number(input.sourceLineId));
        const quantity = Number(input.quantity);
        if (!source || !Number.isFinite(quantity) || quantity <= 0 || source.isFreightCharge) return Response.json({ error: "Select valid positive quantities from the original supplier bill." }, { status: 400 });
        const key = lineKey(source);
        requestedByKey.set(key, round((requestedByKey.get(key) ?? 0) + quantity));
        validatedLines.push({ sourceLineId: source.id, itemId: source.itemId, description: source.description, quantity, unitPrice: source.unitPrice, unitCost: source.unitCost, vatCode: source.vatCode, vatRate: source.vatRate });
      }
      for (const [key, requested] of requestedByKey) if (requested > round((purchasedByKey.get(key) ?? 0) - (returnedByKey.get(key) ?? 0))) return Response.json({ error: "Return quantity exceeds the quantity remaining on the supplier bill. Refresh the return and try again." }, { status: 409 });
      rawLines = validatedLines;
      payload.party = sourceBill.party; payload.currency = sourceBill.currency; payload.exchangeRate = sourceBill.exchangeRate;
      payload.account = sourceBill.account; payload.status = "open";
      payload.memo = [String(payload.memo || ""), `Returned against bill ${sourceBill.number}`].filter(Boolean).join(" · ");
    }
    const requestedParty = String(payload.party ?? "").trim();
    const chequeType = String(payload.chequeType ?? "").trim();
    const party = type === "cheque" && !requestedParty && ["expense", "salary"].includes(chequeType) ? "General expense" : requestedParty;
    const configuredVatCodes = await db.select({ code: vatCodes.code, rate: vatCodes.rate }).from(vatCodes).where(and(eq(vatCodes.companyId, companyId), eq(vatCodes.active, true)));
    const vatRates = configuredVatCodes.length ? Object.fromEntries(configuredVatCodes.map((vatCode) => [vatCode.code, Number(vatCode.rate)])) : fallbackVatRates;
    if (type === "bill") rawLines = rawLines.filter(line => !line.isFreightCharge);
    if (rawLines.some(line => !Number.isFinite(Number(line.freightCharge ?? 0)) || Number(line.freightCharge ?? 0) < 0)) return Response.json({ error: "Line freight charges must be finite, non-negative amounts." }, { status: 400 });
    const prepared = rawLines.map((line) => {
      const quantity = Number(line.quantity ?? 1);
      const unitPrice = Number(line.unitPrice ?? 0);
      const freightCharge = type === "bill" ? round(Number(line.freightCharge ?? 0)) : 0;
      const unitCost = type === "bill" && quantity > 0 ? round(unitPrice + freightCharge / quantity) : Number(line.unitCost ?? 0);
      const requestedVatCode = type === "item receipt" ? "ZERO" : String(line.vatCode ?? (Number(line.vatRate ?? payload.vatRate ?? 5) === 5 ? "STANDARD" : "ZERO")).trim().toUpperCase();
      const vatCode = Object.hasOwn(vatRates, requestedVatCode) ? requestedVatCode : Object.hasOwn(vatRates, "STANDARD") ? "STANDARD" : Object.keys(vatRates)[0];
      const vatRate = vatRates[vatCode];
      const subtotal = round(quantity * unitPrice);
      const vatAmount = round(subtotal * vatRate / 100);
      return { itemId: line.itemId ? Number(line.itemId) : null, description: String(line.description ?? "").trim(), comments: ["invoice", "bill"].includes(type) ? String(line.comments ?? "") : "", serialNumber: ["invoice", "bill"].includes(type) ? String(line.serialNumber ?? "") : "", quantity, unitPrice, unitCost, freightCharge, isFreightCharge: false, vatCode, vatRate, subtotal, vatAmount, total: round(subtotal + vatAmount) };
    }).filter((line) => line.description || line.itemId || line.subtotal > 0);
    if (!prepared.length && Number(payload.total) > 0) {
      const subtotal = Number(payload.total);
      const requestedVatCode = Number(payload.vatRate ?? 5) === 5 ? "STANDARD" : "ZERO";
      const vatCode = Object.hasOwn(vatRates, requestedVatCode) ? requestedVatCode : Object.keys(vatRates)[0];
      const vatRate = vatRates[vatCode];
      prepared.push({ comments: "", serialNumber: "", itemId: null, description: String(payload.memo ?? type), quantity: 1, unitPrice: subtotal, unitCost: 0, freightCharge: 0, isFreightCharge: false, vatCode, vatRate, subtotal, vatAmount: round(subtotal * vatRate / 100), total: round(subtotal * (1 + vatRate / 100)) });
    }
    if (!party || !prepared.length || prepared.some((line) => !Number.isFinite(line.quantity) || line.quantity <= 0 || !Number.isFinite(line.unitPrice) || line.unitPrice < 0)) {
      return Response.json({ error: "Party and at least one valid document line are required." }, { status: 400 });
    }
    if (prepared.some((line) => line.itemId !== null && (!Number.isInteger(line.itemId) || line.itemId <= 0))) {
      return Response.json({ error: "Select a valid inventory item on every stock line." }, { status: 400 });
    }
    const linkedItemIds = [...new Set(prepared.flatMap((line) => line.itemId ? [line.itemId] : []))];
    let linkedItems: Array<{ id: number; itemType: string; status: string; cogsAccountId: number | null; incomeAccountId: number | null; assetAccountId: number | null }> = [];
    if (["bill", "invoice", "estimate", "proforma invoice", "sales order", "quotation"].includes(type) || linkedItemIds.length) {
      const [location] = await db.select({ id: inventoryLocations.id }).from(inventoryLocations).where(and(eq(inventoryLocations.id, locationId), eq(inventoryLocations.companyId, companyId))).limit(1);
      if (!location) return Response.json({ error: "Select a valid inventory in this company." }, { status: 400 });
      if (linkedItemIds.length) {
        linkedItems = await db.select({ id: items.id, itemType: items.itemType, status: items.status, cogsAccountId: items.cogsAccountId, incomeAccountId: items.incomeAccountId, assetAccountId: items.assetAccountId }).from(items).where(and(eq(items.companyId, companyId), eq(items.locationId, locationId), inArray(items.id, linkedItemIds)));
        if (linkedItems.length !== linkedItemIds.length) return Response.json({ error: "Select items from the document’s company and inventory." }, { status: 400 });
        if (linkedItems.some((item) => item.status === "inactive")) return Response.json({ error: "Inactive items cannot be added to a new document." }, { status: 409 });
        if (linkedItems.some((item) => !documentLineItemTypes.has(item.itemType))) return Response.json({ error: "Subtotal, group, discount, payment and VAT control items must be used in their dedicated document areas, not as stock/service lines." }, { status: 400 });
      }
    }
    const stockItemIds = new Set(linkedItems.filter((item) => item.itemType === "stock-part").map((item) => item.id));
    const stockReducing = ["invoice", "sales receipt", "vendor credit"].includes(type);
    let usedAdminNegativeStockOverride = false;
    if (stockReducing) {
      if (!Number.isInteger(locationId) || locationId <= 0) return Response.json({ error: "Select an inventory before creating the document." }, { status: 400 });
      const requestedByItem = new Map<number, number>();
      for (const line of prepared) if (line.itemId && stockItemIds.has(line.itemId)) requestedByItem.set(line.itemId, (requestedByItem.get(line.itemId) ?? 0) + line.quantity);
      const itemIds = [...requestedByItem.keys()];
      if (itemIds.length) {
        const available = await db.select({ id: items.id, sku: items.sku, name: items.name, quantity: items.quantity }).from(items).where(and(eq(items.companyId, companyId), eq(items.locationId, locationId), inArray(items.id, itemIds))).orderBy(asc(items.id)).for("update");
        if (available.length !== itemIds.length) return Response.json({ error: "One or more selected items do not belong to this company inventory." }, { status: 400 });
        const wantsOverride = type !== "vendor credit" && (payload.allowNegativeStock === true || String(payload.allowNegativeStock) === "true");
        let overrideApproved = false;
        if (wantsOverride) {
          if (!stockSettings?.pinHash) return Response.json({ error: "Admin PIN is not configured. Open Management > Admin Controls." }, { status: 403 });
          if (!stockPinVerified) return Response.json({ error: "Incorrect admin PIN. Negative stock was not allowed." }, { status: 403 });
          overrideApproved = true;
          usedAdminNegativeStockOverride = true;
        }
        if (!overrideApproved) {
          const shortages = available.filter((item) => Number(item.quantity) < (requestedByItem.get(item.id) ?? 0));
          if (shortages.length) {
            const detail = shortages.map((item) => `${item.sku} ${item.name}: available ${item.quantity}, requested ${requestedByItem.get(item.id)}`).join("; ");
            return Response.json({ error: `${type === "vendor credit" ? "Purchase return" : "Invoice"} blocked to prevent negative stock. ${detail}` }, { status: 409 });
          }
        }
      }
    }
    if (type === "bill") {
      const freightByTax = new Map<string, { amount: number; rate: number }>();
      for (const line of prepared) if (line.freightCharge > 0) {
        const old = freightByTax.get(line.vatCode);
        freightByTax.set(line.vatCode, { amount: round((old?.amount ?? 0) + line.freightCharge), rate: line.vatRate });
      }
      for (const [vatCode, freight] of freightByTax) {
        const freightVat = round(freight.amount * freight.rate / 100);
        prepared.push({ comments: "", serialNumber: "", itemId: null, description: "Freight Charges", quantity: 1, unitPrice: freight.amount, unitCost: freight.amount, freightCharge: 0, isFreightCharge: true, vatCode, vatRate: freight.rate, subtotal: freight.amount, vatAmount: freightVat, total: round(freight.amount + freightVat) });
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
    let number = String(payload.number ?? `${purchaseOrderId ? type === "bill" ? "BILL" : "REC" : "TX"}-${Date.now()}`);
    if (type === "invoice") {
      if (!Number.isInteger(locationId) || locationId <= 0) return Response.json({ error: "Select an inventory before creating the invoice." }, { status: 400 });
      const [sequence] = await db.update(inventoryLocations).set({ nextInvoiceNumber: sql`${inventoryLocations.nextInvoiceNumber} + 1` }).where(and(eq(inventoryLocations.id, locationId), eq(inventoryLocations.companyId, companyId))).returning();
      if (!sequence) return Response.json({ error: "The selected inventory was not found." }, { status: 404 });
      const companyPrefix = `C${String(companyId).padStart(3, "0")}`;
      number = `${companyPrefix}-${sequence.invoicePrefix}-INV-${String(sequence.nextInvoiceNumber - 1).padStart(4, "0")}`;
    }
    if (["transfer", "credit card charge"].includes(type)) {
      const bankingAccounts = await db.select({ name: accounts.name, type: accounts.type, systemRole: accounts.systemRole }).from(accounts).where(and(eq(accounts.companyId, companyId), eq(accounts.active, true)));
      if (type === "transfer") {
        const selected = bankingAccounts.filter((candidate) => [recordAccount(payload), party].includes(candidate.name) && (candidate.type === "Bank" || candidate.systemRole === "BANK"));
        if (selected.length !== 2 || recordAccount(payload) === party) return Response.json({ error: "Choose two different active bank accounts for the transfer." }, { status: 400 });
      }
      if (type === "credit card charge" && !bankingAccounts.some((candidate) => candidate.type === "Credit Card")) return Response.json({ error: "Add an active Credit Card account in the Chart of Accounts before entering card charges." }, { status: 400 });
    }
    if (type === "customer payment") {
      const [bank] = await db.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.companyId, companyId), eq(accounts.active, true), eq(accounts.name, String(payload.account ?? "")), eq(accounts.currency, currency), sql`(${accounts.type} = 'Bank' OR ${accounts.systemRole} = 'BANK')`)).limit(1);
      if (!bank) return Response.json({ error: "Select an active Deposit To bank in this company matching the payment currency." }, { status: 400 });
      if (vatAmount !== 0) return Response.json({ error: "Customer payments must use zero VAT." }, { status: 400 });
    }
    if (type === "bill payment") {
      const [bank] = await db.select().from(accounts).where(and(eq(accounts.companyId, companyId), eq(accounts.active, true), eq(accounts.name, String(payload.account ?? "")), eq(accounts.currency, currency), sql`(${accounts.type} = 'Bank' OR ${accounts.systemRole} = 'BANK')`)).limit(1);
      if (!bank) return Response.json({ error: "Select an active Pay From bank in this company matching the payment currency." }, { status: 400 });
      if (vatAmount !== 0) return Response.json({ error: "Bill payments must use zero VAT." }, { status: 400 });
    }
    let chequeBankName = "";
    if (type === "cheque") {
      const bankId = Number(payload.bankAccountId);
      if (!Number.isInteger(bankId) || bankId <= 0) return Response.json({ error: "Select a bank account for Pay From." }, { status: 400 });
      const [bank] = await db.select().from(accounts).where(and(eq(accounts.id, bankId), eq(accounts.companyId, companyId), eq(accounts.active, true))).limit(1);
      if (!bank || (bank.type !== "Bank" && bank.systemRole !== "BANK") || bank.currency !== currency) return Response.json({ error: "Select an active bank in this company matching the cheque currency." }, { status: 400 });
      const [posting] = await db.select().from(accounts).where(and(eq(accounts.companyId, companyId), eq(accounts.name, String(payload.account ?? "")), eq(accounts.active, true))).limit(1);
      const expensePosting = posting && (["EXPENSE", "PURCHASES", "COGS", "PAYROLL"].includes(posting.systemRole ?? "") || ["Expense", "Other Expense", "Cost of Goods Sold"].includes(posting.type));
      if (!posting || (!expensePosting && posting.systemRole !== "AP") || (posting.systemRole === "AP" && posting.currency !== currency)) return Response.json({ error: "Select an expense account or Accounts Payable in the cheque currency." }, { status: 400 });
      if (payload.billId && posting.systemRole !== "AP") return Response.json({ error: "Use Accounts Payable to pay a selected bill." }, { status: 400 });
      if (posting.systemRole === "AP" && vatAmount !== 0) return Response.json({ error: "A cheque against Accounts Payable must use zero VAT." }, { status: 400 });
      if (posting.systemRole === "AP") {
        const [vendor] = await db.select({ currency: contacts.currency }).from(contacts).where(and(eq(contacts.companyId, companyId), eq(contacts.type, "vendor"), eq(contacts.name, party))).limit(1);
        if (!vendor || vendor.currency !== currency) return Response.json({ error: "Choose a bank and Accounts Payable matching the vendor currency to settle its balance." }, { status: 400 });
      }
      chequeBankName = bank.name;
    }
    let requestedBillIds: unknown = payload.billIds ?? (payload.billId ? [Number(payload.billId)] : []);
    if (typeof requestedBillIds === "string") { try { requestedBillIds = JSON.parse(requestedBillIds); } catch { return Response.json({ error: "Select valid bills." }, { status: 400 }); } }
    if (!Array.isArray(requestedBillIds) || requestedBillIds.some((id) => !Number.isSafeInteger(id) || id <= 0) || new Set(requestedBillIds).size !== requestedBillIds.length) return Response.json({ error: "Select valid bills." }, { status: 400 });
    const selectedBillIds: number[] = ["bill payment", "cheque"].includes(type) ? requestedBillIds : [];
    if (selectedBillIds.length > 1 && type !== "cheque") return Response.json({ error: "Select one bill for Bill Payment." }, { status: 400 });
    const billId = type === "vendor credit" ? purchaseReturnBillId : selectedBillIds.length === 1 ? selectedBillIds[0] : null;
    const linkedBillIds = [...new Set([...selectedBillIds, ...[billId, replacing?.billId].filter((id): id is number => Boolean(id))])].sort((a, b) => a - b);
    const lockedBills = linkedBillIds.length ? await db.select().from(transactions).where(inArray(transactions.id, linkedBillIds)).orderBy(asc(transactions.id)).for("update") : [];
    if (selectedBillIds.length && type === "cheque") {
      const [posting] = await db.select().from(accounts).where(and(eq(accounts.companyId, companyId), eq(accounts.name, String(payload.account))));
      if (posting?.systemRole !== "AP") return Response.json({ error: "Use Accounts Payable to pay selected bills." }, { status: 400 });
    }
    const billAllocations: { billId: number; amount: number }[] = [];
    let billUnallocated = total;
    const selectedBills = lockedBills.filter((bill) => selectedBillIds.includes(bill.id)).sort((a,b) => a.transactionDate.localeCompare(b.transactionDate) || a.id-b.id);
    if (selectedBills.length !== selectedBillIds.length) return Response.json({ error: "Selected bill not found." }, { status: 400 });
    for (const bill of selectedBills) {
      if (!["bill", "received item bill"].includes(bill.type) || bill.companyId !== companyId || bill.locationId !== locationId || bill.party !== party || bill.currency !== currency) return Response.json({ error: "Select bills for this vendor, company, inventory and currency." }, { status: 400 });
      if (!["open", "pending", "overdue", "partially paid"].includes(bill.status) && !(replacing?.billId === bill.id && bill.status === "paid")) return Response.json({ error: "A selected bill is no longer unpaid. Refresh the list." }, { status: 409 });
      const remaining = round(bill.total - await billPaidAmount(bill.id, replacing?.id));
      const amount = Math.min(Math.max(0,remaining), Math.max(0,billUnallocated));
      if (amount > 0) billAllocations.push({billId:bill.id,amount});
      billUnallocated = round(billUnallocated - amount);
    }
    if (selectedBillIds.length && (total <= 0 || billUnallocated > 0)) return Response.json({error:"Payment exceeds the selected bills' remaining balance."},{status:409});
    if (selectedBills.length && type === "cheque") payload.memo = [String(payload.memo || ""), `Bill references: ${selectedBills.map((bill) => bill.number).join(", ")}`].filter(Boolean).join(" · ");
    let requestedInvoiceIds: unknown = payload.invoiceIds ?? (payload.invoiceId ? [Number(payload.invoiceId)] : []);
    if (typeof requestedInvoiceIds === "string") {
      try { requestedInvoiceIds = JSON.parse(requestedInvoiceIds || "[]"); }
      catch { return Response.json({ error: "Select valid invoices." }, { status: 400 }); }
    }
    if (!Array.isArray(requestedInvoiceIds) || requestedInvoiceIds.length > 500 || requestedInvoiceIds.some((id) => !Number.isSafeInteger(id) || id <= 0) || new Set(requestedInvoiceIds).size !== requestedInvoiceIds.length) return Response.json({ error: "Select valid, unique invoices." }, { status: 400 });
    const linkedInvoiceIds: number[] = type === "customer payment" ? [...requestedInvoiceIds].sort((a, b) => a - b) : [];
    const invoiceId = linkedInvoiceIds.length === 1 ? linkedInvoiceIds[0] : null;
    const lockedInvoices = linkedInvoiceIds.length ? await db.select().from(transactions).where(inArray(transactions.id, linkedInvoiceIds)).orderBy(asc(transactions.id)).for("update") : [];
    const allocations: { invoiceId: number; amount: number }[] = [];
    let unallocated = total;
    for (const id of linkedInvoiceIds) {
      const invoice = lockedInvoices.find((entry) => entry.id === id);
      if (!invoice || invoice.type !== "invoice" || invoice.companyId !== companyId || invoice.locationId !== locationId || invoice.party !== party || invoice.currency !== currency) return Response.json({ error: "Select invoices for this customer, company, inventory and currency." }, { status: 400 });
      if (!["open", "pending", "overdue", "partially paid"].includes(invoice.status)) return Response.json({ error: "An invoice is no longer unpaid. Refresh the invoice list." }, { status: 409 });
    }
    for (const invoice of [...lockedInvoices].sort((a, b) => a.transactionDate.localeCompare(b.transactionDate) || a.id - b.id)) {
      const remaining = round(invoice.total - await invoicePaidAmount(invoice.id));
      const amount = round(Math.min(Math.max(remaining, 0), unallocated));
      if (amount > 0) allocations.push({ invoiceId: invoice.id, amount });
      unallocated = round(unallocated - amount);
    }
    if (linkedInvoiceIds.length && (total <= 0 || unallocated > 0)) return Response.json({ error: "Payment exceeds the selected invoices' remaining balance. Refresh the invoice list." }, { status: 409 });
    const values = {
      companyId, locationId: Number.isInteger(locationId) ? locationId : null, number, type, party, billId, invoiceId, purchaseOrderId, salesSourceId,
      salesman: String(payload.salesman ?? ""), isImport: payload.isImport === true || String(payload.isImport) === "true",
      transactionDate, dueDate: String(payload.dueDate ?? ""), terms,
      account: String(payload.account ?? "Accounts Receivable"), status: ["customer payment", "cheque", "transfer"].includes(type) && total > 0 ? "paid" : String(payload.status ?? "open"), ...(["customer payment", "cheque", "transfer"].includes(type) && total > 0 ? { paidAt: new Date().toISOString() } : {}), memo: String(payload.memo ?? ""), comments, serialNumber,
      subtotal, vatRate: Number(payload.vatRate ?? 5), vatAmount, total, currency, exchangeRate, baseTotal,
      sourceTransactionId: replacing ? replacing.sourceTransactionId : Number.isInteger(conversionSourceId) && conversionSourceId > 0 ? conversionSourceId : null,
    };
    const [record] = replacing
      ? await db.update(transactions).set(values).where(eq(transactions.id, replacing.id)).returning()
      : await db.insert(transactions).values(values).returning();
    if (selectedBillIds.length > 1 && billAllocations.length) await db.insert(billPaymentAllocations).values(billAllocations.map((allocation) => ({ ...allocation, paymentId: record.id })));
    if (salesAllocations.length) await db.insert(salesInvoiceAllocations).values(salesAllocations.map((allocation) => ({ ...allocation, invoiceId: record.id })));
    if (receiptAllocations.length) await db.insert(purchaseReceiptAllocations).values(receiptAllocations.map((allocation) => ({ ...allocation, receiptId: record.id })));
    if (allocations.length) await db.insert(invoicePaymentAllocations).values(allocations.map((allocation) => ({ ...allocation, paymentId: record.id })));
    await db.insert(transactionLines).values(prepared.map((line) => ({ ...line, transactionId: record.id })));

    const nonPosting = ["quotation", "estimate", "proforma invoice", "sales order", "purchase order", "cheque order"].includes(type);
    const partyContactType = ["invoice", "quotation", "estimate", "proforma invoice", "sales order", "sales receipt", "statement charge", "finance charge", "customer payment", "credit memo"].includes(type) ? "customer" : ["bill", "purchase order", "item receipt", "received item bill", "vendor credit", "bill payment", "vendor payment", "cheque", "credit card charge", "cheque order"].includes(type) ? "vendor" : null;
    const [partyContact] = partyContactType ? await db.select({ ledgerAccountId: contacts.ledgerAccountId }).from(contacts).where(and(eq(contacts.companyId, companyId), eq(contacts.name, party), eq(contacts.type, partyContactType))).limit(1) : [];
    // A customer's default currency must not route a foreign-currency document
    // into the wrong receivable control account. This runs inside the posting transaction.
    const postsReceivable = ["invoice", "statement charge", "finance charge", "customer payment", "credit memo"].includes(type);
    const receivable = postsReceivable ? (await ensureCurrencyControlAccount(companyId, "AR", currency)).account : null;
    if (receivable && receivable.type !== "Accounts Receivable") return Response.json({ error: `The ${currency} receivable control account must have type Accounts Receivable. Correct it in Chart of Accounts before posting.` }, { status: 409 });
    const linkedRows = await db.select({ id: accounts.id, name: accounts.name, type: accounts.type, systemRole: accounts.systemRole, currency: accounts.currency }).from(accounts).where(and(eq(accounts.companyId, companyId), eq(accounts.active, true)));
    const linkedAccounts: Record<string, string> = {};
    const [postingCompany] = await db.select({ baseCurrency: companies.baseCurrency }).from(companies).where(eq(companies.id, companyId)).limit(1);
    // P&L and inventory postings are in home currency. Prefer that role's home
    // account instead of whichever currency account the database returns last.
    for (const account of linkedRows.filter(a => a.systemRole && !["AR", "AP"].includes(a.systemRole))) linkedAccounts[account.systemRole!] = account.name;
    for (const role of ["SALES", "OTHER_INCOME", "COGS", "PURCHASES", "EXPENSE", "PAYROLL", "INVENTORY"]) {
      const candidates = linkedRows.filter(a => a.systemRole === role).sort((a, b) => a.id - b.id);
      const selected = candidates.find(a => a.currency === postingCompany?.baseCurrency) ?? candidates.find(a => a.currency === currency) ?? candidates[0];
      if (selected) linkedAccounts[role] = selected.name;
    }
    for (const role of ["AR", "AP"]) {
      const candidates = linkedRows.filter((account) => account.systemRole === role);
      const selected = role === "AR"
        ? candidates.find((account) => account.id === partyContact?.ledgerAccountId && account.currency === currency && account.type === "Accounts Receivable") ?? receivable ?? candidates.find((account) => account.currency === currency && account.type === "Accounts Receivable")
        : candidates.find((account) => account.id === partyContact?.ledgerAccountId) ?? candidates.find((account) => account.currency === currency) ?? candidates[0];
      if (selected) linkedAccounts[role] = selected.name;
    }
    if (chequeBankName) linkedAccounts.BANK = chequeBankName;
    const creditCardAccount = linkedRows.find((account) => account.type === "Credit Card");
    if (creditCardAccount) linkedAccounts.CREDIT_CARD = creditCardAccount.name;
    const postingAccountRole = linkedRows.find((account) => account.name.toLowerCase() === record.account.toLowerCase())?.systemRole ?? "";
    if (!nonPosting) {
      const [entry] = await db.insert(journalEntries).values({ companyId, locationId: Number.isInteger(locationId) && locationId > 0 ? locationId : null, transactionId: record.id, entryDate: transactionDate, reference: number, description: `${type}: ${party}`, currency, exchangeRate }).returning();
      let baseLines = postingLines(type, record.account, record.party, baseSubtotal, baseVatAmount, baseTotal, linkedAccounts);
      const itemConfig = new Map(linkedItems.map((item) => [item.id, item]));
      const accountById = new Map(linkedRows.map((account) => [account.id, account.name]));
      const itemAccount = (itemId: number | null, field: "incomeAccountId" | "cogsAccountId" | "assetAccountId", fallback: string) => {
        const accountId = itemId ? itemConfig.get(itemId)?.[field] : null;
        return accountId ? accountById.get(accountId) ?? fallback : fallback;
      };
      const addAmount = (totals: Map<string, number>, accountName: string, amount: number) => totals.set(accountName, round((totals.get(accountName) ?? 0) + amount));
      const matchTarget = (totals: Map<string, number>, target: number, fallback: string) => {
        const current = round([...totals.values()].reduce((sum, amount) => sum + amount, 0));
        const difference = round(target - current);
        if (difference) {
          const first = totals.keys().next().value as string | undefined;
          const accountName = first ?? fallback;
          totals.set(accountName, round((totals.get(accountName) ?? 0) + difference));
        }
      };
      if (["invoice", "sales receipt"].includes(type)) {
        const salesFallback = linkedAccounts.SALES ?? "Sales Revenue";
        const incomeTotals = new Map<string, number>();
        for (const line of prepared) addAmount(incomeTotals, itemAccount(line.itemId, "incomeAccountId", salesFallback), round(line.subtotal * exchangeRate));
        matchTarget(incomeTotals, baseSubtotal, salesFallback);
        baseLines = [
          { accountName: type === "invoice" ? linkedAccounts.AR ?? "Accounts Receivable" : linkedAccounts.BANK ?? "Business Bank", debit: baseTotal, credit: 0 },
          ...[...incomeTotals].filter(([, amount]) => amount !== 0).map(([accountName, amount]) => ({ accountName, debit: 0, credit: amount })),
          ...(baseVatAmount ? [{ accountName: linkedAccounts.OUTPUT_VAT ?? "VAT Payable", debit: 0, credit: baseVatAmount }] : []),
        ];
      } else if (type === "bill") {
        const purchaseFallback = record.account || linkedAccounts.PURCHASES || "Purchases";
        const inventoryFallback = linkedAccounts.INVENTORY ?? "Inventory Asset";
        const purchaseTotals = new Map<string, number>();
        for (const line of prepared) {
          if (line.isFreightCharge) continue;
          const accountName = line.itemId && stockItemIds.has(line.itemId)
            ? itemAccount(line.itemId, "assetAccountId", inventoryFallback)
            : itemAccount(line.itemId, "cogsAccountId", purchaseFallback);
          addAmount(purchaseTotals, accountName, round((line.subtotal + line.freightCharge) * exchangeRate));
        }
        matchTarget(purchaseTotals, baseSubtotal, purchaseFallback);
        baseLines = [
          ...[...purchaseTotals].filter(([, amount]) => amount !== 0).map(([accountName, amount]) => ({ accountName, debit: amount, credit: 0 })),
          ...(baseVatAmount ? [{ accountName: linkedAccounts.INPUT_VAT ?? "Recoverable VAT", debit: baseVatAmount, credit: 0 }] : []),
          { accountName: linkedAccounts.AP ?? "Accounts Payable", debit: 0, credit: baseTotal },
        ];
      } else if (type === "vendor credit") {
        const purchaseFallback = record.account || linkedAccounts.PURCHASES || "Purchases";
        const inventoryFallback = linkedAccounts.INVENTORY ?? "Inventory Asset";
        const returnTotals = new Map<string, number>();
        for (const line of prepared) {
          const accountName = line.itemId && stockItemIds.has(line.itemId)
            ? itemAccount(line.itemId, "assetAccountId", inventoryFallback)
            : itemAccount(line.itemId, "cogsAccountId", purchaseFallback);
          addAmount(returnTotals, accountName, round(line.subtotal * exchangeRate));
        }
        matchTarget(returnTotals, baseSubtotal, purchaseFallback);
        baseLines = [
          { accountName: linkedAccounts.AP ?? "Accounts Payable", debit: baseTotal, credit: 0 },
          ...[...returnTotals].filter(([, amount]) => amount !== 0).map(([accountName, amount]) => ({ accountName, debit: 0, credit: amount })),
          ...(baseVatAmount ? [{ accountName: linkedAccounts.INPUT_VAT ?? "Recoverable VAT", debit: 0, credit: baseVatAmount }] : []),
        ];
      } else if (type === "item receipt") {
        const purchaseFallback = record.account || linkedAccounts.PURCHASES || "Purchases";
        const inventoryFallback = linkedAccounts.INVENTORY ?? "Inventory Asset";
        const receiptTotals = new Map<string, number>();
        for (const line of prepared) {
          const accountName = line.itemId && stockItemIds.has(line.itemId)
            ? itemAccount(line.itemId, "assetAccountId", inventoryFallback)
            : itemAccount(line.itemId, "cogsAccountId", purchaseFallback);
          addAmount(receiptTotals, accountName, round(line.subtotal * exchangeRate));
        }
        matchTarget(receiptTotals, baseSubtotal, purchaseFallback);
        baseLines = [
          ...[...receiptTotals].filter(([, amount]) => amount !== 0).map(([accountName, amount]) => ({ accountName, debit: amount, credit: 0 })),
          { accountName: record.account || linkedAccounts.SUSPENSE || "Suspense", debit: 0, credit: baseSubtotal },
        ];
      }
      if (["invoice", "sales receipt"].includes(type)) {
        const cogsDebits = new Map<string, number>();
        const assetCredits = new Map<string, number>();
        const cogsFallback = linkedAccounts.COGS ?? "Cost of Goods Sold";
        const inventoryFallback = linkedAccounts.INVENTORY ?? "Inventory Asset";
        for (const line of prepared.filter((entry) => entry.itemId && stockItemIds.has(entry.itemId))) {
          const homeCogs = round(line.quantity * line.unitCost * exchangeRate);
          if (!homeCogs) continue;
          addAmount(cogsDebits, itemAccount(line.itemId, "cogsAccountId", cogsFallback), homeCogs);
          addAmount(assetCredits, itemAccount(line.itemId, "assetAccountId", inventoryFallback), homeCogs);
        }
        baseLines.push(
          ...[...cogsDebits].map(([accountName, amount]) => ({ accountName, debit: amount, credit: 0 })),
          ...[...assetCredits].map(([accountName, amount]) => ({ accountName, debit: 0, credit: amount })),
        );
      }
      const pnlRoleTypes: Record<string, string[]> = { SALES: ["Income"], OTHER_INCOME: ["Other Income", "Income"], COGS: ["Cost of Goods Sold"], PURCHASES: ["Expense", "Cost of Goods Sold"], EXPENSE: ["Expense", "Other Expense"], PAYROLL: ["Expense"] };
      for (const line of baseLines) {
        const matches = linkedRows.filter(a => a.name === line.accountName);
        if (matches.length > 1) return Response.json({ error: `Posting account ${line.accountName} must match one active Chart of Accounts entry. Correct the account link before posting.` }, { status: 409 });
        if (!matches.length) continue;
        const linked = matches[0]; const allowed = pnlRoleTypes[linked.systemRole || ""];
        if (allowed && !allowed.includes(linked.type)) return Response.json({ error: `${linked.name} (${linked.systemRole}) must use account type ${allowed.join(" or ")}. Correct it in Chart of Accounts before posting.` }, { status: 409 });
      }
      await db.insert(journalLines).values(baseLines.map((line) => ({ ...line, journalEntryId: entry.id })));
    }

    if (!nonPosting) {
      const direction = ["invoice", "sales receipt", "vendor credit"].includes(type) ? -1 : ["bill", "item receipt"].includes(type) ? 1 : 0;
      if (direction) for (const line of prepared.filter((entry) => entry.itemId)) {
        const homeCurrencyPurchaseCost = round((["bill", "vendor credit"].includes(type) ? line.unitCost : line.unitPrice) * exchangeRate);
        if (["bill", "item receipt"].includes(type)) await db.update(items).set({ lastPurchasePrice: homeCurrencyPurchaseCost }).where(eq(items.id, line.itemId!));
        if (!stockItemIds.has(line.itemId!)) continue;
        const quantity = direction * line.quantity;
        await db.update(items).set({ quantity: sql`${items.quantity} + ${quantity}` }).where(eq(items.id, line.itemId!));
        await db.insert(inventoryMovements).values({ itemId: line.itemId!, transactionId: record.id, movementDate: transactionDate, movementType: type, quantity, unitCost: ["bill", "vendor credit"].includes(type) ? homeCurrencyPurchaseCost : line.unitCost, reference: number });
      }
      const balanceChange = contactBalanceChange(type, total, postingAccountRole);
      if (balanceChange && partyContactType) await db.update(contacts).set({ balance: sql`${contacts.balance} + ${balanceChange}` }).where(and(eq(contacts.companyId, companyId), eq(contacts.name, party), eq(contacts.type, partyContactType)));
    }
    if (Number.isInteger(conversionSourceId) && conversionSourceId > 0) {
      await db.update(transactions).set({ status: "converted", convertedInvoiceId: record.id }).where(and(eq(transactions.id, conversionSourceId), eq(transactions.companyId, companyId)));
    }
    if (!replacing) await db.insert(auditLog).values({ companyId, action: Number.isInteger(conversionSourceId) && conversionSourceId > 0 ? "converted" : "created", entityType: "transaction", entityId: record.id, details: `${number} ${type}; ${prepared.length} line(s)${Number.isInteger(conversionSourceId) && conversionSourceId > 0 ? `; source document ${conversionSourceId}` : ""}${usedAdminNegativeStockOverride ? "; admin negative-stock override used" : ""}` });
    for (const id of linkedBillIds) await refreshBillStatus(id);
    for (const id of linkedInvoiceIds) await refreshInvoiceStatus(id);
    if (purchaseOrderId) await refreshPurchaseOrder(purchaseOrderId);
    if (salesSourceId) await refreshSalesSource(salesSourceId);
    return Response.json({ record }, { status: replacing ? 200 : 201 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

async function handlePATCH(request: Request) {
  const authorization = await requireApiUser(request, false, true);
  if (authorization instanceof Response) return authorization;
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const id = Number(payload.id);
    const companyId = Number(payload.companyId);
    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(companyId) || companyId <= 0) return Response.json({ error: "Select a valid record and company." }, { status: 400 });
    if (!canAccessCompany(authorization, companyId)) return Response.json({ error: "You do not have access to this company." }, { status: 403 });
    if (payload.kind === "transactions") {
      if (!isAdministrator(authorization)) return Response.json({ error: "Only All-Admin and Admin can edit these documents." }, { status: 403 });
      return await withWriteTransaction(async () => {
        const db = getDb();
        const [existing] = await db.select().from(transactions).where(and(eq(transactions.id, id), eq(transactions.companyId, companyId))).for("update");
        if (existing && ["invoice", "customer payment"].includes(existing.type)) {
          if (payload.editMode !== "details") return Response.json({ error: "Use Edit details for invoices and customer payments. Posted amounts and allocations are protected." }, { status: 400 });
          const allowed = new Set(["kind", "id", "companyId", "revision", "editMode", "number", "transactionDate", "dueDate", "terms", "salesman", "memo"]);
          if (existing.type === "invoice") { allowed.add("comments"); allowed.add("serialNumber"); allowed.add("lineDetails"); allowed.add("appendLines"); }
          if (Object.keys(payload).some((field) => !allowed.has(field))) return Response.json({ error: "Only reference, dates, sales rep, memo and invoice comments/serial numbers can be changed here." }, { status: 400 });
          const oldLines = await db.select().from(transactionLines).where(eq(transactionLines.transactionId, id)).orderBy(asc(transactionLines.id));
          if (payload.revision !== purchaseRevision(existing, oldLines)) return Response.json({ error: "This document changed. Close and reopen the editor before saving." }, { status: 409 });
          const lineDetails: { id: number; comments: string; serialNumber: string }[] = [];
          if (payload.lineDetails !== undefined) {
            if (!Array.isArray(payload.lineDetails)) return Response.json({ error: "Select valid invoice line details." }, { status: 400 });
            const seen = new Set<number>();
            for (const input of payload.lineDetails) {
              if (!input || typeof input !== "object" || Object.keys(input).some(key => !["id", "comments", "serialNumber"].includes(key))) return Response.json({ error: "Only line comments and serial numbers can be edited." }, { status: 400 });
              const line = oldLines.find(line => line.id === input.id);
              if (!line || seen.has(line.id)) return Response.json({ error: "Select unique lines belonging to this invoice." }, { status: 400 });
              const comments = String(input.comments ?? line.comments);
              const serialNumber = String(input.serialNumber ?? line.serialNumber);
              seen.add(line.id);
              lineDetails.push({ id: line.id, comments, serialNumber });
            }
          }
          const appendInputs = existing.type === "invoice" && Array.isArray(payload.appendLines) ? payload.appendLines as InputLine[] : [];
          if (payload.appendLines !== undefined && !Array.isArray(payload.appendLines)) return Response.json({ error: "Select valid invoice lines to add." }, { status: 400 });
          if (appendInputs.length && !["open", "overdue", "partially paid", "pending"].includes(existing.status)) return Response.json({ error: "Only open, overdue or partially paid invoices can have new item lines added." }, { status: 409 });
          if (appendInputs.length > 100) return Response.json({ error: "Add no more than 100 invoice lines at a time." }, { status: 400 });
          const configuredVatCodes = appendInputs.length ? await db.select({ code: vatCodes.code, rate: vatCodes.rate }).from(vatCodes).where(and(eq(vatCodes.companyId, companyId), eq(vatCodes.active, true))) : [];
          const vatRateMap = configuredVatCodes.length ? Object.fromEntries(configuredVatCodes.map((entry) => [entry.code, Number(entry.rate)])) : fallbackVatRates;
          const appended = appendInputs.map((line) => {
            const quantity = Number(line.quantity);
            const unitPrice = Number(line.unitPrice);
            const unitCost = Number(line.unitCost ?? 0);
            const vatCode = String(line.vatCode ?? (Number(line.vatRate ?? existing.vatRate) === 5 ? "STANDARD" : "ZERO")).trim().toUpperCase();
            const vatRate = Object.hasOwn(vatRateMap, vatCode) ? vatRateMap[vatCode] : Number(line.vatRate ?? 0);
            const subtotal = round(quantity * unitPrice);
            const vatAmount = round(subtotal * vatRate / 100);
            return { itemId: line.itemId ? Number(line.itemId) : null, description: String(line.description ?? "").trim(), comments: String(line.comments ?? ""), serialNumber: String(line.serialNumber ?? ""), quantity, unitPrice, unitCost, freightCharge: 0, isFreightCharge: false, vatCode, vatRate, subtotal, vatAmount, total: round(subtotal + vatAmount) };
          });
          if (appended.some((line) => !line.description || !Number.isFinite(line.quantity) || line.quantity <= 0 || !Number.isFinite(line.unitPrice) || line.unitPrice < 0 || !Number.isFinite(line.unitCost) || line.unitCost < 0 || !Number.isFinite(line.vatRate))) return Response.json({ error: "Complete each new invoice line with an item/description, positive quantity, valid rate and VAT." }, { status: 400 });
          if (appended.some((line) => line.itemId !== null && (!Number.isInteger(line.itemId) || line.itemId <= 0))) return Response.json({ error: "Select a valid inventory item for every stock line." }, { status: 400 });
          const number = String(payload.number ?? "").trim();
          const transactionDate = String(payload.transactionDate ?? "");
          const dueDate = String(payload.dueDate ?? "");
          const terms = String(payload.terms ?? "").trim();
          const salesman = String(payload.salesman ?? "").trim();
          const memo = String(payload.memo ?? "");
          const comments = existing.type === "invoice" ? String(payload.comments ?? existing.comments) : existing.comments;
          const serialNumber = existing.type === "invoice" ? String(payload.serialNumber ?? existing.serialNumber) : existing.serialNumber;
          const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
          if (!number || number.length > 100 || !validDate(transactionDate) || (dueDate && !validDate(dueDate)) || terms.length > 200 || memo.length > 5000 || salesman.length > 200) return Response.json({ error: "Enter a reference and valid dates. Payment terms must be no more than 200 characters and memo no more than 5,000 characters." }, { status: 400 });
          if (salesman && salesman !== existing.salesman) {
            const [rep] = await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.companyId, companyId), eq(contacts.type, "employee"), eq(contacts.status, "active"), eq(contacts.name, salesman))).limit(1);
            if (!rep) return Response.json({ error: "Select an active sales rep in this company." }, { status: 400 });
          }
          const [duplicate] = await db.select({ id: transactions.id }).from(transactions).where(and(eq(transactions.companyId, companyId), eq(transactions.number, number), sql`${transactions.locationId} IS NOT DISTINCT FROM ${existing.locationId}`, sql`${transactions.id} <> ${id}`)).limit(1);
          if (number !== existing.number && duplicate) return Response.json({ error: "That reference is already used in this inventory." }, { status: 409 });
          let appendedSummary: { subtotal: number; vatAmount: number; total: number } | null = null;
          if (appended.length) {
            if (!existing.locationId) return Response.json({ error: "This invoice has no inventory location." }, { status: 409 });
            const itemIds = [...new Set(appended.flatMap((line) => line.itemId ? [line.itemId] : []))];
            const itemRows = itemIds.length ? await db.select({ id: items.id, companyId: items.companyId, locationId: items.locationId, name: items.name, sku: items.sku, quantity: items.quantity, itemType: items.itemType, status: items.status, cogsAccountId: items.cogsAccountId, incomeAccountId: items.incomeAccountId, assetAccountId: items.assetAccountId }).from(items).where(inArray(items.id, itemIds)).orderBy(asc(items.id)).for("update") : [];
            if (itemRows.length !== itemIds.length || itemRows.some((item) => item.companyId !== companyId || item.locationId !== existing.locationId)) return Response.json({ error: "Select items from the invoice's company and inventory." }, { status: 400 });
            if (itemRows.some((item) => item.status === "inactive")) return Response.json({ error: "Inactive items cannot be added to an invoice." }, { status: 409 });
            if (itemRows.some((item) => !documentLineItemTypes.has(item.itemType))) return Response.json({ error: "Select stock, non-stock, service or other-charge items only." }, { status: 400 });
            const stockIds = new Set(itemRows.filter((item) => item.itemType === "stock-part").map((item) => item.id));
            const requested = new Map<number, number>();
            for (const line of appended) if (line.itemId && stockIds.has(line.itemId)) requested.set(line.itemId, round((requested.get(line.itemId) ?? 0) + line.quantity));
            const shortages = itemRows.filter((item) => stockIds.has(item.id) && Number(item.quantity) < (requested.get(item.id) ?? 0));
            if (shortages.length) return Response.json({ error: `Invoice blocked to prevent negative stock. ${shortages.map((item) => `${item.sku} ${item.name}: available ${item.quantity}, requested ${requested.get(item.id)}`).join("; ")}` }, { status: 409 });

            const appendSubtotal = round(appended.reduce((sum, line) => sum + line.subtotal, 0));
            const appendVatAmount = round(appended.reduce((sum, line) => sum + line.vatAmount, 0));
            const appendTotal = round(appendSubtotal + appendVatAmount);
            const exchangeRate = Number(existing.exchangeRate || 1);
            const baseVatAmount = round(appendVatAmount * exchangeRate);
            const baseTotal = round(appendTotal * exchangeRate);

            await db.insert(transactionLines).values(appended.map((line) => ({ ...line, transactionId: id })));
            for (const line of appended) if (line.itemId && stockIds.has(line.itemId)) {
              await db.update(items).set({ quantity: sql`${items.quantity} - ${line.quantity}` }).where(eq(items.id, line.itemId));
              await db.insert(inventoryMovements).values({ itemId: line.itemId, transactionId: id, movementDate: transactionDate, movementType: "invoice", quantity: -line.quantity, unitCost: line.unitCost, reference: number });
            }

            const [postingCompany] = await db.select({ baseCurrency: companies.baseCurrency }).from(companies).where(eq(companies.id, companyId)).limit(1);
            const linkedRows = await db.select({ id: accounts.id, name: accounts.name, type: accounts.type, systemRole: accounts.systemRole, currency: accounts.currency }).from(accounts).where(and(eq(accounts.companyId, companyId), eq(accounts.active, true)));
            const linkedAccounts: Record<string, string> = {};
            for (const account of linkedRows.filter((account) => account.systemRole && !["AR", "AP"].includes(account.systemRole))) linkedAccounts[account.systemRole!] = account.name;
            for (const role of ["SALES", "COGS", "INVENTORY", "OUTPUT_VAT"]) {
              const candidates = linkedRows.filter((account) => account.systemRole === role).sort((a, b) => a.id - b.id);
              const selected = candidates.find((account) => account.currency === postingCompany?.baseCurrency) ?? candidates.find((account) => account.currency === existing.currency) ?? candidates[0];
              if (selected) linkedAccounts[role] = selected.name;
            }
            const receivable = (await ensureCurrencyControlAccount(companyId, "AR", existing.currency)).account;
            linkedAccounts.AR = receivable.name;
            const accountById = new Map(linkedRows.map((account) => [account.id, account.name]));
            const itemById = new Map(itemRows.map((item) => [item.id, item]));
            const accountFor = (itemId: number | null, field: "incomeAccountId" | "cogsAccountId" | "assetAccountId", fallback: string) => {
              const accountId = itemId ? itemById.get(itemId)?.[field] : null;
              return accountId ? accountById.get(accountId) ?? fallback : fallback;
            };
            const add = (map: Map<string, number>, accountName: string, amount: number) => map.set(accountName, round((map.get(accountName) ?? 0) + amount));
            const income = new Map<string, number>();
            const cogs = new Map<string, number>();
            const asset = new Map<string, number>();
            for (const line of appended) {
              add(income, accountFor(line.itemId, "incomeAccountId", linkedAccounts.SALES ?? "Sales Revenue"), round(line.subtotal * exchangeRate));
              if (line.itemId && stockIds.has(line.itemId)) {
                const homeCogs = round(line.quantity * line.unitCost * exchangeRate);
                if (homeCogs) {
                  add(cogs, accountFor(line.itemId, "cogsAccountId", linkedAccounts.COGS ?? "Cost of Goods Sold"), homeCogs);
                  add(asset, accountFor(line.itemId, "assetAccountId", linkedAccounts.INVENTORY ?? "Inventory Asset"), homeCogs);
                }
              }
            }
            const [entry] = await db.select().from(journalEntries).where(eq(journalEntries.transactionId, id)).limit(1);
            if (!entry) return Response.json({ error: "The invoice journal entry is missing. Repair the invoice posting before adding lines." }, { status: 409 });
            const extraJournal = [
              { accountName: linkedAccounts.AR ?? "Accounts Receivable", debit: baseTotal, credit: 0 },
              ...[...income].filter(([, amount]) => amount !== 0).map(([accountName, amount]) => ({ accountName, debit: 0, credit: amount })),
              ...(baseVatAmount ? [{ accountName: linkedAccounts.OUTPUT_VAT ?? "VAT Payable", debit: 0, credit: baseVatAmount }] : []),
              ...[...cogs].filter(([, amount]) => amount !== 0).map(([accountName, amount]) => ({ accountName, debit: amount, credit: 0 })),
              ...[...asset].filter(([, amount]) => amount !== 0).map(([accountName, amount]) => ({ accountName, debit: 0, credit: amount })),
            ];
            await db.insert(journalLines).values(extraJournal.map((line) => ({ ...line, journalEntryId: entry.id })));
            await db.update(contacts).set({ balance: sql`${contacts.balance} + ${appendTotal}` }).where(and(eq(contacts.companyId, companyId), eq(contacts.type, "customer"), eq(contacts.name, existing.party)));
            appendedSummary = { subtotal: appendSubtotal, vatAmount: appendVatAmount, total: appendTotal };
          }

          const [record] = await db.update(transactions).set({
            number, transactionDate, dueDate, terms, salesman, memo, comments, serialNumber,
            ...(appendedSummary ? {
              subtotal: round(Number(existing.subtotal) + appendedSummary.subtotal),
              vatAmount: round(Number(existing.vatAmount) + appendedSummary.vatAmount),
              total: round(Number(existing.total) + appendedSummary.total),
              baseTotal: round(Number(existing.baseTotal) + appendedSummary.total * Number(existing.exchangeRate || 1)),
            } : {}),
          }).where(eq(transactions.id, id)).returning();
          for (const line of lineDetails) await db.update(transactionLines).set({ comments: line.comments, serialNumber: line.serialNumber }).where(and(eq(transactionLines.id, line.id), eq(transactionLines.transactionId, id)));
          if (appendedSummary) await refreshInvoiceStatus(id);
          await db.update(journalEntries).set({ entryDate: transactionDate, reference: number }).where(eq(journalEntries.transactionId, id));
          await db.update(inventoryMovements).set({ movementDate: transactionDate, reference: number }).where(eq(inventoryMovements.transactionId, id));
          await db.insert(auditLog).values({ companyId, action: "updated", entityType: "transaction", entityId: id, details: JSON.stringify({ actor: { id: authorization.id, email: authorization.email }, mode: appended.length ? "details+append-lines" : "details", before: existing, after: record, appendedLines: appended, lineDetails: { before: oldLines.map(line => ({ id: line.id, comments: line.comments, serialNumber: line.serialNumber })), after: lineDetails } }) });
          return Response.json({ record });
        }
        if (existing?.purchaseOrderId) return Response.json({ error: "Remove and recreate this linked receipt to change received quantities." }, { status: 409 });
        if (!existing) return Response.json({ error: "Purchase not found." }, { status: 404 });
        if (!["estimate", "proforma invoice", "sales order", "bill", "purchase order", "item receipt", "received item bill", "expense", "bill payment", "vendor payment", "vendor credit"].includes(existing.type)) return Response.json({ error: "This document is not an editable purchase." }, { status: 400 });
        const [salesChild] = await db.select({ id: transactions.id }).from(transactions).where(sql`${transactions.salesSourceId} = ${id} or ${transactions.sourceTransactionId} = ${id}`).limit(1);
        if (salesChild) return Response.json({ error: "Remove linked invoices before editing or deleting this source document." }, { status: 409 });
        const [receipt] = await db.select({ id: transactions.id }).from(transactions).where(eq(transactions.purchaseOrderId, id)).limit(1);
        if (receipt) return Response.json({ error: "This purchase order has item receipts. Remove the receipts before editing or deleting the order." }, { status: 409 });
        const [allocated] = await db.select({ id: transactions.id }).from(transactions).where(sql`(${transactions.billId} = ${id} or ${transactions.invoiceId} = ${id})`).limit(1);
        const [invoiceAllocation] = await db.select({ id: invoicePaymentAllocations.id }).from(invoicePaymentAllocations).where(eq(invoicePaymentAllocations.invoiceId, id)).limit(1);
        const [billAllocation] = await db.select({ id: billPaymentAllocations.id }).from(billPaymentAllocations).where(eq(billPaymentAllocations.billId, id)).limit(1);
        if (allocated || invoiceAllocation || billAllocation) return Response.json({ error: "Remove linked payments before editing this bill." }, { status: 409 });
        if (existing.convertedInvoiceId || !["open", "draft", "pending", "overdue"].includes(existing.status)) return Response.json({ error: "Only open, overdue, draft or pending purchases can be edited. Converted or settled documents are locked." }, { status: 409 });
        const oldLines = await db.select().from(transactionLines).where(eq(transactionLines.transactionId, id)).orderBy(asc(transactionLines.id));
        if (payload.revision !== purchaseRevision(existing, oldLines)) return Response.json({ error: "This purchase changed. Close the editor and reopen it before saving." }, { status: 409 });
        if (payload.type !== existing.type || Number(payload.locationId) !== existing.locationId) return Response.json({ error: "Keep the original document type and inventory when editing." }, { status: 400 });
        const newLines = Array.isArray(payload.lines) ? payload.lines as InputLine[] : [];
        if (!newLines.length || newLines.some((line) => !String(line.description ?? "").trim() || !Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0 || !Number.isFinite(Number(line.unitPrice)) || Number(line.unitPrice) < 0 || !Number.isFinite(Number(line.unitCost ?? 0)))) return Response.json({ error: "Complete every line with a description, positive quantity and valid price." }, { status: 400 });
        const date = String(payload.transactionDate ?? "");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || !String(payload.number ?? "").trim()) return Response.json({ error: "Enter a valid date and reference number." }, { status: 400 });

        const movements = await db.select().from(inventoryMovements).where(eq(inventoryMovements.transactionId, id));
        const affectedIds = [...new Set([...movements.map((movement) => movement.itemId), ...newLines.flatMap((line) => line.itemId ? [Number(line.itemId)] : [])])].sort((a, b) => a - b);
        if (affectedIds.some((itemId) => !Number.isInteger(itemId) || itemId <= 0)) return Response.json({ error: "Select valid inventory items." }, { status: 400 });
        const stock = affectedIds.length ? await db.select().from(items).where(inArray(items.id, affectedIds)).orderBy(asc(items.id)).for("update") : [];
        if (stock.length !== affectedIds.length || stock.some((item) => item.companyId !== companyId || item.locationId !== existing.locationId)) return Response.json({ error: "Select items from this purchase inventory." }, { status: 400 });
        for (const item of stock) {
          const previous = movements.filter((movement) => movement.itemId === item.id).reduce((sum, movement) => sum + movement.quantity, 0);
          const incoming = ["bill", "item receipt"].includes(existing.type) ? newLines.filter((line) => Number(line.itemId) === item.id).reduce((sum, line) => sum + Number(line.quantity), 0) : 0;
          if (item.quantity - previous + incoming < -0.000001) return Response.json({ error: `Cannot reduce ${item.name}: some received stock has already been used.` }, { status: 409 });
          await db.update(items).set({ quantity: sql`${items.quantity} - ${previous}` }).where(eq(items.id, item.id));
        }
        const balance = contactBalanceChange(existing.type, existing.total);
        if (balance) await db.update(contacts).set({ balance: sql`${contacts.balance} - ${balance}` }).where(and(eq(contacts.companyId, companyId), eq(contacts.type, "vendor"), eq(contacts.name, existing.party)));
        await db.delete(inventoryMovements).where(eq(inventoryMovements.transactionId, id));
        await db.delete(journalEntries).where(eq(journalEntries.transactionId, id));
        await db.delete(transactionLines).where(eq(transactionLines.transactionId, id));
        const response = await saveNewRecord(new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify({ ...payload, sourceTransactionId: null, status: existing.status, total: undefined }) }), existing);
        if (!response.ok) return response;
        // Editing an older receipt must not replace the most recent purchase cost.
        for (const item of stock) {
          const [latest] = await db.select({ price: transactionLines.unitPrice, rate: transactions.exchangeRate }).from(transactionLines).innerJoin(transactions, eq(transactionLines.transactionId, transactions.id)).where(and(eq(transactionLines.itemId, item.id), inArray(transactions.type, ["bill", "item receipt"]))).orderBy(desc(transactions.transactionDate), desc(transactions.id), desc(transactionLines.id)).limit(1);
          await db.update(items).set({ lastPurchasePrice: latest ? round(latest.price * latest.rate) : item.cost }).where(eq(items.id, item.id));
        }
        const { record } = await response.clone().json();
        await db.insert(auditLog).values({ companyId, action: "updated", entityType: "transaction", entityId: id, details: JSON.stringify({ actor: { id: authorization.id, name: authorization.fullName, email: authorization.email }, before: existing, after: record, beforeLines: oldLines, afterLines: newLines }) });
        return response;
      });
    }
    if (payload.kind === "contacts" || payload.kind === "accounts") return await withWriteTransaction(async () => {
      const db = getDb();
      const accountEdit = payload.kind === "accounts";
      if (!accountEdit && process.env.COMNET_LOCAL_DB !== "1") await db.execute(sql`select pg_advisory_xact_lock(731459, ${companyId})`);
      const [existing] = accountEdit
        ? await db.select().from(accounts).where(and(eq(accounts.id, id), eq(accounts.companyId, companyId)))
        : await db.select().from(contacts).where(and(eq(contacts.id, id), eq(contacts.companyId, companyId)));
      if (!existing) return Response.json({ error: "Record not found." }, { status: 404 });
      if (!mayWrite(authorization, writePermission(accountEdit ? "accounts" : "contacts", { type: existing.type }))) return Response.json({ error: "Your role cannot edit this record." }, { status: 403 });
      if (!accountEdit && existing.type === "vendor" && !isAdministrator(authorization)) return Response.json({ error: "Only All-Admin and Admin can edit vendor details." }, { status: 403 });
      const name = String(payload.name ?? existing.name).trim();
      if (!name) return Response.json({ error: "Name is required." }, { status: 400 });
      if (!accountEdit && existing.type === "customer") {
        const customer = existing as typeof contacts.$inferSelect;
        const candidate = {
          name, company: String(payload.company ?? customer.company).trim(),
          phone: String(payload.phone ?? customer.phone).trim(), whatsapp: String(payload.whatsapp ?? customer.whatsapp).trim(),
          trn: String(payload.trn ?? customer.trn).trim(),
        };
        if (!validInternationalPhone(candidate.phone) || !validInternationalPhone(candidate.whatsapp)) return Response.json({ error: "Contact and WhatsApp numbers must include + and a country code (7–15 digits)." }, { status: 400 });
        if (candidate.trn && !/^\d{15}$/.test(candidate.trn)) return Response.json({ error: "TRN must contain exactly 15 digits." }, { status: 400 });
        const customers = await db.select({ id: contacts.id, name: contacts.name, company: contacts.company, phone: contacts.phone, whatsapp: contacts.whatsapp, trn: contacts.trn }).from(contacts).where(and(eq(contacts.companyId, companyId), eq(contacts.type, "customer")));
        const conflict = customerConflict(candidate, customers, id);
        if (conflict) return Response.json({ error: conflict }, { status: 409 });
      }
      const contactType = accountEdit ? null : (existing as typeof contacts.$inferSelect).type;
      const sameName = accountEdit ? await db.select({ id: accounts.id, name: accounts.name }).from(accounts).where(eq(accounts.companyId, companyId)) : await db.select({ id: contacts.id, name: contacts.name }).from(contacts).where(and(eq(contacts.companyId, companyId), eq(contacts.type, contactType!)));
      if (sameName.some((entry) => entry.id !== id && normalizeComparableText(entry.name) === normalizeComparableText(name))) return Response.json({ error: "Another record already uses this name." }, { status: 409 });
      if (name !== existing.name) {
        const oldNames = accountEdit ? await db.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.companyId, companyId), eq(accounts.name, existing.name))) : await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.companyId, companyId), eq(contacts.name, existing.name)));
        if (oldNames.length > 1) return Response.json({ error: "Duplicate existing names must be resolved before renaming linked records." }, { status: 409 });
      }
      if (accountEdit) {
        const account = existing as typeof accounts.$inferSelect;
        const code = uppercaseText(payload.code);
        const type = String(payload.type ?? account.type).trim();
        if (!code) return Response.json({ error: "Account code is required." }, { status: 400 });
        if (!accountTypeValues.has(type)) return Response.json({ error: "Select a valid account type." }, { status: 400 });
        const role = String(account.systemRole ?? "");
        const compatible = compatibleAccountTypes[role];
        if (compatible && !compatible.has(type)) return Response.json({ error: `The linked system use ${role} requires account type: ${[...compatible].join(" or ")}.` }, { status: 409 });
        const codes = await db.select({ id: accounts.id, code: accounts.code }).from(accounts).where(eq(accounts.companyId, companyId));
        if (codes.some((entry) => entry.id !== id && normalizeComparableText(entry.code) === normalizeComparableText(code))) return Response.json({ error: "Account code already exists." }, { status: 409 });
        const [record] = await db.update(accounts).set({ code, name, type }).where(and(eq(accounts.id, id), eq(accounts.companyId, companyId))).returning();
        if (name !== existing.name) {
          await db.update(transactions).set({ account: name }).where(and(eq(transactions.companyId, companyId), eq(transactions.account, existing.name)));
          await db.update(journalLines).set({ accountName: name }).where(and(eq(journalLines.accountName, existing.name), inArray(journalLines.journalEntryId, db.select({ id: journalEntries.id }).from(journalEntries).where(eq(journalEntries.companyId, companyId)))));
        }
        await db.insert(auditLog).values({ companyId, action: "updated", entityType: "account", entityId: id, details: JSON.stringify({ name: { before: existing.name, after: name }, type: { before: existing.type, after: record.type } }) });
        return Response.json({ record });
      }
      const changes: Record<string, string> = { name };
      for (const field of ["company", "billingName", "email", "phone", "whatsapp", "country", "trn", "reseller", "planet", "passport", "description"] as const) {
        if (payload[field] !== undefined) changes[field] = String(payload[field]).trim();
      }
      const [record] = await db.update(contacts).set(changes).where(and(eq(contacts.id, id), eq(contacts.companyId, companyId))).returning();
      if (name !== existing.name) await db.update(transactions).set({ party: name }).where(and(eq(transactions.companyId, companyId), eq(transactions.party, existing.name)));
      await db.insert(auditLog).values({ companyId, action: "updated", entityType: existing.type === "vendor" ? "vendor" : "contact", entityId: id, details: existing.type === "vendor" ? JSON.stringify({ actorId: authorization.id, actorName: authorization.fullName || authorization.email, actorEmail: authorization.email, vendorName: name, changes: Object.entries(changes).filter(([field, value]) => String((existing as Record<string, unknown>)[field] ?? "") !== value).map(([field, value]) => ({ field, before: (existing as Record<string, unknown>)[field] ?? "", after: value })) }) : `${existing.name} → ${name}` });
      return Response.json({ record });
    });
    if (payload.kind !== "items") return Response.json({ error: "This record cannot be edited here." }, { status: 400 });
    if (!mayWrite(authorization, "inventory:manage")) return Response.json({ error: "Your role cannot edit inventory." }, { status: 403 });
    const db = getDb();
    const [existing] = await db.select().from(items).where(and(eq(items.id, id), eq(items.companyId, companyId)));
    if (!existing) return Response.json({ error: "Item not found." }, { status: 404 });
    const specifications = Array.from({ length: 30 }, (_, index) => ({
      label: String(payload[`specLabel${index}`] ?? "").trim(),
      value: uppercaseText(payload[`specValue${index}`]),
    })).filter((specification) => specification.label && specification.value);
    const specificationValue = (label: string) => specifications.find((specification) => specification.label.toLowerCase() === label.toLowerCase())?.value ?? "";
    const category = uppercaseText(payload.category ?? existing.category) || uppercaseText(existing.category);
    const generatedName = uppercaseText([specificationValue("Brand"), specificationValue("Model") || specificationValue("Part Number")].filter(Boolean).join(" ")) || uppercaseText(existing.name);
    const existingItems = await db.select({ id: items.id, name: items.name }).from(items).where(eq(items.companyId, companyId));
    if (existingItems.some((item) => item.id !== id && normalizeComparableText(item.name) === normalizeComparableText(generatedName))) return Response.json({ error: "An item with this name already exists." }, { status: 409 });
    const itemType = normalizedItemType(payload.itemType ?? existing.itemType);
    if (existing.itemType === "stock-part" && itemType !== "stock-part" && Math.abs(existing.quantity) > 0.000001) return Response.json({ error: "Reduce on-hand quantity to zero before changing a Stock Part to a non-stock item type." }, { status: 409 });
    const purchaseVatCode = String(payload.purchaseVatCode ?? existing.purchaseVatCode).trim().toUpperCase();
    const salesVatCode = String(payload.salesVatCode ?? existing.salesVatCode).trim().toUpperCase();
    const cogsAccountId = optionalId(payload.cogsAccountId ?? existing.cogsAccountId);
    const preferredSupplierId = optionalId(payload.preferredSupplierId ?? existing.preferredSupplierId);
    const incomeAccountId = optionalId(payload.incomeAccountId ?? existing.incomeAccountId);
    const assetAccountId = itemType === "stock-part" ? optionalId(payload.assetAccountId ?? existing.assetAccountId) : null;
    const accountIds = [...new Set([cogsAccountId, incomeAccountId, assetAccountId].filter((accountId): accountId is number => accountId !== null))];
    const linkedAccounts = accountIds.length ? await db.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.companyId, companyId), eq(accounts.active, true), inArray(accounts.id, accountIds))) : [];
    if (linkedAccounts.length !== accountIds.length) return Response.json({ error: "Select active item accounts from this company’s Chart of Accounts." }, { status: 400 });
    if (preferredSupplierId) {
      const [supplier] = await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.id, preferredSupplierId), eq(contacts.companyId, companyId), eq(contacts.type, "vendor"), eq(contacts.status, "active"))).limit(1);
      if (!supplier) return Response.json({ error: "Select an active preferred supplier from this company." }, { status: 400 });
    }
    const activeVatCodes = await db.select({ code: vatCodes.code }).from(vatCodes).where(and(eq(vatCodes.companyId, companyId), eq(vatCodes.active, true)));
    if (activeVatCodes.length && [purchaseVatCode, salesVatCode].some((code) => !activeVatCodes.some((entry) => entry.code === code))) return Response.json({ error: "Select active purchase and sales VAT codes for this company." }, { status: 400 });
    const reorderPoint = itemType === "stock-part" ? Number(payload.reorderPoint ?? existing.reorderPoint) : 0;
    const salesPrice = Number(payload.salesPrice ?? existing.salesPrice);
    const cost = Number(payload.cost ?? existing.cost);
    if (![reorderPoint, salesPrice, cost].every((value) => Number.isFinite(value) && value >= 0)) return Response.json({ error: "Reorder point, cost and sales price must be non-negative numbers." }, { status: 400 });
    const [record] = await db.update(items).set({
      category,
      sku: existing.sku,
      name: generatedName,
      itemType, reorderPoint, salesPrice, cost, purchaseVatCode, cogsAccountId, preferredSupplierId, salesVatCode, incomeAccountId, assetAccountId,
      amountsIncludeVat: payload.amountsIncludeVat === true || String(payload.amountsIncludeVat) === "true",
      status: String(payload.status ?? existing.status) === "inactive" ? "inactive" : "active",
      // Keep labels in structured specifications for editing/filtering; the customer-facing description contains values only.
      description: specifications.map((specification) => specification.value).filter((value) => value.trim().toLowerCase() !== "no").join(" | "),
      specifications: JSON.stringify(specifications),
    }).where(eq(items.id, id)).returning();
    await db.insert(auditLog).values({ companyId, action: "updated", entityType: "item", entityId: id, details: `${record.sku} ${record.name}` });
    return Response.json({ record });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

function recordAccount(payload: Record<string, unknown>) {
  return String(payload.account ?? "").trim();
}

function contactBalanceChange(type: string, total: number, accountRole = "") {
  if (["invoice", "statement charge", "finance charge", "bill", "received item bill"].includes(type)) return total;
  if (type === "cheque" && accountRole === "AP") return -total;
  if (["customer payment", "credit memo", "bill payment", "vendor payment", "vendor credit"].includes(type)) return -total;
  return 0;
}

function postingLines(type: string, account: string, party: string, subtotal: number, vatAmount: number, total: number, linked: Record<string, string>) {
  const named = (role: string, fallback: string) => linked[role] ?? fallback;
  if (["invoice", "sales receipt"].includes(type)) return [
    { accountName: type === "invoice" ? named("AR", "Accounts Receivable") : named("BANK", "Business Bank"), debit: total, credit: 0 },
    { accountName: named("SALES", "Sales Revenue"), debit: 0, credit: subtotal },
    ...(vatAmount ? [{ accountName: named("OUTPUT_VAT", "VAT Payable"), debit: 0, credit: vatAmount }] : []),
  ];
  if (type === "statement charge") return [
    { accountName: named("AR", "Accounts Receivable"), debit: total, credit: 0 },
    { accountName: account || named("SALES", "Sales Revenue"), debit: 0, credit: subtotal },
    ...(vatAmount ? [{ accountName: named("OUTPUT_VAT", "VAT Payable"), debit: 0, credit: vatAmount }] : []),
  ];
  if (type === "finance charge") return [
    { accountName: named("AR", "Accounts Receivable"), debit: total, credit: 0 },
    { accountName: account || named("OTHER_INCOME", "Other Income"), debit: 0, credit: total },
  ];
  if (type === "credit memo") return [
    { accountName: account || named("SALES", "Sales Revenue"), debit: subtotal, credit: 0 },
    ...(vatAmount ? [{ accountName: named("OUTPUT_VAT", "VAT Payable"), debit: vatAmount, credit: 0 }] : []),
    { accountName: named("AR", "Accounts Receivable"), debit: 0, credit: total },
  ];
  if (type === "customer payment") return [{ accountName: account, debit: total, credit: 0 }, { accountName: named("AR", "Accounts Receivable"), debit: 0, credit: total }];
  if (type === "bill") return [
    { accountName: account || named("PURCHASES", "Purchases"), debit: subtotal, credit: 0 },
    ...(vatAmount ? [{ accountName: named("INPUT_VAT", "Recoverable VAT"), debit: vatAmount, credit: 0 }] : []),
    { accountName: named("AP", "Accounts Payable"), debit: 0, credit: total },
  ];
  if (type === "vendor credit") return [
    { accountName: named("AP", "Accounts Payable"), debit: total, credit: 0 },
    { accountName: account || named("PURCHASES", "Purchases"), debit: 0, credit: subtotal },
    ...(vatAmount ? [{ accountName: named("INPUT_VAT", "Recoverable VAT"), debit: 0, credit: vatAmount }] : []),
  ];
  if (type === "item receipt") return [
    { accountName: named("INVENTORY", "Inventory Asset"), debit: subtotal, credit: 0 },
    { accountName: account || named("SUSPENSE", "Suspense"), debit: 0, credit: subtotal },
  ];
  if (type === "received item bill") return [
    { accountName: account || named("SUSPENSE", "Suspense"), debit: subtotal, credit: 0 },
    ...(vatAmount ? [{ accountName: named("INPUT_VAT", "Recoverable VAT"), debit: vatAmount, credit: 0 }] : []),
    { accountName: named("AP", "Accounts Payable"), debit: 0, credit: total },
  ];
  if (type === "bill payment") return [{ accountName: named("AP", "Accounts Payable"), debit: total, credit: 0 }, { accountName: account, debit: 0, credit: total }];
  if (type === "vendor payment") return [{ accountName: named("AP", "Accounts Payable"), debit: total, credit: 0 }, { accountName: named("BANK", "Business Bank"), debit: 0, credit: total }];
  if (["expense", "cheque"].includes(type)) return [
    { accountName: account || named("EXPENSE", "Operating Expenses"), debit: subtotal, credit: 0 },
    ...(vatAmount ? [{ accountName: named("INPUT_VAT", "Recoverable VAT"), debit: vatAmount, credit: 0 }] : []),
    { accountName: named("BANK", "Business Bank"), debit: 0, credit: total },
  ];
  if (type === "deposit") return [{ accountName: named("BANK", "Business Bank"), debit: total, credit: 0 }, { accountName: account || named("OTHER_INCOME", "Other Income"), debit: 0, credit: total }];
  if (type === "transfer") return [{ accountName: party, debit: total, credit: 0 }, { accountName: account || named("BANK", "Business Bank"), debit: 0, credit: total }];
  if (type === "credit card charge") return [
    { accountName: account || named("EXPENSE", "Operating Expenses"), debit: subtotal, credit: 0 },
    ...(vatAmount ? [{ accountName: named("INPUT_VAT", "Recoverable VAT"), debit: vatAmount, credit: 0 }] : []),
    { accountName: named("CREDIT_CARD", named("BANK", "Business Bank")), debit: 0, credit: total },
  ];
  return [{ accountName: account || named("SUSPENSE", "Suspense"), debit: total, credit: 0 }, { accountName: named("EQUITY", "Opening Balance Equity"), debit: 0, credit: total }];
}

async function handleDELETE(request: Request) {
  const authorization = await requireApiUser(request, true, true);
  if (authorization instanceof Response) return authorization;
  try {
    const { kind, id, companyId } = (await request.json()) as { kind: RecordKind; id: number; companyId: number };
    const db = getDb();
    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(companyId) || companyId <= 0) return Response.json({ error: "Select a valid record and company." }, { status: 400 });
    if (!canAccessCompany(authorization, companyId)) return Response.json({ error: "You do not have access to this company." }, { status: 403 });
    if (kind === "contacts") return await withWriteTransaction(async () => {
      const tx = getDb();
      const [vendor] = await tx.select().from(contacts).where(and(eq(contacts.id, id), eq(contacts.companyId, companyId))).for("update");
      if (!vendor) return Response.json({ error: "Contact not found." }, { status: 404 });
      if (vendor.type === "vendor") {
        if (!isAdministrator(authorization)) return Response.json({ error: "Only All-Admin and Admin can delete vendors." }, { status: 403 });
        const [activity] = await tx.select({ id: transactions.id }).from(transactions).where(and(eq(transactions.companyId, companyId), eq(transactions.party, vendor.name))).limit(1);
        if (Number(vendor.balance) !== 0 || activity) return Response.json({ error: "This vendor has a balance or transaction history and cannot be deleted." }, { status: 409 });
        await tx.insert(auditLog).values({ companyId, action: "deleted", entityType: "vendor", entityId: id, details: JSON.stringify({ actorId: authorization.id, actorName: authorization.fullName || authorization.email, actorEmail: authorization.email, vendorName: vendor.name, changes: [] }) });
      }
      await tx.delete(contacts).where(and(eq(contacts.id, id), eq(contacts.companyId, companyId)));
      return Response.json({ ok: true });
    });
    else if (kind === "items") await db.delete(items).where(and(eq(items.id, id), eq(items.companyId, companyId)));
    else if (kind === "accounts") {
      const [account] = await db.select({ name: accounts.name, systemRole: accounts.systemRole, parentAccountId: accounts.parentAccountId }).from(accounts).where(and(eq(accounts.id, id), eq(accounts.companyId, companyId))).limit(1);
      if (!account) return Response.json({ error: "Account not found." }, { status: 404 });
      if (!account.parentAccountId) return Response.json({ error: "Only sub-accounts can be deleted. Main Chart of Accounts entries must be kept." }, { status: 409 });
      if (account.systemRole) return Response.json({ error: "Linked system accounts cannot be deleted." }, { status: 409 });
      const [child] = await db.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.companyId, companyId), eq(accounts.parentAccountId, id))).limit(1);
      if (child) return Response.json({ error: "Move or delete this account's sub-accounts first." }, { status: 409 });
      const [activity] = await db.select({ id: journalLines.id }).from(journalLines).innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id)).where(and(eq(journalEntries.companyId, companyId), eq(journalLines.accountName, account.name))).limit(1);
      if (activity) return Response.json({ error: "Sub-accounts with journal activity cannot be deleted." }, { status: 409 });
      await db.delete(accounts).where(and(eq(accounts.id, id), eq(accounts.companyId, companyId)));
    }
    else return await withWriteTransaction(async () => {
      const db = getDb();
      const [record] = await db.select().from(transactions).where(and(eq(transactions.id, id), eq(transactions.companyId, companyId))).for("update");
      if (record) {
        const [salesChild] = await db.select({ id: transactions.id }).from(transactions).where(sql`${transactions.salesSourceId} = ${id} or ${transactions.sourceTransactionId} = ${id}`).limit(1);
        if (salesChild) return Response.json({ error: "Remove linked invoices before editing or deleting this source document." }, { status: 409 });
        const [receipt] = await db.select({ id: transactions.id }).from(transactions).where(eq(transactions.purchaseOrderId, id)).limit(1);
        if (receipt) return Response.json({ error: "This purchase order has item receipts. Remove the receipts before editing or deleting the order." }, { status: 409 });
        const [allocated] = await db.select({ id: transactions.id }).from(transactions).where(sql`(${transactions.billId} = ${id} or ${transactions.invoiceId} = ${id})`).limit(1);
        const [invoiceAllocation] = await db.select({ id: invoicePaymentAllocations.id }).from(invoicePaymentAllocations).where(eq(invoicePaymentAllocations.invoiceId, id)).limit(1);
        const [billAllocation] = await db.select({ id: billPaymentAllocations.id }).from(billPaymentAllocations).where(eq(billPaymentAllocations.billId, id)).limit(1);
        if (allocated || invoiceAllocation || billAllocation) return Response.json({ error: "Remove linked payments before deleting this bill." }, { status: 409 });
        const paymentAllocations = await db.select().from(invoicePaymentAllocations).where(eq(invoicePaymentAllocations.paymentId, id));
        const invoiceIds = paymentAllocations.map((allocation) => allocation.invoiceId).sort((a, b) => a - b);
        if (invoiceIds.length) await db.select({ id: transactions.id }).from(transactions).where(inArray(transactions.id, invoiceIds)).orderBy(asc(transactions.id)).for("update");
        const billAllocations = await db.select().from(billPaymentAllocations).where(eq(billPaymentAllocations.paymentId, id));
        const billIds = [...new Set([...(record.billId ? [record.billId] : []), ...billAllocations.map((allocation) => allocation.billId)])].sort((a,b) => a-b);
        if (billIds.length) await db.select({id: transactions.id}).from(transactions).where(inArray(transactions.id, billIds)).orderBy(asc(transactions.id)).for("update");
        if (record.salesSourceId) await db.select({ id: transactions.id }).from(transactions).where(eq(transactions.id, record.salesSourceId)).for("update");
        if (record.purchaseOrderId) await db.select({ id: transactions.id }).from(transactions).where(eq(transactions.id, record.purchaseOrderId)).for("update");
        const movements = await db.select().from(inventoryMovements).where(eq(inventoryMovements.transactionId, id));
        const itemIds = [...new Set(movements.map((movement) => movement.itemId))].sort((a, b) => a - b);
        const stock = itemIds.length ? await db.select().from(items).where(inArray(items.id, itemIds)).orderBy(asc(items.id)).for("update") : [];
        for (const item of stock) {
          const received = movements.filter((movement) => movement.itemId === item.id).reduce((sum, movement) => sum + movement.quantity, 0);
          if (received > 0 && item.quantity - received < -0.000001) return Response.json({ error: `Cannot delete this purchase: received stock for ${item.name} has already been used.` }, { status: 409 });
          await db.update(items).set({ quantity: sql`${items.quantity} - ${received}` }).where(eq(items.id, item.id));
        }
        const [postingAccount] = await db.select({ systemRole: accounts.systemRole }).from(accounts).where(and(eq(accounts.companyId, companyId), eq(accounts.name, record.account))).limit(1);
        const balanceChange = contactBalanceChange(record.type, record.total, postingAccount?.systemRole ?? "");
        const contactType = ["invoice", "sales receipt", "statement charge", "finance charge", "customer payment", "credit memo"].includes(record.type) ? "customer" : "vendor";
        if (balanceChange) await db.update(contacts).set({ balance: sql`${contacts.balance} - ${balanceChange}` }).where(and(eq(contacts.companyId, companyId), eq(contacts.name, record.party), eq(contacts.type, contactType)));
        await db.delete(transactions).where(eq(transactions.id, id));
        for (const billId of billIds) await refreshBillStatus(billId);
        if (record.purchaseOrderId) await refreshPurchaseOrder(record.purchaseOrderId);
        if (record.salesSourceId) await refreshSalesSource(record.salesSourceId);
        for (const invoiceId of invoiceIds) await refreshInvoiceStatus(invoiceId);
        if (["bill", "item receipt"].includes(record.type)) for (const item of stock) {
          const [latest] = await db.select({ price: transactionLines.unitPrice, rate: transactions.exchangeRate }).from(transactionLines).innerJoin(transactions, eq(transactionLines.transactionId, transactions.id)).where(and(eq(transactionLines.itemId, item.id), inArray(transactions.type, ["bill", "item receipt"]))).orderBy(desc(transactions.transactionDate), desc(transactions.id), desc(transactionLines.id)).limit(1);
          await db.update(items).set({ lastPurchasePrice: latest ? round(latest.price * latest.rate) : item.cost }).where(eq(items.id, item.id));
        }
        await db.insert(auditLog).values({ companyId, action: "deleted", entityType: "transaction", entityId: id, details: `${record.number} reversed` });
      }
      return Response.json({ ok: true });
    });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export const POST = skuWrite("records", handlePOST);

export const PATCH = skuWrite("records", handlePATCH);

export const DELETE = skuWrite("records", handleDELETE);
