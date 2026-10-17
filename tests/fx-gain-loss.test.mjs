import test from "node:test";
import assert from "node:assert/strict";
import { exchangeDifference, withExchangeDifference } from "../lib/fx-difference.ts";

test("the difference is the booked value less the payment's value of what it settles", () => {
  assert.equal(exchangeDifference([{ amount: 1000, bookedRate: 3.6735 }], 3.67), 3.5);
  assert.equal(exchangeDifference([{ amount: 1000, bookedRate: 3.67 }], 3.6725), -2.5);
  assert.equal(exchangeDifference([{ amount: 600, bookedRate: 3.67 }, { amount: 400, bookedRate: 3.6735 }], 3.6725), round(600 * 3.67 + 400 * 3.6735 - 1000 * 3.6725));
  assert.equal(exchangeDifference([], 3.67), 0);
  assert.equal(exchangeDifference([{ amount: 100, bookedRate: 1 }], 1), 0);
  assert.equal(exchangeDifference([{ amount: 100, bookedRate: 0 }], 3.67), 0);
});
function round(value) { return Math.round((value + Number.EPSILON) * 100) / 100; }

test("a customer payment credits receivables at the booked value; a loss debits the exchange account", () => {
  const lines = [{ accountName: "NBD-USD", debit: 3670, credit: 0 }, { accountName: "Accounts Receivable - USD", debit: 0, credit: 3670 }];
  const posted = withExchangeDifference(lines, { accountName: "Accounts Receivable - USD", side: "credit" }, 3.5, { name: "Exchange Gain or Loss", id: 9 });
  assert.deepEqual(posted, [lines[0], { accountName: "Accounts Receivable - USD", debit: 0, credit: 3673.5 }, { accountName: "Exchange Gain or Loss", accountId: 9, debit: 3.5, credit: 0 }]);
  const gain = withExchangeDifference(lines, { accountName: "Accounts Receivable - USD", side: "credit" }, -2, { name: "FX" });
  assert.deepEqual(gain.slice(1), [{ accountName: "Accounts Receivable - USD", debit: 0, credit: 3668 }, { accountName: "FX", accountId: null, debit: 0, credit: 2 }]);
});

test("a bill payment debits payables at the booked value and stays balanced", () => {
  const lines = [{ accountName: "Accounts Payable - USD", debit: 3672.5, credit: 0 }, { accountName: "NBD-USD", debit: 0, credit: 3672.5 }];
  const loss = withExchangeDifference(lines, { accountName: "Accounts Payable - USD", side: "debit" }, -2.5, { name: "FX" });
  assert.deepEqual(loss.map((line) => [line.accountName, line.debit, line.credit]), [["Accounts Payable - USD", 3670, 0], ["NBD-USD", 0, 3672.5], ["FX", 2.5, 0]]);
  const net = (rows) => round(rows.reduce((sum, line) => sum + line.debit - line.credit, 0));
  assert.equal(net(loss), 0);
  assert.equal(net(withExchangeDifference(lines, { accountName: "Accounts Payable - USD", side: "debit" }, 4, { name: "FX" })), 0);
  assert.deepEqual(withExchangeDifference(lines, { accountName: "Missing", side: "debit" }, 4, { name: "FX" }), lines);
  assert.deepEqual(withExchangeDifference(lines, { accountName: "Accounts Payable - USD", side: "debit" }, 0, { name: "FX" }), lines);
});
