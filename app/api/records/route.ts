import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import {
  accounts, auditLog, contacts, inventoryMovements, items, journalEntries,
  journalLines, transactionLines, transactions,
} from "../../../db/schema";

type RecordKind = "transactions" | "contacts" | "items" | "accounts";
type InputLine = { itemId?: number | string | null; description?: string; quantity?: number | string; unitPrice?: number | string; unitCost?: number | string; vatRate?: number | string };

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected database error";
  return message.includes("does not exist") ? "The accounting database is being updated. Please refresh in a moment." : message;
}

const round = (value: number) => Math.round(value * 100) / 100;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind") as RecordKind | null;
    const id = Number(url.searchParams.get("id"));
    const db = getDb();
    if (kind === "transactions" && id) {
      const [record] = await db.select().from(transactions).where(eq(transactions.id, id));
      if (!record) return Response.json({ error: "Transaction not found." }, { status: 404 });
      const lines = await db.select().from(transactionLines).where(eq(transactionLines.transactionId, id)).orderBy(asc(transactionLines.id));
      const journal = await db.select({
        accountName: journalLines.accountName, debit: journalLines.debit, credit: journalLines.credit,
      }).from(journalLines).innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id)).where(eq(journalEntries.transactionId, id)).orderBy(asc(journalLines.id));
      return Response.json({ record, lines, journal });
    }
    if (kind === "contacts") return Response.json({ records: await db.select().from(contacts).orderBy(asc(contacts.name)) });
    if (kind === "items") return Response.json({ records: await db.select().from(items).orderBy(asc(items.name)) });
    if (kind === "accounts") return Response.json({ records: await db.select().from(accounts).orderBy(asc(accounts.code)) });
    return Response.json({ records: await db.select().from(transactions).orderBy(desc(transactions.transactionDate), desc(transactions.id)).limit(500) });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const kind = payload.kind as RecordKind;
    const db = getDb();

    if (kind === "contacts") {
      const name = String(payload.name ?? "").trim();
      if (!name) return Response.json({ error: "Name is required." }, { status: 400 });
      if (payload.type === "customer") {
        const required = [payload.company, payload.phone, payload.whatsapp, payload.country, payload.reseller, payload.planet, payload.currency];
        if (required.some((value) => !String(value ?? "").trim())) return Response.json({ error: "Complete all required customer fields." }, { status: 400 });
      }
      const [record] = await db.insert(contacts).values({
        type: (payload.type as "customer" | "vendor" | "employee") ?? "customer", name,
        company: String(payload.company ?? ""), billingName: String(payload.billingName ?? name),
        email: String(payload.email ?? ""), phone: String(payload.phone ?? ""), whatsapp: String(payload.whatsapp ?? ""),
        country: String(payload.country ?? ""), trn: String(payload.trn ?? ""), reseller: String(payload.reseller ?? "Reseller"),
        planet: String(payload.planet ?? "No"), passport: String(payload.passport ?? ""), currency: String(payload.currency ?? "AED"),
        description: String(payload.description ?? ""), balance: Number(payload.balance ?? 0),
      }).returning();
      return Response.json({ record }, { status: 201 });
    }

    if (kind === "items") {
      const specifications = Array.from({ length: 30 }, (_, index) => ({
        label: String(payload[`specLabel${index}`] ?? "").trim(),
        value: String(payload[`specValue${index}`] ?? "").trim(),
      })).filter((specification) => specification.label && specification.value);
      const specificationValue = (label: string) => specifications.find((specification) => specification.label.toLowerCase() === label.toLowerCase())?.value ?? "";
      const category = String(payload.category ?? "General").trim() || "General";
      const sku = String(payload.sku ?? "").trim() || specificationValue("Part Number") || `ITEM-${Date.now()}`;
      const name = String(payload.name ?? "").trim() || [specificationValue("Brand"), specificationValue("Model") || specificationValue("Part Number")].filter(Boolean).join(" ") || `${category} Item`;
      const description = specifications.map((specification) => `${specification.label}: ${specification.value}`).join(" | ");
      const [record] = await db.insert(items).values({
        name, sku, category, description,
        specifications: JSON.stringify(specifications), quantity: Number(payload.quantity ?? 0),
        reorderPoint: Number(payload.reorderPoint ?? 0), salesPrice: Number(payload.salesPrice ?? 0), cost: Number(payload.cost ?? 0),
      }).returning();
      return Response.json({ record }, { status: 201 });
    }

    if (kind === "accounts") {
      const name = String(payload.name ?? "").trim();
      const code = String(payload.code ?? "").trim();
      if (!name || !code) return Response.json({ error: "Account code and name are required." }, { status: 400 });
      const [record] = await db.insert(accounts).values({ code, name, type: String(payload.type ?? "Expense"), balance: Number(payload.balance ?? 0) }).returning();
      return Response.json({ record }, { status: 201 });
    }

    const party = String(payload.party ?? "").trim();
    const type = String(payload.type ?? "invoice");
    const rawLines = Array.isArray(payload.lines) ? payload.lines as InputLine[] : [];
    const prepared = rawLines.map((line) => {
      const quantity = Number(line.quantity ?? 1);
      const unitPrice = Number(line.unitPrice ?? 0);
      const unitCost = Number(line.unitCost ?? 0);
      const vatRate = Number(line.vatRate ?? payload.vatRate ?? 5);
      const subtotal = round(quantity * unitPrice);
      const vatAmount = round(subtotal * vatRate / 100);
      return { itemId: line.itemId ? Number(line.itemId) : null, description: String(line.description ?? "").trim(), quantity, unitPrice, unitCost, vatRate, subtotal, vatAmount, total: round(subtotal + vatAmount) };
    }).filter((line) => line.description || line.itemId || line.subtotal > 0);
    if (!prepared.length && Number(payload.total) > 0) {
      const subtotal = Number(payload.total);
      const vatRate = Number(payload.vatRate ?? 5);
      prepared.push({ itemId: null, description: String(payload.memo ?? type), quantity: 1, unitPrice: subtotal, unitCost: 0, vatRate, subtotal, vatAmount: round(subtotal * vatRate / 100), total: round(subtotal * (1 + vatRate / 100)) });
    }
    if (!party || !prepared.length || prepared.some((line) => !Number.isFinite(line.quantity) || line.quantity <= 0 || !Number.isFinite(line.unitPrice) || line.unitPrice < 0)) {
      return Response.json({ error: "Party and at least one valid document line are required." }, { status: 400 });
    }
    const subtotal = round(prepared.reduce((sum, line) => sum + line.subtotal, 0));
    const vatAmount = round(prepared.reduce((sum, line) => sum + line.vatAmount, 0));
    const total = round(subtotal + vatAmount);
    const transactionDate = String(payload.transactionDate ?? new Date().toISOString().slice(0, 10));
    const number = String(payload.number ?? `TX-${Date.now()}`);
    const [record] = await db.insert(transactions).values({
      number, type, party, transactionDate, dueDate: String(payload.dueDate ?? ""),
      account: String(payload.account ?? "Accounts Receivable"), status: String(payload.status ?? "open"), memo: String(payload.memo ?? ""),
      subtotal, vatRate: Number(payload.vatRate ?? 5), vatAmount, total,
    }).returning();
    await db.insert(transactionLines).values(prepared.map((line) => ({ ...line, transactionId: record.id })));

    const nonPosting = ["estimate", "sales order", "purchase order"].includes(type);
    if (!nonPosting) {
      const [entry] = await db.insert(journalEntries).values({ transactionId: record.id, entryDate: transactionDate, reference: number, description: `${type}: ${party}` }).returning();
      const baseLines = postingLines(type, record.account, subtotal, vatAmount, total);
      const cogs = ["invoice", "sales receipt"].includes(type) ? round(prepared.reduce((sum, line) => sum + line.quantity * line.unitCost, 0)) : 0;
      if (cogs) baseLines.push({ accountName: "Cost of Goods Sold", debit: cogs, credit: 0 }, { accountName: "Inventory Asset", debit: 0, credit: cogs });
      await db.insert(journalLines).values(baseLines.map((line) => ({ ...line, journalEntryId: entry.id })));
    }

    if (!nonPosting) {
      const direction = ["invoice", "sales receipt"].includes(type) ? -1 : type === "bill" ? 1 : 0;
      if (direction) for (const line of prepared.filter((entry) => entry.itemId)) {
        const quantity = direction * line.quantity;
        await db.update(items).set({ quantity: sql`${items.quantity} + ${quantity}` }).where(eq(items.id, line.itemId!));
        await db.insert(inventoryMovements).values({ itemId: line.itemId!, transactionId: record.id, movementDate: transactionDate, movementType: type, quantity, unitCost: line.unitCost, reference: number });
      }
      const balanceChange = contactBalanceChange(type, total);
      const contactType = ["invoice", "sales receipt", "customer payment", "credit memo"].includes(type) ? "customer" : "vendor";
      if (balanceChange) await db.update(contacts).set({ balance: sql`${contacts.balance} + ${balanceChange}` }).where(and(eq(contacts.name, party), eq(contacts.type, contactType)));
    }
    await db.insert(auditLog).values({ action: "created", entityType: "transaction", entityId: record.id, details: `${number} ${type}; ${prepared.length} line(s)` });
    return Response.json({ record }, { status: 201 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    if (payload.kind !== "items") return Response.json({ error: "Only inventory items can be updated here." }, { status: 400 });
    const id = Number(payload.id);
    if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "A valid item is required." }, { status: 400 });
    const db = getDb();
    const [existing] = await db.select().from(items).where(eq(items.id, id));
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
      sku: specificationValue("Part Number") || existing.sku,
      name: generatedName || existing.name,
      description: specifications.map((specification) => `${specification.label}: ${specification.value}`).join(" | "),
      specifications: JSON.stringify(specifications),
    }).where(eq(items.id, id)).returning();
    await db.insert(auditLog).values({ action: "updated", entityType: "item", entityId: id, details: `${record.sku} ${record.name}` });
    return Response.json({ record });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

function contactBalanceChange(type: string, total: number) {
  if (type === "invoice" || type === "bill") return total;
  if (["customer payment", "credit memo", "bill payment", "vendor payment", "vendor credit"].includes(type)) return -total;
  return 0;
}

function postingLines(type: string, account: string, subtotal: number, vatAmount: number, total: number) {
  if (["invoice", "sales receipt"].includes(type)) return [
    { accountName: type === "invoice" ? "Accounts Receivable" : "Business Bank", debit: total, credit: 0 },
    { accountName: "Sales Revenue", debit: 0, credit: subtotal },
    ...(vatAmount ? [{ accountName: "VAT Payable", debit: 0, credit: vatAmount }] : []),
  ];
  if (type === "customer payment") return [{ accountName: "Business Bank", debit: total, credit: 0 }, { accountName: "Accounts Receivable", debit: 0, credit: total }];
  if (type === "bill") return [
    { accountName: account || "Purchases", debit: subtotal, credit: 0 },
    ...(vatAmount ? [{ accountName: "Recoverable VAT", debit: vatAmount, credit: 0 }] : []),
    { accountName: "Accounts Payable", debit: 0, credit: total },
  ];
  if (["bill payment", "vendor payment"].includes(type)) return [{ accountName: "Accounts Payable", debit: total, credit: 0 }, { accountName: "Business Bank", debit: 0, credit: total }];
  if (["expense", "cheque"].includes(type)) return [
    { accountName: account || "Operating Expenses", debit: subtotal, credit: 0 },
    ...(vatAmount ? [{ accountName: "Recoverable VAT", debit: vatAmount, credit: 0 }] : []),
    { accountName: "Business Bank", debit: 0, credit: total },
  ];
  if (type === "deposit") return [{ accountName: "Business Bank", debit: total, credit: 0 }, { accountName: account || "Other Income", debit: 0, credit: total }];
  return [{ accountName: account || "Suspense", debit: total, credit: 0 }, { accountName: "Opening Balance Equity", debit: 0, credit: total }];
}

export async function DELETE(request: Request) {
  try {
    const { kind, id } = (await request.json()) as { kind: RecordKind; id: number };
    const db = getDb();
    if (kind === "contacts") await db.delete(contacts).where(eq(contacts.id, id));
    else if (kind === "items") await db.delete(items).where(eq(items.id, id));
    else if (kind === "accounts") await db.delete(accounts).where(eq(accounts.id, id));
    else {
      const [record] = await db.select().from(transactions).where(eq(transactions.id, id));
      if (record) {
        const movements = await db.select().from(inventoryMovements).where(eq(inventoryMovements.transactionId, id));
        for (const movement of movements) await db.update(items).set({ quantity: sql`${items.quantity} - ${movement.quantity}` }).where(eq(items.id, movement.itemId));
        const balanceChange = contactBalanceChange(record.type, record.total);
        const contactType = ["invoice", "sales receipt", "customer payment", "credit memo"].includes(record.type) ? "customer" : "vendor";
        if (balanceChange) await db.update(contacts).set({ balance: sql`${contacts.balance} - ${balanceChange}` }).where(and(eq(contacts.name, record.party), eq(contacts.type, contactType)));
        await db.delete(transactions).where(eq(transactions.id, id));
        await db.insert(auditLog).values({ action: "deleted", entityType: "transaction", entityId: id, details: `${record.number} reversed` });
      }
    }
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
