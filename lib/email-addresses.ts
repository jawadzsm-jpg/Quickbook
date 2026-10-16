import { and, desc, eq, inArray, isNull, like, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { documentEmails } from "@/db/schema";
import { parseEmailList, REPORT_EMAIL_PREFIX } from "@/lib/email-templates";

// Document and report emails keep no history (migration 0139): once an email is sent, only the addresses it went to are
// remembered, as one document_emails row per company and party (a customer, supplier or "Report · <title>"), newest
// first, so the email dialog can suggest them next time. Subject, sender, attachment and delivery are never stored.
const KEEP = 50;
const list = (value: string) => { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.map(String) : []; } catch { return []; } };

/** Remembers the addresses of a sent email for this party: newest first, each once, up to 50. */
export async function rememberAddresses(companyId: number, party: string, addresses: string[]) {
  if (!addresses.length) return;
  const db = getDb();
  const rows = await db.select({ id: documentEmails.id, recipients: documentEmails.recipients, cc: documentEmails.cc }).from(documentEmails)
    .where(and(eq(documentEmails.companyId, companyId), eq(documentEmails.party, party))).orderBy(desc(documentEmails.createdAt), desc(documentEmails.id));
  const merged = parseEmailList([...addresses, ...rows.flatMap((row) => [...list(row.recipients), ...list(row.cc)])].join(",")).valid.slice(0, KEEP);
  // The merged row is written before the old ones go, so two sends at once lose no address (the next send merges them).
  await db.insert(documentEmails).values({ companyId, party, recipients: JSON.stringify(merged) });
  if (rows.length) await db.delete(documentEmails).where(inArray(documentEmails.id, rows.map((row) => row.id)));
}

/** Addresses emailed before, newest first: for one party, or for every report when `party` is omitted. */
export async function rememberedAddresses(companyId: number, party?: string) {
  const where: SQL | undefined = party === undefined
    ? and(eq(documentEmails.companyId, companyId), isNull(documentEmails.transactionId), like(documentEmails.party, `${REPORT_EMAIL_PREFIX}%`))
    : and(eq(documentEmails.companyId, companyId), eq(documentEmails.party, party));
  const rows = await getDb().select({ recipients: documentEmails.recipients, cc: documentEmails.cc }).from(documentEmails).where(where).orderBy(desc(documentEmails.createdAt)).limit(40);
  return parseEmailList(rows.flatMap((row) => [...list(row.recipients), ...list(row.cc)]).join(",")).valid;
}
