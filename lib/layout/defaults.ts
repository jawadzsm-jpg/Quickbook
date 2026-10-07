import type { Layout, LayoutKind, Overlay, Row, Section, SectionProps, SectionStyle, SectionType } from "./schema";

export const newId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

export const defaultStyle: SectionStyle = { align: "left", verticalAlign: "top", paddingMm: 2, border: "none", borderColor: "", borderWidthPt: 0.75, background: "", textColor: "", font: "", fontScale: 1, bold: false, italic: false, underline: false };

export const sectionLabels: Record<SectionType, string> = {
  companyHeader: "Company header", title: "Document title", billTo: "Bill to", shipTo: "Ship to", details: "Document details",
  lineItems: "Line items", totals: "Totals", notes: "Customer message", terms: "Terms & conditions", bankDetails: "Bank details",
  signature: "Signature", text: "Text block", image: "Image", spacer: "Spacer", divider: "Divider", letterBody: "Letter body",
};

const defaultProps: { [K in SectionType]: () => SectionProps[K] } = {
  companyHeader: () => ({ showLeftLogo: true, showRightLogo: true, showName: true, showAddress: true, showPhone: true, showEmail: true, showTrn: true, logoHeightMm: 20, nameText: "", addressText: "", phoneLabel: "Tel:", emailLabel: "", trnLabel: "TRN" }),
  title: () => ({ text: "Tax Invoice" }),
  billTo: () => ({ label: "Bill To" }),
  shipTo: () => ({ label: "Ship To" }),
  details: () => ({ columns: 4, fields: [
    { key: "number", label: "Invoice #" }, { key: "date", label: "Date" }, { key: "dueDate", label: "Due Date" }, { key: "terms", label: "Terms" },
    { key: "salesman", label: "Sales Rep" }, { key: "trn", label: "Customer TRN" },
  ] }),
  lineItems: () => ({ zebra: false, repeatHeading: true, headingBackground: "", headingTextColor: "", headingBold: true, gridLines: "rows", columns: [
    { key: "index", label: "#", width: 5 }, { key: "sku", label: "Item", width: 12 }, { key: "description", label: "Description", width: 37 },
    { key: "quantity", label: "Qty", width: 7 }, { key: "unitPrice", label: "Rate", width: 11 }, { key: "vatAmount", label: "VAT", width: 10 }, { key: "total", label: "Amount", width: 13 },
  ] }),
  totals: () => ({ widthPercent: 100, rows: [{ key: "subtotal", label: "Subtotal" }, { key: "vat", label: "VAT" }, { key: "total", label: "Total" }, { key: "balance", label: "Balance Due" }] }),
  notes: () => ({ label: "Customer Message", text: "" }),
  terms: () => ({ label: "Terms & Conditions", text: "" }),
  bankDetails: () => ({ label: "Bank Details" }),
  signature: () => ({ label: "Authorised Signature", lineWidthMm: 60 }),
  text: () => ({ text: "Add your text" }),
  image: () => ({ src: "", heightMm: 25 }),
  spacer: () => ({ heightMm: 6 }),
  divider: () => ({ thicknessPt: 0.75 }),
  letterBody: () => ({ text: "Dear Sir / Madam,\n\n" }),
};

const styleOverrides: Partial<Record<SectionType, Partial<SectionStyle>>> = {
  title: { align: "center", fontScale: 1.9, bold: true },
  totals: { align: "right" },
  billTo: { border: "box" }, shipTo: { border: "box" },
  spacer: { paddingMm: 0 }, divider: { paddingMm: 0 },
};

export function newSection<T extends SectionType>(type: T): Section {
  return { id: newId(type), type, props: defaultProps[type](), style: { ...defaultStyle, ...styleOverrides[type] }, screen: true, print: true, avoidBreakInside: type !== "lineItems" && type !== "letterBody" && type !== "text" } as Section;
}

export function newRow(sections: Section[], options: Partial<Omit<Row, "id" | "sections" | "ratios">> & { ratios?: number[] } = {}): Row {
  return { id: newId("row"), sections, ratios: options.ratios ?? sections.map(() => 1), gapMm: options.gapMm ?? 4, spaceBeforeMm: options.spaceBeforeMm ?? 3, keepTogether: options.keepTogether ?? false, repeat: options.repeat ?? "none" };
}

export function newOverlay(kind: Overlay["kind"]): Overlay {
  return { id: newId("overlay"), kind, xMm: 92, yMm: 14, widthMm: 40, heightMm: kind === "stamp" ? 14 : 20, rotateDeg: kind === "stamp" ? -8 : 0, opacity: kind === "stamp" ? 0.85 : 1, text: kind === "text" ? "Text" : "", src: "", pages: "first", screen: true, print: true };
}

export function defaultLayout(kind: LayoutKind = "invoice"): Layout {
  const page: Layout["page"] = { size: "A4", orientation: "portrait", margins: { top: 12, right: 12, bottom: 14, left: 12 }, pageNumbers: true };
  const theme: Layout["theme"] = { font: "Arial", baseSizePt: 9.5, accent: "#164e63", text: "#111827", border: "#cbd5e1", arabicLabels: true, currencySymbol: "" };
  if (kind === "letterhead") {
    return { version: 2, kind, enabled: false, name: "Company letterhead", page, theme, overlays: [], rows: [
      newRow([newSection("companyHeader")], { repeat: "header", spaceBeforeMm: 0 }),
      newRow([newSection("divider")], { repeat: "header" }),
      newRow([newSection("letterBody")], { spaceBeforeMm: 8 }),
      newRow([newSection("signature")], { keepTogether: true, spaceBeforeMm: 12 }),
    ] };
  }
  return { version: 2, kind, enabled: false, name: "Company invoice", page, theme, overlays: [], rows: [
    newRow([newSection("companyHeader")], { spaceBeforeMm: 0 }),
    newRow([newSection("title")]),
    newRow([newSection("billTo"), newSection("shipTo")], { keepTogether: true }),
    newRow([newSection("details")]),
    newRow([newSection("lineItems")], { spaceBeforeMm: 4 }),
    newRow([newSection("notes"), newSection("totals")], { ratios: [3, 2], keepTogether: true }),
    newRow([newSection("terms")]),
  ] };
}

/** A new layout for a document type: a copy of the invoice layout (or the default) titled for that type. */
export function layoutForDocumentType(type: string, base?: Layout): Layout {
  const copy = structuredClone(base ?? defaultLayout("invoice"));
  copy.name = `${type} layout`.slice(0, 80);
  copy.enabled = false;
  copy.rows = copy.rows.map((row) => ({ ...row, id: newId("row"), sections: row.sections.map((section) => ({ ...section, id: newId(section.type), ...(section.type === "title" ? { props: { ...section.props, text: type === "Invoice" ? "Tax Invoice" : type } } : {}) } as Section)) }));
  copy.overlays = copy.overlays.map((overlay) => ({ ...overlay, id: newId("overlay") }));
  return copy;
}
