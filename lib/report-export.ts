export type ReportExportColumn = { key: string; label: string; type?: "money" };
export type ReportExportRow = Record<string, string | number | null>;
export type ReportExportData = {
  key?: string;
  title: string;
  generatedAt: string;
  currency: string;
  period?: { label: string };
  columns: ReportExportColumn[];
  rows: ReportExportRow[];
  financial?: { details: ReportExportRow[] };
};

const navy = "FF102033";
const emerald = "FF059669";
const pale = "FFF4F7FA";
const border = "FFD7DEE7";

function safeCsv(value: unknown) {
  const text = String(value ?? "");
  const safe = /^[\s\u0000-\u001f]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

function slug(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "report";
}

export function reportDownloadDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function reportFilename(report: ReportExportData, extension: "csv" | "xlsx" | "pdf", date = new Date()) {
  return `${slug(report.title)}-${reportDownloadDate(date)}.${extension}`;
}

function metadata(report: ReportExportData, company: string, inventory: string) {
  return [
    ["Company", company],
    ["Report", report.title],
    ["Inventory", inventory || "All inventories"],
    ["Period", report.period?.label || "Current report"],
    ["Currency", `${report.currency} (home currency)`],
    ["Generated", new Date(report.generatedAt).toLocaleString("en-AE")],
  ];
}

export function reportCsv(report: ReportExportData, company: string, inventory: string, rows = report.rows) {
  const records: unknown[][] = [
    ...metadata(report, company, inventory),
    [],
    report.columns.map((column) => column.label),
    ...rows.map((row) => report.columns.map((column) => row[column.key] ?? "")),
  ];
  return "\uFEFF" + records.map((record) => record.map(safeCsv).join(",")).join("\r\n");
}

function cellValue(value: string | number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : String(value ?? "");
}

function widthFor(column: ReportExportColumn) {
  if (/^(account|name|item|description|customer|supplier|vendor|party)$/i.test(column.key)) return 38;
  if (/date|month/i.test(column.key)) return 16;
  if (column.type === "money") return 20;
  return 22;
}

export async function reportWorkbook(report: ReportExportData, company: string, inventory: string, rows = report.rows) {
  const { default: ExcelJS } = await import("exceljs");
  const book = new ExcelJS.Workbook();
  book.creator = "COMNET Enterprise Accounting";
  book.created = new Date(report.generatedAt);
  book.modified = new Date();
  const sheet = book.addWorksheet("Report", {
    views: [{ state: "frozen", ySplit: 9 }],
    pageSetup: { paperSize: 9, orientation: report.columns.length > 6 ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
  });
  const columnCount = Math.max(1, report.columns.length);
  sheet.addRow([company]);
  sheet.addRow([report.title]);
  sheet.addRow([`${inventory || "All inventories"} | ${report.period?.label || "Current report"}`]);
  sheet.addRow([`${report.currency} home currency | Accrual basis`]);
  sheet.addRow([`Generated ${new Date(report.generatedAt).toLocaleString("en-AE")}`]);
  sheet.addRow([]);
  sheet.addRow([`${rows.length.toLocaleString("en-US")} record${rows.length === 1 ? "" : "s"}`]);
  sheet.addRow([]);
  for (let row = 1; row <= 7; row++) sheet.mergeCells(row, 1, row, columnCount);
  sheet.getRow(1).height = 27;
  sheet.getRow(1).font = { bold: true, size: 17, color: { argb: "FFFFFFFF" } };
  sheet.getRow(2).font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  for (let row = 1; row <= 5; row++) {
    sheet.getRow(row).fill = { type: "pattern", pattern: "solid", fgColor: { argb: navy } };
    sheet.getRow(row).alignment = { vertical: "middle" };
    if (row > 2) sheet.getRow(row).font = { size: 10, color: { argb: "FFD7E2EC" } };
  }
  sheet.getRow(7).font = { bold: true, color: { argb: emerald } };
  const header = sheet.addRow(report.columns.map((column) => column.label));
  header.height = 32;
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navy } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = { top: { style: "thin", color: { argb: border } }, bottom: { style: "thin", color: { argb: border } } };
  });
  rows.forEach((record, index) => {
    const row = sheet.addRow(report.columns.map((column) => cellValue(record[column.key])));
    row.height = 21;
    row.alignment = { vertical: "top", wrapText: true };
    if (index % 2 === 1) row.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: pale } }; });
    row.eachCell((cell) => { cell.border = { bottom: { style: "hair", color: { argb: border } } }; });
  });
  report.columns.forEach((column, index) => {
    const excelColumn = sheet.getColumn(index + 1);
    excelColumn.width = widthFor(column);
    if (column.type === "money") excelColumn.numFmt = '#,##0.00;[Red](#,##0.00);"-"';
  });
  sheet.autoFilter = { from: { row: 9, column: 1 }, to: { row: 9, column: columnCount } };
  sheet.pageSetup.printTitlesRow = "1:9";
  sheet.headerFooter.oddHeader = `&L${company.replaceAll("&", "&&")}&R${report.title.replaceAll("&", "&&")}`;
  sheet.headerFooter.oddFooter = `&L${reportDownloadDate()}&RPage &P of &N`;

  if (report.financial?.details?.length) {
    const detailKeys = ["date", "reference", "name", "account", "section", "currency", "amount"].filter((key) => report.financial!.details.some((row) => row[key] !== undefined));
    const detailLabels: Record<string, string> = { date: "Date", reference: "Reference", name: "Name", account: "Account", section: "Classification", currency: "Currency", amount: "Amount" };
    const detail = book.addWorksheet("Account detail", { views: [{ state: "frozen", ySplit: 1 }] });
    const detailHeader = detail.addRow(detailKeys.map((key) => detailLabels[key]));
    detailHeader.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navy } }; cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; });
    report.financial.details.forEach((record) => detail.addRow(detailKeys.map((key) => cellValue(record[key]))));
    detailKeys.forEach((key, index) => { detail.getColumn(index + 1).width = /name|account/.test(key) ? 36 : 20; if (key === "amount") detail.getColumn(index + 1).numFmt = '#,##0.00;[Red](#,##0.00);"-"'; });
    detail.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: Math.max(1, detailKeys.length) } };
  }
  return book.xlsx.writeBuffer();
}

function displayValue(value: string | number | null | undefined, money: boolean) {
  if (money && typeof value === "number") return value < 0 ? `(${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return String(value ?? "");
}

export async function reportPdf(report: ReportExportData, company: string, inventory: string, rows = report.rows) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const pdf = new jsPDF({ orientation: report.columns.length > 6 ? "landscape" : "portrait", format: "a4", unit: "mm" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const drawHeader = () => {
    pdf.setFillColor(16, 32, 51);
    pdf.rect(0, 0, pageWidth, 38, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.text(company, 12, 10, { maxWidth: pageWidth - 24 });
    pdf.setFontSize(16);
    pdf.text(report.title, 12, 21, { maxWidth: pageWidth - 24 });
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(215, 226, 236);
    pdf.text(`${inventory || "All inventories"} | ${report.period?.label || "Current report"} | ${report.currency} home currency | ${rows.length} records`, 12, 31, { maxWidth: pageWidth - 24 });
  };
  autoTable(pdf, {
    startY: 44,
    margin: { top: 44, bottom: 17, left: 10, right: 10 },
    head: [report.columns.map((column) => column.label)],
    body: rows.map((row) => report.columns.map((column) => displayValue(row[column.key], column.type === "money"))),
    theme: "grid",
    styles: { font: "helvetica", fontSize: report.columns.length > 8 ? 6.5 : 8, cellPadding: 2.2, overflow: "linebreak", lineColor: [215, 222, 231], lineWidth: 0.15, textColor: [28, 43, 58] },
    headStyles: { fillColor: [16, 32, 51], textColor: [255, 255, 255], fontStyle: "bold", valign: "middle" },
    alternateRowStyles: { fillColor: [244, 247, 250] },
    columnStyles: Object.fromEntries(report.columns.map((column, index) => [index, column.type === "money" ? { halign: "right" } : {}])),
    didDrawPage: drawHeader,
  });
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    pdf.setDrawColor(5, 150, 105);
    pdf.line(10, pageHeight - 13, pageWidth - 10, pageHeight - 13);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(90, 104, 119);
    pdf.text(`Generated ${new Date(report.generatedAt).toLocaleString("en-AE")} | ${report.currency}`, 10, pageHeight - 7);
    pdf.text(`Page ${page} of ${pages}`, pageWidth - 10, pageHeight - 7, { align: "right" });
  }
  return pdf.output("arraybuffer");
}
