export const letterheadDocuments = [
  ["tax-invoice", "Tax Invoice"], ["commercial-invoice", "Commercial Invoice"],
  ["estimate", "Estimate"], ["proforma-invoice", "Proforma Invoice"],
  ["sales-order", "Sales Order"], ["purchase-order", "Purchase Order"],
  ["purchase-return", "Purchase Return"], ["credit-note", "Credit Note"],
  ["refund", "Refund"], ["cash-sales", "Sales Receipt"], ["quotation", "Quotation"],
  ["delivery-note", "Delivery Note"], ["packing-list", "Packing List"],
  ["hs-code-summary", "HS Code Summary"], ["statement", "Statement"],
  ["warranty-slip", "Warranty / RMA Slip"],
] as const;
export type LetterheadDocument = typeof letterheadDocuments[number][0];
export type LetterheadTemplate = {
  id: string; name: string; color: string; heading: string; subtitle: string;
  website: string; body: string; footer: string; documents: LetterheadDocument[];
  showLogo: boolean; showRightLogo: boolean; showStamp: boolean;
  stampLeft: number; stampTop: number;
  bodyHtml?: string; bodyLeft?: number; bodyTop?: number; bodyWidth?: number;
};
export type LetterheadSettings = { templates: LetterheadTemplate[] };
export const defaultLetterhead = (): LetterheadTemplate => ({
  id: "", name: "Company letterhead", color: "#c82424", heading: "", subtitle: "",
  website: "", body: "", footer: "", documents: [], showLogo: true,
  showRightLogo: true, showStamp: false, stampLeft: 155, stampTop: 230,
  bodyHtml: "", bodyLeft: 13, bodyTop: 48, bodyWidth: 184,
});
const allowedDocuments = new Set<string>(letterheadDocuments.map(([key]) => key));
const color = (value: unknown) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
const bounded = (value: unknown, max: number) => typeof value === "string" && value.length <= max;

export function validateLetterheadSettings(value: string): LetterheadSettings {
  if (value.length > 140_000) throw new Error("Letterhead settings are too large.");
  const input = value ? JSON.parse(value) as LetterheadSettings : { templates: [] };
  if (!input || !Array.isArray(input.templates) || input.templates.length > 20) throw new Error("Keep at most 20 saved letterheads.");
  const ids = new Set<string>();
  const documents = new Set<string>();
  const templates = input.templates.map((raw) => {
    if (!raw || typeof raw.id !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(raw.id) || ids.has(raw.id)) throw new Error("Invalid letterhead ID.");
    ids.add(raw.id);
    if (!bounded(raw.name, 80) || !raw.name.trim() || !color(raw.color)
      || !bounded(raw.heading, 120) || !bounded(raw.subtitle, 180)
      || !bounded(raw.website, 160) || !bounded(raw.body, 6000) || !bounded(raw.footer, 300)
      || (raw.bodyHtml !== undefined && !bounded(raw.bodyHtml, 12000))
      || (raw.bodyLeft !== undefined && (!Number.isInteger(raw.bodyLeft) || raw.bodyLeft < 0 || raw.bodyLeft > 170))
      || (raw.bodyTop !== undefined && (!Number.isInteger(raw.bodyTop) || raw.bodyTop < 0 || raw.bodyTop > 250))
      || (raw.bodyWidth !== undefined && (!Number.isInteger(raw.bodyWidth) || raw.bodyWidth < 20 || raw.bodyWidth > 210))
      || typeof raw.showLogo !== "boolean" || typeof raw.showRightLogo !== "boolean" || typeof raw.showStamp !== "boolean"
      || !Number.isInteger(raw.stampLeft) || raw.stampLeft < 0 || raw.stampLeft > 170
      || !Number.isInteger(raw.stampTop) || raw.stampTop < 0 || raw.stampTop > 260
      || !Array.isArray(raw.documents) || raw.documents.length > allowedDocuments.size
      || raw.documents.some((doc) => !allowedDocuments.has(doc) || documents.has(doc))
      || new Set(raw.documents).size !== raw.documents.length) throw new Error("Check the letterhead fields and document assignments.");
    raw.documents.forEach((doc) => documents.add(doc));
    return {
      id: raw.id, name: raw.name.trim(), color: raw.color, heading: raw.heading,
      subtitle: raw.subtitle, website: raw.website, body: raw.body, footer: raw.footer,
      documents: raw.documents, showLogo: raw.showLogo, showRightLogo: raw.showRightLogo,
      showStamp: raw.showStamp, stampLeft: raw.stampLeft, stampTop: raw.stampTop,
      bodyHtml: raw.bodyHtml || "", bodyLeft: raw.bodyLeft ?? 13,
      bodyTop: raw.bodyTop ?? 48, bodyWidth: raw.bodyWidth ?? 184,
    };
  });
  return { templates };
}
export function readLetterheads(value?: string): LetterheadSettings {
  try { return validateLetterheadSettings(value || ""); } catch { return { templates: [] }; }
}
export function letterheadForDocument(value: string | undefined, document: LetterheadDocument): LetterheadTemplate | undefined {
  return readLetterheads(value).templates.find((template) => template.documents.includes(document));
}
