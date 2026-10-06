// Company bank accounts by currency. The legacy single bank fields on the company remain the default
// account; `bankAccounts` (JSON) adds one account per extra currency so documents can show the account
// that matches the customer's currency.

export type BankAccount = { id: string; currency: string; bankName: string; accountName: string; accountNumber: string; iban: string; swift: string };
export type CompanyBankFields = { bankName?: string; bankAccountName?: string; bankAccountNumber?: string; bankIban?: string; bankSwift?: string; bankCurrency?: string; baseCurrency?: string; bankAccounts?: string };

export const MAX_BANK_ACCOUNTS = 10;
const limits = { bankName: 120, accountName: 120, accountNumber: 80, iban: 80, swift: 40 } as const;

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
    return account;
  });
}

/** Lenient read for editing: keeps half-typed entries so the form never loses what the user entered. */
export function draftBankAccounts(value: unknown): BankAccount[] {
  try {
    const raw = typeof value === "string" ? (value ? JSON.parse(value) : []) : value;
    if (!Array.isArray(raw)) return [];
    return raw.filter((entry) => entry && typeof entry === "object").map((entry: Record<string, unknown>) => ({ id: String(entry.id ?? ""), currency: String(entry.currency ?? ""), bankName: String(entry.bankName ?? ""), accountName: String(entry.accountName ?? ""), accountNumber: String(entry.accountNumber ?? ""), iban: String(entry.iban ?? ""), swift: String(entry.swift ?? "") }));
  } catch { return []; }
}

export function readBankAccounts(value: unknown): BankAccount[] {
  try { return parseBankAccounts(value); } catch { return []; }
}

function defaultAccount(company: CompanyBankFields): BankAccount | null {
  if (!company.bankName && !company.bankAccountNumber && !company.bankIban) return null;
  return { id: "default", currency: (company.bankCurrency || company.baseCurrency || "").toUpperCase(), bankName: company.bankName ?? "", accountName: company.bankAccountName ?? "", accountNumber: company.bankAccountNumber ?? "", iban: company.bankIban ?? "", swift: company.bankSwift ?? "" };
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
