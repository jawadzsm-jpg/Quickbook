// Items with stock on hand, and customers or vendors with an open balance, stay active: making them inactive would hide
// stock or money that is still owed from new documents and the lists. Only a change from active to inactive is checked.
const STOCK_EPSILON = 0.000001;
const MONEY_EPSILON = 0.005;

const quantityText = (quantity: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(quantity);
const moneyText = (amount: number, currency: string) => `${currency} ${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;

/** Why this item cannot be made inactive yet, or null. */
export function itemInactivationProblem(item: { status: string; quantity: number; sku?: string | null; name?: string | null }, nextStatus: string) {
  if (item.status !== "active" || nextStatus !== "inactive" || Math.abs(Number(item.quantity) || 0) < STOCK_EPSILON) return null;
  const label = [item.sku, item.name].filter(Boolean).join(" ") || "This item";
  return `${label} still has ${quantityText(Number(item.quantity))} in stock. Sell, transfer or adjust the stock to zero before making it inactive.`;
}

/** Why this customer or vendor cannot be made inactive yet, or null. Employees are not checked. */
export function contactInactivationProblem(contact: { type: string; status: string; balance: number; currency?: string | null }, nextStatus: string) {
  if (!["customer", "vendor"].includes(contact.type) || contact.status !== "active" || nextStatus !== "inactive" || Math.abs(Number(contact.balance) || 0) < MONEY_EPSILON) return null;
  const settle = contact.type === "customer" ? "Receive or credit the balance" : "Pay or clear the balance";
  return `This ${contact.type} still has a balance of ${moneyText(Number(contact.balance), contact.currency || "AED")}. ${settle} before making it inactive.`;
}
