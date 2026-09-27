export const inventoryReportKeys = new Set([
  "inventory-valuation",
  "inventory-valuation-detail",
  "inventory-status",
  "inventory-status-supplier",
  "physical-inventory",
  "pending-builds",
]);

export type InventorySummaryCard = {
  label: string;
  value: number | string;
  format: "money" | "number" | "text";
  tone?: "positive" | "negative" | "neutral" | "accent";
};

type InventoryReportLike = {
  key?: string;
  rows: Array<Record<string, string | number | null>>;
};

const sum = (rows: InventoryReportLike["rows"], key: string) => rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
const unique = (rows: InventoryReportLike["rows"], key: string) => new Set(rows.map((row) => String(row[key] ?? "").trim()).filter(Boolean)).size;
const money = (label: string, value: number, tone: InventorySummaryCard["tone"] = "neutral"): InventorySummaryCard => ({ label, value, format: "money", tone });
const number = (label: string, value: number, tone: InventorySummaryCard["tone"] = "neutral"): InventorySummaryCard => ({ label, value, format: "number", tone });

export function inventoryDetailTarget(key = "") {
  return ({
    "inventory-valuation": "inventory-valuation-detail",
    "inventory-status": "inventory-valuation-detail",
    "inventory-status-supplier": "inventory-status",
    "pending-builds": "physical-inventory",
  } as Record<string, string>)[key] || "";
}

export function inventorySummary(report: InventoryReportLike): { cards: InventorySummaryCard[]; note: string } | null {
  const key = report.key || "";
  const rows = report.rows;
  if (!inventoryReportKeys.has(key)) return null;

  if (key === "inventory-valuation") {
    return { cards: [money("Stock value", sum(rows, "value"), "accent"), number("On hand", sum(rows, "quantity")), number("Stock items", sum(rows, "items")), number("Categories", unique(rows, "category")), number("Asset accounts", unique(rows, "account"))], note: "Stock value uses the current on-hand quantity and weighted average purchase cost in home currency. Account names open their ledger history." };
  }
  if (key === "inventory-valuation-detail") {
    const quantity = sum(rows, "quantity");
    const value = sum(rows, "value");
    return { cards: [money("Stock value", value, "accent"), number("On hand", quantity), number("Stock items", rows.length), money("Average value per item", rows.length ? value / rows.length : 0), number("Zero / negative QOH", rows.filter((row) => Number(row.quantity) <= 0).length, "negative")], note: "Select an item name to open it in Inventory. Asset accounts open the linked Chart of Accounts history." };
  }
  if (key === "inventory-status") {
    return { cards: [money("Stock value", sum(rows, "value"), "accent"), number("Available quantity", sum(rows, "available"), "positive"), number("Items", rows.length), number("Low stock", rows.filter((row) => String(row.status) === "Low Stock").length, "negative"), number("Out of stock", rows.filter((row) => String(row.status) === "Out of Stock").length, "negative")], note: "Select an item to open its Inventory record. Status compares quantity on hand with the saved reorder point." };
  }
  if (key === "inventory-status-supplier") {
    return { cards: [money("Stock value", sum(rows, "value"), "accent"), number("On hand", sum(rows, "quantity")), number("Suppliers", unique(rows, "supplier")), number("Low-stock items", sum(rows, "lowStock"), "negative"), number("Out-of-stock items", sum(rows, "outOfStock"), "negative")], note: "Latest supplier is taken from the newest posted purchase receipt or bill. Select a supplier to open Vendor Center." };
  }
  if (key === "physical-inventory") {
    return { cards: [number("Items to count", rows.length), number("System quantity", sum(rows, "quantity")), number("Categories", unique(rows, "category")), number("Zero / negative QOH", rows.filter((row) => Number(row.quantity) <= 0).length, "negative")], note: "Use the blank Physical Count and Difference columns during stock verification. Select an item to open its Inventory record." };
  }

  return { cards: [number("Items below level", rows.length, "negative"), number("Required quantity", sum(rows, "required"), "accent"), number("On hand", sum(rows, "onHand")), number("Required now", rows.filter((row) => String(row.status) === "Required").length, "negative"), number("Categories", unique(rows, "category"))], note: "Required quantity is the gap between the saved build or reorder level and current on-hand stock. Select an item to open Inventory." };
}
