import type { StaffSalaryRecord } from "./staff-salary-sheet";
import { staffSalaryTotals } from "./staff-salary-sheet";
import { defaultLetterhead, letterheadFooterLines, letterheadForDocument } from "./letterhead";

export async function staffSalaryPdf(record: StaffSalaryRecord, print = false, orientation: "portrait" | "landscape" = "landscape") {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const pdf = new jsPDF({ orientation, unit: "mm", format: "a4" });
  // Page geometry: landscape keeps the original 297 × 210 mm layout; portrait scales widths to the 210 mm page.
  const pageWidth = pdf.internal.pageSize.getWidth(), pageHeight = pdf.internal.pageSize.getHeight(), center = pageWidth / 2, right = pageWidth - 12;
  const columnScale = (pageWidth - 24) / 273;
  const column = (width: number) => width * columnScale;
  const { data, letterhead: company } = record;
  const assigned = letterheadForDocument(company.letterheadDesign, "staff-salary-sheet");
  const template = assigned ?? { ...defaultLetterhead(), color: company.documentColor || "#164e63" };
  // The assigned letterhead's footer prints at the bottom of every page, above the page number.
  const footerLines = assigned && assigned.showFooter !== false ? [assigned.footer, ...letterheadFooterLines(assigned, company)].flatMap((line) => line ? line.split("\n") : []).slice(0, 5) : [];
  const footerHeight = footerLines.length ? footerLines.length * 3.6 + 4 : 0;
  const color = /^#[a-f0-9]{6}$/i.test(template.color) ? template.color : "#164e63";
  const amount = (value: number) => value.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const totals = staffSalaryTotals(data);
  pdf.setFontSize(11);
  const titleLines: string[] = pdf.splitTextToSize(data.title, pageWidth - 67);
  const brandingExtra = (template.heading ? 5 : 0) + (template.subtitle ? 4 : 0);
  const tableTop = 63 + brandingExtra + Math.max(0, titleLines.length - 1) * 5;
  const image = (src: string, x: number) => { if (!src) return; try { const props = pdf.getImageProperties(src); const scale = Math.min(35 / props.width, 17 / props.height); pdf.addImage(src, x, 9, props.width * scale, props.height * scale); } catch { /* Company name remains visible for unsupported images. */ } };
  const header = () => {
    if (template.showLogo) image(company.logoData, 12);
    if (template.showRightLogo) image(company.rightLogoData, pageWidth - 47);
    pdf.setFont("helvetica", "bold"); pdf.setTextColor(color); pdf.setFontSize(13);
    pdf.text(pdf.splitTextToSize(company.name, Math.min(190, pageWidth - 96)).slice(0, 2), center, 13, { align: "center" });
    pdf.setFontSize(8); pdf.setFont("helvetica", "normal"); pdf.setTextColor(60);
    let brandY = 21;
    // The letterhead's heading and subtitle print in its colour, like the letterhead page.
    pdf.setTextColor(color);
    if (template.heading) { pdf.setFont("helvetica", "bold"); pdf.setFontSize(10); pdf.text(template.heading, center, brandY, { align: "center", maxWidth: Math.min(190, pageWidth - 96) }); brandY += 5; }
    if (template.subtitle) { pdf.setFont("helvetica", "bold"); pdf.setFontSize(8); pdf.text(template.subtitle, center, brandY, { align: "center", maxWidth: Math.min(190, pageWidth - 96) }); }
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); pdf.setTextColor(60);
    const address = [company.addressLine1, company.addressLine2, company.city, company.country].filter(Boolean).join(", ");
    pdf.text(pdf.splitTextToSize(address, Math.min(200, pageWidth - 96)).slice(0, 2), center, 24 + brandingExtra, { align: "center" });
    if (template.headerContact !== false) pdf.text([company.phone, company.email, template.website].filter(Boolean).join(" | "), center, 33 + brandingExtra, { align: "center", maxWidth: pageWidth - 27 });
    pdf.setDrawColor(color); pdf.line(12, 36 + brandingExtra, right, 36 + brandingExtra);
    pdf.setFontSize(11); pdf.setFont("helvetica", "bold"); pdf.setTextColor(20); pdf.text(titleLines, 12, 42 + brandingExtra);
    pdf.setFontSize(8); pdf.setFont("helvetica", "normal");
    pdf.text(`Ref. No.: ${data.referenceNo || "-"}`, 12, tableTop - 15, { maxWidth: pageWidth - 27 });
    pdf.text(`Salary month: ${data.month}     Start: ${data.startDate}     End: ${data.endDate}`, 12, tableTop - 10);
    pdf.text(`Company code: ${data.companyCode || "-"}     Tel./Mob.: ${data.phone || company.phone || "-"}`, 12, tableTop - 5, { maxWidth: pageWidth - 27 });
  };
  autoTable(pdf, { tableWidth: pdf.internal.pageSize.getWidth() - 24, startY: tableTop, margin: { top: tableTop, left: 12, right: 12, bottom: 17 + footerHeight }, theme: "grid", styles: { font: "helvetica", fontSize: 7.5, cellPadding: 1.2, textColor: 20, lineColor: [180, 190, 200], overflow: "linebreak" }, headStyles: { fillColor: color, textColor: 255, fontStyle: "bold" }, columnStyles: { 0: { cellWidth: column(12) }, 1: { cellWidth: column(80) }, 2: { cellWidth: column(32) }, 3: { cellWidth: column(25) }, 4: { cellWidth: column(32) }, 5: { cellWidth: column(58) }, 6: { cellWidth: column(34), halign: "right" } }, head: [["Sl. No.", "Employee name", "Emp. personal no.", "Card details", "Bank name", "IBAN", `Salary (${data.currency})`]], body: data.lines.map((line, index) => [index + 1, line.name, line.personalNumber, line.cardDetails, line.bankName, line.iban, amount(line.salary)]), foot: [
    [{ content: `Service charges: ${data.lines.length} employees · Service fee per employee: ${amount(data.serviceFee)}`, colSpan: 6 }, ""],
    [{ content: `TOTAL ${data.currency}`, colSpan: 6 }, amount(totals.salary)],
    [{ content: "CHARGES", colSpan: 6 }, amount(totals.charges)],
    [{ content: "GRAND TOTAL", colSpan: 6 }, amount(totals.grandTotal)],
    ...(data.notes ? [[{ content: data.notes, colSpan: 7 }]] : []),
  ], footStyles: { fillColor: [240, 245, 248], textColor: 20, fontStyle: "bold", halign: "right" }, showFoot: "lastPage", rowPageBreak: "avoid", didDrawPage: header });
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages && footerLines.length; page++) {
    pdf.setPage(page);
    const top = pageHeight - 12 - (footerLines.length - 1) * 3.6;
    pdf.setDrawColor(color); pdf.line(12, top - 4, right, top - 4);
    footerLines.forEach((line, index) => {
      pdf.setFont("helvetica", index === 0 && assigned?.footer ? "bold" : "normal"); pdf.setFontSize(index === 0 && assigned?.footer ? 8 : 7.5);
      pdf.setTextColor(index === 0 && assigned?.footer ? color : "#475569");
      pdf.text(line, center, top + index * 3.6, { align: "center", maxWidth: pageWidth - 37 });
    });
  }
  for (let page = 1; page <= pages; page++) { pdf.setPage(page); pdf.setFont("helvetica", "normal"); pdf.setFontSize(7); pdf.setTextColor(90); pdf.text(`Salary sheet ${record.id ? `HR-${record.id}` : "preview"}  |  Page ${page} of ${pages}`, right, pageHeight - 8, { align: "right" }); }
  if (print) pdf.autoPrint();
  return pdf.output("blob");
}
