// Company cheque templates: one per bank layout, saved once and used for every cheque from that bank's book.
// A template holds the cheque size, where each field prints (mm from the cheque's top-left corner) and how the
// cheque sits in the printer, so text lands on the lines whatever paper sizes the printer driver accepts.
import { uaeChequeLayout } from "./uae-cheque-layouts";

export type ChequeFieldKey = "date" | "payee" | "words" | "amount" | "crossing";
export type ChequeField = { left: number; top: number; width: number; fontPt: number };
export type ChequeTemplate = {
  widthMm: number;
  heightMm: number;
  fields: Record<ChequeFieldKey, ChequeField>;
  /** Amount in words continues here when it does not fit on the first line. */
  wordsLine2: { left: number; top: number; width: number };
  /** "text" prints 12/10/2026; "boxes" prints each digit in the cheque's date boxes (DD MM YYYY). */
  dateMode: "text" | "boxes";
  /** Distance between digit boxes and the extra gap between the DD, MM and YYYY groups. */
  datePitchMm: number;
  dateGroupGapMm: number;
  /** Paper the print is laid out on, where the cheque sits on it and a fine offset for the printer. */
  page: "cheque" | "a4";
  align: "left" | "center" | "right";
  offsetXMm: number;
  offsetYMm: number;
};
export type ChequePrintData = { date: string; payee: string; words: string; amount: number; currency: string; crossed: boolean };

export const chequeFieldLabels: Record<ChequeFieldKey, string> = { date: "Date", payee: "Pay to", words: "Amount in words", amount: "Amount", crossing: "A/C Payee Only" };
export const chequeFieldKeys: ChequeFieldKey[] = ["date", "payee", "words", "amount", "crossing"];
const A4 = { width: 210, height: 297 };
const round = (value: number) => Math.round(value * 10) / 10;

// Positions measured on a real cheque (mm from the cheque's top-left corner, about ±2 mm). They describe the cheque
// itself, not the printer; the printer feed offset is set per company in the template.
const measuredFields: Partial<Record<string, { fields: Partial<Record<ChequeFieldKey, ChequeField>>; wordsLine2: { left: number; top: number; width: number } }>> = {
  // Habib Bank AG Zurich, measured from an Al Fahidi branch cheque (187 × 90 mm): date in the Date box on the right,
  // payee on the "Pay against this cheque to" line, words on the "Dirhams" line and the line below, amount in the box.
  "habib-bank-ag-zurich": {
    fields: {
      date: { left: 130, top: 16.5, width: 37, fontPt: 11 },
      payee: { left: 16, top: 31.5, width: 150, fontPt: 11 },
      words: { left: 15, top: 43, width: 112, fontPt: 9.5 },
      amount: { left: 131, top: 46, width: 46, fontPt: 10.5 },
    },
    wordsLine2: { left: 6, top: 51.5, width: 120 },
  },
  // Emirates NBD business cheque (190.5 × 88.9 mm), measured from an Al Souk branch cheque: date on the line between
  // "Date" and the Arabic label, payee after "Pay against this cheque", words after "Dirhams" and on the line below,
  // amount between "AED" and the Arabic label in the box, A/C Payee Only top left above the branch name.
  "emirates-nbd-business": {
    fields: {
      date: { left: 118, top: 17, width: 46, fontPt: 11 },
      payee: { left: 25, top: 28, width: 140, fontPt: 11 },
      words: { left: 16, top: 38, width: 99, fontPt: 9.5 },
      amount: { left: 134, top: 45.5, width: 46, fontPt: 10.5 },
      crossing: { left: 10, top: 3, width: 44, fontPt: 9 },
    },
    wordsLine2: { left: 15, top: 48.5, width: 100 },
  },
};

/** Starting template for a bank layout: measured positions where known, otherwise the built-in (approximate) ones. */
export function defaultChequeTemplate(layoutKey: string): ChequeTemplate {
  const layout = uaeChequeLayout(layoutKey);
  const field = (position: { left: number; top: number; width: number }, fontPt: number): ChequeField => ({ ...position, fontPt });
  const measured = measuredFields[layout.key];
  return {
    widthMm: layout.widthMm, heightMm: layout.heightMm,
    fields: { date: field(layout.date, 11), payee: field(layout.payee, 11), words: field(layout.words, 9.5), amount: field(layout.amount, 10.5), crossing: field(layout.crossing, 9), ...measured?.fields },
    wordsLine2: measured?.wordsLine2 ?? { left: layout.words.left, top: round(layout.words.top + 7), width: layout.words.width },
    dateMode: "text", datePitchMm: 4.5, dateGroupGapMm: 1.5,
    page: "cheque", align: "left", offsetXMm: 0, offsetYMm: 0,
  };
}

const finite = (value: unknown, min: number, max: number, fallback: number) => {
  const number = Number(value);
  return Number.isFinite(number) ? round(Math.min(max, Math.max(min, number))) : fallback;
};

/** Accept a stored or submitted template; anything missing or out of range falls back to the bank's defaults. */
export function normalizeChequeTemplate(layoutKey: string, value: unknown): ChequeTemplate {
  const base = defaultChequeTemplate(layoutKey);
  let raw: Record<string, unknown> = {};
  try { raw = (typeof value === "string" ? JSON.parse(value || "{}") : value ?? {}) as Record<string, unknown>; } catch { raw = {}; }
  const widthMm = finite(raw.widthMm, 100, 250, base.widthMm), heightMm = finite(raw.heightMm, 50, 150, base.heightMm);
  const rawFields = (raw.fields ?? {}) as Record<string, Record<string, unknown>>;
  const fields = Object.fromEntries(chequeFieldKeys.map((key) => {
    const input = rawFields[key] ?? {}, fallback = base.fields[key];
    const width = finite(input.width, 5, widthMm, fallback.width);
    return [key, { left: finite(input.left, 0, widthMm - 5, fallback.left), top: finite(input.top, 0, heightMm - 2, fallback.top), width, fontPt: finite(input.fontPt, 6, 20, fallback.fontPt) }];
  })) as Record<ChequeFieldKey, ChequeField>;
  const line2 = (raw.wordsLine2 ?? {}) as Record<string, unknown>;
  return {
    widthMm, heightMm, fields,
    wordsLine2: { left: finite(line2.left, 0, widthMm - 5, base.wordsLine2.left), top: finite(line2.top, 0, heightMm - 2, base.wordsLine2.top), width: finite(line2.width, 5, widthMm, base.wordsLine2.width) },
    dateMode: raw.dateMode === "boxes" ? "boxes" : "text",
    datePitchMm: finite(raw.datePitchMm, 2, 10, base.datePitchMm),
    dateGroupGapMm: finite(raw.dateGroupGapMm, 0, 10, base.dateGroupGapMm),
    page: raw.page === "a4" ? "a4" : "cheque",
    align: raw.align === "center" || raw.align === "right" ? raw.align : "left",
    offsetXMm: finite(raw.offsetXMm, -50, 50, 0),
    offsetYMm: finite(raw.offsetYMm, -50, 200, 0),
  };
}

/** Where the cheque's top-left corner sits on the printed page, in mm. */
export function chequeOrigin(template: ChequeTemplate, nudge = { x: 0, y: 0 }) {
  const pageWidth = template.page === "a4" ? A4.width : template.widthMm;
  const baseX = template.page === "cheque" || template.align === "left" ? 0 : template.align === "center" ? (pageWidth - template.widthMm) / 2 : pageWidth - template.widthMm;
  return { x: round(baseX + template.offsetXMm + nudge.x), y: round(template.offsetYMm + nudge.y) };
}

/** Split the amount in words over the two lines by an estimated character width (bold Arial capitals ≈ 0.72 em). */
export function splitChequeWords(text: string, template: ChequeTemplate): [string, string] {
  const perLine = Math.max(10, Math.floor(template.fields.words.width / (template.fields.words.fontPt * 0.3528 * 0.72)));
  const words = text.split(/\s+/).filter(Boolean);
  let first = "";
  while (words.length && `${first} ${words[0]}`.trim().length <= perLine) first = `${first} ${words.shift()}`.trim();
  return [first, words.join(" ")];
}

/** Each printed piece of the cheque: text with its position (mm on the cheque) and font size. */
export function chequePieces(template: ChequeTemplate, data: ChequePrintData) {
  const { fields } = template;
  const pieces: Array<{ key: string; text: string; left: number; top: number; width: number; fontPt: number; align: "left" | "center" | "right"; bold?: boolean; rotate?: number }> = [];
  const [year, month, day] = data.date.split("-");
  if (template.dateMode === "boxes" && year && month && day) {
    const digits = `${day}${month}${year}`.split("");
    digits.forEach((digit, index) => {
      const groupGaps = (index >= 2 ? 1 : 0) + (index >= 4 ? 1 : 0);
      pieces.push({ key: `date-${index}`, text: digit, left: round(fields.date.left + index * template.datePitchMm + groupGaps * template.dateGroupGapMm), top: fields.date.top, width: template.datePitchMm, fontPt: fields.date.fontPt, align: "center", bold: true });
    });
  } else pieces.push({ key: "date", text: day ? `${day}/${month}/${year}` : data.date, ...fields.date, align: "center", bold: true });
  pieces.push({ key: "payee", text: `** ${data.payee} **`, ...fields.payee, align: "left", bold: true });
  const [line1, line2] = splitChequeWords(`** ${data.words} **`, template);
  pieces.push({ key: "words", text: line1, ...fields.words, align: "left", bold: true });
  if (line2) pieces.push({ key: "words-2", text: line2, ...template.wordsLine2, fontPt: fields.words.fontPt, align: "left", bold: true });
  pieces.push({ key: "amount", text: `**${data.amount.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}**`, ...fields.amount, align: "right", bold: true });
  if (data.crossed) pieces.push({ key: "crossing", text: "A/C PAYEE ONLY", ...fields.crossing, align: "left", bold: true, rotate: -7 });
  return pieces;
}

const escape = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);

/**
 * Printable page: the cheque fields placed for the printer feed. `testOutline` draws the cheque edge and field boxes
 * so a plain-paper test print can be held against a real cheque.
 */
export function chequePrintDocument(template: ChequeTemplate, data: ChequePrintData, options: { nudge?: { x: number; y: number }; testOutline?: boolean } = {}) {
  const origin = chequeOrigin(template, options.nudge);
  const pageWidth = template.page === "a4" ? A4.width : template.widthMm, pageHeight = template.page === "a4" ? A4.height : template.heightMm;
  const pieces = chequePieces(template, data).map((piece) => `<div class="f" style="left:${piece.left}mm;top:${piece.top}mm;width:${piece.width}mm;font-size:${piece.fontPt}pt;text-align:${piece.align};${piece.bold ? "font-weight:700;" : ""}${piece.rotate ? `transform:rotate(${piece.rotate}deg);transform-origin:left top;` : ""}">${escape(piece.text)}</div>`).join("");
  const outline = options.testOutline ? `<div class="edge"></div>${chequeFieldKeys.map((key) => { const field = template.fields[key]; return `<div class="box" style="left:${field.left}mm;top:${field.top}mm;width:${field.width}mm;height:${(field.fontPt * 0.3528 * 1.4).toFixed(1)}mm"></div>`; }).join("")}` : "";
  const styles = `@page{size:${pageWidth}mm ${pageHeight}mm;margin:0}*{box-sizing:border-box}html,body{width:${pageWidth}mm;height:${pageHeight}mm;margin:0;padding:0;overflow:hidden;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;print-color-adjust:exact;-webkit-print-color-adjust:exact}.cheque{position:absolute;left:${origin.x}mm;top:${origin.y}mm;width:${template.widthMm}mm;height:${template.heightMm}mm}.f{position:absolute;white-space:nowrap;overflow:visible;line-height:1.15;text-transform:uppercase}.edge{position:absolute;inset:0;border:0.3mm dashed #64748b}.box{position:absolute;border:0.2mm dotted #94a3b8}`;
  return { styles, html: `<div class="cheque">${outline}${pieces}</div>`, pageWidth, pageHeight };
}
