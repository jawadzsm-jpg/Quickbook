// Customer-facing sales documents carry one VAT treatment for the whole document.
// Stock-return lines (negative quantity) are always zero-rated and sit outside this rule.
export const singleVatCodeDocumentTypes = ["invoice", "pending invoice", "quotation", "estimate", "proforma invoice", "sales order", "sales receipt", "credit memo"];

type VatLine = { vatCode?: string; quantity?: string | number; itemId?: string | number | null; description?: string; unitPrice?: string | number };

export const usesSingleVatCode = (type: string) => singleVatCodeDocumentTypes.includes(type);

const followsDocumentVat = (line: VatLine) => !(Number(line.quantity) < 0);
const isFilled = (line: VatLine) => Boolean(line.itemId || String(line.description ?? "").trim() || Number(line.unitPrice) > 0);

/** VAT code already used by the document's other lines, ignoring the line at `exceptIndex` and empty lines. */
export function documentVatCode(lines: VatLine[], exceptIndex = -1) {
  return lines.find((line, index) => index !== exceptIndex && followsDocumentVat(line) && isFilled(line) && line.vatCode)?.vatCode;
}

/** Apply one VAT code to every line that follows the document VAT. */
export function withDocumentVat<T extends VatLine>(lines: T[], vatCode: string, vatRate: string): T[] {
  return lines.map((line) => followsDocumentVat(line) ? { ...line, vatCode, vatRate } : line);
}

/** Distinct VAT codes on lines that must share the document VAT. */
export function documentVatCodes(lines: VatLine[]) {
  return [...new Set(lines.filter(followsDocumentVat).map((line) => String(line.vatCode ?? "")))];
}
