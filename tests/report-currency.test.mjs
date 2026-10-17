import test from "node:test";
import assert from "node:assert/strict";
import { ORIGINAL_CURRENCY_KEY, accountNativeTotals, accountRate, hasOriginalCurrencies, rowAccountId, tagRowCurrencies, withOriginalCurrencyColumn } from "../lib/report-currency.ts";

test("a foreign account's own-currency total uses original amounts, entry rates and the current rate", () => {
  const entries = [
    { debit: 671610, credit: 0, originalDebit: 183000, originalCredit: null, entryCurrency: "USD", exchangeRate: 3.67 },
    { debit: 36.7, credit: 0, entryCurrency: "USD", exchangeRate: 3.67 },
    { debit: 0, credit: 367, entryCurrency: "AED", exchangeRate: 1 },
  ];
  const totals = accountNativeTotals(entries, "USD", "AED", 3.67, 100);
  assert.equal(Math.round(totals.native * 100) / 100, 183000 + 10 - 100 + 100);
  assert.equal(Math.round(totals.home * 100) / 100, 671610 + 36.7 - 367 + 367);
  assert.equal(accountRate({ home: 0, native: 0 }, 3.67), 3.67);
  assert.ok(Math.abs(accountRate(totals, 3.67) - totals.home / totals.native) < 1e-12);
});

test("rows take their document's currency first, else their linked account's", () => {
  const rows = [{ transactionId: 1, total: 612890 }, { account: "NBD-EUR", accountAccountId: 7, balance: 1067500 }, { account: "Petty Cash", accountAccountId: 3, balance: 410800 }];
  const tagged = tagRowCurrencies(rows, (row) => row.transactionId ? { originalCurrency: "USD", originalRate: 3.67 } : rowAccountId(row) === 7 ? { originalCurrency: "EUR", originalRate: 4.27 } : null);
  assert.deepEqual(tagged.map((row) => row.originalCurrency ?? null), ["USD", "EUR", null]);
  assert.equal(hasOriginalCurrencies(tagged, "AED"), true);
  assert.equal(hasOriginalCurrencies(tagged.slice(2), "AED"), false);
  assert.equal(tagRowCurrencies([{ x: 1 }], () => ({ originalCurrency: "USD", originalRate: 0 }))[0].originalCurrency, undefined);
});

test("the original-currency column follows the last amount column and shows home rows as a dash", () => {
  const report = { currency: "AED", columns: [{ key: "account", label: "Account" }, { key: "debit", label: "Debit", type: "money" }, { key: "balance", label: "Balance", type: "money" }, { key: "note", label: "Note" }], rows: [
    { account: "NBD-USD", debit: 1835000, balance: 671610, originalCurrency: "USD", originalRate: 3.67 },
    { account: "Petty Cash", debit: 3118000, balance: 410800 },
  ] };
  const shown = withOriginalCurrencyColumn(report);
  assert.deepEqual(shown.columns.map((column) => column.key), ["account", "debit", "balance", ORIGINAL_CURRENCY_KEY, "note"]);
  assert.equal(shown.columns[3].label, "Balance · original currency");
  assert.equal(shown.rows[0][ORIGINAL_CURRENCY_KEY], "USD 183,000.00");
  assert.equal(shown.rows[1][ORIGINAL_CURRENCY_KEY], "—");
  const home = { currency: "AED", columns: report.columns, rows: [report.rows[1]] };
  assert.equal(withOriginalCurrencyColumn(home), home);
});
