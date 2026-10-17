// Report Center → "Hide zero rows": leaves out rows whose every number is zero (e.g. unused accounts showing 0.00 debit,
// credit and balance). Rows without any number in the shown columns — headings, names, lists — are always kept. The
// filtered report feeds the screen, print, PDF, Excel, CSV and email alike.

type Column = { key: string; type?: string };
type Row = Record<string, unknown>;

/** Remembered per browser, like other report view choices. */
export const HIDE_ZERO_ROWS_STORAGE_KEY = "comnet-report-hide-zero-rows";

const isZero = (value: number, money: boolean) => money ? Math.abs(value) < 0.005 : Math.abs(value) < 1e-9;

/** True when the row shows at least one number and all of its shown numbers are zero. */
export function isZeroRow(row: Row, columns: readonly Column[]) {
  let numbers = 0;
  for (const column of columns) {
    const value = row[column.key];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    numbers += 1;
    if (!isZero(value, column.type === "money")) return false;
  }
  return numbers > 0;
}

/** The report without its all-zero rows, and how many rows were left out. */
export function withoutZeroRows<T extends { rows: Row[]; columns: readonly Column[] }>(report: T): { report: T; hidden: number } {
  const rows = report.rows.filter((row) => !isZeroRow(row, report.columns));
  return { report: rows.length === report.rows.length ? report : { ...report, rows }, hidden: report.rows.length - rows.length };
}
