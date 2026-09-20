type ReportRow = Record<string, string | number>;

const inventoryQohReports = new Set([
  "inventory-valuation",
  "inventory-valuation-detail",
  "inventory-status",
  "inventory-status-supplier",
  "physical-inventory",
  "pending-builds",
]);

export const hasInventoryQohFilter = (reportKey?: string) => inventoryQohReports.has(String(reportKey || ""));

export const filterZeroQohRows = (reportKey: string | undefined, rows: ReportRow[], hideZeroQoh: boolean) => {
  if (!hideZeroQoh || !hasInventoryQohFilter(reportKey)) return rows;
  return rows.filter((row) => Number(row.quantity ?? row.onHand ?? 0) !== 0);
};
