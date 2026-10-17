// Realised exchange differences. A foreign invoice or bill is booked at its own rate; the payment that settles it
// arrives at another. The payment clears Accounts Receivable / Payable at the booked rate of what it settles, and the
// difference posts to the Exchange Gain or Loss account (system role FX_GAIN_LOSS, home currency), as QuickBooks does.

export const FX_GAIN_LOSS_ROLE = "FX_GAIN_LOSS";
export const FX_GAIN_LOSS_ACCOUNT = { code: "7200", name: "Exchange Gain or Loss", type: "Other Expense" } as const;
/** Payment types that settle foreign invoices (customer payment) or bills (bill payment, cheque to Accounts Payable). */
export const fxPaymentTypes = ["customer payment", "bill payment", "cheque"] as const;

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Home-currency difference between what the settled documents were booked at and the payment's value of the same
 * amount: Σ round(amount × booked rate) − round(Σ amount × payment rate). Positive means the documents were booked
 * higher than the payment is worth (a loss on receivables, a gain on payables).
 */
export function exchangeDifference(settled: ReadonlyArray<{ amount: number; bookedRate: number }>, paymentRate: number) {
  const valid = settled.filter((entry) => entry.amount > 0 && entry.bookedRate > 0);
  if (!valid.length || !(paymentRate > 0)) return 0;
  const booked = valid.reduce((sum, entry) => sum + round(entry.amount * entry.bookedRate), 0);
  const atPayment = round(valid.reduce((sum, entry) => sum + entry.amount, 0) * paymentRate);
  return round(booked - atPayment);
}

type Line = { accountName: string; debit: number; credit: number; accountId?: number | null };

/**
 * The payment journal with its receivable/payable line moved to the booked value and the difference on the exchange
 * account. Receivables (customer payments) are credited; payables (bill payments, cheques) are debited. The journal
 * stays balanced. Lines are returned unchanged when there is no difference or no control line.
 */
export function withExchangeDifference<T extends Line>(lines: readonly T[], control: { accountName: string; side: "debit" | "credit" }, difference: number, fx: { name: string; id?: number }): Array<T | Line> {
  if (!difference) return [...lines];
  const index = lines.findIndex((line) => line.accountName === control.accountName && line[control.side] > 0);
  if (index < 0) return [...lines];
  const adjusted = lines.map((line, position) => position === index ? { ...line, [control.side]: round(line[control.side] + difference) } : line);
  // Receivable side: more credited than received → debit the exchange account (loss). Payable side: the reverse.
  const fxDebit = control.side === "credit" ? difference : -difference;
  return [...adjusted, { accountName: fx.name, accountId: fx.id ?? null, debit: round(Math.max(fxDebit, 0)), credit: round(Math.max(-fxDebit, 0)) }];
}
