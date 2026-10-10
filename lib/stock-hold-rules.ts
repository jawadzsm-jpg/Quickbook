// Hold rules shared by the server checks and the sales document form (no database access here).

export type ActiveHold = { itemId: number; quantity: number; salesRep: string; expiresAt: string };

/** Sales rep names compare case- and space-insensitively. */
export const sameSalesRep = (a: unknown, b: unknown) => String(a ?? "").trim().toLowerCase() !== "" && String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

/** Active holds on one item that a document for `salesRep` may not use, with their total quantity. */
export function holdsForOthers(holds: readonly ActiveHold[], itemId: unknown, salesRep: unknown) {
  const others = holds.filter((hold) => String(hold.itemId) === String(itemId) && !sameSalesRep(hold.salesRep, salesRep));
  return { holds: others, quantity: others.reduce((sum, hold) => sum + Number(hold.quantity), 0) };
}
