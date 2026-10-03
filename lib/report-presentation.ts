export type ReportColumn = { key: string; label: string; type?: "money" };
export type ReportRow = Record<string, string | number | null>;

/** Presentation only: never infer additive totals or account IDs from a label. */
export function reportColumnKind(column: ReportColumn, rows: ReportRow[] = []): "text" | "quantity" | "price" | "amount" {
  if (column.type === "money") return /price|cost|rate/i.test(column.key) && !/total/i.test(column.key) ? "price" : "amount";
  if (/^(quantity|qty|qoh|onHand|sold|purchased|remaining|count|daysOverdue|overdueDays|days|orders|invoices|bills|debits|credits|margin|percentage|rate)$/i.test(column.key)) return "quantity";
  const values = rows.map(row => row[column.key]).filter(value => value !== null && value !== undefined && value !== "");
  return values.length > 0 && values.every(value => typeof value === "number") ? "quantity" : "text";
}

export function reportColumnWeight(column: ReportColumn, rows: ReportRow[] = []) {
  if (reportColumnKind(column, rows) !== "text") return 1.6;
  if (/date|month/i.test(column.key)) return 1.35;
  return /name|item|description|account|customer|supplier|vendor|party|memo|address/i.test(column.key) ? 2.8 : 1.5;
}

export function uniqueReportDefinitions<T extends readonly [string, string, string, string]>(definitions: readonly T[]): T[] {
  const seen = new Set<string>();
  return definitions.filter(definition => {
    if (seen.has(definition[3])) return false;
    seen.add(definition[3]);
    return true;
  });
}
