// Company Setup → Clear company: what can be cleared, grouped for the dialog. Shared by the dialog and the server.
// The Chart of Accounts, items, inventory locations, warehouses, company identity, base currency, users and the
// audit history are never cleared.

export const CLEAR_GROUPS = [
  { id: "accounting", label: "Accounting and stock" },
  { id: "contacts", label: "Customers, vendors and employees" },
  { id: "operations", label: "Operations" },
  { id: "documents", label: "Reports, documents and messages" },
  { id: "settings", label: "Settings and setup" },
] as const;

export const CLEAR_SECTIONS = [
  { id: "transactions", group: "accounting", label: "Transactions, payments and cheques", detail: "Every sales, purchase and banking document, journal, VAT return and adjustment, with their packing lists and attachments. The Chart of Accounts and every sub-account are kept; account and contact balances reset to zero." },
  { id: "stock", group: "accounting", label: "Reset stock to zero, keep items", detail: "Keeps every item (name, SKU, prices, specifications, HS code) and sets stock to zero in every warehouse; moves between warehouses and stock holds are cleared too. Runs together with Transactions.", requires: "transactions" },
  { id: "customers", group: "contacts", label: "Customers", detail: "Customer records with their sub-accounts and their warranty/RMA slips. Documents keep the customer's name as written on them." },
  { id: "vendors", group: "contacts", label: "Vendors", detail: "Supplier records with their bank details. Warranty slips sent to a supplier keep the slip without the supplier link." },
  { id: "employees", group: "contacts", label: "Employees", detail: "Employee records (salary, loan and vacation details) and employee attachments." },
  { id: "warranty", group: "operations", label: "Warranty / RMA slips", detail: "Customer warranty slips and supplier return receipts." },
  { id: "offers", group: "operations", label: "Today offers and stock holds", detail: "Running, scheduled and past Today offers, and stock held for sales reps." },
  { id: "cargo", group: "operations", label: "Cargo list", detail: "Saved cargo and shipping companies." },
  { id: "rcm", group: "operations", label: "RCM declarations", detail: "Saved reverse-charge (RCM) declarations." },
  { id: "reports", group: "documents", label: "Saved reports and attachments", detail: "Memorised reports, inventory-check reports, staff salary sheets, income tax working papers and every remaining attachment." },
  { id: "email", group: "documents", label: "Email templates and sent emails", detail: "Email templates made in this company and the history of documents emailed to customers and suppliers." },
  { id: "notifications", group: "documents", label: "Notifications", detail: "In-app notifications for this company (cheque notices and PDC reminders) for every user." },
  { id: "settings", group: "settings", label: "VAT, currencies and company controls", detail: "VAT codes (the standard UAE codes are restored), exchange rates and company-level control settings." },
  { id: "setup", group: "settings", label: "Company setup and templates", detail: "Logos, stamp, address, contact details, TRN, bank accounts, document-template settings and the app font and text sizes. The company name and base currency are kept." },
] as const;

export type ClearSection = typeof CLEAR_SECTIONS[number]["id"];
/** Older clients sent "contacts" for customers, vendors and employees together. */
export const LEGACY_CLEAR_SECTIONS = { contacts: ["customers", "vendors", "employees"] } as const;
export const clearSectionIds: readonly string[] = CLEAR_SECTIONS.map((section) => section.id);

/** Counts shown next to each option: label → number of records (zero entries are listed too). */
export type ClearCounts = Partial<Record<ClearSection, { label: string; count: number }[]>>;

/** Total records an option would clear. */
export const clearTotal = (counts: ClearCounts, section: ClearSection) => (counts[section] ?? []).reduce((sum, entry) => sum + entry.count, 0);

/** Selection with dependencies applied: Stock needs Transactions; removing Transactions removes Stock. */
export function toggleClearSection(current: ClearSection[], section: ClearSection, checked: boolean): ClearSection[] {
  let next = checked ? [...new Set([...current, section])] : current.filter((value) => value !== section);
  if (section === "stock" && checked && !next.includes("transactions")) next = [...next, "transactions"];
  if (section === "transactions" && !checked) next = next.filter((value) => value !== "stock");
  return CLEAR_SECTIONS.map((entry) => entry.id).filter((id) => next.includes(id));
}
