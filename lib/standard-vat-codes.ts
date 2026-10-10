export const standardVatCodes = [
  { code: "STANDARD", name: "Standard rated", rate: 5, description: "Standard UAE VAT rate", system: true },
  { code: "ZERO", name: "Zero rated", rate: 0, description: "Taxable supply charged at 0%", system: true },
  { code: "EXEMPT", name: "Exempt", rate: 0, description: "Supply exempt from VAT", system: true },
  { code: "REVERSE_CHARGE", name: "Reverse charge", rate: 5, description: "UAE reverse-charge supply reported in VAT201 Boxes 3 and 10", system: true },
  { code: "IMPORT_GOODS", name: "Goods imported into the UAE", rate: 5, description: "Imported goods supported by a Bill of Entry, Airway Bill and customs documents", system: true },
  { code: "OUT_OF_SCOPE", name: "Out of scope", rate: 0, description: "Transaction outside the scope of VAT", system: true },
] as const;

const standardRates: Record<string, number> = Object.fromEntries(standardVatCodes.map((vatCode) => [vatCode.code, vatCode.rate]));
const specialVatCodes = new Set(["REVERSE_CHARGE", "IMPORT_GOODS"]);

/**
 * The VAT code to apply when the app picks one itself (new-line default, zero-rate lines): `preferred` while it is
 * active, otherwise an active ordinary code with the same rate, then STANDARD, then the first active code. Reverse
 * charge and import codes are never chosen in place of another code. With no active codes, `preferred` is kept.
 */
export function activeVatCode(active: readonly { code: string; rate: number | string }[], preferred: string) {
  if (!active.length || active.some((entry) => entry.code === preferred)) return preferred;
  const ordinary = active.filter((entry) => !specialVatCodes.has(entry.code));
  const rate = standardRates[preferred];
  return (rate === undefined ? undefined : ordinary.find((entry) => Number(entry.rate) === rate))?.code
    ?? active.find((entry) => entry.code === "STANDARD")?.code ?? ordinary[0]?.code ?? active[0].code;
}
