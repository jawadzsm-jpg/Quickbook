import { reportStampAfterTable } from "./report-stamp";
import { incomeTaxReportSummary } from "./income-tax";
import { journalReportSummary } from "./journal-register";
import { reportColumnKind, reportColumnWeight } from "./report-presentation";
import { vatColumnKind, vatColumnTotal, vatColumnWeight, vatReportKeys, vatSummary } from "./vat-report";
import { budgetSummary, budgetReportKeys, type BudgetBasis } from "./budget-report";
import { salesColumnKind, salesColumnTotal, salesColumnWeight, salesReportKeys, salesSummary } from "./sales-report";
import { customerSummary } from "./customer-report";
import { vendorSummary, vendorReportKeys, vendorColumnKind, vendorColumnTotal, vendorColumnWeight } from "./vendor-report";
import { purchaseColumnKind, purchaseColumnTotal, purchaseColumnWeight, purchaseReportKeys, purchaseSummary } from "./purchase-report";
import { inventoryColumnKind, inventoryColumnTotal, inventoryColumnWeight, inventoryReportKeys, inventorySummary } from "./inventory-report";
import { bankingSummary } from "./banking-report";
import { accountantSummary, accountantReportKeys } from "./accountant-report";
import { listSummary, listReportKeys } from "./list-report";
import { employeeSummary } from "./employee-report";
import { financialSummary } from "./financial-presentation";
import type { PrintOrientation } from "./document-print";

export type ReportExportColumn = { key: string; label: string; type?: "money" };
export type ReportExportRow = Record<string, string | number | null>;
export type ReportExportData = {
  key?: string;
  budget?: BudgetBasis;
  description?: string;
  pnl?: {warnings: string[]};
  summary?: {income:number;expenses:number;netIncome:number};
  accountLinkIssues?: string[];
  title: string;
  generatedAt: string;
  currency: string;
  period?: { label: string };
  columns: ReportExportColumn[];
  rows: ReportExportRow[];
  financial?: { details: ReportExportRow[]; note?: string; issues?: string[] };
  openBalance?: { totalOpen: number; totalAmount: number; overdueOnly?: boolean };
  activeCustomers?: { count: number };
  statement?: { opening: number; charges: number; credits: number; closing: number };
  /** Statements: bank details boxes (company and/or supplier), printed after the table in order (left offset in mm). */
  bankBoxes?: Array<{ title: string; lines: string[]; remark?: string; left: number }>;
  /** Statements: the letterhead assigned to statements, drawn as the PDF page header and footer instead of the generic report band. */
  letterhead?: ReportLetterhead;
};
export type ReportLetterhead = {
  name: string; color: string; logo?: string; rightLogo?: string; heading?: string; subtitle?: string;
  /** Phone / email / website line under the header. */
  contact: string[];
  /** Footer text and company lines printed at the bottom of every page. */
  footer: string[];
  /** Replaces the summary note, e.g. who the statement is for and its period. */
  note?: string;
};

// Any image the browser can draw (PNG, JPEG, WebP, SVG data URL) as a PNG jsPDF can embed, with its pixel size.
function pngImage(src: string) {
  return new Promise<{ data: string; width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Could not prepare the image.");
        context.drawImage(image, 0, 0);
        resolve({ data: canvas.toDataURL("image/png"), width: image.naturalWidth, height: image.naturalHeight });
      } catch (error) { reject(error); }
    };
    image.onerror = () => reject(new Error("Could not read the image."));
    image.src = src;
  });
}
const hexRgb = (hex: string): [number, number, number] => /^#[0-9a-f]{6}$/i.test(hex) ? [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16)) as [number, number, number] : [16, 32, 51];

export function reportOverview(report: ReportExportData, rows: ReportExportRow[]) {
  if (report.key === "purchase-document-register") return { cards: [
    { label: "Documents", value: rows.length, format: "number", tone: "neutral" },
    { label: "Purchase orders", value: rows.filter(row => row.type === "purchase order").length, format: "number", tone: "neutral" },
    { label: "Bills", value: rows.filter(row => ["bill","received item bill"].includes(String(row.type))).length, format: "number", tone: "neutral" },
  ], note: report.description || "Filtered purchase register; original document currencies." };
  if (report.key === "sales-document-register") return { cards: [
    { label: "Documents", value: rows.length, format: "number", tone: "neutral" },
    { label: "Invoices", value: rows.filter(row => row.type === "invoice").length, format: "number", tone: "neutral" },
    { label: "Currencies", value: new Set(rows.map(row => row.currency)).size, format: "number", tone: "neutral" },
  ], note: report.description || "Filtered sales document register; original document currencies." };
  if(report.pnl&&report.summary)return {cards:[{label:'Income',value:report.summary.income,format:'money',tone:'positive'},{label:report.key==='profit-loss-cost-of-goods'?'Cost of goods sold':'Costs & expenses',value:report.summary.expenses,format:'money',tone:'neutral'},{label:report.key==='profit-loss-cost-of-goods'?'Gross profit':'Net profit / loss',value:report.summary.netIncome,format:'money',tone:report.summary.netIncome<0?'negative':'positive'}],note:report.description||'Accrual basis · Posted journal entries'};
  return incomeTaxReportSummary({ key: report.key, rows }) ?? journalReportSummary({ key: report.key, rows }) ?? financialSummary({ key: report.key, rows, financial: report.financial }) ?? vatSummary({ key: report.key, rows }) ?? budgetSummary({ key: report.key, rows, budget: report.budget }) ?? salesSummary({ key: report.key, rows }) ?? customerSummary({ key: report.key, rows, openBalance: report.openBalance, activeCustomers: report.activeCustomers, statement: report.statement }) ?? vendorSummary({ key: report.key, rows, statement: report.statement }) ?? purchaseSummary({ key: report.key, rows }) ?? inventorySummary({ key: report.key, rows }) ?? bankingSummary({ key: report.key, rows }) ?? accountantSummary({ key: report.key, rows }) ?? listSummary({ key: report.key, rows }) ?? employeeSummary({ key: report.key, rows });
}

export function reportReviewIssues(report: ReportExportData) {
  return [...new Set([...(report.pnl?.warnings ?? []), ...(report.financial?.issues ?? []), ...((["income-tax", "posted-journals", "posted-journal-lines"].includes(report.key || "") || budgetReportKeys.has(report.key || "") || accountantReportKeys.has(report.key || "") || listReportKeys.has(report.key || "")) ? report.accountLinkIssues ?? [] : [])])];
}

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
    [vatReportKeys.has(report.key || "") ? "Scope" : "Inventory", inventory || "All inventories"],
    ["Period", report.period?.label || "Current report"],
    ["Currency", report.key === "employee-balances" ? "Per employee (recorded currency)" : `${report.currency} (${vendorReportKeys.has(report.key || "") ? "transaction currency" : "home currency"})`],
    ["Generated", new Date(report.generatedAt).toLocaleString("en-AE")],
  ];
}

export function reportCsv(report: ReportExportData, company: string, inventory: string, rows = report.rows) {
  if (vatReportKeys.has(report.key || "")) inventory = "Company-wide · all inventories";
  const records: unknown[][] = [
    ...metadata(report, company, inventory),
    [],
    report.columns.map((column) => column.label),
    ...rows.map((row) => report.columns.map((column) => row[column.key] ?? "")),
  ];
  if (vendorReportKeys.has(report.key || "") || inventoryReportKeys.has(report.key || "") || purchaseReportKeys.has(report.key || "") || salesReportKeys.has(report.key || "") || vatReportKeys.has(report.key || "")) {
    const isVendor = vendorReportKeys.has(report.key || "");
    const isPurchase = purchaseReportKeys.has(report.key || "");
    const isSales = salesReportKeys.has(report.key || "");
    const isVat = vatReportKeys.has(report.key || "");
    const columnTotal = isVendor ? vendorColumnTotal : isVat ? vatColumnTotal : isSales ? salesColumnTotal : isPurchase ? purchaseColumnTotal : inventoryColumnTotal;
    if (!isVat || report.columns.some((column) => columnTotal(rows, column) !== null)) records.push(report.columns.map((column, index) => index === 0 ? (isPurchase || isSales || isVat || isVendor ? "Report total" : "Net total") : columnTotal(rows, column) ?? ""));
  }
  const overview = reportOverview(report, rows);
  if (overview) records.push([], ["Summary"], ...overview.cards.map((card) => [card.label, card.value, card.format === "money" ? report.currency : ""]), ["Basis", overview.note]);
  if (reportReviewIssues(report).length) records.push([], ["Account review"], ...reportReviewIssues(report).map(issue => [issue]));
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

export async function reportWorkbook(report: ReportExportData, company: string, inventory: string, rows = report.rows, orientation: PrintOrientation = "portrait") {
  if (vatReportKeys.has(report.key || "")) inventory = "Company-wide · all inventories";
  const { default: ExcelJS } = await import("exceljs");
  const book = new ExcelJS.Workbook();
  book.creator = "COMNET Enterprise Accounting";
  book.created = new Date(report.generatedAt);
  book.modified = new Date();
  const sheet = book.addWorksheet("Report", {
    views: [{ state: "frozen", ySplit: 9 }],
    pageSetup: { paperSize: 9, orientation, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
  });
  const columnCount = Math.max(1, report.columns.length);
  const isVendor = vendorReportKeys.has(report.key || "");
  const isInventory = inventoryReportKeys.has(report.key || "");
  const isPurchase = purchaseReportKeys.has(report.key || "");
  const isSales = salesReportKeys.has(report.key || "");
  const isVat = vatReportKeys.has(report.key || "");
  const isOperational = isInventory || isPurchase || isSales || isVat || isVendor;
  const genericKinds = new Map(report.columns.map(column => [column.key, reportColumnKind(column, rows)]));
  const columnKind = isVendor ? vendorColumnKind : isVat ? vatColumnKind : isSales ? salesColumnKind : isPurchase ? purchaseColumnKind : isInventory ? inventoryColumnKind : (column: ReportExportColumn) => genericKinds.get(column.key) ?? "text";
  const columnTotal = isVendor ? vendorColumnTotal : isVat ? vatColumnTotal : isSales ? salesColumnTotal : isPurchase ? purchaseColumnTotal : inventoryColumnTotal;
  sheet.addRow([company]);
  sheet.addRow([report.title]);
  sheet.addRow([`${inventory || "All inventories"} | ${report.period?.label || "Current report"}`]);
  sheet.addRow([`${report.key === "employee-balances" ? "Per employee (recorded currency)" : report.currency} ${isVendor ? "transaction currency" : "report currency"} | ${isVat && report.key === "vat-code-list" ? "Current VAT code register" : isSales && ["pending-sales", "sales-orders"].includes(report.key || "") ? "Document face values including VAT" : isPurchase && report.key?.includes("order") ? "Unposted commitments" : isVendor ? "Supplier document activity" : "Accrual basis"}`]);
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
    row.height = Math.max(24, ...report.columns.map((column) => {
      const width = widthFor(column);
      return Math.ceil(String(record[column.key] ?? "").length / Math.max(10, width - 5)) * 15 + 8;
    }));
    row.alignment = { vertical: "top", wrapText: true };
    if (index % 2 === 1) row.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: pale } }; });
    row.eachCell((cell) => { cell.border = { bottom: { style: "hair", color: { argb: border } } }; });
  });
  report.columns.forEach((column, index) => {
    const excelColumn = sheet.getColumn(index + 1);
    excelColumn.width = widthFor(column);
    if (columnKind(column) !== "text") {
      excelColumn.alignment = { horizontal: "right", vertical: "top", wrapText: true };
      if (column.type !== "money") excelColumn.numFmt = !isInventory ? '#,##0.######;[Red](#,##0.######);"0"' : '#,##0.##;[Red](#,##0.##);"0"';
    }
    if (column.type === "money") excelColumn.numFmt = '#,##0.00;[Red](#,##0.00);"-"';
  });
  sheet.autoFilter = { from: { row: 9, column: 1 }, to: { row: 9, column: columnCount } };
  sheet.pageSetup.printTitlesRow = "1:9";
  sheet.headerFooter.oddHeader = `&L${company.replaceAll("&", "&&")}&R${report.title.replaceAll("&", "&&")}`;
  sheet.headerFooter.oddFooter = `&L${reportDownloadDate()}&RPage &P of &N`;

  if (report.financial?.details?.length) {
    const detailKeys = ["date", "reference", "name", "account", "section", "currency", "amount"].filter((key) => report.financial!.details.some((row) => row[key] !== undefined));
    const detailLabels: Record<string, string> = { date: "Date", reference: "Reference", name: "Name", account: "Account", section: "Classification", currency: "Currency", amount: "Amount" };
    const detail = book.addWorksheet("Account detail", { views: [{ state: "frozen", ySplit: 1 }], pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "1:1" } });
    const detailHeader = detail.addRow(detailKeys.map((key) => detailLabels[key]));
    detailHeader.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navy } }; cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; });
    report.financial.details.forEach((record) => detail.addRow(detailKeys.map((key) => cellValue(record[key]))));
    detailKeys.forEach((key, index) => { detail.getColumn(index + 1).width = /name|account/.test(key) ? 36 : 20; if (key === "amount") detail.getColumn(index + 1).numFmt = '#,##0.00;[Red](#,##0.00);"-"'; });
    detail.eachRow(row => { row.alignment = { wrapText: true, vertical: "top" }; });
    detail.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: Math.max(1, detailKeys.length) } };
  }
  if (isOperational) {
    if (!isVat || report.columns.some((column) => columnTotal(rows, column) !== null)) {
      const total = sheet.addRow(report.columns.map((column, index) => index === 0 ? (isPurchase || isSales || isVat || isVendor ? "Report total" : "Net total") : columnTotal(rows, column) ?? ""));
      total.eachCell((cell) => { cell.font = { bold: true, color: { argb: navy } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5F4EC" } }; });
    }
  }
  const overview = reportOverview(report, rows);
  if (overview) {
    const summarySheet = book.addWorksheet(isVendor ? "Vendors summary" : isVat ? "VAT summary" : isSales ? "Sales summary" : isPurchase ? "Purchases summary" : isInventory ? "Inventory summary" : "Summary", { pageSetup: { paperSize: 9, orientation, fitToPage: true, fitToWidth: 1, fitToHeight: 1 } });
    summarySheet.columns = [{ width: 34 }, { width: 26 }, { width: 20 }];
    summarySheet.addRows([[company], [report.title], [inventory || "All inventories"], [!isInventory ? (report.period?.label || "Selected reporting period") : "Current stock snapshot", report.currency], [], ["Metric", "Value", "Currency / units"]]);
    overview.cards.forEach((card) => {
      const row = summarySheet.addRow([card.label, card.value, card.format === "money" ? report.currency : ""]);
      if (card.format === "money") row.getCell(2).numFmt = '#,##0.00;[Red](#,##0.00)';
    });
    summarySheet.addRow([]);
    const note = summarySheet.addRow([overview.note]);
    summarySheet.mergeCells(note.number, 1, note.number, 3); note.height = 65; note.alignment = { wrapText: true, vertical: "top" };
    summarySheet.getRow(1).font = { bold: true, size: 15 };
    summarySheet.getRow(6).eachCell((cell) => { cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navy } }; });
  }
  if (reportReviewIssues(report).length) {
    const review = book.addWorksheet("Account review", { pageSetup: { paperSize: 9, orientation, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    review.getColumn(1).width = 100;
    review.addRow([`${company} · ${report.title}`]).font = { bold: true, size: 13 };
    review.addRow(["Review account mapping before relying on classified totals."]).font = { bold: true };
    reportReviewIssues(report).forEach(issue => { const row = review.addRow([issue]); row.alignment = { wrapText: true, vertical: "top" }; row.height = Math.max(30, Math.ceil(issue.length / 95) * 16); });
  }
  return book.xlsx.writeBuffer();
}

function displayValue(value: string | number | null | undefined, money: boolean) {
  if (money && typeof value === "number") return value < 0 ? `(${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return String(value ?? "");
}

export async function reportPdf(report: ReportExportData, company: string, inventory: string, rows = report.rows, stamp?: { data: string; left: number; top: number }, orientation: PrintOrientation = "portrait") {
  if (vatReportKeys.has(report.key || "")) inventory = "Company-wide · all inventories";
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const pdf = new jsPDF({ orientation, format: "a4", unit: "mm" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const summary = reportOverview(report, rows);
  const brand = report.letterhead;
  const [leftLogo, rightLogo] = brand ? await Promise.all([brand.logo, brand.rightLogo].map((src) => src ? pngImage(src).catch(() => null) : Promise.resolve(null))) : [null, null];
  const brandColor = hexRgb(brand?.color ?? "");
  // Letterhead header in the same 38 mm band as the generic header, so the stamp guide and table positions are unchanged.
  const drawLetterhead = (letterhead: ReportLetterhead) => {
    const fit = (image: { width: number; height: number }, maxWidth: number, maxHeight: number) => { const scale = Math.min(maxWidth / image.width, maxHeight / image.height); return { width: image.width * scale, height: image.height * scale }; };
    if (leftLogo) { const size = fit(leftLogo, 75, 23); pdf.addImage(leftLogo.data, "PNG", 12, 5 + (23 - size.height) / 2, size.width, size.height); }
    else { pdf.setFont("helvetica", "bold"); pdf.setFontSize(16); pdf.setTextColor(...brandColor); pdf.text(letterhead.name, 12, 19, { maxWidth: pageWidth / 2 - 14 }); }
    const headingLines = [letterhead.heading, letterhead.subtitle].filter(Boolean) as string[];
    const rightHeight = headingLines.length ? 15 : 23;
    if (rightLogo) { const size = fit(rightLogo, 75, rightHeight); pdf.addImage(rightLogo.data, "PNG", pageWidth - 12 - size.width, 5 + (rightHeight - size.height) / 2, size.width, size.height); }
    pdf.setTextColor(...brandColor);
    headingLines.forEach((line, index) => { pdf.setFont("helvetica", "bold"); pdf.setFontSize(index === 0 ? 12 : 8.5); pdf.text(line, pageWidth - 12, (rightLogo ? 24 : 13) + index * 5, { align: "right", maxWidth: pageWidth / 2 - 14 }); });
    if (letterhead.contact.length) { pdf.setFont("helvetica", "bold"); pdf.setFontSize(8); pdf.setTextColor(36, 40, 45); pdf.text(letterhead.contact.join("     "), pageWidth / 2, 33, { align: "center", maxWidth: pageWidth - 24 }); }
    pdf.setDrawColor(156, 163, 175); pdf.setLineWidth(0.3); pdf.line(12, 36.5, pageWidth - 12, 36.5);
  };
  const drawHeader = () => {
    if (brand) return drawLetterhead(brand);
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
    pdf.text(`${inventory || "All inventories"} | ${report.period?.label || "Current report"} | ${report.key === "employee-balances" ? "Employee currencies" : `${report.currency} report currency`} | ${rows.length} records`, 12, 31, { maxWidth: pageWidth - 24 });
  };
  const isVendor = vendorReportKeys.has(report.key || "");
  const isInventory = inventoryReportKeys.has(report.key || "");
  const isPurchase = purchaseReportKeys.has(report.key || "");
  const isSales = salesReportKeys.has(report.key || "");
  const isVat = vatReportKeys.has(report.key || "");
  const isOperational = isInventory || isPurchase || isSales || isVat || isVendor;
  const genericKinds = new Map(report.columns.map(column => [column.key, reportColumnKind(column, rows)]));
  const columnKind = isVendor ? vendorColumnKind : isVat ? vatColumnKind : isSales ? salesColumnKind : isPurchase ? purchaseColumnKind : isInventory ? inventoryColumnKind : (column: ReportExportColumn) => genericKinds.get(column.key) ?? "text";
  const columnTotal = isVendor ? vendorColumnTotal : isVat ? vatColumnTotal : isSales ? salesColumnTotal : isPurchase ? purchaseColumnTotal : inventoryColumnTotal;
  const columnWeight = isVendor ? vendorColumnWeight : isVat ? vatColumnWeight : isSales ? salesColumnWeight : isPurchase ? purchaseColumnWeight : isInventory ? inventoryColumnWeight : (column: ReportExportColumn) => genericKinds.get(column.key) !== "text" ? 1.6 : reportColumnWeight(column);
  let tableStart = summary ? 67 : 44;
  if (summary) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(16, 32, 51);
    pdf.text(brand ? "Statement of Account" : "Summary", pageWidth / 2, 43, { align: "center" });
    const gap = 3;
    const summaryColumns = Math.max(1, Math.min(3, summary.cards.length));
    const cardWidth = (pageWidth - 20 - gap * (summaryColumns - 1)) / summaryColumns;
    summary.cards.forEach((card, index) => {
      const x = 10 + (index % summaryColumns) * (cardWidth + gap);
      const y = 47 + Math.floor(index / summaryColumns) * 18;
      pdf.setFillColor(244, 247, 250);
      pdf.setDrawColor(215, 222, 231);
      pdf.roundedRect(x, y, cardWidth, 15, 1.5, 1.5, "FD");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(6.5);
      pdf.setTextColor(90, 104, 119);
      pdf.text(card.label.toUpperCase(), x + 2.5, y + 5, { maxWidth: cardWidth - 5 });
      pdf.setFontSize(9);
      pdf.setTextColor(card.tone === "negative" ? 190 : card.tone === "positive" ? 4 : 15, card.tone === "negative" ? 24 : card.tone === "positive" ? 120 : 23, card.tone === "negative" ? 60 : card.tone === "positive" ? 87 : 42);
      const value = card.format === "money" ? `${report.currency} ${displayValue(card.value, true)}` : typeof card.value === "number" ? card.value.toLocaleString("en-AE", { maximumFractionDigits: isPurchase || isSales || isVat || isVendor ? 6 : 3 }) : card.value;
      pdf.text(value, x + 2.5, y + 11.5, { maxWidth: cardWidth - 5 });
    });
    tableStart = 47 + Math.ceil(summary.cards.length / summaryColumns) * 18 + 3;
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(7); pdf.setTextColor(90, 104, 119);
    const note = pdf.splitTextToSize(brand?.note ?? summary.note, pageWidth - 20);
    pdf.text(note, 10, tableStart); tableStart += note.length * 3.2 + 4;
  }
  const inventoryWeight = report.columns.reduce((total, column) => total + columnWeight(column), 0);
  autoTable(pdf, {
    startY: tableStart,
    margin: { top: 44, bottom: 17, left: 10, right: 10 },
    head: [report.columns.map((column) => column.label)],
    body: rows.map((row) => report.columns.map((column) => columnKind(column) === "quantity" && typeof row[column.key] === "number" ? Number(row[column.key]).toLocaleString("en-US", { maximumFractionDigits: 6 }) : displayValue(row[column.key], column.type === "money"))),
    theme: "grid",
    styles: { font: "helvetica", fontSize: report.columns.length > 8 ? 6.5 : 8, cellPadding: 2.2, overflow: "linebreak", lineColor: [215, 222, 231], lineWidth: 0.15, textColor: [28, 43, 58] },
    headStyles: { fillColor: brand ? [234, 242, 245] : [16, 32, 51], textColor: brand ? [23, 43, 64] : [255, 255, 255], fontStyle: "bold", valign: "middle", ...(isVat || isVendor ? { cellPadding: 1 } : {}) },
    alternateRowStyles: { fillColor: [244, 247, 250] },
    columnStyles: Object.fromEntries(report.columns.map((column, index) => [index, { halign: columnKind(column) === "text" ? "left" : "right", cellWidth: (pageWidth - 20) * columnWeight(column) / inventoryWeight }])),
    foot: isOperational && rows.length && (!isVat || report.columns.some((column) => columnTotal(rows, column) !== null)) ? [report.columns.map((column, index) => index === 0 ? (isPurchase || isSales || isVat || isVendor ? "Report total" : "Net total") : displayValue(columnTotal(rows, column), column.type === "money"))] : undefined,
    showFoot: "lastPage",
    rowPageBreak: "avoid",
    footStyles: { fillColor: [229, 244, 236], textColor: [16, 32, 51], fontStyle: "bold" },
    didParseCell: (cell) => {
      if (cell.section === "head") return;
      const column = report.columns[cell.column.index];
      if (!column || (columnKind(column) === "text" && !["date", "dueDate"].includes(column.key) && !(isVat && column.key === "code"))) return;
      cell.cell.styles.cellPadding = 1;
      const width = (pageWidth - 20) * columnWeight(column) / inventoryWeight - 2;
      pdf.setFont("helvetica", cell.cell.styles.fontStyle);
      pdf.setFontSize(cell.cell.styles.fontSize);
      const textWidth = pdf.getTextWidth(cell.cell.text.join(" "));
      if (textWidth > width) cell.cell.styles.fontSize *= width / textWidth;
    },
    didDrawPage: drawHeader,
  });
  if (reportReviewIssues(report).length) {
    const lastY = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
    autoTable(pdf, { startY: lastY + 7, margin: { top: 44, bottom: 17, left: 10, right: 10 }, head: [["Account review - review before relying on classified totals"]], body: reportReviewIssues(report).map(issue => [issue]), styles: { font: "helvetica", fontSize: 8, cellPadding: 3, overflow: "linebreak" }, headStyles: { fillColor: [120, 75, 20] }, rowPageBreak: "avoid", didDrawPage: drawHeader });
  }
  let contentBottom = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  for (const box of report.bankBoxes ?? []) {
    // Bank details box after the table, at the chosen left offset, moving to a new page when it does not fit.
    const width = 80, lineHeight = 3.6;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    const remark = box.remark ? pdf.splitTextToSize(box.remark, width - 6) as string[] : [];
    const height = 5 + (box.lines.length + 1) * lineHeight + (remark.length ? remark.length * lineHeight + 1.5 : 0);
    let top = contentBottom + 8;
    if (top + height > pageHeight - 18) { pdf.addPage(); drawHeader(); top = 46; }
    const left = Math.max(10, Math.min(pageWidth - 10 - width, 10 + box.left));
    pdf.setDrawColor(148, 163, 184);
    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(left, top, width, height, 1, 1, "FD");
    let y = top + 5;
    pdf.setTextColor(15, 23, 42);
    pdf.setFont("helvetica", "bold");
    pdf.text(box.title.toUpperCase(), left + 3, y);
    pdf.setFont("helvetica", "normal");
    for (const line of box.lines) { y += lineHeight; pdf.text(line, left + 3, y, { maxWidth: width - 6 }); }
    if (remark.length) { y += 1.5; pdf.setTextColor(185, 28, 28); for (const line of remark) { y += lineHeight; pdf.text(line, left + 3, y); } }
    contentBottom = top + height;
  }
  if (stamp?.data) {
    const stampImage = await pngImage(stamp.data).catch(() => { throw new Error("Could not read the company stamp."); });
    const scale = Math.min(32 / stampImage.width, 23 / stampImage.height);
    const placement = reportStampAfterTable(pageHeight, contentBottom, stamp.top, stampImage.height * scale);
    if (placement.newPage) { pdf.addPage(); drawHeader(); }
    pdf.addImage(stampImage.data, "PNG", Math.max(0, Math.min(pageWidth - stampImage.width * scale, stamp.left)), placement.top, stampImage.width * scale, stampImage.height * scale);
  }
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    if (brand) {
      // Letterhead footer: its text and company lines centred under a line in the letterhead colour, page number on the right.
      pdf.setDrawColor(...brandColor); pdf.setLineWidth(0.4); pdf.line(10, pageHeight - 13, pageWidth - 10, pageHeight - 13);
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(7); pdf.setTextColor(71, 85, 105);
      const lines = brand.footer.flatMap((line) => pdf.splitTextToSize(line, pageWidth - 60) as string[]).slice(0, 3);
      lines.forEach((line, index) => pdf.text(line, pageWidth / 2, pageHeight - 9 + index * 3.2, { align: "center" }));
      pdf.setFont("helvetica", "normal"); pdf.text(`Page ${page} of ${pages}`, pageWidth - 10, pageHeight - 9, { align: "right" });
      continue;
    }
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
