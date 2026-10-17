import test from "node:test";
import assert from "node:assert/strict";
import { adjustmentCostLayer, adjustmentJournal, adjustmentTotals, adjustmentTypeComment, adjustmentTypeFromComment, planAdjustmentLine, weightedAverageTotals, weightedUnitCost } from "../lib/stock-adjustment.ts";

const stock = { quantity: 10, unitCost: 5 };

test("quantity adjustments value the difference at the current unit cost", () => {
  const down = planAdjustmentLine("quantity", stock, { newQuantity: "7" }, 1);
  assert.deepEqual(down, { quantityOnHand: 10, newQuantity: 7, quantityDifference: -3, currentValue: 50, newValue: 35, valueDifference: -15, unitCost: 5, newUnitCost: 5 });
  const up = planAdjustmentLine("quantity", stock, { quantityDifference: 2.5 }, 3.6725);
  assert.equal(up.newQuantity, 12.5);
  assert.equal(up.valueDifference, 12.5);
  assert.match(planAdjustmentLine("quantity", stock, { newQuantity: -1 }, 1).error, /below zero/);
  assert.match(planAdjustmentLine("quantity", stock, { newQuantity: 10 }, 1).error, /Nothing changes/);
  assert.match(planAdjustmentLine("quantity", stock, {}, 1).error, /new quantity/);
});

test("value adjustments convert the typed value to home currency and reset the unit cost", () => {
  const usd = planAdjustmentLine("value", stock, { newValue: "20" }, 3.6725);
  assert.equal(usd.newValue, 73.45);
  assert.equal(usd.valueDifference, 23.45);
  assert.equal(usd.quantityDifference, 0);
  assert.equal(usd.newUnitCost, 7.345);
  const both = planAdjustmentLine("quantity-value", stock, { newQuantity: 4, newValue: 30 }, 1);
  assert.equal(both.valueDifference, -20);
  assert.equal(both.newUnitCost, 7.5);
  assert.match(planAdjustmentLine("quantity-value", stock, { newQuantity: 0, newValue: 5 }, 1).error, /no quantity/);
  assert.match(planAdjustmentLine("value", { quantity: 0, unitCost: 5 }, { newValue: 5 }, 1).error, /Quantity and Total Value/);
  assert.match(planAdjustmentLine("value", { quantity: -2, unitCost: 5 }, { newValue: 5 }, 1).error, /negative stock/);
  assert.match(planAdjustmentLine("value", stock, { newValue: 5 }, 0).error, /exchange rate/);
});

test("the journal debits gaining asset accounts, credits losing ones and balances against the adjustment account", () => {
  const journal = adjustmentJournal([{ assetAccountId: 1, valueDifference: -15 }, { assetAccountId: 1, valueDifference: 10 }, { assetAccountId: 2, valueDifference: 7.34 }], 9, 3.67);
  const debit = journal.reduce((sum, line) => sum + line.debit, 0), credit = journal.reduce((sum, line) => sum + line.credit, 0);
  assert.ok(Math.abs(debit - credit) < 1e-9);
  assert.deepEqual(journal.map((line) => [line.accountId, line.debit, line.credit]), [[1, 0, 5], [2, 7.34, 0], [9, 0, 2.34]]);
  assert.equal(journal.find((line) => line.accountId === 2).originalDebit, 2);
  assert.deepEqual(adjustmentJournal([{ assetAccountId: 1, valueDifference: 0 }], 9, 1), []);
  assert.deepEqual(adjustmentTotals([{ valueDifference: -15 }, { valueDifference: 10.1 }]), { totalValue: -4.9, lineCount: 2 });
});

test("a value adjustment restarts the weighted average cost at its new value and quantity", () => {
  const detail = (newQuantity, newValue) => JSON.stringify({ quantityOnHand: 10, newQuantity, currentValue: 50, newValue, unitCost: 5, newUnitCost: newValue / newQuantity });
  const adjustment = adjustmentCostLayer({ itemId: 1, transactionId: 20, transactionComments: adjustmentTypeComment("value"), lineComments: detail(10, 80) });
  assert.deepEqual(adjustment, { itemId: 1, transactionId: 20, quantity: 10, value: 80, reset: true });
  // Quantity-only adjustments and unreadable lines leave the average alone.
  assert.equal(adjustmentCostLayer({ itemId: 1, transactionId: 21, transactionComments: adjustmentTypeComment("quantity"), lineComments: detail(12, 60) }), null);
  assert.equal(adjustmentCostLayer({ itemId: 1, transactionId: 22, transactionComments: adjustmentTypeComment("value"), lineComments: "not json" }), null);
  assert.equal(adjustmentTypeFromComment(adjustmentTypeComment("quantity-value")), "quantity-value");

  const before = { itemId: 1, transactionId: 10, quantity: 10, value: 50 };
  const after = { itemId: 1, transactionId: 30, quantity: 10, value: 120 };
  const other = { itemId: 2, transactionId: 5, quantity: 4, value: 20 };
  // Purchases before the adjustment are replaced by it; ones after it average on top, whatever order the rows come in.
  assert.equal(weightedUnitCost(weightedAverageTotals([before, adjustment]).get(1)), 8);
  const totals = weightedAverageTotals([after, adjustment, other, before]);
  assert.deepEqual(totals.get(1), { quantity: 20, value: 200 });
  assert.equal(weightedUnitCost(totals.get(1)), 10);
  assert.equal(weightedUnitCost(totals.get(2)), 5);
  // Writing stock down to zero value gives a zero average; an adjustment to no stock leaves no average to use.
  const zero = adjustmentCostLayer({ itemId: 1, transactionId: 40, transactionComments: adjustmentTypeComment("value"), lineComments: detail(10, 0) });
  assert.equal(weightedUnitCost(weightedAverageTotals([before, zero]).get(1)), 0);
  const empty = adjustmentCostLayer({ itemId: 1, transactionId: 40, transactionComments: adjustmentTypeComment("quantity-value"), lineComments: JSON.stringify({ newQuantity: 0, newValue: 0 }) });
  assert.equal(weightedUnitCost(weightedAverageTotals([before, empty]).get(1)), undefined);
});
