import { and, eq, or } from "drizzle-orm";
import { getDb } from "@/db";
import { contacts, transactions } from "@/db/schema";
import { requireCompanyAccess } from "@/lib/auth";
import { friendlyEmailError } from "@/lib/email-errors";
import { canEmailDocuments, EMAIL_BODY_MAX, EMAIL_SUBJECT_MAX, MAX_ATTACHMENT_BYTES, MAX_RECIPIENTS, RECIPIENTS_PER_MESSAGE, emailDocumentTypeValues, parseEmailList, recipientBatches, SUPPLIER_DOCUMENT_TYPES } from "@/lib/email-templates";
import { emailDeliveryConfigured, sendDocumentEmail } from "@/lib/smtp";
import { rememberAddresses, rememberedAddresses } from "@/lib/email-addresses";
import { emailSignatureFor, savedSignature } from "@/lib/email-signature-server";
import { publicErrorMessage } from "@/lib/errors";
import { consumeRateLimit } from "@/lib/rate-limit";

// Documents that can be emailed with their PDF: the sales and purchase documents the A4 template prints.
const emailableTypes = new Set([...emailDocumentTypeValues.filter((type) => type !== "any" && type !== "stock list"), "pending invoice"]);
const denied = () => Response.json({ error: "Only accountants and administrators can email documents." }, { status: 403 });
const isVoid = (row: { status: string; voidedAt: string | null }) => Boolean(row.voidedAt) || ["void", "voided", "cancelled", "canceled"].includes(row.status.toLowerCase());

async function access(request: Request, companyId: number, mutating = false) {
  const user = await requireCompanyAccess(request, companyId, false, mutating);
  if (user instanceof Response) return user;
  return canEmailDocuments(user.role) ? user : denied();
}

async function documentFor(companyId: number, transactionId: number) {
  if (!Number.isSafeInteger(transactionId) || transactionId <= 0) return null;
  const [row] = await getDb().select({ id: transactions.id, type: transactions.type, number: transactions.number, party: transactions.party, status: transactions.status, voidedAt: transactions.voidedAt })
    .from(transactions).where(and(eq(transactions.id, transactionId), eq(transactions.companyId, companyId))).limit(1);
  return row ?? null;
}

/**
 * Addresses to offer for a document: the customer's or supplier's saved email (it may hold several) and the addresses
 * this company emailed that party before, newest first (the only thing kept of a sent email, lib/email-addresses.ts).
 */
async function suggestedAddresses(companyId: number, party: string, type: string) {
  const db = getDb();
  const contactType = SUPPLIER_DOCUMENT_TYPES.includes(type) ? "vendor" : "customer";
  const [saved, earlier] = await Promise.all([
    db.select({ email: contacts.email }).from(contacts).where(and(eq(contacts.companyId, companyId), eq(contacts.type, contactType), or(eq(contacts.name, party), eq(contacts.company, party), eq(contacts.billingName, party)))).limit(5),
    rememberedAddresses(companyId, party),
  ]);
  const contact = parseEmailList(saved.map((row) => row.email).join(",")).valid;
  const previous = earlier.filter((address) => !contact.includes(address));
  return { contact, previous };
}

/** What the email dialog needs: whether email is set up, the addresses to suggest and the sender. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const companyId = Number(params.get("companyId"));
  const user = await access(request, companyId);
  if (user instanceof Response) return user;
  try {
    const document = await documentFor(companyId, Number(params.get("transactionId")));
    if (!document) return Response.json({ error: "Document not found." }, { status: 404 });
    const [suggestions, configured, signature] = await Promise.all([
      suggestedAddresses(companyId, document.party, document.type),
      emailDeliveryConfigured().catch(() => false),
      savedSignature(companyId, user.id),
    ]);
    return Response.json({
      configured, suggestions, signatureOn: Boolean(signature?.signature.enabled), sender: { name: user.fullName || user.email, email: user.email },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: publicErrorMessage(error, "Could not load the email details.") }, { status: 500 }); }
}

/**
 * Email a document: multipart form with companyId, transactionId, to and cc (addresses separated by commas or new
 * lines), subject, body and an optional `pdf` file. Nothing about the send is kept except, once it is sent, the
 * addresses it went to (for suggestions).
 */
export async function POST(request: Request) {
  let form: FormData;
  try { form = await request.formData(); } catch { return Response.json({ error: "The email could not be read. Try again." }, { status: 400 }); }
  const companyId = Number(form.get("companyId"));
  const user = await access(request, companyId, true);
  if (user instanceof Response) return user;
  // Protects the sender reputation and the email plan's quota from a misused account.
  const sendBudget = await consumeRateLimit(`document-email:${user.id}`, 100, 3600);
  if (!sendBudget.allowed) return Response.json({ error: "Too many emails sent in the last hour. Try again later." }, { status: 429, headers: { "Retry-After": String(sendBudget.retryAfter) } });
  const document = await documentFor(companyId, Number(form.get("transactionId")));
  if (!document) return Response.json({ error: "Document not found." }, { status: 404 });
  if (!emailableTypes.has(document.type)) return Response.json({ error: "This document cannot be emailed." }, { status: 400 });
  if (isVoid(document)) return Response.json({ error: "A void document cannot be emailed." }, { status: 409 });

  const to = parseEmailList(String(form.get("to") ?? ""));
  const cc = parseEmailList(String(form.get("cc") ?? ""));
  const ccOnly = cc.valid.filter((address) => !to.valid.includes(address));
  const invalid = [...to.invalid, ...cc.invalid];
  if (invalid.length) return Response.json({ error: `Check these email addresses: ${invalid.slice(0, 5).join(", ")}${invalid.length > 5 ? "…" : ""}` }, { status: 400 });
  if (!to.valid.length) return Response.json({ error: "Add at least one email address in To." }, { status: 400 });
  if (to.valid.length + ccOnly.length > MAX_RECIPIENTS) return Response.json({ error: `One email can go to at most ${MAX_RECIPIENTS} addresses.` }, { status: 400 });
  const subject = String(form.get("subject") ?? "").replace(/[\r\n]+/g, " ").trim();
  const body = String(form.get("body") ?? "").replace(/\r\n/g, "\n").trim();
  if (!subject || subject.length > EMAIL_SUBJECT_MAX) return Response.json({ error: `Write a subject (up to ${EMAIL_SUBJECT_MAX} characters).` }, { status: 400 });
  if (!body || body.length > EMAIL_BODY_MAX) return Response.json({ error: "Write the message." }, { status: 400 });

  const file = form.get("pdf");
  let attachment: { filename: string; content: Buffer } | undefined;
  if (file instanceof File && file.size) {
    if (file.size > MAX_ATTACHMENT_BYTES) return Response.json({ error: "The PDF is larger than 4 MB. Remove large images from the document and try again." }, { status: 413 });
    const content = Buffer.from(await file.arrayBuffer());
    if (content.subarray(0, 5).toString("latin1") !== "%PDF-") return Response.json({ error: "The attachment must be a PDF." }, { status: 400 });
    const filename = (file.name || `${document.number}.pdf`).replace(/[\\/\r\n"]+/g, "_").replace(/\.pdf$/i, "").slice(0, 120) + ".pdf";
    attachment = { filename, content };
  }
  if (!await emailDeliveryConfigured().catch(() => false)) return Response.json({ error: "Emails are not set up yet. An All-Admin can set the email server in Admin Controls → Email server." }, { status: 409 });

  try {
    const signature = await emailSignatureFor(companyId, user.id, request);
    const { sent: messages } = await sendDocumentEmail({ to: recipientBatches(to.valid), cc: ccOnly, replyTo: user.email ? { name: user.fullName || user.email, address: user.email } : undefined, subject, body, attachment, signature });
    // The email went out; failing to remember its addresses must not report it as failed.
    await rememberAddresses(companyId, document.party, [...to.valid, ...ccOnly]).catch(() => undefined);
    return Response.json({ ok: true, messages, recipients: to.valid.length + ccOnly.length });
  } catch (error) {
    const sentMessages = Number((error as { sentMessages?: number }).sentMessages ?? 0);
    const reason = friendlyEmailError(error);
    // The PDF's size helps tell an attachment the server refuses from an account limit.
    const pdfNote = attachment ? ` The attached PDF was ${(attachment.content.length / 1024 / 1024).toFixed(2)} MB; if the email goes through without the PDF, the server is refusing the attachment.` : "";
    const detail = (sentMessages ? `Sent to the first ${sentMessages * RECIPIENTS_PER_MESSAGE} addresses, then: ${reason}` : reason) + pdfNote;
    return Response.json({ error: detail }, { status: 502 });
  }
}
