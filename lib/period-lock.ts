import { and, eq, gte, isNotNull, lte, or, type AnyColumn } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog, companySettings, incomeTaxWorkingPapers, vatReturns } from "@/db/schema";
import { checkAdminPin, pinBlockedMessage } from "./pin-attempts";
import { PERIOD_LOCK_PIN_HEADER, PERIOD_LOCKED } from "./period-lock-shared";

export { PERIOD_LOCK_PIN_HEADER, PERIOD_LOCKED };

// Once a VAT return is filed or a corporate tax working paper is marked filed, its period is locked: creating, editing,
// deleting or voiding anything dated inside it needs the company's Admin PIN (Management > Admin Controls). The client
// sends the PIN in this header and repeats the request after asking for it.

/** Documents that never post to the ledger or VAT, so a filed period does not lock them. */
export const unlockedDocumentTypes: ReadonlySet<string> = new Set(["quotation", "estimate", "proforma invoice", "sales order", "purchase order", "pending invoice"]);

const isDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** The filed VAT return or corporate tax period containing one of `dates`, or null when none is locked. */
export async function lockedPeriod(companyId: number, dates: readonly unknown[]) {
  const days = [...new Set(dates.filter(isDate))];
  if (!days.length) return null;
  const db = getDb();
  const inside = (start: AnyColumn, end: AnyColumn) => or(...days.map((day) => and(lte(start, day), gte(end, day))));
  const [vat] = await db.select({ start: vatReturns.periodStart, end: vatReturns.periodEnd, reference: vatReturns.reference }).from(vatReturns).where(and(eq(vatReturns.companyId, companyId), inside(vatReturns.periodStart, vatReturns.periodEnd))).limit(1);
  if (vat) return { kind: "VAT return", start: vat.start, end: vat.end, reference: vat.reference };
  const [tax] = await db.select({ start: incomeTaxWorkingPapers.periodStart, end: incomeTaxWorkingPapers.periodEnd }).from(incomeTaxWorkingPapers).where(and(eq(incomeTaxWorkingPapers.companyId, companyId), isNotNull(incomeTaxWorkingPapers.filedAt), inside(incomeTaxWorkingPapers.periodStart, incomeTaxWorkingPapers.periodEnd))).limit(1);
  return tax ? { kind: "Corporate tax", start: tax.start, end: tax.end, reference: "" } : null;
}

/**
 * Null when the change may go ahead: no date is in a filed period, or the request carries the correct Admin PIN (the
 * override is audited). Otherwise a 423 response with code PERIOD_LOCKED that tells the client to ask for the PIN.
 */
export async function guardFiledPeriod(request: Request, companyId: number, dates: readonly unknown[], action: string, actor: { id: number; email: string; fullName?: string | null }) {
  const period = await lockedPeriod(companyId, dates);
  if (!period) return null;
  const label = `${period.kind}${period.reference ? ` ${period.reference}` : ""} (${period.start} to ${period.end})`;
  const db = getDb();
  const [settings] = await db.select({ pinHash: companySettings.negativeStockPinHash }).from(companySettings).where(eq(companySettings.companyId, companyId)).limit(1);
  if (!settings?.pinHash) return Response.json({ error: `This date is in a filed period: ${label}. Ask an administrator to set the Admin PIN in Management > Admin Controls before changing it.`, code: PERIOD_LOCKED, period, pinConfigured: false }, { status: 423 });
  const pin = request.headers.get(PERIOD_LOCK_PIN_HEADER) ?? "";
  if (!pin) return Response.json({ error: `This date is in a filed period: ${label}. An administrator must enter the Admin PIN to change it.`, code: PERIOD_LOCKED, period, pinConfigured: true }, { status: 423 });
  const pinCheck = await checkAdminPin(companyId, actor.id, pin, settings.pinHash);
  if (!pinCheck.ok) return Response.json({ error: pinCheck.blocked ? pinBlockedMessage(pinCheck.retryAfter) : "Incorrect Admin PIN. The filed period was not changed.", code: PERIOD_LOCKED, period, pinConfigured: true, wrongPin: true }, { status: 423 });
  await db.insert(auditLog).values({ companyId, action: "filed-period override", entityType: "period_lock", entityId: 0, details: JSON.stringify({ action, period: label, dates: dates.filter(isDate), actorId: actor.id, actorName: actor.fullName || actor.email }) });
  return null;
}
