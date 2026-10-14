// Email lists for Inventory Overview emails: a Sales list (customers) and a Purchase list (suppliers) per company and
// user. Each user's addresses are private; Admins and All-Admins see and manage everyone's.
// Shared by the email dialog and the server.
import { isValidEmail } from "@/lib/email-validation";

export type EmailListType = "sales" | "purchase";
/** ownerName: who added it (shown to administrators, who see every user's addresses). */
export type EmailListContact = { id: number; name: string; company: string; email: string; ownerName?: string };
export const EMAIL_LIST_TYPES: readonly EmailListType[] = ["sales", "purchase"];
export const emailListLabel = (type: EmailListType) => type === "sales" ? "Sales list" : "Purchase list";

/** Addresses one list may hold, and how many one import may add. */
export const EMAIL_LIST_MAX = 5000;
export const EMAIL_LIST_IMPORT_MAX = 2000;
/** Addresses one Inventory Overview email may go to (sent hidden, in batches). */
export const INVENTORY_EMAIL_MAX_RECIPIENTS = 500;
export const EMAIL_LIST_NAME_MAX = 160;

export const isEmailListType = (value: unknown): value is EmailListType => value === "sales" || value === "purchase";

/**
 * Who may use a list (see, import, remove and send): every role except Viewer; Sales users only the Sales list.
 */
export function canUseEmailList(role: string, type: EmailListType) {
  if (role === "viewer") return false;
  return type === "sales" || role !== "sales";
}
export const emailListsFor = (role: string) => EMAIL_LIST_TYPES.filter((type) => canUseEmailList(role, type));

/** One CSV line split into cells; handles quoted cells, doubled quotes and commas or semicolons. */
function csvCells(line: string, separator: string) {
  const cells: string[] = [];
  let cell = "", quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted) {
      if (character === "\"" && line[index + 1] === "\"") { cell += "\""; index += 1; }
      else if (character === "\"") quoted = false;
      else cell += character;
    } else if (character === "\"") quoted = true;
    else if (character === separator) { cells.push(cell.trim()); cell = ""; }
    else cell += character;
  }
  cells.push(cell.trim());
  return cells;
}

/**
 * Contacts from a CSV file. With a header row the "Email" / "E-mail" column is the address, a "Name" / "Contact" column
 * the name and a "Company" column the company; without one, the first cell that is an email address is used and the
 * next other cells are the name and company. Addresses are lower-cased and de-duplicated; rows without a valid address
 * are counted as skipped.
 */
export function parseEmailListCsv(text: string) {
  const lines = text.replace(/^﻿/, "").split(/\r\n|\n|\r/).filter((line) => line.trim());
  if (!lines.length) return { contacts: [] as { name: string; company: string; email: string }[], skipped: 0 };
  const separator = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const header = csvCells(lines[0], separator).map((cell) => cell.toLowerCase());
  const emailColumn = header.findIndex((cell) => /^e-?mail( address)?$|email/.test(cell) && !isValidEmail(cell));
  const companyColumn = emailColumn >= 0 ? header.findIndex((cell) => /company|business|organi[sz]ation|firm/.test(cell)) : -1;
  const nameColumn = emailColumn >= 0 ? header.findIndex((cell, index) => index !== companyColumn && /name|contact|customer|supplier|vendor|person/.test(cell)) : -1;
  const rows = (emailColumn >= 0 ? lines.slice(1) : lines).map((line) => csvCells(line, separator));
  const contacts: { name: string; company: string; email: string }[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const cells of rows) {
    const at = emailColumn >= 0 ? emailColumn : cells.findIndex((cell) => isValidEmail(cell.toLowerCase().replace(/^mailto:/, "")));
    const email = (cells[at] ?? "").toLowerCase().replace(/^mailto:/, "").trim();
    if (at < 0 || !isValidEmail(email)) { skipped += 1; continue; }
    if (seen.has(email)) continue;
    seen.add(email);
    const others = cells.filter((cell, index) => index !== at && cell.trim());
    const name = (emailColumn >= 0 ? nameColumn >= 0 ? cells[nameColumn] : "" : others[0]) ?? "";
    const company = (emailColumn >= 0 ? companyColumn >= 0 ? cells[companyColumn] : "" : others[1]) ?? "";
    contacts.push({ name: name.trim().slice(0, EMAIL_LIST_NAME_MAX), company: company.trim().slice(0, EMAIL_LIST_NAME_MAX), email });
  }
  return { contacts, skipped };
}

/** The message when no template is chosen; {items} is replaced with the selected stock. */
/** The standard wording when no item is selected: the person writes their own message (news, website items…). */
export const defaultListEmail = {
  subject: "News from {company}",
  body: "Dear {name} – {contactCompany},\n\n\n\nFor orders or questions, reply to this email.\n\nBest regards,\n{sender}\n{company}",
};
export const defaultStockEmail = {
  subject: "Available stock from {company}",
  body: "Dear {name} – {contactCompany},\n\nPlease find our available stock below:\n\n{items}\n\nFor orders or questions, reply to this email.\n\nBest regards,\n{sender}\n{company}",
};

/** Placeholders filled for each recipient of a stock email: the contact's name and company from the list. */
export const personalPlaceholders = /\{(?:name|contactCompany)\}/;

/**
 * A stock email's text for one recipient: {name} is the contact's name (else their company, else "Sir/Madam") and
 * {contactCompany} their company. "{name} – {contactCompany}" becomes just one of them when the other is missing.
 */
export function personalizeEmail(text: string, contact: { name: string; company: string }) {
  const name = contact.name.trim(), company = contact.company.trim();
  const greeting = name || company || "Sir/Madam";
  return text
    .replace(/\{name\}\s*[–-]\s*\{contactCompany\}/g, name && company && name.toLowerCase() !== company.toLowerCase() ? `${name} – ${company}` : greeting)
    .replace(/\{name\}/g, greeting)
    .replace(/\{contactCompany\}/g, company);
}
