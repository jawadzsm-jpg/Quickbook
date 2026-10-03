import { vatTaxableValue } from "@/lib/vat-report";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getDb, withWriteTransaction } from "@/db";
import { accounts, auditLog, companies, inventoryLocations, journalEntries, journalLines, transactionLines, transactions, vatAdjustments, vatCodes, vatReturns } from "@/db/schema";
import { canAccessCompany, requireApiUser, requireCompanyAccess } from "@/lib/auth";

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const salesTypes = new Set(["invoice", "sales receipt", "statement charge", "credit memo"]);
const purchaseTypes = new Set(["bill", "received item bill", "expense", "cheque", "credit card charge", "vendor credit"]);
const excludedStatuses = new Set(["cancelled", "canceled", "void", "voided", "deleted"]);
const reverseChargeCodes = new Set(["REVERSE", "REVERSE_CHARGE", "RCM"]);

type VatBox = { amount: number; vat: number };

function add(box: VatBox, amount: number, vat: number) {
  box.amount = round(box.amount + amount);
  box.vat = round(box.vat + vat);
}

function filingDueDate(periodEnd: string) {
  const date = new Date(`${periodEnd}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 28);
  return date.toISOString().slice(0, 10);
}

async function calculateVat(companyId: number, periodStart: string, periodEnd: string) {
  const db = getDb();
  const [lines, adjustments, configuredCodes, companyRows] = await Promise.all([
    db.select({
      type: transactions.type,
      status: transactions.status,
      isImport: transactions.isImport,
      billId: transactions.billId,
      vatCode: transactionLines.vatCode,
      vatRate: transactionLines.vatRate,
      taxableAmount: transactionLines.subtotal,
      freightCharge: transactionLines.freightCharge,
      vatAmount: transactionLines.vatAmount,
      exchangeRate: transactions.exchangeRate,
    }).from(transactionLines).innerJoin(transactions, eq(transactionLines.transactionId, transactions.id)).where(and(
      eq(transactions.companyId, companyId),
      gte(transactions.transactionDate, periodStart),
      lte(transactions.transactionDate, periodEnd),
    )),
    db.select().from(vatAdjustments).where(and(eq(vatAdjustments.companyId, companyId), gte(vatAdjustments.adjustmentDate, periodStart), lte(vatAdjustments.adjustmentDate, periodEnd))),
    db.select({ code: vatCodes.code, rate: vatCodes.rate }).from(vatCodes).where(eq(vatCodes.companyId, companyId)),
    db.select({ baseCurrency: companies.baseCurrency, trn: companies.trn }).from(companies).where(eq(companies.id, companyId)).limit(1),
  ]);

  const box1: VatBox = { amount: 0, vat: 0 };
  const box3: VatBox = { amount: 0, vat: 0 };
  const box4: VatBox = { amount: 0, vat: 0 };
  const box5: VatBox = { amount: 0, vat: 0 };
  const box6: VatBox = { amount: 0, vat: 0 };
  const box9: VatBox = { amount: 0, vat: 0 };
  const box10: VatBox = { amount: 0, vat: 0 };
  const knownCodes = new Map(configuredCodes.map((code) => [code.code.toUpperCase(), Number(code.rate)]));
  const blockingIssues: string[] = [];
  const warnings: string[] = [];
  let exceptionLines = 0;
  let transactionLineCount = 0;

  for (const line of lines) {
    if (excludedStatuses.has(String(line.status).toLowerCase())) continue;
    const isSale = salesTypes.has(line.type);
    const isPurchase = purchaseTypes.has(line.type);
    if (!isSale && !isPurchase) continue;
    // A cheque allocated to a bill is a payment, not a second taxable purchase.
    if (line.type === "cheque" && line.billId) continue;
    const sign = ["credit memo", "vendor credit"].includes(line.type) ? -1 : 1;
    const rate = Number(line.exchangeRate) || 1;
    const taxableAmount = vatTaxableValue({ subtotal: line.taxableAmount, freightCharge: line.freightCharge });
    const amount = round(sign * taxableAmount * rate);
    const vat = round(sign * Number(line.vatAmount) * rate);
    const code = String(line.vatCode || "").trim().toUpperCase();
    const expectedRate = knownCodes.get(code);
    transactionLineCount += 1;

    if (!code || expectedRate === undefined) {
      exceptionLines += 1;
      continue;
    }
    const invalidCalculation = Math.abs(Number(line.vatAmount) - taxableAmount * Number(line.vatRate) / 100) > 0.011 || Math.abs(Number(line.vatRate) - expectedRate) > 0.001;
    const invalidUaeTreatment = expectedRate !== 5 && !["ZERO", "EXEMPT", "OUT_OF_SCOPE"].includes(code);
    if (invalidCalculation || invalidUaeTreatment || (code === "OUT_OF_SCOPE" && Math.abs(vat) > 0.001)) exceptionLines += 1;
    if (code === "OUT_OF_SCOPE") {
      continue;
    }

    if (isSale) {
      if (code === "ZERO") add(box4, amount, 0);
      else if (code === "EXEMPT") add(box5, amount, 0);
      else add(box1, amount, vat);
      continue;
    }

    if (line.isImport) {
      add(box6, amount, vat);
      add(box10, amount, vat);
    } else if (reverseChargeCodes.has(code)) {
      add(box3, amount, vat);
      add(box10, amount, vat);
    } else if (code !== "ZERO" && code !== "EXEMPT" && Math.abs(vat) > 0.001) {
      add(box9, amount, vat);
    }
  }

  const adjustmentTotal = round(adjustments.reduce((sum, adjustment) => sum + (adjustment.direction === "increase" ? adjustment.amount : -adjustment.amount), 0));
  const outputVat = round(box1.vat + box3.vat + box6.vat);
  const inputVat = round(box9.vat + box10.vat);
  const company = companyRows[0];
  if (company?.baseCurrency !== "AED") blockingIssues.push("UAE VAT returns must be prepared and filed in AED. Change the company base currency to AED before recording a filing.");
  if (!/^\d{15}$/.test(company?.trn ?? "")) blockingIssues.push("Add the company’s valid 15-digit UAE TRN in Company Setup before recording a filing.");
  if (exceptionLines) blockingIssues.push(`${exceptionLines} VAT line${exceptionLines === 1 ? " has" : "s have"} an unknown code or VAT calculation exception. Review the VAT exception reports.`);
  if (adjustmentTotal) warnings.push("Manual VAT-due adjustments are included in the internal net position but must be mapped to the correct EmaraTax adjustment field before submission.");
  if (Math.abs(box6.amount) > 0.001) warnings.push("Reconcile Box 6 with the import values auto-populated from UAE Customs in EmaraTax.");
  warnings.push("Confirm the Box 1 standard-rated supplies allocation by Emirate in EmaraTax.");

  return {
    basis: "UAE VAT — date of supply (accrual)",
    currency: "AED",
    filingDueDate: filingDueDate(periodEnd),
    boxes: { box1, box3, box4, box5, box6, box9, box10, box11: { amount: round(box9.amount + box10.amount), vat: inputVat }, box12: outputVat, box13: inputVat, box14: round(outputVat - inputVat) },
    outputVat,
    inputVat,
    adjustments: adjustmentTotal,
    netVatDue: round(outputVat - inputVat + adjustmentTotal),
    transactionLines: transactionLineCount,
    exceptionLines,
    reviewIssues: [...blockingIssues, ...warnings],
    blockingIssues,
    canRecordFiling: blockingIssues.length === 0,
  };
}

async function getVatManagement(request: Request) {
  const url = new URL(request.url);
  const companyId = Number(url.searchParams.get("companyId"));
  const authorization = await requireCompanyAccess(request, companyId, "reports:read");
  if (authorization instanceof Response) return authorization;
  try {
    const periodStart = String(url.searchParams.get("periodStart") ?? "");
    const periodEnd = String(url.searchParams.get("periodEnd") ?? "");
    if (!Number.isInteger(companyId) || companyId <= 0 || !validDate(periodStart) || !validDate(periodEnd) || periodStart > periodEnd) return Response.json({ error: "Choose a valid VAT period." }, { status: 400 });
    const db = getDb();
    const [summary, returns, adjustments] = await Promise.all([
      calculateVat(companyId, periodStart, periodEnd),
      db.select().from(vatReturns).where(eq(vatReturns.companyId, companyId)).orderBy(desc(vatReturns.periodEnd), desc(vatReturns.id)).limit(100),
      db.select().from(vatAdjustments).where(eq(vatAdjustments.companyId, companyId)).orderBy(desc(vatAdjustments.adjustmentDate), desc(vatAdjustments.id)).limit(100),
    ]);
    return Response.json({ summary, returns, adjustments });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not load VAT management." }, { status: 500 }); }
}

async function updateVatManagement(request: Request) {
  const user = await requireApiUser(request, "accounting:manage", true);
  if (user instanceof Response) return user;
  try {
    const payload = await request.json() as Record<string, unknown>;
    const companyId = Number(payload.companyId);
    const locationId = Number(payload.locationId);
    const action = String(payload.action ?? "");
    if (!Number.isInteger(companyId) || companyId <= 0) return Response.json({ error: "Select a company." }, { status: 400 });
    if (!canAccessCompany(user, companyId)) return Response.json({ error: "You do not have access to this company." }, { status: 403 });
    const db = getDb();

    if (action === "file") {
      const periodStart = String(payload.periodStart ?? "");
      const periodEnd = String(payload.periodEnd ?? "");
      const reference = String(payload.reference ?? "").trim();
      if (!validDate(periodStart) || !validDate(periodEnd) || periodStart > periodEnd || !reference || reference.length > 80) return Response.json({ error: "Enter a valid period and FTA filing reference." }, { status: 400 });
      return await withWriteTransaction(async () => {
        const tx = getDb();
        const [duplicateReference] = await tx.select({ id: vatReturns.id }).from(vatReturns).where(and(eq(vatReturns.companyId, companyId), eq(vatReturns.reference, reference))).limit(1);
        if (duplicateReference) return Response.json({ error: "That FTA filing reference already exists." }, { status: 409 });
        const [overlap] = await tx.select({ id: vatReturns.id }).from(vatReturns).where(and(eq(vatReturns.companyId, companyId), lte(vatReturns.periodStart, periodEnd), gte(vatReturns.periodEnd, periodStart))).limit(1);
        if (overlap) return Response.json({ error: "A VAT filing is already recorded for all or part of this tax period." }, { status: 409 });
        const summary = await calculateVat(companyId, periodStart, periodEnd);
        if (!summary.canRecordFiling) return Response.json({ error: summary.blockingIssues.join(" "), reviewIssues: summary.reviewIssues }, { status: 409 });
        const [record] = await tx.insert(vatReturns).values({ companyId, locationId: null, periodStart, periodEnd, reference, outputVat: summary.outputVat, inputVat: summary.inputVat, adjustments: summary.adjustments, netVatDue: summary.netVatDue, filedByUserId: user.id }).returning();
        await tx.insert(auditLog).values({ companyId, action: "filed", entityType: "vat_return", entityId: record.id, details: `${reference}; company-wide; ${periodStart} to ${periodEnd}; VAT due ${summary.netVatDue.toFixed(2)} AED` });
        return Response.json({ record }, { status: 201 });
      });
    }

    if (action === "adjust") {
      if (!Number.isInteger(locationId) || locationId <= 0) return Response.json({ error: "Select an inventory for the adjustment journal." }, { status: 400 });
      const [location] = await db.select({ id: inventoryLocations.id }).from(inventoryLocations).where(and(eq(inventoryLocations.id, locationId), eq(inventoryLocations.companyId, companyId), eq(inventoryLocations.active, true))).limit(1);
      if (!location) return Response.json({ error: "The selected inventory was not found." }, { status: 404 });
      const adjustmentDate = String(payload.adjustmentDate ?? "");
      const reference = String(payload.reference ?? "").trim();
      const reason = String(payload.reason ?? "").trim();
      const direction = String(payload.direction ?? "increase") as "increase" | "decrease";
      const amount = round(Number(payload.amount));
      if (!validDate(adjustmentDate) || !reference || reference.length > 80 || !reason || reason.length > 500 || !["increase", "decrease"].includes(direction) || !Number.isFinite(amount) || amount <= 0) return Response.json({ error: "Complete the VAT adjustment with a valid positive amount." }, { status: 400 });
      return await withWriteTransaction(async () => {
        const tx = getDb();
        const [duplicate] = await tx.select({ id: vatAdjustments.id }).from(vatAdjustments).where(and(eq(vatAdjustments.companyId, companyId), eq(vatAdjustments.reference, reference))).limit(1);
        if (duplicate) return Response.json({ error: "That VAT adjustment reference already exists." }, { status: 409 });
        const accountRows = await tx.select({ id: accounts.id, name: accounts.name, systemRole: accounts.systemRole }).from(accounts).where(and(eq(accounts.companyId, companyId), eq(accounts.active, true)));
        const vatAccount = accountRows.find((account) => account.systemRole === "OUTPUT_VAT");
        const offsetAccount = accountRows.find((account) => account.systemRole === "SUSPENSE");
        if (!vatAccount || !offsetAccount) return Response.json({ error: "Link VAT Payable and Suspense accounts in Chart of Accounts before posting an adjustment." }, { status: 409 });
        const [entry] = await tx.insert(journalEntries).values({ companyId, locationId, entryDate: adjustmentDate, reference, description: `VAT adjustment: ${reason}`, posted: true }).returning();
        await tx.insert(journalLines).values(direction === "increase"
          ? [{ journalEntryId: entry.id, accountName: offsetAccount.name, debit: amount, credit: 0 }, { journalEntryId: entry.id, accountName: vatAccount.name, debit: 0, credit: amount }]
          : [{ journalEntryId: entry.id, accountName: vatAccount.name, debit: amount, credit: 0 }, { journalEntryId: entry.id, accountName: offsetAccount.name, debit: 0, credit: amount }]);
        const [record] = await tx.insert(vatAdjustments).values({ companyId, locationId, adjustmentDate, reference, direction, amount, reason, createdByUserId: user.id }).returning();
        await tx.insert(auditLog).values({ companyId, action: "created", entityType: "vat_adjustment", entityId: record.id, details: `${reference}; ${direction}; ${amount.toFixed(2)}; journal ${entry.id}` });
        return Response.json({ record }, { status: 201 });
      });
    }

    return Response.json({ error: "Choose a valid VAT action." }, { status: 400 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not update VAT." }, { status: 500 }); }
}

function noStore(response: Response) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(request: Request) {
  return noStore(await getVatManagement(request));
}

export async function POST(request: Request) {
  return noStore(await updateVatManagement(request));
}
