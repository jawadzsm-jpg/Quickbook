// Email templates for sending documents to customers and suppliers. Shared by the email dialog and the server.
import { isValidEmail } from "@/lib/email-validation";

/** Placeholders a template may use; each is replaced with the document's value when the email is written. */
export const EMAIL_PLACEHOLDERS = [
  { key: "name", label: "Customer / supplier" },
  { key: "type", label: "Document type" },
  { key: "number", label: "Document number" },
  { key: "date", label: "Document date" },
  { key: "dueDate", label: "Due date" },
  { key: "amount", label: "Amount" },
  { key: "currency", label: "Currency" },
  { key: "company", label: "Your company" },
  { key: "sender", label: "Your name" },
  { key: "senderEmail", label: "Your email" },
] as const;
export type EmailPlaceholder = typeof EMAIL_PLACEHOLDERS[number]["key"];
export type EmailValues = Record<EmailPlaceholder, string>;

/** Document types a template can be for. "any" fits every document. */
export const EMAIL_DOCUMENT_TYPES = [
  { value: "any", label: "Any document" },
  { value: "invoice", label: "Invoice" },
  { value: "quotation", label: "Quotation" },
  { value: "estimate", label: "Estimate" },
  { value: "proforma invoice", label: "Proforma invoice" },
  { value: "sales order", label: "Sales order" },
  { value: "sales receipt", label: "Sales receipt" },
  { value: "credit memo", label: "Credit memo" },
  { value: "purchase order", label: "Purchase order" },
  { value: "bill", label: "Supplier bill" },
  { value: "vendor credit", label: "Purchase return" },
  // Inventory Overview emails to the Sales or Purchase list; {items} is the selected stock.
  { value: "stock list", label: "Inventory Overview stock list" },
] as const;
export const emailDocumentTypeValues: readonly string[] = EMAIL_DOCUMENT_TYPES.map((type) => type.value);
export const emailDocumentTypeLabel = (value: string) => EMAIL_DOCUMENT_TYPES.find((type) => type.value === value)?.label ?? value;

/** Document types that go to a supplier rather than a customer. */
export const SUPPLIER_DOCUMENT_TYPES = ["purchase order", "bill", "vendor credit"];

export const EMAIL_SUBJECT_MAX = 300;
export const EMAIL_BODY_MAX = 20_000;
export const EMAIL_TEMPLATE_NAME_MAX = 80;
/** One message carries at most this many recipients; more are sent as further copies of the same email. */
export const RECIPIENTS_PER_MESSAGE = 50;
/** A safety limit for one send, well above any customer's or supplier's address list. */
export const MAX_RECIPIENTS = 500;
/** The PDF must fit the hosting request limit (4.5 MB) together with the message. */
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;

/** The built-in wording, used until a person picks or writes a template. */
export function defaultEmailTemplate(documentType: string) {
  const supplier = SUPPLIER_DOCUMENT_TYPES.includes(documentType);
  return {
    subject: "{type} {number} from {company}",
    body: supplier
      ? "Dear {name},\n\nPlease find attached our {type} {number} dated {date} for {currency} {amount}.\n\nKindly confirm receipt.\n\nKind regards,\n{sender}\n{company}"
      : "Dear {name},\n\nPlease find attached {type} {number} dated {date} for {currency} {amount}.\n\nIf you have any questions, just reply to this email.\n\nKind regards,\n{sender}\n{company}",
  };
}

/** Replaces {placeholders} with the document's values; unknown placeholders are left as written. */
export function fillEmailTemplate(text: string, values: Partial<EmailValues>) {
  return text.replace(/\{(\w+)\}/g, (match, key: string) => key in values ? String(values[key as EmailPlaceholder] ?? "") : match);
}

/** A template fits a document when it is for that type or for any document. */
export const templateFits = (templateType: string, documentType: string) => templateType === "any" || templateType === documentType;

/**
 * Email addresses from typed or pasted text: split on commas, semicolons, spaces and new lines, "Name <a@b.com>"
 * reduced to the address, lower-cased and de-duplicated. Returns the valid addresses and the parts that were not.
 */
export function parseEmailList(text: string) {
  const valid: string[] = [], invalid: string[] = [];
  // "Name <a@b.com>" (as copied from a mail program) keeps only the address.
  for (const part of text.replace(/[^,;<>\n]*<([^<>]+)>/g, " $1 ").split(/[,;\s]+/)) {
    const address = part.trim().replace(/^mailto:/i, "").replace(/^[<("']+|[>)"'.]+$/g, "").toLowerCase();
    if (!address) continue;
    if (isValidEmail(address)) { if (!valid.includes(address)) valid.push(address); }
    else if (!invalid.includes(part)) invalid.push(part);
  }
  return { valid, invalid };
}

/** Splits a recipient list into groups for separate messages. */
export function recipientBatches<T>(recipients: T[], size = RECIPIENTS_PER_MESSAGE) {
  const batches: T[][] = [];
  for (let index = 0; index < recipients.length; index += size) batches.push(recipients.slice(index, index + size));
  return batches;
}

/** Accountants and administrators email documents and keep email templates. */
export const canEmailDocuments = (role: string) => ["all_admin", "admin", "accountant"].includes(role);
/** The template type for Inventory Overview emails; every role except Viewer may keep templates of this type. */
export const STOCK_EMAIL_TYPE = "stock list";
