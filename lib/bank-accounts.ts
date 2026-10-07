// Company bank accounts by currency. The legacy single bank fields on the company remain the default
// account; `bankAccounts` (JSON) adds one account per extra currency so documents can show the account
// that matches the customer's currency. Each account may carry its own bank stamp image (`bankStampData`
// for the default account, `stampData` on the others) and a remark (`bankRemark` / `remark`), such as payment
// instructions, printed with that account's details.

export type BankAccount = { id: string; currency: string; bankName: string; accountName: string; accountNumber: string; iban: string; swift: string; stampData?: string; remark?: string };
export type CompanyBankFields = { bankName?: string; bankAccountName?: string; bankAccountNumber?: string; bankIban?: string; bankSwift?: string; bankCurrency?: string; baseCurrency?: string; bankAccounts?: string; bankStampData?: string; bankRemark?: string };

export const MAX_BANK_ACCOUNTS = 10;
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
  if (!Array.isArray(raw) || raw.length > MAX_BANK_ACCOUNTS) throw new Error(`Add at most ${MAX_BANK_ACCOUNTS} bank accounts.`);
  const ids = new Set<string>(); const currencies = new Set<string>();
  return raw.map((entry: Record<string, unknown>) => {
    if (!entry || typeof entry !== "object") throw new Error("Invalid bank account.");
    const id = String(entry.id ?? "");
    const currency = String(entry.currency ?? "").trim().toUpperCase();
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(id) || ids.has(id)) throw new Error("Invalid bank account.");
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Choose a three-letter currency for every bank account.");
    if (currencies.has(currency)) throw new Error(`Only one bank account per currency (${currency} is repeated).`);
    ids.add(id); currencies.add(currency);
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
    return account;
  });
}

/** Lenient read for editing: keeps half-typed entries so the form never loses what the user entered. */
export function draftBankAccounts(value: unknown): BankAccount[] {
  try {
    const raw = typeof value === "string" ? (value ? JSON.parse(value) : []) : value;
    if (!Array.isArray(raw)) return [];
    return raw.filter((entry) => entry && typeof entry === "object").map((entry: Record<string, unknown>) => ({ id: String(entry.id ?? ""), currency: String(entry.currency ?? ""), bankName: String(entry.bankName ?? ""), accountName: String(entry.accountName ?? ""), accountNumber: String(entry.accountNumber ?? ""), iban: String(entry.iban ?? ""), swift: String(entry.swift ?? ""), ...(entry.stampData ? { stampData: String(entry.stampData) } : {}), ...(entry.remark ? { remark: String(entry.remark) } : {}) }));
  } catch { return []; }
}

export function readBankAccounts(value: unknown): BankAccount[] {
  try { return parseBankAccounts(value); } catch { return []; }
}

function defaultAccount(company: CompanyBankFields): BankAccount | null {
  if (!company.bankName && !company.bankAccountNumber && !company.bankIban) return null;
  return { id: "default", currency: (company.bankCurrency || company.baseCurrency || "").toUpperCase(), bankName: company.bankName ?? "", accountName: company.bankAccountName ?? "", accountNumber: company.bankAccountNumber ?? "", iban: company.bankIban ?? "", swift: company.bankSwift ?? "", ...(company.bankStampData ? { stampData: company.bankStampData } : {}), ...(company.bankRemark ? { remark: company.bankRemark } : {}) };
}

/** The account to print for a document currency: an exact currency match, otherwise the default account. */
export function bankForCurrency(company: CompanyBankFields, currency: string | undefined): BankAccount | null {
  const wanted = String(currency ?? "").toUpperCase();
  const fallback = defaultAccount(company);
  if (wanted && fallback?.currency === wanted) return fallback;
  return readBankAccounts(company.bankAccounts).find((account) => account.currency === wanted) ?? fallback;
}

export function bankLines(account: BankAccount | null): string[] {
  if (!account) return [];
  return [account.bankName, account.accountName && `Account name: ${account.accountName}`, account.accountNumber && `Account no.: ${account.accountNumber}`, account.iban && `IBAN: ${account.iban}`, account.swift && `SWIFT: ${account.swift}`, account.currency && `Currency: ${account.currency}`].filter(Boolean) as string[];
}
