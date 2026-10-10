export const standardVatCodes = [
  { code: "STANDARD", name: "Standard rated", rate: 5, description: "Standard UAE VAT rate", system: true },
  { code: "ZERO", name: "Zero rated", rate: 0, description: "Taxable supply charged at 0%", system: true },
  { code: "EXEMPT", name: "Exempt", rate: 0, description: "Supply exempt from VAT", system: true },
  { code: "REVERSE_CHARGE", name: "Reverse charge", rate: 5, description: "UAE reverse-charge supply reported in VAT201 Boxes 3 and 10", system: true },
  { code: "IMPORT_GOODS", name: "Goods imported into the UAE", rate: 5, description: "Imported goods supported by a Bill of Entry, Airway Bill and customs documents", system: true },
  { code: "OUT_OF_SCOPE", name: "Out of scope", rate: 0, description: "Transaction outside the scope of VAT", system: true },
] as const;

/** Codes the app applies on its own (new-line default and zero-rate fallback, e.g. negative invoice lines), so they always stay active. */
export const alwaysActiveVatCodes: ReadonlySet<string> = new Set(["STANDARD", "ZERO"]);
export const alwaysActiveVatMessage = "STANDARD and ZERO must remain active: documents use them as the default and zero-rate VAT codes.";
