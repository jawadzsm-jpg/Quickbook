import { freightLineDocuments, vatTaxableValue } from "@/lib/vat-report";

// UAE VAT return (FTA VAT201) box mapping, shared by VAT Management, its Excel/PDF export and the tests.
// Every figure comes from posted transaction lines (saved VAT code, VAT amount and exchange rate) and VAT adjustments.

export const uaeEmirates = [
  { key: "abu-dhabi", box: "1a", name: "Abu Dhabi", aliases: ["abu dhabi", "abudhabi", "auh", "al ain", "musaffah", "mussafah", "ruwais", "khalifa city"] },
  { key: "dubai", box: "1b", name: "Dubai", aliases: ["dubai", "dxb", "deira", "bur dubai", "jebel ali", "al quoz", "jafza", "karama"] },
  { key: "sharjah", box: "1c", name: "Sharjah", aliases: ["sharjah", "shj", "khor fakkan", "khorfakkan", "kalba", "saif zone"] },
  { key: "ajman", box: "1d", name: "Ajman", aliases: ["ajman"] },
  { key: "umm-al-quwain", box: "1e", name: "Umm Al Quwain", aliases: ["umm al quwain", "umm al qaiwain", "umm al qwain", "uaq"] },
  { key: "ras-al-khaimah", box: "1f", name: "Ras Al Khaimah", aliases: ["ras al khaimah", "ras al khaima", "rak"] },
  { key: "fujairah", box: "1g", name: "Fujairah", aliases: ["fujairah", "fujeirah"] },
] as const;
export type EmirateKey = (typeof uaeEmirates)[number]["key"];
export const isEmirateKey = (value: unknown): value is EmirateKey => uaeEmirates.some((emirate) => emirate.key === value);
export const emirateName = (key: string) => uaeEmirates.find((emirate) => emirate.key === key)?.name ?? "";

const words = (value: string) => ` ${value.toLowerCase().replace(/[^a-z]+/g, " ").trim()} `;

/** The emirate named in free text (city or address), or "" — the last one mentioned wins ("Al Nahda, Dubai" → Dubai). */
export function emirateFromText(text: string): EmirateKey | "" {
  const haystack = words(text);
  let found: { key: EmirateKey; at: number } | undefined;
  for (const emirate of uaeEmirates) for (const alias of emirate.aliases) {
    const at = haystack.lastIndexOf(` ${alias} `);
    if (at >= 0 && (!found || at > found.at)) found = { key: emirate.key, at };
  }
  return found?.key ?? "";
}

/** Company emirate from Company Setup: city first, then the address lines. */
export function companyEmirate(company: { city?: string | null; addressLine1?: string | null; addressLine2?: string | null }) {
  for (const text of [company.city, company.addressLine2, company.addressLine1]) {
    const key = emirateFromText(String(text ?? ""));
    if (key) return key;
  }
  return "";
}

export const vat201BoxKeys = ["1a", "1b", "1c", "1d", "1e", "1f", "1g", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14"] as const;
export type Vat201BoxKey = (typeof vat201BoxKeys)[number];
/** Amount and VAT in AED; `adjustment` is the template's Adjustment column (output rows: a positive value reduces tax due). */
export type Vat201Box = { amount: number; vat: number; adjustment: number };
export type Vat201Source = {
  transactionId?: number; adjustmentId?: number; number: string; type: string; date: string; party: string;
  inventory: string; vatCode: string; amount: number; vat: number; adjustment: number;
};
/** Figures EasyBook cannot derive from its records; typed on the return screen (refunds as positive values). */
export type Vat201Manual = { touristAmount: number; touristVat: number; importAdjustmentAmount: number; importAdjustmentVat: number; box9Adjustment: number };
export const emptyVat201Manual: Vat201Manual = { touristAmount: 0, touristVat: 0, importAdjustmentAmount: 0, importAdjustmentVat: 0, box9Adjustment: 0 };

/** Each box: where it sits in the template (merged ranges are addressed by their top-left cell) and which columns it has. */
export const vat201Layout: Array<{ box: Vat201BoxKey; label: string; section: "output" | "input" | "net"; cells: Partial<Record<keyof Vat201Box, string>>; total?: boolean }> = [
  ...uaeEmirates.map((emirate, index) => ({ box: emirate.box, label: `Standard rated supplies in ${emirate.name}`, section: "output" as const, cells: { amount: `H${13 + index * 2}`, vat: `K${13 + index * 2}`, adjustment: `O${13 + index * 2}` } })),
  { box: "2", label: "Tax Refunds provided to Tourists under the Tax Refunds for Tourists Scheme", section: "output", cells: { amount: "I27", vat: "L27" } },
  { box: "3", label: "Supplies subject to the reverse charge provisions", section: "output", cells: { amount: "H29", vat: "K29" } },
  { box: "4", label: "Zero rated supplies", section: "output", cells: { amount: "H31" } },
  { box: "5", label: "Exempt supplies", section: "output", cells: { amount: "H33" } },
  { box: "6", label: "Goods imported into the UAE", section: "output", cells: { amount: "H35", vat: "K35" } },
  { box: "7", label: "Adjustments to goods imported into the UAE", section: "output", cells: { amount: "H37", vat: "K37" } },
  { box: "8", label: "Totals", section: "output", cells: { amount: "H39", vat: "K39", adjustment: "N39" }, total: true },
  { box: "9", label: "Standard rated expenses", section: "input", cells: { amount: "H45", vat: "K45", adjustment: "N45" } },
  { box: "10", label: "Supplies subject to the reverse charge provisions", section: "input", cells: { amount: "H47", vat: "K47" } },
  { box: "11", label: "Totals", section: "input", cells: { amount: "H49", vat: "K49", adjustment: "N49" }, total: true },
  { box: "12", label: "Total value of due tax for the period", section: "net", cells: { amount: "H54" }, total: true },
  { box: "13", label: "Total value of recoverable tax for the period", section: "net", cells: { amount: "H56" }, total: true },
  { box: "14", label: "Payable tax for the period", section: "net", cells: { amount: "H58" }, total: true },
];

export type Vat201Line = {
  transactionId: number; number: string; type: string; status: string; party: string; date: string; locationId: number | null;
  isImport: boolean; billId: number | null; isFreightCharge?: boolean | null; vatCode: string | null; vatRate: number;
  subtotal: number; freightCharge: number; vatAmount: number; exchangeRate: number;
};
export type Vat201Adjustment = { id: number; reference: string; adjustmentDate: string; direction: "increase" | "decrease"; amount: number; reason: string; locationId: number | null };

export const vatSalesTypes = new Set(["invoice", "sales receipt", "statement charge", "credit memo"]);
export const vatPurchaseTypes = new Set(["bill", "received item bill", "expense", "cheque", "credit card charge", "vendor credit"]);
export const vatExcludedStatuses = new Set(["cancelled", "canceled", "void", "voided", "deleted", "draft"]);
export const reverseChargeCodes = new Set(["REVERSE", "REVERSE_CHARGE", "RCM"]);

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const emptyBox = (): Vat201Box => ({ amount: 0, vat: 0, adjustment: 0 });

/** Classify posted lines and adjustments into VAT201 boxes, with the documents behind each box. Box 1 is split by the
 * emirate of the inventory that made the supply (else the company's emirate); lines with neither go to `unallocated`. */
export function buildVat201(input: {
  lines: Vat201Line[]; adjustments: Vat201Adjustment[]; codes: Array<{ code: string; rate: number }>;
  locations: Array<{ id: number; name: string; emirate: string }>; companyEmirate: string;
}) {
  const boxes = Object.fromEntries(vat201BoxKeys.map((key) => [key, emptyBox()])) as Record<Vat201BoxKey, Vat201Box>;
  const unallocated = emptyBox();
  const sources = new Map<string, Map<string, Vat201Source>>();
  const knownCodes = new Map(input.codes.map((code) => [code.code.toUpperCase(), Number(code.rate)]));
  const locations = new Map(input.locations.map((location) => [location.id, location]));
  const freightLines = freightLineDocuments(input.lines);
  let exceptionLines = 0;
  let transactionLines = 0;

  const emirateBox = (locationId: number | null): Vat201BoxKey | "unallocated" => {
    const own = locationId ? locations.get(locationId)?.emirate : "";
    const key = isEmirateKey(own) ? own : isEmirateKey(input.companyEmirate) ? input.companyEmirate : "";
    return uaeEmirates.find((emirate) => emirate.key === key)?.box ?? "unallocated";
  };
  const add = (box: Vat201BoxKey | "unallocated", source: Vat201Source, id: string) => {
    const target = box === "unallocated" ? unallocated : boxes[box];
    target.amount = round(target.amount + source.amount);
    target.vat = round(target.vat + source.vat);
    target.adjustment = round(target.adjustment + source.adjustment);
    const list = sources.get(box) ?? new Map<string, Vat201Source>();
    const existing = list.get(id);
    if (existing) { existing.amount = round(existing.amount + source.amount); existing.vat = round(existing.vat + source.vat); existing.adjustment = round(existing.adjustment + source.adjustment); }
    else list.set(id, { ...source });
    sources.set(box, list);
  };

  for (const line of input.lines) {
    if (vatExcludedStatuses.has(String(line.status).toLowerCase())) continue;
    const isSale = vatSalesTypes.has(line.type);
    const isPurchase = vatPurchaseTypes.has(line.type);
    if (!isSale && !isPurchase) continue;
    // A cheque allocated to a bill is a payment, not a second taxable purchase.
    if (line.type === "cheque" && line.billId) continue;
    const sign = ["credit memo", "vendor credit"].includes(line.type) ? -1 : 1;
    const rate = Number(line.exchangeRate) || 1;
    const taxableAmount = vatTaxableValue({ subtotal: line.subtotal, freightCharge: line.freightCharge, transactionId: line.transactionId }, freightLines);
    const amount = round(sign * taxableAmount * rate);
    const vat = round(sign * Number(line.vatAmount) * rate);
    const code = String(line.vatCode || "").trim().toUpperCase();
    const expectedRate = knownCodes.get(code);
    transactionLines += 1;

    if (!code || expectedRate === undefined) { exceptionLines += 1; continue; }
    const invalidCalculation = Math.abs(Number(line.vatAmount) - taxableAmount * Number(line.vatRate) / 100) > 0.011 || Math.abs(Number(line.vatRate) - expectedRate) > 0.001;
    const invalidUaeTreatment = expectedRate !== 5 && !["ZERO", "EXEMPT", "OUT_OF_SCOPE"].includes(code);
    if (invalidCalculation || invalidUaeTreatment || (code === "OUT_OF_SCOPE" && Math.abs(vat) > 0.001)) exceptionLines += 1;
    if (code === "OUT_OF_SCOPE") continue;

    const source: Vat201Source = { transactionId: line.transactionId, number: line.number, type: line.type, date: line.date, party: line.party, inventory: (line.locationId && locations.get(line.locationId)?.name) || "", vatCode: code, amount, vat, adjustment: 0 };
    const id = `t${line.transactionId}:${code}`;
    if (isSale) {
      if (code === "ZERO") add("4", { ...source, vat: 0 }, id);
      else if (code === "EXEMPT") add("5", { ...source, vat: 0 }, id);
      else add(emirateBox(line.locationId), source, id);
    } else if (line.isImport) {
      add("6", source, id); add("10", source, id);
    } else if (reverseChargeCodes.has(code)) {
      add("3", source, id); add("10", source, id);
    } else if (code !== "ZERO" && code !== "EXEMPT" && Math.abs(vat) > 0.001) {
      add("9", source, id);
    }
  }

  // Manual VAT-due adjustments post to VAT Payable; on the return they sit in the Adjustment column of the emirate row
  // of their inventory. The template subtracts that column (Box 8 = −sum), so a decrease is positive and an increase negative.
  for (const adjustment of input.adjustments) {
    const value = round(adjustment.direction === "decrease" ? adjustment.amount : -adjustment.amount);
    add(emirateBox(adjustment.locationId), { adjustmentId: adjustment.id, number: adjustment.reference, type: "VAT adjustment", date: adjustment.adjustmentDate, party: adjustment.reason, inventory: (adjustment.locationId && locations.get(adjustment.locationId)?.name) || "", vatCode: "", amount: 0, vat: 0, adjustment: value }, `a${adjustment.id}`);
  }

  const sortedSources = Object.fromEntries([...sources].map(([box, list]) => [box, [...list.values()].sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number))])) as Partial<Record<Vat201BoxKey | "unallocated", Vat201Source[]>>;
  return { boxes: vat201Totals(boxes, unallocated, emptyVat201Manual), unallocated, sources: sortedSources, exceptionLines, transactionLines };
}

/** Totals exactly as the template's formulas: Box 8 (row 39), Box 11 (row 49) and Boxes 12–14, with the manual figures.
 * Unallocated Box 1 supplies still count in the totals so the return balances while the emirate is fixed. */
export function vat201Totals(source: Record<Vat201BoxKey, Vat201Box>, unallocated: Vat201Box, manual: Vat201Manual) {
  const boxes = Object.fromEntries(vat201BoxKeys.map((key) => [key, { ...source[key] }])) as Record<Vat201BoxKey, Vat201Box>;
  boxes["2"] = { amount: round(-Math.abs(manual.touristAmount)), vat: round(-Math.abs(manual.touristVat)), adjustment: 0 };
  boxes["7"] = { amount: round(manual.importAdjustmentAmount), vat: round(manual.importAdjustmentVat), adjustment: 0 };
  boxes["9"] = { ...boxes["9"], adjustment: round(manual.box9Adjustment) };
  const outputs: Vat201BoxKey[] = ["1a", "1b", "1c", "1d", "1e", "1f", "1g", "2", "3", "4", "5", "6", "7"];
  const sum = (keys: Vat201BoxKey[], field: keyof Vat201Box) => round(keys.reduce((total, key) => total + boxes[key][field], 0));
  boxes["8"] = {
    amount: round(sum(outputs, "amount") + unallocated.amount),
    vat: round(sum(outputs, "vat") + unallocated.vat),
    adjustment: round(-(sum(outputs, "adjustment") + unallocated.adjustment)),
  };
  boxes["11"] = { amount: sum(["9", "10"], "amount"), vat: sum(["9", "10"], "vat"), adjustment: sum(["9", "10"], "adjustment") };
  const due = round(boxes["8"].vat + boxes["8"].adjustment);
  const recoverable = round(boxes["11"].vat + boxes["11"].adjustment);
  boxes["12"] = { amount: due, vat: 0, adjustment: 0 };
  boxes["13"] = { amount: recoverable, vat: 0, adjustment: 0 };
  boxes["14"] = { amount: round(due - recoverable), vat: 0, adjustment: 0 };
  return boxes;
}

const xmlEscape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Write one cell of a worksheet XML: a number (kept beside any formula, as its cached result) or an inline string.
 * The cell's style is kept, so the template's formats, borders and protection stay as they are. */
export function setSheetCell(xml: string, ref: string, value: number | string) {
  const pattern = new RegExp(`<c r="${ref}"([^>]*?)(?:/>|>([\\s\\S]*?)</c>)`);
  const match = xml.match(pattern);
  if (!match) throw new Error(`Template cell ${ref} is missing.`);
  const attributes = match[1].replace(/\s+t="[^"]*"/, "").replace(/\/$/, "");
  const formula = match[2]?.match(/<f>[\s\S]*?<\/f>/)?.[0] ?? "";
  const body = typeof value === "number" ? `${formula}<v>${round(value)}</v>` : `<is><t xml:space="preserve">${xmlEscape(value)}</t></is>`;
  return xml.replace(pattern, `<c r="${ref}"${attributes}${typeof value === "string" ? ' t="inlineStr"' : ""}>${body}</c>`);
}

/** Fill the VAT201 template worksheet with the return: every box cell, the totals' cached results and a heading line. */
export function fillVat201Sheet(xml: string, boxes: Record<Vat201BoxKey, Vat201Box>, heading: string) {
  let sheet = setSheetCell(xml, "D8", heading);
  for (const row of vat201Layout) for (const [field, ref] of Object.entries(row.cells) as Array<[keyof Vat201Box, string]>) sheet = setSheetCell(sheet, ref, boxes[row.box][field]);
  // The totals' twin cells in the merged ranges carry the same formulas; keep their cached values in step too.
  const twins: Array<[string, number]> = [["I39", boxes["8"].amount], ["L39", boxes["8"].vat], ["O39", boxes["8"].adjustment], ["I49", boxes["11"].amount], ["L49", boxes["11"].vat], ["O49", boxes["11"].adjustment], ["I54", boxes["12"].amount], ["I56", boxes["13"].amount], ["I58", boxes["14"].amount]];
  for (const [ref, value] of twins) if (sheet.includes(`<c r="${ref}"`)) sheet = setSheetCell(sheet, ref, value);
  return sheet;
}

export const vat201TemplatePath = "/templates/vat201-return-template.xlsx";

/** The VAT201 template (public/templates) with the return filled in. Only the worksheet cells change; the template's
 * layout, formulas, option buttons and sheet protection are kept, and Excel recalculates the totals on opening. */
export async function vat201Workbook(template: ArrayBuffer | Uint8Array, boxes: Record<Vat201BoxKey, Vat201Box>, heading: string) {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(template);
  const sheetPath = "xl/worksheets/sheet1.xml";
  const sheet = zip.file(sheetPath);
  const workbook = zip.file("xl/workbook.xml");
  if (!sheet || !workbook) throw new Error("The VAT return template is damaged.");
  zip.file(sheetPath, fillVat201Sheet(await sheet.async("string"), boxes, heading));
  const workbookXml = await workbook.async("string");
  zip.file("xl/workbook.xml", workbookXml.includes("<calcPr") ? workbookXml.replace(/<calcPr(?![^>]*fullCalcOnLoad)/, '<calcPr fullCalcOnLoad="1"') : workbookXml.replace("</workbook>", '<calcPr fullCalcOnLoad="1"/></workbook>'));
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
