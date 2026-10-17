// Stock adjustments (Admin Controls → Stock adjustments), like "Adjust Quantity/Value on Hand": change the quantity, the
// total value, or both, for many items of one inventory at once. Pure rules shared by the API and the screen (no database
// access). Values typed on the screen are in the adjustment's currency; everything posted is converted to home currency.

/** Transaction type of a posted stock adjustment. Only /api/stock-adjustments creates, reverses or deletes it. */
export const STOCK_ADJUSTMENT_TYPE = "inventory adjustment";

export const adjustmentTypes = ["quantity", "value", "quantity-value"] as const;
export type AdjustmentType = typeof adjustmentTypes[number];
export const adjustmentTypeLabels: Record<AdjustmentType, string> = { quantity: "Quantity", value: "Total Value", "quantity-value": "Quantity and Total Value" };

export const MAX_ADJUSTMENT_LINES = 200;

/** Home-currency stock of an item before the adjustment. */
export type ItemStock = { quantity: number; unitCost: number };
/** One line as typed: new quantity (or the difference) and, for value types, the new total value in the document currency. */
export type AdjustmentLineInput = { newQuantity?: number | string | null; quantityDifference?: number | string | null; newValue?: number | string | null };
export type AdjustmentLinePlan = {
  quantityOnHand: number; newQuantity: number; quantityDifference: number;
  /** Home currency. */
  currentValue: number; newValue: number; valueDifference: number; unitCost: number; newUnitCost: number;
};

export const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export const roundQuantity = (value: number) => Math.round(value * 1e6) / 1e6;
const present = (value: unknown) => value !== undefined && value !== null && String(value).trim() !== "";
const number = (value: unknown) => typeof value === "number" ? value : Number(String(value).trim());

export const isAdjustmentType = (value: unknown): value is AdjustmentType => adjustmentTypes.includes(value as AdjustmentType);
export const changesQuantity = (type: AdjustmentType) => type !== "value";
export const changesValue = (type: AdjustmentType) => type !== "quantity";

/** The posted adjustment's comments record its type. */
export const adjustmentTypeComment = (type: AdjustmentType) => `Adjustment type: ${adjustmentTypeLabels[type]}`;
export const adjustmentTypeFromComment = (comments: string): AdjustmentType => adjustmentTypes.find((type) => comments === adjustmentTypeComment(type)) ?? "quantity";
/** Comments of the adjustments that set an item's total value (they reset its weighted average cost). */
export const valueAdjustmentComments = adjustmentTypes.filter(changesValue).map(adjustmentTypeComment);

/**
 * One step of an item's weighted average cost, in posting order (transaction id). A purchase adds its quantity and
 * home-currency value; a value adjustment replaces the running totals with the stock it set (new quantity and value).
 */
export type CostLayer = { itemId: number; transactionId: number; quantity: number; value: number; reset?: boolean };

/**
 * Weighted average totals per item: purchases since the item's latest value adjustment, on top of that adjustment's
 * new quantity and value. With no value adjustment this is the plain purchase average; right after one, the average is
 * exactly its new value ÷ new quantity. Quantity-only adjustments are valued at the average and do not change it.
 */
export function weightedAverageTotals(layers: Iterable<CostLayer>) {
  const totals = new Map<number, { quantity: number; value: number }>();
  for (const layer of [...layers].sort((a, b) => a.transactionId - b.transactionId)) {
    const quantity = Number(layer.quantity) || 0, value = Number(layer.value) || 0;
    const old = layer.reset ? { quantity: 0, value: 0 } : totals.get(layer.itemId) ?? { quantity: 0, value: 0 };
    totals.set(layer.itemId, { quantity: old.quantity + quantity, value: old.value + value });
  }
  return totals;
}

/** The cost layer of a posted adjustment line, or null when it does not set the item's value (or its detail is unreadable). */
export function adjustmentCostLayer(line: { itemId: number | null; transactionId: number; transactionComments: string; lineComments: string }): CostLayer | null {
  if (!line.itemId || !valueAdjustmentComments.includes(line.transactionComments)) return null;
  let detail: { newQuantity?: unknown; newValue?: unknown };
  try { detail = JSON.parse(line.lineComments) as typeof detail; } catch { return null; }
  const quantity = Number(detail?.newQuantity), value = Number(detail?.newValue);
  if (!Number.isFinite(quantity) || !Number.isFinite(value) || quantity < 0 || value < 0) return null;
  return { itemId: line.itemId, transactionId: line.transactionId, quantity, value, reset: true };
}

/** Unit cost from weighted totals (two decimals), or undefined when there is no quantity to average over. */
export const weightedUnitCost = (totals: { quantity: number; value: number } | undefined) => totals && totals.quantity > 0 ? Math.round(totals.value / totals.quantity * 100) / 100 : undefined;

/**
 * The effect of one line. Quantity adjustments value the difference at the item's current unit cost; value adjustments
 * set the item's total value (new value × exchange rate, home currency) and so its unit cost. Returns an error message
 * when the line cannot be posted.
 */
export function planAdjustmentLine(type: AdjustmentType, stock: ItemStock, input: AdjustmentLineInput, exchangeRate: number): AdjustmentLinePlan | { error: string } {
  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) return { error: "Enter a positive exchange rate." };
  const quantityOnHand = roundQuantity(Number(stock.quantity) || 0);
  const unitCost = Math.max(0, Number(stock.unitCost) || 0);
  let newQuantity = quantityOnHand;
  if (changesQuantity(type)) {
    if (present(input.newQuantity)) newQuantity = number(input.newQuantity);
    else if (present(input.quantityDifference)) newQuantity = quantityOnHand + number(input.quantityDifference);
    else return { error: "Enter the new quantity or the quantity difference." };
    if (!Number.isFinite(newQuantity)) return { error: "Enter a valid quantity." };
    newQuantity = roundQuantity(newQuantity);
    if (newQuantity < 0) return { error: "The new quantity cannot be below zero." };
  }
  const quantityDifference = roundQuantity(newQuantity - quantityOnHand);
  const currentValue = roundMoney(quantityOnHand * unitCost);
  let newValue: number;
  if (changesValue(type)) {
    if (!present(input.newValue)) return { error: "Enter the new total value." };
    const typed = number(input.newValue);
    if (!Number.isFinite(typed) || typed < 0) return { error: "Enter a total value of zero or more." };
    if (quantityOnHand < 0) return { error: "Resolve negative stock before changing its value." };
    if (type === "value" && quantityOnHand === 0) return { error: "Total Value adjusts stock on hand. Use Quantity and Total Value for an item with no stock." };
    newValue = roundMoney(typed * exchangeRate);
    if (newQuantity === 0 && newValue !== 0) return { error: "An item with no quantity must have a total value of zero." };
  } else newValue = roundMoney(currentValue + quantityDifference * unitCost);
  const valueDifference = roundMoney(newValue - currentValue);
  if (!Number.isFinite(valueDifference) || Math.abs(valueDifference) > 1e12) return { error: "The value is too large." };
  if (quantityDifference === 0 && valueDifference === 0) return { error: "Nothing changes on this line." };
  const newUnitCost = changesValue(type) && newQuantity > 0 ? Math.round(newValue / newQuantity * 10000) / 10000 : unitCost;
  return { quantityOnHand, newQuantity, quantityDifference, currentValue, newValue, valueDifference, unitCost, newUnitCost };
}

/** Totals shown under the lines: the net value change (home currency) and how many items change. */
export function adjustmentTotals(plans: Array<Pick<AdjustmentLinePlan, "valueDifference">>) {
  return { totalValue: roundMoney(plans.reduce((sum, plan) => sum + plan.valueDifference, 0)), lineCount: plans.length };
}

export type JournalLine = { accountId: number; debit: number; credit: number; originalDebit: number; originalCredit: number };

/**
 * A balanced journal for the adjustment: each inventory asset account is debited with the value it gains (credited when
 * it loses value), and the adjustment account takes the opposite side. Amounts are home currency; the original amounts
 * are in the document currency. Returns no lines when the total value does not change.
 */
export function adjustmentJournal(lines: Array<{ assetAccountId: number; valueDifference: number }>, adjustmentAccountId: number, exchangeRate: number): JournalLine[] {
  const byAccount = new Map<number, number>();
  for (const line of lines) byAccount.set(line.assetAccountId, roundMoney((byAccount.get(line.assetAccountId) ?? 0) + line.valueDifference));
  const original = (home: number) => roundMoney(home / exchangeRate);
  const result: JournalLine[] = [];
  let net = 0;
  for (const [accountId, amount] of byAccount) {
    if (!amount) continue;
    net = roundMoney(net + amount);
    result.push({ accountId, debit: Math.max(amount, 0), credit: Math.max(-amount, 0), originalDebit: original(Math.max(amount, 0)), originalCredit: original(Math.max(-amount, 0)) });
  }
  if (net) result.push({ accountId: adjustmentAccountId, debit: Math.max(-net, 0), credit: Math.max(net, 0), originalDebit: original(Math.max(-net, 0)), originalCredit: original(Math.max(net, 0)) });
  return result;
}
