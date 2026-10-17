// Report Center → "Show other currencies": reports stay in home currency, and rows of a foreign-currency document or
// account also show their own-currency amount (e.g. NBD-USD: AED 671,610.00 | USD 183,000.00). The server tags each
// row with its currency and rate (home per unit); the screen adds one "Original currency" column, which print, PDF,
// Excel, CSV and email then include. Pure rules, no database access.

type Row = Record<string, unknown>;
type Column = { key: string; label: string; type?: string };

/** Remembered per browser, like other report view choices. */
export const SHOW_ORIGINAL_CURRENCY_STORAGE_KEY = "comnet-report-original-currency";
export const ORIGINAL_CURRENCY_KEY = "originalCurrencyAmount";

export type CurrencyTag = { originalCurrency: string; originalRate: number };
type JournalEntry = { debit: number; credit: number; originalDebit?: number | null; originalCredit?: number | null; entryCurrency?: string | null; exchangeRate?: number | null };

/**
 * Debit-minus-credit of an account in home currency and in the account's own currency, opening balance included.
 * Postings in the account's currency use their original amounts (or home ÷ the entry's rate); postings in another
 * currency, and the opening balance, convert at the account currency's current rate.
 */
export function accountNativeTotals(entries: readonly JournalEntry[], accountCurrency: string, homeCurrency: string, currentRate: number, openingBalance = 0) {
  const code = accountCurrency.toUpperCase();
  let home = openingBalance * currentRate, native = openingBalance;
  for (const entry of entries) {
    const debit = Number(entry.debit) || 0, credit = Number(entry.credit) || 0;
    home += debit - credit;
    const entryCurrency = String(entry.entryCurrency || homeCurrency).toUpperCase();
    const rate = Number(entry.exchangeRate) || 1;
    if (entryCurrency === code) {
      const originalDebit = entry.originalDebit ?? (rate > 0 ? debit / rate : 0);
      const originalCredit = entry.originalCredit ?? (rate > 0 ? credit / rate : 0);
      native += Number(originalDebit) - Number(originalCredit);
    } else if (currentRate > 0) native += (debit - credit) / currentRate;
  }
  return { home, native };
}

/** Home per unit for a foreign account: its home total ÷ own-currency total, or the current rate when it nets to zero. */
export function accountRate(totals: { home: number; native: number }, currentRate: number) {
  return Math.abs(totals.native) > 0.000001 && Math.abs(totals.home) > 0.000001 ? totals.home / totals.native : currentRate;
}

/** Account id a report row points to (financial and account reports link their account column). */
export const rowAccountId = (row: Row) => Number(row.accountAccountId ?? row.nameAccountId ?? row.accountId ?? 0) || 0;

/** Rows with their currency tag: a document's currency and rate first, else the linked account's currency. */
export function tagRowCurrencies<T extends Row>(rows: readonly T[], tagFor: (row: T) => CurrencyTag | null): T[] {
  return rows.map((row) => {
    const tag = tagFor(row);
    return tag && tag.originalRate > 0 && Number.isFinite(tag.originalRate) ? { ...row, ...tag } : row;
  });
}

export const hasOriginalCurrencies = (rows: readonly Row[], reportCurrency: string) => rows.some((row) => typeof row.originalCurrency === "string" && row.originalCurrency.toUpperCase() !== reportCurrency.toUpperCase());

const formatAmount = (value: number) => value.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * The report with an "Original currency" column after its last amount column: that amount ÷ the row's rate, written
 * with the row's currency ("USD 183,000.00"). Home-currency rows show "—". Unchanged when no row is in another currency.
 */
export function withOriginalCurrencyColumn<T extends { rows: Row[]; columns: Column[]; currency: string }>(report: T): T {
  if (!hasOriginalCurrencies(report.rows, report.currency)) return report;
  const moneyIndex = report.columns.map((column) => column.type === "money").lastIndexOf(true);
  if (moneyIndex < 0) return report;
  const source = report.columns[moneyIndex];
  const columns = [...report.columns.slice(0, moneyIndex + 1), { key: ORIGINAL_CURRENCY_KEY, label: `${source.label} · original currency` }, ...report.columns.slice(moneyIndex + 1)];
  const rows = report.rows.map((row) => {
    const currency = typeof row.originalCurrency === "string" ? row.originalCurrency.toUpperCase() : "";
    const rate = Number(row.originalRate);
    const amount = row[source.key];
    if (!currency || currency === report.currency.toUpperCase() || !(rate > 0) || typeof amount !== "number") return { ...row, [ORIGINAL_CURRENCY_KEY]: "—" };
    return { ...row, [ORIGINAL_CURRENCY_KEY]: `${currency} ${formatAmount(Math.round(amount / rate * 100) / 100)}` };
  });
  return { ...report, columns, rows };
}
