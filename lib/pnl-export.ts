import type { PnlReport } from "./profit-loss";

export const csvValue = (value: string | number) => typeof value === "number" ? String(value) : `"${(/^[\s\u0000-\u001f]*[=+@-]/.test(value) ? "'" + value : value).replaceAll('"', '""')}"`;
export function pnlCsv(report: PnlReport, company: string) {
  const records: (string | number)[][] = [[company], [report.title], [`${report.pnl.from || "Beginning"} to ${report.pnl.to || "Latest posting"}`, report.pnl.location, report.currency, "Accrual basis"], [report.description], ...report.pnl.warnings.map(w => [w]), [], report.columns.map(c => c.label), ...report.rows.map(r => report.columns.map(c => r[c.key] ?? ""))];
  return "\uFEFF" + records.map(r => r.map(csvValue).join(",")).join("\r\n");
}
export async function pnlWorkbook(report: PnlReport, company: string) {
  const { default: ExcelJS } = await import("exceljs");
  const book = new ExcelJS.Workbook(); book.creator = "COMNET Enterprise Accounting"; book.created = new Date(report.generatedAt);
  const sheet = book.addWorksheet("Profit and Loss", { views: [{ state: "frozen", ySplit: 5 }], pageSetup: { paperSize: 9, orientation: report.columns.length > 4 ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const width = report.columns.length;
  [company, report.title, `${report.pnl.from || "Beginning"} to ${report.pnl.to || "Latest posting"} · ${report.pnl.location}`, `${report.currency} · Accrual basis · Generated ${report.generatedAt}`].forEach((text, i) => { sheet.addRow([text]); sheet.mergeCells(i + 1, 1, i + 1, width); });
  sheet.getRow(1).font = { bold: true, size: 16, color: { argb: "FF102033" } };
  sheet.getRow(2).font = { bold: true, size: 13 };
  const header = sheet.addRow(report.columns.map(c => c.label)); header.height = 36; header.alignment = { wrapText: true, vertical: "middle" };
  header.eachCell(c => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF102033" } }; c.font = { bold: true, color: { argb: "FFFFFFFF" } }; });
  report.rows.forEach(r => { const row = sheet.addRow(report.columns.map(c => r[c.key] ?? "")); row.alignment = { wrapText: true, vertical: "top" }; if (r.kind) row.font = { bold: true }; if (r.kind === "total") row.eachCell(c => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } }; }); });
  report.columns.forEach((c, i) => { sheet.getColumn(i + 1).width = i === 0 ? 46 : c.type === "money" ? 21 : 24; if (c.type === "money") sheet.getColumn(i + 1).numFmt = '#,##0.00;[Red](#,##0.00);"–"'; });
  sheet.pageSetup.printTitlesRow = "1:5";
  sheet.headerFooter.oddFooter = "&L" + company.replaceAll("&", "&&") + "&RPage &P of &N";
  const notes = book.addWorksheet("Basis and account checks"); notes.getColumn(1).width = 120;
  [report.description, ...report.pnl.warnings].forEach(n => { const r = notes.addRow([n]); r.alignment = { wrapText: true }; r.height = Math.max(30, Math.ceil(n.length / 110) * 16); });
  const detail = book.addWorksheet("Ledger detail");
  detail.addRow(["Date", "Reference", "Account", "Classification", "Inventory", "Sales rep", "Income", "Cost of sales", "Other expenses"]);
  report.pnl.details.forEach(r => detail.addRow([r.date, r.reference, r.account, r.type, r.location, r.salesman, r.income, r.cost, r.expenses]));
  detail.columns.forEach((c, i) => { c.width = i === 2 ? 40 : 23; if (i >= 6) c.numFmt = "#,##0.00;[Red](#,##0.00)"; });
  detail.getRow(1).font = { bold: true };
  return book.xlsx.writeBuffer();
}
export async function pnlPdf(report: PnlReport, company: string) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const pdf = new jsPDF({ orientation: report.columns.length > 4 ? "landscape" : "portrait", format: "a4", unit: "mm" });
  const width = pdf.internal.pageSize.getWidth(); const height = pdf.internal.pageSize.getHeight();
  const number = (n: number) => n < 0 ? `(${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const head = () => {
    pdf.setFillColor(16, 32, 51); pdf.rect(0, 0, width, 34, "F"); pdf.setTextColor(255); pdf.setFontSize(13); pdf.text(company, 12, 10, { maxWidth: width - 24 }); pdf.setFontSize(16); pdf.text(report.title, 12, 20); pdf.setFontSize(8); pdf.text(`${report.pnl.from || "Beginning"} to ${report.pnl.to || "Latest posting"} | ${report.pnl.location} | ${report.currency} | Accrual basis`, 12, 29, { maxWidth: width - 24 });
  };
  autoTable(pdf, { startY: 40, margin: { top: 40, bottom: 18, left: 12, right: 12 }, head: [report.columns.map(c => c.label)], body: report.rows.map(r => report.columns.map(c => typeof r[c.key] === "number" && c.type === "money" ? number(Number(r[c.key])) : String(r[c.key] ?? ""))), styles: { fontSize: 8, cellPadding: 2.5, overflow: "linebreak" }, headStyles: { fillColor: [16, 32, 51] }, alternateRowStyles: { fillColor: [245, 248, 250] }, columnStyles: Object.fromEntries(report.columns.map((c, i) => [i, c.type === "money" ? { halign: "right" } : {}])), didParseCell: d => { if (d.section === "body" && report.rows[d.row.index]?.kind) { d.cell.styles.fontStyle = "bold"; d.cell.styles.fillColor = report.rows[d.row.index].kind === "total" ? [209, 250, 229] : [232, 238, 242]; } }, didDrawPage: head });
  pdf.addPage(); head();
  autoTable(pdf, { startY: 40, margin: { top: 40, bottom: 18, left: 12, right: 12 }, head: [["Report basis and account checks"]], body: [[report.description], ...(report.pnl.warnings.length ? report.pnl.warnings.map(w => [w]) : [["No missing or ambiguous account matches found in this report period."]])], styles: { fontSize: 9, cellPadding: 3 }, headStyles: { fillColor: [16, 32, 51] }, didDrawPage: head });
  for (let page = 1; page <= pdf.getNumberOfPages(); page++) { pdf.setPage(page); pdf.setTextColor(95); pdf.setFontSize(8); pdf.text(`Generated ${report.generatedAt.slice(0, 16).replace("T", " ")} UTC`, 12, height - 8); pdf.text(`Page ${page} of ${pdf.getNumberOfPages()}`, width - 12, height - 8, { align: "right" }); }
  return pdf.output("arraybuffer");
}
