import { readDocumentDesign, type DocumentDesign } from "@/lib/document-design";
import { defaultLayout, newId, newRow, newSection } from "./defaults";
import { parseLayout, type DetailField, type Layout, type LineColumn, type Overlay, type Row, type Section, type TotalRow } from "./schema";

// The v1 designer measured pixels on a ~794px-wide A4 preview (96 dpi); 1px = 25.4 / 96 mm.
const PX_TO_MM = 25.4 / 96;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number) => Math.round(value * 10) / 10;

const detailKeys: Partial<Record<string, DetailField>> = { number: "number", date: "date", dueDate: "dueDate", terms: "terms", salesman: "salesman", trn: "trn", source: "source" };
const columnKeys: Partial<Record<string, LineColumn>> = { sku: "sku", description: "description", quantity: "quantity", unitPrice: "unitPrice", serialNumber: "serialNumber", comments: "comments", subtotal: "subtotal", vatAmount: "vatAmount", total: "total" };
const totalKeys: Partial<Record<string, TotalRow>> = { subtotal: "subtotal", vatAmount: "vat", total: "total", balance: "balance" };

function withSection<T extends Section["type"]>(type: T, apply: (section: Extract<Section, { type: T }>) => void): Section {
  const section = newSection(type) as Extract<Section, { type: T }>;
  apply(section);
  return section;
}

/** Convert a saved v1 Company Setup design into an equivalent v2 flow layout (one-way; v1 data is left untouched). */
export function migrateDocumentDesign(source: DocumentDesign | string): Layout {
  const design = typeof source === "string" ? readDocumentDesign(source) : source;
  const layout = defaultLayout("invoice");
  const printed = <T extends { print: boolean }>(fields: T[]) => fields.filter((field) => field.print);

  layout.name = design.name.slice(0, 80) || layout.name;
  layout.page = {
    size: design.paper === "Letter" ? "Letter" : "A4",
    orientation: design.orientation,
    margins: { top: clamp(design.margin, 5, 40), right: clamp(design.margin, 5, 40), bottom: clamp(design.margin, 5, 40), left: clamp(design.margin, 5, 40) },
    pageNumbers: design.printPageNumbers,
  };
  layout.theme = { ...layout.theme, font: design.font, baseSizePt: round(clamp(design.fontSize * 0.75, 7, 14)), accent: /^#[0-9a-f]{6}$/i.test(design.color) ? design.color : layout.theme.accent };

  const header = withSection("companyHeader", (section) => Object.assign(section.props, {
    showLeftLogo: design.leftLogo, showRightLogo: design.rightLogo, showName: design.showCompany, showAddress: design.showAddress,
    showPhone: design.showPhone, showEmail: design.showEmail, logoHeightMm: round(clamp(design.logoHeight * PX_TO_MM, 8, 60)),
  }));
  const title = withSection("title", (section) => { section.props.text = design.title; });

  const headerFields = printed(design.headers);
  const parties = headerFields.filter((field) => field.key === "billTo" || field.key === "shipTo").map((field) =>
    withSection(field.key as "billTo" | "shipTo", (section) => { section.props.label = field.label; }));
  const details = withSection("details", (section) => {
    section.props.fields = headerFields.flatMap((field) => detailKeys[field.key] ? [{ key: detailKeys[field.key]!, label: field.label }] : []);
  });

  const columns = printed(design.columns).flatMap((column) => columnKeys[column.key] ? [{ key: columnKeys[column.key]!, label: column.label, width: clamp(column.width, 3, 100) }] : []);
  const lines = withSection("lineItems", (section) => { if (columns.length) section.props.columns = columns; });

  const footer = printed(design.footer);
  const totals = footer.flatMap((field) => totalKeys[field.key] ? [{ key: totalKeys[field.key]!, label: field.label }] : []);
  const message = footer.find((field) => field.key === "message");
  const disclaimer = footer.find((field) => field.key === "disclaimer");

  const rows: Row[] = [newRow([header], { spaceBeforeMm: 0 }), newRow([title])];
  if (parties.length) rows.push(newRow(parties, { keepTogether: true }));
  if (details.type === "details" && details.props.fields.length) rows.push(newRow([details]));
  rows.push(newRow([lines], { spaceBeforeMm: 4 }));
  const summary: Section[] = [];
  if (message) summary.push(withSection("notes", (section) => { section.props.label = message.label; section.props.text = design.message; }));
  if (totals.length) summary.push(withSection("totals", (section) => { section.props.rows = totals; }));
  if (summary.length) rows.push(newRow(summary, { keepTogether: true, ratios: summary.length === 2 ? [3, 2] : [1] }));
  if (disclaimer) rows.push(newRow([withSection("terms", (section) => { section.props.label = disclaimer.label; section.props.text = design.disclaimer; })]));
  layout.rows = rows;

  const overlays: Overlay[] = design.customBoxes.filter((box) => box.print && box.text.trim()).slice(0, 11).map((box) => ({
    id: newId("overlay"), kind: "text", text: box.text.slice(0, 200), src: "", pages: "first", screen: box.screen, print: true, rotateDeg: 0, opacity: 1,
    xMm: round(clamp(box.left * PX_TO_MM, 0, 500)), yMm: round(clamp(box.down * PX_TO_MM, 0, 500)),
    widthMm: round(clamp(box.width * PX_TO_MM, 5, 300)), heightMm: round(clamp(box.height * PX_TO_MM, 5, 300)),
  }));
  if (design.statusStamp) overlays.push({ id: newId("overlay"), kind: "stamp", text: "{status}", src: "", pages: "first", screen: true, print: true, rotateDeg: -12, opacity: 0.85, xMm: 140, yMm: 52, widthMm: 40, heightMm: 18 });
  layout.overlays = overlays;

  // Validate the result so a migrated layout is always one the server will accept.
  return parseLayout(layout);
}
