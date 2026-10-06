import { z } from "zod";

// Layout builder v2: a document is a vertical flow of rows; each row holds 1–3 sections side by side.
// Everything is measured in millimetres so the editor canvas, print and PDF share one geometry.
// Only overlays (stamps, images, free text) are absolutely positioned, and they never take part in page flow.

export const sectionTypes = ["companyHeader", "title", "billTo", "shipTo", "details", "lineItems", "totals", "notes", "terms", "bankDetails", "signature", "text", "image", "spacer", "divider", "letterBody"] as const;
export type SectionType = typeof sectionTypes[number];

export const detailFields = ["number", "date", "dueDate", "terms", "salesman", "reference", "trn", "source", "status"] as const;
export type DetailField = typeof detailFields[number];
export const lineColumns = ["index", "sku", "description", "quantity", "unitPrice", "serialNumber", "comments", "subtotal", "vatRate", "vatAmount", "total"] as const;
export type LineColumn = typeof lineColumns[number];
export const totalRows = ["subtotal", "vat", "total", "paid", "balance"] as const;
export type TotalRow = typeof totalRows[number];

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
const shortText = z.string().max(200);
const longText = z.string().max(15000);
// Images are stored inline as data URLs; keep each under ~1 MB so a whole layout stays well within request limits.
const imageData = z.string().max(1_400_000).refine((value) => value === "" || /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,/.test(value), "Use a PNG, JPEG, WebP, GIF or SVG image.");
const colour = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const mm = (min: number, max: number) => z.number().finite().min(min).max(max);

export const sectionStyleSchema = z.object({
  align: z.enum(["left", "center", "right"]),
  paddingMm: mm(0, 20),
  border: z.enum(["none", "box", "top", "bottom"]),
  background: z.union([colour, z.literal("")]),
  fontScale: mm(0.6, 2),
  bold: z.boolean(),
}).strict();
export type SectionStyle = z.infer<typeof sectionStyleSchema>;

const props = {
  companyHeader: z.object({ showLeftLogo: z.boolean(), showRightLogo: z.boolean(), showName: z.boolean(), showAddress: z.boolean(), showPhone: z.boolean(), showEmail: z.boolean(), showTrn: z.boolean(), logoHeightMm: mm(8, 60) }).strict(),
  title: z.object({ text: shortText }).strict(),
  billTo: z.object({ label: shortText }).strict(),
  shipTo: z.object({ label: shortText }).strict(),
  details: z.object({ fields: z.array(z.object({ key: z.enum(detailFields), label: shortText }).strict()).max(detailFields.length), columns: z.number().int().min(1).max(4) }).strict(),
  lineItems: z.object({ columns: z.array(z.object({ key: z.enum(lineColumns), label: shortText, width: mm(3, 100) }).strict()).min(1).max(lineColumns.length), zebra: z.boolean(), repeatHeading: z.boolean() }).strict(),
  totals: z.object({ rows: z.array(z.object({ key: z.enum(totalRows), label: shortText }).strict()).min(1).max(totalRows.length), widthPercent: mm(30, 100) }).strict(),
  notes: z.object({ label: shortText, text: longText }).strict(),
  terms: z.object({ label: shortText, text: longText }).strict(),
  bankDetails: z.object({ label: shortText }).strict(),
  signature: z.object({ label: shortText, lineWidthMm: mm(20, 120) }).strict(),
  text: z.object({ text: longText }).strict(),
  image: z.object({ src: imageData, heightMm: mm(5, 120) }).strict(),
  spacer: z.object({ heightMm: mm(1, 80) }).strict(),
  divider: z.object({ thicknessPt: mm(0.25, 4) }).strict(),
  letterBody: z.object({ text: longText }).strict(),
} satisfies Record<SectionType, z.ZodTypeAny>;
export type SectionProps = { [K in SectionType]: z.infer<typeof props[K]> };

const visibility = { screen: z.boolean(), print: z.boolean() };
const sectionSchema = z.discriminatedUnion("type", sectionTypes.map((type) => z.object({ id, type: z.literal(type), props: props[type], style: sectionStyleSchema, ...visibility, avoidBreakInside: z.boolean() }).strict()) as unknown as [z.ZodDiscriminatedUnionOption<"type">, ...z.ZodDiscriminatedUnionOption<"type">[]]);
export type Section = { [K in SectionType]: { id: string; type: K; props: SectionProps[K]; style: SectionStyle; screen: boolean; print: boolean; avoidBreakInside: boolean } }[SectionType];

export const rowSchema = z.object({
  id,
  sections: z.array(sectionSchema).min(1).max(3),
  ratios: z.array(mm(0.1, 100)).min(1).max(3),
  gapMm: mm(0, 20),
  spaceBeforeMm: mm(0, 40),
  keepTogether: z.boolean(),
  repeat: z.enum(["none", "header", "footer"]),
}).strict().refine((row) => row.ratios.length === row.sections.length, "Each section in a row needs a width ratio.");
export type Row = Omit<z.infer<typeof rowSchema>, "sections"> & { sections: Section[] };

export const overlaySchema = z.object({
  id,
  kind: z.enum(["stamp", "image", "text"]),
  xMm: mm(0, 500), yMm: mm(0, 500), widthMm: mm(5, 300), heightMm: mm(5, 300),
  rotateDeg: mm(-180, 180), opacity: mm(0.05, 1),
  text: shortText, src: imageData,
  pages: z.enum(["first", "all"]),
  ...visibility,
}).strict();
export type Overlay = z.infer<typeof overlaySchema>;

export const paperSizes = { A4: { width: 210, height: 297 }, Letter: { width: 215.9, height: 279.4 } } as const;
export type PaperSize = keyof typeof paperSizes;

export const layoutSchema = z.object({
  version: z.literal(2),
  kind: z.enum(["invoice", "letterhead"]),
  enabled: z.boolean(),
  name: z.string().trim().min(1).max(80),
  page: z.object({
    size: z.enum(["A4", "Letter"]),
    orientation: z.enum(["portrait", "landscape"]),
    margins: z.object({ top: mm(5, 40), right: mm(5, 40), bottom: mm(5, 40), left: mm(5, 40) }).strict(),
    pageNumbers: z.boolean(),
  }).strict(),
  theme: z.object({ font: z.enum(["Arial", "Georgia", "Verdana", "Helvetica", "Times New Roman"]), baseSizePt: mm(7, 14), accent: colour, text: colour, border: colour }).strict(),
  rows: z.array(rowSchema).min(1).max(40),
  overlays: z.array(overlaySchema).max(12),
}).strict().superRefine((layout, context) => {
  const ids = [...layout.rows.flatMap((row) => [row.id, ...row.sections.map((section) => section.id)]), ...layout.overlays.map((overlay) => overlay.id)];
  if (new Set(ids).size !== ids.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "Layout element IDs must be unique." });
  if (layout.rows.filter((row) => row.repeat === "none").length === 0) context.addIssue({ code: z.ZodIssueCode.custom, message: "Keep at least one row in the page body." });
});
export type Layout = Omit<z.infer<typeof layoutSchema>, "rows"> & { rows: Row[] };
export type LayoutKind = Layout["kind"];

/** Printable content box of a page in millimetres. */
export function contentBox(page: Layout["page"]) {
  const paper = paperSizes[page.size];
  const [width, height] = page.orientation === "portrait" ? [paper.width, paper.height] : [paper.height, paper.width];
  return { pageWidth: width, pageHeight: height, width: width - page.margins.left - page.margins.right, height: height - page.margins.top - page.margins.bottom };
}

/** Validate untrusted JSON (from storage or a request) into a layout; throws with a readable message. */
export function parseLayout(value: unknown): Layout {
  const result = layoutSchema.safeParse(typeof value === "string" ? JSON.parse(value) : value);
  if (!result.success) throw new Error(result.error.issues[0]?.message ?? "Invalid layout.");
  return result.data as Layout;
}
