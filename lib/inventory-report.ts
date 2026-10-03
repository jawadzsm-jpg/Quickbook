export const inventoryReportKeys = new Set([
  "inventory-valuation",
  "inventory-valuation-detail",
  "inventory-status",
  "inventory-status-supplier",
  "inventory-stock-aging",
  "negative-item-list",
  "physical-inventory",
  "pending-builds",
]);

export type InventorySummaryCard = {
  label: string;
  value: number | string;
  format: "money" | "number" | "text";
  tone?: "positive" | "negative" | "neutral" | "accent";
};

export type InventoryReportRow = Record<string, string | number | null>;
export type InventoryReportColumn = { key: string; label: string; type?: "money" };
export type InventoryReportFilters = { query: string; account: string; status: string; sort: string };
const quantityKeys = new Set(["quantity", "onHand", "available", "reorder", "required", "buildLevel", "shortageQuantity", "items", "lowStock", "outOfStock", "ageDays", "count", "difference"]);
const additiveKeys = new Set(["quantity", "onHand", "available", "required", "shortageQuantity", "items", "lowStock", "outOfStock", "value", "shortageValue"]);

export function inventoryColumnKind(column: InventoryReportColumn): "text" | "quantity" | "price" | "amount" {
  if (column.type === "money") return column.key === "cost" ? "price" : "amount";
  return quantityKeys.has(column.key) ? "quantity" : "text";
}

export function inventoryColumnWeight(column: InventoryReportColumn) {
  if (["name", "item"].includes(column.key)) return 4.5;
  if (["account", "supplier"].includes(column.key)) return 3;
  if (column.key === "cost") return 1.8;
  if (column.type === "money") return 2.2;
  if (inventoryColumnKind(column) === "quantity") return 1.2;
  return 1.8;
}

export function inventoryColumnTotal(rows: InventoryReportRow[], column: InventoryReportColumn) {
  return additiveKeys.has(column.key) ? rows.reduce((total, row) => total + Number(row[column.key] || 0), 0) : null;
}

export function filterInventoryReportRows<T extends InventoryReportRow>(rows: T[], columns: InventoryReportColumn[], filters: InventoryReportFilters): T[] {
  const query = filters.query.trim().toLocaleLowerCase();
  const selected = rows.filter((row) => (!query || columns.some((column) => String(row[column.key] ?? "").toLocaleLowerCase().includes(query)))
    && (!filters.account || String(row.account ?? "") === filters.account)
    && (!filters.status || String(row.status ?? row.ageBand ?? "") === filters.status));
  if (filters.sort === "value") return selected.sort((a, b) => Number(b.value ?? b.shortageValue ?? 0) - Number(a.value ?? a.shortageValue ?? 0));
  if (filters.sort === "quantity") return selected.sort((a, b) => Number(a.quantity ?? a.onHand ?? 0) - Number(b.quantity ?? b.onHand ?? 0));
  if (filters.sort === "name") return selected.sort((a, b) => String(a.name ?? a.supplier ?? a.category ?? "").localeCompare(String(b.name ?? b.supplier ?? b.category ?? "")));
  return selected;
}

type InventoryAccount = { id: number; code: string; name: string; active: boolean; systemRole: string | null; currency: string };
export function inventoryAssetAccountLink(item: { assetAccountId: number | null }, accounts: InventoryAccount[], currency: string) {
  const defaults = accounts.filter((account) => account.active && (account.systemRole === "INVENTORY" || /inventory asset/i.test(account.name)));
  // A saved ID remains authoritative after an account is renamed or deactivated.
  const account = item.assetAccountId
    ? accounts.find((entry) => entry.id === item.assetAccountId)
    : defaults.find((entry) => entry.currency === currency) ?? defaults[0];
  return { account: account ? `${account.code} · ${account.name}` : item.assetAccountId ? "Inventory asset account link missing" : "Inventory Asset not configured", accountAccountId: account?.id ?? 0 };
}

export const inventoryReportGroups = [
  { title: "Stock valuation", description: "Understand your inventory investment and linked asset accounts.", keys: ["inventory-valuation", "inventory-valuation-detail"] },
  { title: "Availability & purchasing", description: "Find available stock, supplier exposure and replenishment needs.", keys: ["inventory-status", "inventory-status-supplier", "pending-builds"] },
  { title: "Stock health & verification", description: "Identify aging stock, shortages and items to count.", keys: ["inventory-stock-aging", "negative-item-list", "physical-inventory"] },
];

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
    "inventory-stock-aging": "inventory-valuation-detail",
    "negative-item-list": "inventory-status",
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
    const positiveRows = rows.filter((row) => Number(row.quantity) > 0);
    const quantity = sum(positiveRows, "quantity");
    const value = sum(positiveRows, "value");
    return { cards: [money("Stock value", value, "accent"), number("On hand", quantity), number("Stock items", rows.length), money("Average value per item", quantity ? value / quantity : 0), number("Zero / negative QOH", rows.filter((row) => Number(row.quantity) <= 0).length, "negative")], note: "Stock value includes positive quantity on hand at weighted average purchase cost. Average value per item is the stock value divided by positive units on hand; zero and negative quantities are excluded and shown separately. Select an item name to open it in Inventory. Asset accounts open the linked Chart of Accounts history." };
  }
  if (key === "inventory-status") {
    return { cards: [money("Stock value", sum(rows, "value"), "accent"), number("Available quantity", sum(rows, "available"), "positive"), number("Items", rows.length), number("Low stock", rows.filter((row) => String(row.status) === "Low Stock").length, "negative"), number("Out of stock", rows.filter((row) => String(row.status) === "Out of Stock").length, "negative")], note: "Select an item to open its Inventory record. Status compares quantity on hand with the saved reorder point." };
  }
  if (key === "inventory-status-supplier") {
    return { cards: [money("Stock value", sum(rows, "value"), "accent"), number("On hand", sum(rows, "quantity")), number("Suppliers", unique(rows, "supplier")), number("Low-stock items", sum(rows, "lowStock"), "negative"), number("Out-of-stock items", sum(rows, "outOfStock"), "negative")], note: "Latest supplier is taken from the newest posted purchase receipt or bill. Select a supplier to open Vendor Center." };
  }
  if (key === "inventory-stock-aging") {
    return { cards: [money("Aged stock value", sum(rows, "value"), "accent"), number("On-hand quantity", sum(rows, "quantity"), "positive"), number("Stock items", rows.length), number("Over 90 days", rows.filter((row) => Number(row.ageDays) > 90).length, "negative"), number("Over 365 days", rows.filter((row) => Number(row.ageDays) > 365).length, "negative")], note: "Age is measured from the latest posted stock receipt or supplier bill; where no receipt exists, the item creation date is used. Select an item or source document to open its linked area." };
  }
  if (key === "negative-item-list") {
    return { cards: [number("Negative items", rows.length, "negative"), number("Shortage quantity", sum(rows, "shortageQuantity"), "negative"), money("Shortage value", sum(rows, "shortageValue"), "negative"), number("Categories", unique(rows, "category")), number("Inventories affected", unique(rows, "inventory"), "accent")], note: "Only active stock items below zero are included. Shortage value uses the current weighted average purchase cost. Select an item to open and correct its Inventory record." };
  }
  if (key === "customization-details") {
    return { cards: [number("Products", rows.length), number("Customized", sum(rows, "hasCustomization"), "positive"), number("Serial assigned", sum(rows, "hasSerial")), number("UPC assigned", sum(rows, "hasUpc")), number("Needs user details", sum(rows, "needsDetails"), "negative")], note: "Product customization data is maintained by authorized Product Customization, Inventory Manager and Administrator users." };
  }
  if (key === "physical-inventory") {
    return { cards: [number("Items to count", rows.length), number("System quantity", sum(rows, "quantity")), number("Categories", unique(rows, "category")), number("Zero / negative QOH", rows.filter((row) => Number(row.quantity) <= 0).length, "negative")], note: "Use the blank Physical Count and Difference columns during stock verification. Select an item to open its Inventory record." };
  }

  return { cards: [number("Items below level", rows.length, "negative"), number("Required quantity", sum(rows, "required"), "accent"), number("On hand", sum(rows, "onHand")), number("Required now", rows.filter((row) => String(row.status) === "Required").length, "negative"), number("Categories", unique(rows, "category"))], note: "Required quantity is the gap between the saved build or reorder level and current on-hand stock. Select an item to open Inventory." };
}
