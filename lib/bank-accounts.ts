// Company bank accounts by currency. The legacy single bank fields on the company remain the default
// account; `bankAccounts` (JSON) adds any number of further accounts in any currency, several per currency allowed, so
// documents can show the account that matches the customer's currency. When a currency has several accounts, every one
// marked `primary` (ticked "Print this account") prints on documents in that currency; a document can also pick its own. Each account may carry its own bank stamp image (`bankStampData`
// for the default account, `stampData` on the others) and a remark (`bankRemark` / `remark`), such as payment
// instructions, printed with that account's details.

export type BankAccount = { id: string; currency: string; bankName: string; accountName: string; accountNumber: string; iban: string; swift: string; stampData?: string; remark?: string; primary?: boolean };
export type CompanyBankFields = { bankName?: string; bankAccountName?: string; bankAccountNumber?: string; bankIban?: string; bankSwift?: string; bankCurrency?: string; baseCurrency?: string; bankAccounts?: string; bankStampData?: string; bankRemark?: string };

const limits = { bankName: 120, accountName: 120, accountNumber: 80, iban: 80, swift: 40 } as const;
export const MAX_BANK_STAMP_LENGTH = 700_000;
export const MAX_BANK_REMARK_LENGTH = 500;

/** A bank stamp is empty or a PNG, JPG or WebP data URL under 500 KB. */
export function validBankStamp(value: string): boolean {
  return !value || (value.length <= MAX_BANK_STAMP_LENGTH && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value));
}

/** Parse and validate stored or submitted bank accounts; throws on invalid input. */
export function parseBankAccounts(value: unknown): BankAccount[] {
  if (value === undefined || value === null || value === "") return [];
  const raw = typeof value === "string" ? JSON.parse(value) : value;
  if (!Array.isArray(raw)) throw new Error("Invalid bank accounts.");
  const ids = new Set<string>();
  return raw.map((entry: Record<string, unknown>) => {
    if (!entry || typeof entry !== "object") throw new Error("Invalid bank account.");
    const id = String(entry.id ?? "");
    const currency = String(entry.currency ?? "").trim().toUpperCase();
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(id) || ids.has(id)) throw new Error("Invalid bank account.");
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Choose a three-letter currency for every bank account.");
    ids.add(id);
    const account = { id, currency } as BankAccount;
    for (const [key, max] of Object.entries(limits) as [keyof typeof limits, number][]) {
      const text = String(entry[key] ?? "").trim();
      if (text.length > max) throw new Error(`Bank ${key} is too long.`);
      account[key] = key === "iban" || key === "swift" ? text.toUpperCase() : text;
    }
    if (!account.bankName && !account.accountNumber && !account.iban) throw new Error(`Enter the bank name, account number or IBAN for the ${currency} account.`);
    const stampData = String(entry.stampData ?? "");
    if (!validBankStamp(stampData)) throw new Error(`Upload a PNG, JPG or WebP bank stamp smaller than 500 KB for the ${currency} account.`);
    if (stampData) account.stampData = stampData;
    const remark = String(entry.remark ?? "").trim();
    if (remark.length > MAX_BANK_REMARK_LENGTH) throw new Error(`Keep the ${currency} bank remark under ${MAX_BANK_REMARK_LENGTH} characters.`);
    if (remark) account.remark = remark;
    if (entry.primary === true) account.primary = true;
    return account;
  });
}

/** Lenient read for editing: keeps half-typed entries so the form never loses what the user entered. */
export function draftBankAccounts(value: unknown): BankAccount[] {
  try {
    const raw = typeof value === "string" ? (value ? JSON.parse(value) : []) : value;
    if (!Array.isArray(raw)) return [];
    return raw.filter((entry) => entry && typeof entry === "object").map((entry: Record<string, unknown>) => ({ id: String(entry.id ?? ""), currency: String(entry.currency ?? ""), bankName: String(entry.bankName ?? ""), accountName: String(entry.accountName ?? ""), accountNumber: String(entry.accountNumber ?? ""), iban: String(entry.iban ?? ""), swift: String(entry.swift ?? ""), ...(entry.stampData ? { stampData: String(entry.stampData) } : {}), ...(entry.remark ? { remark: String(entry.remark) } : {}), ...(entry.primary === true ? { primary: true } : {}) }));
  } catch { return []; }
}

export function readBankAccounts(value: unknown): BankAccount[] {
  try { return parseBankAccounts(value); } catch { return []; }
}

function defaultAccount(company: CompanyBankFields): BankAccount | null {
  if (!company.bankName && !company.bankAccountNumber && !company.bankIban) return null;
  return { id: "default", currency: (company.bankCurrency || company.baseCurrency || "").toUpperCase(), bankName: company.bankName ?? "", accountName: company.bankAccountName ?? "", accountNumber: company.bankAccountNumber ?? "", iban: company.bankIban ?? "", swift: company.bankSwift ?? "", ...(company.bankStampData ? { stampData: company.bankStampData } : {}), ...(company.bankRemark ? { remark: company.bankRemark } : {}) };
}

/**
 * The first account to print for a document currency: the account marked to print for that currency, otherwise the default
 * account when it is in that currency, otherwise the first account in that currency, otherwise the default account.
 */
export function bankForCurrency(company: CompanyBankFields, currency: string | undefined): BankAccount | null {
  const wanted = String(currency ?? "").toUpperCase();
  const fallback = defaultAccount(company);
  const matching = wanted ? readBankAccounts(company.bankAccounts).filter((account) => account.currency === wanted) : [];
  return matching.find((account) => account.primary) ?? (fallback?.currency === wanted && wanted ? fallback : matching[0]) ?? fallback;
}

/** Every account to print for a document currency: all ticked accounts in that currency, otherwise `bankForCurrency`. */
export function banksForCurrency(company: CompanyBankFields, currency: string | undefined): BankAccount[] {
  const wanted = String(currency ?? "").toUpperCase();
  const ticked = wanted ? readBankAccounts(company.bankAccounts).filter((account) => account.currency === wanted && account.primary) : [];
  if (ticked.length) return ticked;
  const single = bankForCurrency(company, currency);
  return single ? [single] : [];
}

/** Every company bank account a document can print: the main account (id "default") first, then the extra accounts. */
export function companyBankAccounts(company: CompanyBankFields): BankAccount[] {
  const main = defaultAccount(company);
  return [...(main ? [main] : []), ...readBankAccounts(company.bankAccounts)];
}

/** Most bank accounts one document can print together. */
export const MAX_DOCUMENT_BANK_ACCOUNTS = 5;

/** The account ids saved on a document (`bankAccountKey`, comma-separated, in print order); empty follows its currency. */
export function documentBankKeys(bankAccountKey: unknown): string[] {
  return [...new Set(String(bankAccountKey ?? "").split(",").map((key) => key.trim()).filter(Boolean))];
}

/**
 * The accounts to print on one document: the accounts chosen on it (`bankAccountKey`), otherwise the ticked accounts for
 * its currency. Only accounts offered for its currency count (`bankChoicesForCurrency`), so an AED invoice never prints a
 * USD account; chosen accounts since removed from Company Setup are skipped too. With none left the currency rule applies.
 */
export function banksForDocument(company: CompanyBankFields, currency: string | undefined, bankAccountKey: unknown): BankAccount[] {
  const accounts = bankChoicesForCurrency(company, currency);
  const chosen = documentBankKeys(bankAccountKey).map((key) => accounts.find((account) => account.id === key)).filter(Boolean) as BankAccount[];
  return chosen.length ? chosen : banksForCurrency(company, currency);
}

/** The first account printed on one document (its bank stamp prints with the bank details). */
export function bankForDocument(company: CompanyBankFields, currency: string | undefined, bankAccountKey: unknown): BankAccount | null {
  return banksForDocument(company, currency, bankAccountKey)[0] ?? null;
}

/** Accounts offered for a document: those in its currency; when the company has none in that currency, every account. */
export function bankChoicesForCurrency(company: CompanyBankFields, currency: string | undefined): BankAccount[] {
  const accounts = companyBankAccounts(company);
  const wanted = String(currency ?? "").toUpperCase();
  const matching = accounts.filter((account) => account.currency === wanted);
  return matching.length ? matching : accounts;
}

/** Short label for choosing an account: bank, currency and the end of the account number or IBAN. */
export function bankAccountLabel(account: BankAccount): string {
  const number = account.accountNumber || account.iban;
  return [account.bankName || account.accountName || "Bank account", account.currency, number && `…${number.slice(-4)}`, account.id === "default" && "main"].filter(Boolean).join(" · ");
}

/** Bank box lines for several accounts, a blank line between accounts. */
export function documentBankLines(accounts: BankAccount[]): string[] {
  return accounts.flatMap((account, index) => [...(index ? ["\u00a0"] : []), ...bankLines(account)]);
}

/** The Company Setup remarks of several accounts, one per line. */
export function documentBankRemark(accounts: BankAccount[]): string {
  return [...new Set(accounts.map((account) => account.remark?.trim()).filter(Boolean))].join("\n");
}

export function bankLines(account: BankAccount | null): string[] {
  if (!account) return [];
  return [account.bankName, account.accountName && `Account name: ${account.accountName}`, account.accountNumber && `Account no.: ${account.accountNumber}`, account.iban && `IBAN: ${account.iban}`, account.swift && `SWIFT: ${account.swift}`, account.currency && `Currency: ${account.currency}`].filter(Boolean) as string[];
}
