import type { StaffSalaryRecord } from "./staff-salary-sheet";
import { staffSalaryTotals } from "./staff-salary-sheet";
import { defaultLetterhead, letterheadForDocument } from "./letterhead";

export async function staffSalaryPdf(record: StaffSalaryRecord, print = false) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const { data, letterhead: company } = record;
  const template = letterheadForDocument(company.letterheadDesign, "staff-salary-sheet") ?? { ...defaultLetterhead(), color: company.documentColor || "#164e63" };
  const color = /^#[a-f0-9]{6}$/i.test(template.color) ? template.color : "#164e63";
  const amount = (value: number) => value.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const totals = staffSalaryTotals(data);
  pdf.setFontSize(11);
  const titleLines: string[] = pdf.splitTextToSize(data.title, 230);
  const brandingExtra = (template.heading ? 5 : 0) + (template.subtitle ? 4 : 0);
  const tableTop = 63 + brandingExtra + Math.max(0, titleLines.length - 1) * 5;
  const image = (src: string, x: number) => { if (!src) return; try { const props = pdf.getImageProperties(src); const scale = Math.min(35 / props.width, 17 / props.height); pdf.addImage(src, x, 9, props.width * scale, props.height * scale); } catch { /* Company name remains visible for unsupported images. */ } };
  const header = () => {
    if (template.showLogo) image(company.logoData, 12);
    if (template.showRightLogo) image(company.rightLogoData, 250);
    pdf.setFont("helvetica", "bold"); pdf.setTextColor(color); pdf.setFontSize(13);
    pdf.text(pdf.splitTextToSize(company.name, 190).slice(0, 2), 148.5, 13, { align: "center" });
    pdf.setFontSize(8); pdf.setFont("helvetica", "normal"); pdf.setTextColor(60);
    let brandY = 21;
    if (template.heading) { pdf.text(template.heading, 148.5, brandY, { align: "center", maxWidth: 190 }); brandY += 5; }
    if (template.subtitle) pdf.text(template.subtitle, 148.5, brandY, { align: "center", maxWidth: 190 });
    const address = [company.addressLine1, company.addressLine2, company.city, company.country].filter(Boolean).join(", ");
    pdf.text(pdf.splitTextToSize(address, 200).slice(0, 2), 148.5, 24 + brandingExtra, { align: "center" });
    pdf.text([company.phone, company.email, template.website].filter(Boolean).join(" | "), 148.5, 33 + brandingExtra, { align: "center", maxWidth: 270 });
    pdf.setDrawColor(color); pdf.line(12, 36 + brandingExtra, 285, 36 + brandingExtra);
    pdf.setFontSize(11); pdf.setFont("helvetica", "bold"); pdf.setTextColor(20); pdf.text(titleLines, 12, 42 + brandingExtra);
    pdf.setFontSize(8); pdf.setFont("helvetica", "normal");
    pdf.text(`Ref. No.: ${data.referenceNo || "-"}`, 12, tableTop - 15, { maxWidth: 270 });
    pdf.text(`Salary month: ${data.month}     Start: ${data.startDate}     End: ${data.endDate}`, 12, tableTop - 10);
    pdf.text(`Company code: ${data.companyCode || "-"}     Tel./Mob.: ${data.phone || company.phone || "-"}`, 12, tableTop - 5, { maxWidth: 270 });
  };
  autoTable(pdf, { tableWidth: pdf.internal.pageSize.getWidth() - 24, startY: tableTop, margin: { top: tableTop, left: 12, right: 12, bottom: 17 }, theme: "grid", styles: { font: "helvetica", fontSize: 7.5, cellPadding: 1.2, textColor: 20, lineColor: [180, 190, 200], overflow: "linebreak" }, headStyles: { fillColor: color, textColor: 255, fontStyle: "bold" }, columnStyles: { 0: { cellWidth: 12 }, 1: { cellWidth: 80 }, 2: { cellWidth: 32 }, 3: { cellWidth: 25 }, 4: { cellWidth: 32 }, 5: { cellWidth: 58 }, 6: { cellWidth: 34, halign: "right" } }, head: [["Sl. No.", "Employee name", "Emp. personal no.", "Card details", "Bank name", "IBAN", `Salary (${data.currency})`]], body: data.lines.map((line, index) => [index + 1, line.name, line.personalNumber, line.cardDetails, line.bankName, line.iban, amount(line.salary)]), foot: [
    [{ content: `Service charges: ${data.lines.length} employees · Service fee per employee: ${amount(data.serviceFee)}`, colSpan: 6 }, ""],
    [{ content: `TOTAL ${data.currency}`, colSpan: 6 }, amount(totals.salary)],
    [{ content: "CHARGES", colSpan: 6 }, amount(totals.charges)],
    [{ content: "GRAND TOTAL", colSpan: 6 }, amount(totals.grandTotal)],
    ...(data.notes ? [[{ content: data.notes, colSpan: 7 }]] : []),
  ], footStyles: { fillColor: [240, 245, 248], textColor: 20, fontStyle: "bold", halign: "right" }, showFoot: "lastPage", rowPageBreak: "avoid", didDrawPage: header });
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) { pdf.setPage(page); pdf.setFont("helvetica", "normal"); pdf.setFontSize(7); pdf.setTextColor(90); pdf.text(`Salary sheet ${record.id ? `HR-${record.id}` : "preview"}  |  Page ${page} of ${pages}`, 285, 202, { align: "right" }); if (template.footer) pdf.text(template.footer, 12, 198, { maxWidth: 195 }); }
  if (print) pdf.autoPrint();
  return pdf.output("blob");
}
