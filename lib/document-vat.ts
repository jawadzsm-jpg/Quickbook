// Sales and purchase documents carry one VAT treatment for the whole document; the first line sets it.
// Stock-return lines (negative quantity) are always zero-rated and sit outside this rule.
export const singleVatCodeDocumentTypes = ["invoice", "pending invoice", "quotation", "estimate", "proforma invoice", "sales order", "sales receipt", "credit memo", "bill", "purchase order"];

type VatLine = { vatCode?: string; quantity?: string | number };

export const usesSingleVatCode = (type: string) => singleVatCodeDocumentTypes.includes(type);

const followsDocumentVat = (line: VatLine) => !(Number(line.quantity) < 0);

/** VAT code the document already uses (first other line wins), ignoring the line at `exceptIndex`. */
export function documentVatCode(lines: VatLine[], exceptIndex = -1) {
  return lines.find((line, index) => index !== exceptIndex && followsDocumentVat(line) && line.vatCode)?.vatCode;
}

/** Apply one VAT code to every line that follows the document VAT. */
export function withDocumentVat<T extends VatLine>(lines: T[], vatCode: string, vatRate: string): T[] {
  return lines.map((line) => followsDocumentVat(line) ? { ...line, vatCode, vatRate } : line);
}

/** Distinct VAT codes on lines that must share the document VAT. */
export function documentVatCodes(lines: VatLine[]) {
  return [...new Set(lines.filter(followsDocumentVat).map((line) => String(line.vatCode ?? "")))];
}
