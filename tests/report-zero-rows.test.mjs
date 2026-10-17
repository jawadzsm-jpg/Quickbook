import test from "node:test";
import assert from "node:assert/strict";
import { isZeroRow, withoutZeroRows } from "../lib/report-zero-rows.ts";

const columns = [{ key: "section" }, { key: "account" }, { key: "debit", type: "money" }, { key: "credit", type: "money" }, { key: "balance", type: "money" }];

test("rows whose shown numbers are all zero are hidden; any non-zero number keeps the row", () => {
  assert.equal(isZeroRow({ section: "Assets", account: "Business Bank", debit: 0, credit: 0, balance: 0 }, columns), true);
  assert.equal(isZeroRow({ section: "Liabilities", account: "Accounts Payable", debit: 2707200, credit: 2707200, balance: 0 }, columns), false);
  assert.equal(isZeroRow({ account: "Rounding", debit: 0.004, credit: 0, balance: -0.001 }, columns), true);
  assert.equal(isZeroRow({ account: "Cent", debit: 0.01, credit: 0, balance: 0.01 }, columns), false);
  assert.equal(isZeroRow({ item: "A", quantity: 0.000001 }, [{ key: "item" }, { key: "quantity" }]), false);
});

test("text-only rows and numbers outside the shown columns never hide a row", () => {
  assert.equal(isZeroRow({ section: "Assets", account: "Current assets" }, columns), false);
  assert.equal(isZeroRow({ name: "Customer", accountId: 0 }, [{ key: "name" }]), false);
  assert.equal(isZeroRow({ name: "Customer", balance: "0.00" }, [{ key: "name" }, { key: "balance", type: "money" }]), false);
});

test("the filtered report keeps everything else and counts what it left out", () => {
  const report = { title: "Balance Sheet Detail", columns, rows: [{ account: "Petty Cash", debit: 3118000, credit: 2707200, balance: 410800 }, { account: "Undeposited Funds", debit: 0, credit: 0, balance: 0 }, { account: "Vehicles", debit: 0, credit: 0, balance: 0 }] };
  const { report: filtered, hidden } = withoutZeroRows(report);
  assert.equal(hidden, 2);
  assert.deepEqual(filtered.rows.map((row) => row.account), ["Petty Cash"]);
  assert.equal(filtered.title, "Balance Sheet Detail");
  assert.equal(report.rows.length, 3);
  const clean = { columns, rows: [{ account: "Petty Cash", debit: 1, credit: 0, balance: 1 }] };
  assert.equal(withoutZeroRows(clean).report, clean);
});
