// Inventory list stock tabs. All items normally holds active items with stock;
// while the user searches it also holds out-of-stock matches, so a search never
// hides an active item. Inactive items always stay in their own tab.
export type StockTab = "all" | "in" | "low" | "inactive" | "zero" | "out";

type StockItem = Record<string, unknown>;

export function inStockTab(item: StockItem, tab: StockTab, searching = false): boolean {
  if (tab === "inactive") return item.status === "inactive";
  if (item.status === "inactive") return false;
  const quantity = Number(item.quantity);
  if (tab === "all") return searching || quantity > 0;
  if (tab === "in") return quantity > 0;
  if (tab === "low") return quantity > 0 && quantity <= Number(item.reorderPoint);
  return quantity <= 0;
}

export function stockTabCounts(items: readonly StockItem[], searching = false) {
  const count = (tab: StockTab) => items.filter((item) => inStockTab(item, tab, searching)).length;
  return { all: count("all"), in: count("in"), low: count("low"), inactive: count("inactive"), zero: count("zero") };
}
