type StockItem = { id: number; locationId: number | null; sku: string; itemNumber: string | null; name: string; quantity: number; cost: number; lastPurchasePrice: number; salesPrice: number; grnPrice?: number | null };
type PurchaseLine = { transactionId: number; itemId: number | null; description: string; quantity: number; subtotal: number; type: string; date: string; number: string; exchangeRate: number };
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** Current stock pricing estimate, not realized sales profit or inventory revaluation. */
export function stockPricingRows(stock: StockItem[], lines: PurchaseLine[], locations: { id: number; name: string }[]) {
  const documents = new Map<number, PurchaseLine[]>();
  for (const line of lines) {
    const group = documents.get(line.transactionId) ?? [];
    group.push(line); documents.set(line.transactionId, group);
  }
  type Cost = { unit: number; freight: number; reference: string; date: string; id: number };
  const bills = new Map<number, Cost>(), receipts = new Map<number, Cost>();
  for (const document of documents.values()) {
    const header = document[0];
    const rate = Number(header.exchangeRate);
    if (!Number.isFinite(rate) || rate <= 0) continue;
    const stockLines = document.filter((line) => line.itemId && line.quantity > 0);
    const value = stockLines.reduce((sum, line) => sum + Math.max(0, line.subtotal), 0);
    const quantity = stockLines.reduce((sum, line) => sum + line.quantity, 0);
    const freight = document.filter((line) => !line.itemId && /^freight charges?$/i.test(line.description.trim())).reduce((sum, line) => sum + line.subtotal, 0) * rate;
    for (const itemId of new Set(stockLines.map((line) => line.itemId!))) {
      const itemLines = stockLines.filter((line) => line.itemId === itemId);
      const itemQty = itemLines.reduce((sum, line) => sum + line.quantity, 0);
      const itemValue = itemLines.reduce((sum, line) => sum + line.subtotal, 0);
      const allocation = value > 0 ? Math.max(0, itemValue) / value : itemQty / quantity;
      const cost = { unit: itemValue * rate / itemQty, freight: freight * allocation / itemQty, reference: header.number, date: header.date, id: header.transactionId };
      const target = header.type === 'item receipt' ? receipts : bills;
      const previous = target.get(itemId);
      if (!previous || cost.date > previous.date || (cost.date === previous.date && cost.id > previous.id)) target.set(itemId, cost);
    }
  }
  const inventoryNames = new Map(locations.map((location) => [location.id, location.name]));
  return stock.map((item) => {
    const bill = bills.get(item.id), grn = receipts.get(item.id);
    const enteredGrn = item.grnPrice != null ? { unit: item.grnPrice, freight: 0, reference: "Entered price" } : undefined;
    const basis = bill ?? enteredGrn ?? grn;
    const fallback = item.lastPurchasePrice > 0 ? item.lastPurchasePrice : item.cost;
    const knownCost = Boolean(basis) || fallback > 0;
    const unitCost = basis ? basis.unit + basis.freight : fallback;
    const profit = item.salesPrice - unitCost;
    const quantity = Math.max(0, item.quantity);
    return {
      itemId: item.id, savedSellingPrice: item.salesPrice, savedGrnPrice: item.grnPrice ?? "",
      inventory: inventoryNames.get(item.locationId ?? 0) ?? 'Unassigned', itemNumber: item.itemNumber || item.sku, sku: item.sku, name: item.name, quantity: item.quantity,
      purchaseCost: bill ? round(bill.unit) : '—', freightCost: basis ? round(basis.freight) : 0, grnCost: enteredGrn ? round(enteredGrn.unit) : grn ? round(grn.unit) : '—',
      totalCost: knownCost ? round(unitCost) : '—', sellingPrice: round(item.salesPrice), unitProfit: knownCost ? round(profit) : '—',
      margin: knownCost && item.salesPrice > 0 ? `${round(profit / item.salesPrice * 100)}%` : '—',
      stockCost: knownCost ? round(unitCost * quantity) : '—', potentialProfit: knownCost ? round(profit * quantity) : '—',
      costSource: bill ? `Bill ${bill.reference}` : enteredGrn ? "Entered GRN price" : grn ? `GRN ${grn.reference}` : knownCost ? 'Saved item cost' : 'Cost not available',
    };
  });
}
