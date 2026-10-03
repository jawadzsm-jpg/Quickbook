import type { PnlReport } from "./profit-loss";
import type { PrintOrientation } from "./document-print";
import { pnlAmount, pnlSummary } from "./pnl-presentation";

export const csvValue = (value: string | number) => typeof value === "number" ? String(value) : `"${(/^[\s\u0000-\u001f]*[=+@-]/.test(value) ? "'" + value : value).replaceAll('"', '""')}"`;
export function pnlCsv(report: PnlReport, company: string) {
  const records: (string | number)[][] = [[company], [report.title], [`${report.pnl.from || "Beginning"} to ${report.pnl.to || "Latest posting"}`, report.pnl.location, report.currency, "Accrual basis"], [], report.columns.map(c => c.label), ...report.rows.map(r => report.columns.map(c => r[c.key] ?? "")), [], ["Classified ledger summary", report.currency], ...pnlSummary(report).map(card => [card.label, card.value]), [], ["Reporting notes"], [report.description], ...report.pnl.warnings.map(warning => ["Review", warning])];
  return "\uFEFF" + records.map(r => r.map(csvValue).join(",")).join("\r\n");
}
export async function pnlWorkbook(report: PnlReport, company: string, orientation: PrintOrientation = "portrait") {
  const { default: ExcelJS } = await import("exceljs");
  const book = new ExcelJS.Workbook(); book.creator = "COMNET Enterprise Accounting"; book.created = new Date(report.generatedAt);
  const sheet = book.addWorksheet("Profit and Loss", { views: [{ state: "frozen", ySplit: 5 }], pageSetup: { paperSize: 9, orientation, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const width = report.columns.length;
  [company, report.title, `${report.pnl.from || "Beginning"} to ${report.pnl.to || "Latest posting"} · ${report.pnl.location}`, `${report.currency} · Accrual basis · Generated ${report.generatedAt}`].forEach((text, i) => { sheet.addRow([text]); sheet.mergeCells(i + 1, 1, i + 1, width); });
  sheet.getRow(1).font = { bold: true, size: 16, color: { argb: "FF102033" } };
  sheet.getRow(2).font = { bold: true, size: 13 };
  const header = sheet.addRow(report.columns.map(c => c.label)); header.height = 36; header.alignment = { wrapText: true, vertical: "middle" };
  header.eachCell(c => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF102033" } }; c.font = { bold: true, color: { argb: "FFFFFFFF" } }; });
  report.rows.forEach(r => { const row = sheet.addRow(report.columns.map(c => r[c.key] ?? "")); row.alignment = { wrapText: true, vertical: "top" }; if (r.kind) row.font = { bold: true }; if (r.kind === "total") row.eachCell(c => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } }; }); });
  report.columns.forEach((c, i) => { sheet.getColumn(i + 1).width = i === 0 ? 46 : c.type === "money" ? 21 : 24; if (c.type === "money") sheet.getColumn(i + 1).numFmt = '#,##0.00;[Red](#,##0.00);"–"'; });
  sheet.pageSetup.printTitlesRow = "1:5";
  sheet.pageSetup.printArea = `A1:${sheet.getColumn(width).letter}${sheet.rowCount}`;
  report.columns.forEach((column, index) => { if (column.type === "money") sheet.getColumn(index + 1).alignment = { horizontal: "right", vertical: "top", wrapText: true }; });
  sheet.headerFooter.oddFooter = "&L" + company.replaceAll("&", "&&") + "&RPage &P of &N";
  const detail = book.addWorksheet("Ledger detail", { views: [{ state: "frozen", ySplit: 1 }], pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "1:1" } });
  detail.addRow(["Date", "Reference", "Account", "Classification", "Inventory", "Sales rep", "Income", "Cost of sales", "Other expenses"]);
  report.pnl.details.forEach(r => detail.addRow([r.date, r.reference, r.account, r.type, r.location, r.salesman, r.income, r.cost, r.expenses]));
  detail.columns.forEach((c, i) => { c.width = i === 2 ? 40 : 23; if (i >= 6) c.numFmt = "#,##0.00;[Red](#,##0.00)"; });
  detail.getRow(1).font = { bold: true };
  detail.eachRow(row => { row.alignment = { wrapText: true, vertical: "top" }; });
  detail.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, detail.rowCount), column: 9 } };
  const summary = book.addWorksheet("Summary & review", { pageSetup: { paperSize: 9, orientation, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  summary.columns = [{ width: 32 }, { width: 72 }];
  summary.addRow([company, report.title]);
  summary.addRow(["Reporting period", `${report.pnl.from || "Beginning"} to ${report.pnl.to || "Latest posting"}`]);
  summary.addRow(["Scope", `${report.pnl.location} · ${report.currency} · Accrual basis`]);
  summary.addRow([]);
  pnlSummary(report).forEach(card => { const row = summary.addRow([card.label, card.value]); row.font = { bold: true }; row.getCell(2).numFmt = '#,##0.00;[Red](#,##0.00)'; });
  summary.addRow([]);
  summary.addRow(["Reporting basis", report.description]);
  report.pnl.warnings.forEach(warning => summary.addRow(["Review", warning]));
  summary.eachRow(row => { row.alignment = { wrapText: true, vertical: "top" }; row.height = Math.max(25, Math.ceil(String(row.getCell(2).value ?? "").length / 65) * 16); });
  summary.getRow(1).font = { bold: true, size: 13 };
  summary.headerFooter.oddFooter = "&L" + company.replaceAll("&", "&&") + "&RPage &P of &N";
  return book.xlsx.writeBuffer();
}
export async function pnlPdf(report: PnlReport, company: string, stamp?: { data: string; left: number; top: number }, orientation: PrintOrientation = "portrait") {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const pdf = new jsPDF({ orientation, format: "a4", unit: "mm" });
  const width = pdf.internal.pageSize.getWidth(); const height = pdf.internal.pageSize.getHeight();
  const number = pnlAmount;
  const head = () => {
    pdf.setFillColor(16, 32, 51); pdf.rect(0, 0, width, 34, "F"); pdf.setTextColor(255); pdf.setFontSize(13); pdf.text(company, 12, 10, { maxWidth: width - 24 }); pdf.setFontSize(16); pdf.text(report.title, 12, 20); pdf.setFontSize(8); pdf.text(`${report.pnl.from || "Beginning"} to ${report.pnl.to || "Latest posting"} | ${report.pnl.location} | ${report.currency} | Accrual basis`, 12, 29, { maxWidth: width - 24 });
  };
  autoTable(pdf, { startY: 40, margin: { top: 40, bottom: 18, left: 12, right: 12 }, head: [pnlSummary(report).map(card => card.label)], body: [pnlSummary(report).map(card => `${number(card.value)} ${report.currency}`)], theme: "grid", styles: { fontSize: 10, cellPadding: 3, halign: "right" }, headStyles: { fillColor: [235, 245, 240], textColor: [30, 70, 55], fontSize: 8 }, didDrawPage: head });
  const lastY = () => (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  autoTable(pdf, { startY: lastY() + 7, margin: { top: 40, bottom: 18, left: 12, right: 12 }, head: [report.columns.map(c => c.label)], body: report.rows.map(r => report.columns.map(c => typeof r[c.key] === "number" && c.type === "money" ? number(Number(r[c.key])) : String(r[c.key] ?? ""))), styles: { fontSize: 8, cellPadding: 2.5, overflow: "linebreak" }, headStyles: { fillColor: [16, 32, 51] }, alternateRowStyles: { fillColor: [245, 248, 250] }, columnStyles: Object.fromEntries(report.columns.map((c, i) => [i, c.type === "money" ? { halign: "right" } : {}])), didParseCell: d => { if (d.section === "body" && report.rows[d.row.index]?.kind) { d.cell.styles.fontStyle = "bold"; d.cell.styles.fillColor = report.rows[d.row.index].kind === "total" ? [209, 250, 229] : [232, 238, 242]; } }, didDrawPage: head });
  autoTable(pdf, { startY: lastY() + 7, margin: { top: 40, bottom: 18, left: 12, right: 12 }, head: [["Reporting notes & review"]], body: [[report.description], ...report.pnl.warnings.map(warning => [warning])], styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak" }, headStyles: { fillColor: [235, 245, 240], textColor: [30, 70, 55] }, bodyStyles: { textColor: [60, 70, 65] }, didDrawPage: head });
  if (stamp?.data) {
    const image = await new Promise<{ data: string; width: number; height: number }>((resolve, reject) => {
      const source = new Image();
      source.onload = () => {
        try {
          const canvas = document.createElement("canvas"); canvas.width = source.naturalWidth; canvas.height = source.naturalHeight;
          const context = canvas.getContext("2d"); if (!context) throw new Error("Could not prepare the company stamp.");
          context.drawImage(source, 0, 0); resolve({ data: canvas.toDataURL("image/png"), width: source.naturalWidth, height: source.naturalHeight });
        } catch (error) { reject(error); }
      };
      source.onerror = () => reject(new Error("Could not read the company stamp.")); source.src = stamp.data;
    });
    const scale = Math.min(32 / image.width, 23 / image.height);
    pdf.setPage(1);
    pdf.addImage(image.data, "PNG", Math.max(0, Math.min(width - image.width * scale, stamp.left)), Math.max(0, Math.min(height - image.height * scale, stamp.top)), image.width * scale, image.height * scale);
  }
  for (let page = 1; page <= pdf.getNumberOfPages(); page++) { pdf.setPage(page); pdf.setTextColor(95); pdf.setFontSize(8); pdf.text(`Generated ${report.generatedAt.slice(0, 16).replace("T", " ")} UTC`, 12, height - 8); pdf.text(`Page ${page} of ${pdf.getNumberOfPages()}`, width - 12, height - 8, { align: "right" }); }
  return pdf.output("arraybuffer");
}
