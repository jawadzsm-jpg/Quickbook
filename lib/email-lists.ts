// Email lists for Inventory Overview emails: a Sales list (customers) and a Purchase list (suppliers) per company and
// user. Each user's addresses are private; Admins and All-Admins see and manage everyone's.
// Shared by the email dialog and the server.
import { isValidEmail } from "@/lib/email-validation";

export type EmailListType = "sales" | "purchase";
/**
 * category: a country, region or any label the user gives, to filter and email part of a list ("" = none).
 * ownerId / ownerName: whose list it is (shown to administrators, who see every user's addresses).
 */
export type EmailListContact = { id: number; name: string; company: string; category: string; email: string; ownerId?: number | null; ownerName?: string };
/** A user whose list an administrator can open (and add to). */
export type EmailListOwner = { id: number; name: string };
export const EMAIL_LIST_TYPES: readonly EmailListType[] = ["sales", "purchase"];
export const emailListLabel = (type: EmailListType) => type === "sales" ? "Sales list" : "Purchase list";

/**
 * Lists and emails have no overall size limit; large ones go to the server in batches (the email dialog sends them
 * one after another): addresses added per request, addresses removed or categorised per request, and addresses one
 * send request goes to (sent hidden, in batches of 50, or one copy each when personalised).
 */
export const EMAIL_LIST_IMPORT_MAX = 2000;
export const EMAIL_LIST_IDS_MAX = 5000;
export const INVENTORY_EMAIL_MAX_RECIPIENTS = 500;
/** Largest CSV file the email dialog imports. */
export const EMAIL_LIST_CSV_MAX_BYTES = 50 * 1024 * 1024;
/** Send requests (of up to 500 addresses each) one user may make per hour: up to 100,000 addresses. */
export const INVENTORY_EMAIL_REQUESTS_PER_HOUR = 200;

/** Splits a list into consecutive batches of `size`. */
export function inBatches<T>(items: readonly T[], size: number) {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) batches.push(items.slice(index, index + size));
  return batches;
}
export const EMAIL_LIST_NAME_MAX = 160;
export const EMAIL_LIST_CATEGORY_MAX = 60;

/** A category as stored: single spaces, trimmed, at most 60 characters ("" = no category). */
export const cleanEmailListCategory = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, EMAIL_LIST_CATEGORY_MAX);

/** The categories used in a list, sorted (case-insensitive, the first spelling kept). */
export function emailListCategories(contacts: readonly { category?: string }[]) {
  const seen = new Map<string, string>();
  for (const contact of contacts) { const category = contact.category?.trim(); if (category && !seen.has(category.toLowerCase())) seen.set(category.toLowerCase(), category); }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

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
 * the name, a "Company" column the company and a "Category" / "Country" / "Region" / "Group" column the category;
 * without one, the first cell that is an email address is used and the next other cells are the name, company and
 * category. Addresses are lower-cased and de-duplicated; rows without a valid address are counted as skipped.
 */
export function parseEmailListCsv(text: string) {
  const lines = text.replace(/^﻿/, "").split(/\r\n|\n|\r/).filter((line) => line.trim());
  if (!lines.length) return { contacts: [] as { name: string; company: string; category: string; email: string }[], skipped: 0 };
  const separator = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const header = csvCells(lines[0], separator).map((cell) => cell.toLowerCase());
  const emailColumn = header.findIndex((cell) => /^e-?mail( address)?$|email/.test(cell) && !isValidEmail(cell));
  const companyColumn = emailColumn >= 0 ? header.findIndex((cell) => /company|business|organi[sz]ation|firm/.test(cell)) : -1;
  const categoryColumn = emailColumn >= 0 ? header.findIndex((cell, index) => index !== companyColumn && /categor|country|region|group|tag|segment/.test(cell)) : -1;
  const nameColumn = emailColumn >= 0 ? header.findIndex((cell, index) => index !== companyColumn && index !== categoryColumn && /name|contact|customer|supplier|vendor|person/.test(cell)) : -1;
  const rows = (emailColumn >= 0 ? lines.slice(1) : lines).map((line) => csvCells(line, separator));
  const contacts: { name: string; company: string; category: string; email: string }[] = [];
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
    const category = (emailColumn >= 0 ? categoryColumn >= 0 ? cells[categoryColumn] : "" : others[2]) ?? "";
    contacts.push({ name: name.trim().slice(0, EMAIL_LIST_NAME_MAX), company: company.trim().slice(0, EMAIL_LIST_NAME_MAX), category: cleanEmailListCategory(category), email });
  }
  return { contacts, skipped };
}

/** The message when no template is chosen; {items} is replaced with the selected stock. */
/** The standard wording when no item is selected: the person writes their own message (news, website items…). */
export const defaultListEmail = {
  subject: "News from {company}",
  body: "Dear {name},\n\n\n\nFor orders or questions, reply to this email.\n\nBest regards,\n{sender}\n{company}",
};
export const defaultStockEmail = {
  subject: "Available stock from {company}",
  body: "Dear {name},\n\nPlease find our available stock below:\n\n{items}\n\nFor orders or questions, reply to this email.\n\nBest regards,\n{sender}\n{company}",
};

/** Placeholders filled for each recipient of a stock email: the contact's name and company from the list. */
export const personalPlaceholders = /\{(?:name|contactCompany)\}/;

/**
 * A stock email's text for one recipient: {name} is the contact's name, or "Sir/Madam" without one (the company is not
 * used in its place), and {contactCompany} their company, for templates that want it.
 */
export function personalizeEmail(text: string, contact: { name: string; company: string }) {
  return text.replace(/\{name\}/g, contact.name.trim() || "Sir/Madam").replace(/\{contactCompany\}/g, contact.company.trim());
}
