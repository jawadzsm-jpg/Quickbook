import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { getDb, withWriteTransaction } from "@/db";
import { accounts, auditLog, companies, inventoryLocations, journalEntries, journalLines, transactionLines, transactions, vatAdjustments, vatCodes, vatReturns } from "@/db/schema";
import { canAccessCompany, requireApiUser, requireCompanyAccess } from "@/lib/auth";
import { guardFiledPeriod } from "@/lib/period-lock";
import { publicErrorMessage } from "@/lib/errors";
import { buildVat201, companyEmirate, emirateName, isEmirateKey, uaeEmirates } from "@/lib/vat-return";

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

type VatBox = { amount: number; vat: number };
const pair = (box: { amount: number; vat: number }): VatBox => ({ amount: box.amount, vat: box.vat });

function filingDueDate(periodEnd: string) {
  const date = new Date(`${periodEnd}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 28);
  return date.toISOString().slice(0, 10);
}

async function calculateVat(companyId: number, periodStart: string, periodEnd: string) {
  const db = getDb();
  const [lines, adjustments, configuredCodes, companyRows, locationRows, accountRows] = await Promise.all([
    db.select({
      transactionId: transactions.id,
      number: transactions.number,
      type: transactions.type,
      status: transactions.status,
      party: transactions.party,
      date: transactions.transactionDate,
      locationId: transactions.locationId,
      isImport: transactions.isImport,
      billId: transactions.billId,
      isFreightCharge: transactionLines.isFreightCharge,
      vatCode: transactionLines.vatCode,
      vatRate: transactionLines.vatRate,
      subtotal: transactionLines.subtotal,
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
    db.select({ name: companies.name, baseCurrency: companies.baseCurrency, trn: companies.trn, city: companies.city, addressLine1: companies.addressLine1, addressLine2: companies.addressLine2 }).from(companies).where(eq(companies.id, companyId)).limit(1),
    db.select({ id: inventoryLocations.id, name: inventoryLocations.name, emirate: inventoryLocations.emirate, active: inventoryLocations.active }).from(inventoryLocations).where(eq(inventoryLocations.companyId, companyId)).orderBy(asc(inventoryLocations.name)),
    db.select({ id: accounts.id, code: accounts.code, name: accounts.name, systemRole: accounts.systemRole }).from(accounts).where(eq(accounts.companyId, companyId)),
  ]);

  const company = companyRows[0];
  const defaultEmirate = company ? companyEmirate(company) : "";
  const vat201 = buildVat201({ lines, adjustments, codes: configuredCodes, locations: locationRows, companyEmirate: defaultEmirate });
  const { boxes, exceptionLines } = vat201;
  const box1 = { amount: round(uaeEmirates.reduce((sum, emirate) => sum + boxes[emirate.box].amount, 0) + vat201.unallocated.amount), vat: round(uaeEmirates.reduce((sum, emirate) => sum + boxes[emirate.box].vat, 0) + vat201.unallocated.vat) };
  const blockingIssues: string[] = [];
  const warnings: string[] = [];
  const adjustmentTotal = round(adjustments.reduce((sum, adjustment) => sum + (adjustment.direction === "increase" ? adjustment.amount : -adjustment.amount), 0));
  const outputVat = round(box1.vat + boxes["3"].vat + boxes["6"].vat);
  const inputVat = round(boxes["9"].vat + boxes["10"].vat);
  if (company?.baseCurrency !== "AED") blockingIssues.push("UAE VAT returns must be prepared and filed in AED. Change the company base currency to AED before recording a filing.");
  if (!/^\d{15}$/.test(company?.trn ?? "")) blockingIssues.push("Add the company’s valid 15-digit UAE TRN in Company Setup before recording a filing.");
  if (exceptionLines) blockingIssues.push(`${exceptionLines} VAT line${exceptionLines === 1 ? " has" : "s have"} an unknown code or VAT calculation exception. Review the VAT exception reports.`);
  if (Math.abs(vat201.unallocated.amount) > 0.001 || Math.abs(vat201.unallocated.adjustment) > 0.001) warnings.push("Some standard-rated supplies have no emirate. Set the emirate of each inventory in the VAT return below, or add the company city in Company Setup.");
  if (adjustmentTotal) warnings.push("VAT adjustments are shown in the Box 1 Adjustment column of their inventory’s emirate. Confirm in EmaraTax that each one belongs there.");
  if (Math.abs(boxes["6"].amount) > 0.001) warnings.push("Reconcile Box 6 with the import values auto-populated from UAE Customs in EmaraTax.");
  warnings.push("Boxes 2 (tourist refunds) and 7 (import adjustments) are not recorded in EasyBook; enter them on the return if they apply.");
  const role = (systemRole: string) => accountRows.filter((account) => account.systemRole === systemRole).map((account) => ({ id: account.id, code: String(account.code), name: account.name }));

  return {
    basis: "UAE VAT — date of supply (accrual)",
    currency: "AED",
    filingDueDate: filingDueDate(periodEnd),
    boxes: { box1, box3: pair(boxes["3"]), box4: pair(boxes["4"]), box5: pair(boxes["5"]), box6: pair(boxes["6"]), box9: pair(boxes["9"]), box10: pair(boxes["10"]), box11: pair(boxes["11"]), box12: boxes["12"].amount, box13: boxes["13"].amount, box14: boxes["14"].amount },
    vat201: {
      boxes, unallocated: vat201.unallocated, sources: vat201.sources,
      company: { name: company?.name ?? "", trn: company?.trn ?? "", emirate: defaultEmirate, emirateName: emirateName(defaultEmirate) },
      inventories: locationRows.map((location) => ({ id: location.id, name: location.name, active: location.active, emirate: isEmirateKey(location.emirate) ? location.emirate : "" })),
      accounts: { output: role("OUTPUT_VAT"), input: role("INPUT_VAT") },
    },
    outputVat,
    inputVat,
    adjustments: adjustmentTotal,
    netVatDue: round(outputVat - inputVat + adjustmentTotal),
    transactionLines: vat201.transactionLines,
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
  } catch (error) { return Response.json({ error: publicErrorMessage(error, "Could not load VAT management.") }, { status: 500 }); }
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

    if (action === "emirate") {
      const emirate = String(payload.emirate ?? "");
      if (!Number.isInteger(locationId) || locationId <= 0 || (emirate && !isEmirateKey(emirate))) return Response.json({ error: "Choose an inventory and a UAE emirate." }, { status: 400 });
      const [location] = await db.update(inventoryLocations).set({ emirate }).where(and(eq(inventoryLocations.id, locationId), eq(inventoryLocations.companyId, companyId))).returning();
      if (!location) return Response.json({ error: "The selected inventory was not found." }, { status: 404 });
      await db.insert(auditLog).values({ companyId, action: "updated", entityType: "inventory_emirate", entityId: location.id, details: `${location.name}: VAT201 emirate ${emirateName(emirate) || "follows the company"}` });
      return Response.json({ location: { id: location.id, name: location.name, emirate: location.emirate } });
    }

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
      const locked = await guardFiledPeriod(request, companyId, [adjustmentDate], `VAT adjustment ${reference}`, user);
      if (locked) return locked;
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
          ? [{ journalEntryId: entry.id, accountName: offsetAccount.name, accountId: offsetAccount.id, debit: amount, credit: 0 }, { journalEntryId: entry.id, accountName: vatAccount.name, accountId: vatAccount.id, debit: 0, credit: amount }]
          : [{ journalEntryId: entry.id, accountName: vatAccount.name, accountId: vatAccount.id, debit: amount, credit: 0 }, { journalEntryId: entry.id, accountName: offsetAccount.name, accountId: offsetAccount.id, debit: 0, credit: amount }]);
        const [record] = await tx.insert(vatAdjustments).values({ companyId, locationId, adjustmentDate, reference, direction, amount, reason, createdByUserId: user.id }).returning();
        await tx.insert(auditLog).values({ companyId, action: "created", entityType: "vat_adjustment", entityId: record.id, details: `${reference}; ${direction}; ${amount.toFixed(2)}; journal ${entry.id}` });
        return Response.json({ record }, { status: 201 });
      });
    }

    return Response.json({ error: "Choose a valid VAT action." }, { status: 400 });
  } catch (error) { return Response.json({ error: publicErrorMessage(error, "Could not update VAT.") }, { status: 500 }); }
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
