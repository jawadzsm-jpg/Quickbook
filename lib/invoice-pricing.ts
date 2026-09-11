// Exchange rates are home-currency units per one document-currency unit.
export type PricedInvoiceLine = {
  unitPrice: string;
  unitCost: string;
  homeUnitPrice?: number;
  homeUnitCost?: number;
};

export function validDocumentRate(value: unknown): number {
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("Set a positive exchange rate before converting invoice prices.");
  return rate;
}

export function invoiceCurrencyAmount(homeAmount: number, rate: number): string {
  validDocumentRate(rate);
  if (!Number.isFinite(homeAmount)) throw new Error("Enter a valid item price.");
  return String(Number((homeAmount / rate).toFixed(2)));
}

export function convertInvoiceLines<T extends PricedInvoiceLine>(lines: T[], oldRate: number, newRate: number): T[] {
  validDocumentRate(oldRate);
  validDocumentRate(newRate);
  return lines.map((line) => {
    // Retain unrounded home amounts so switching currencies never compounds rounding.
    const homeUnitPrice = line.homeUnitPrice ?? Number(line.unitPrice || 0) * oldRate;
    const homeUnitCost = line.homeUnitCost ?? Number(line.unitCost || 0) * oldRate;
    return { ...line, homeUnitPrice, homeUnitCost,
      unitPrice: invoiceCurrencyAmount(homeUnitPrice, newRate),
      unitCost: invoiceCurrencyAmount(homeUnitCost, newRate) };
  });
}
