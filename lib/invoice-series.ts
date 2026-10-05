export const defaultInvoiceNumberFormat = "C{COMPANY}-{PREFIX}-INV-{NUMBER}";

export type InvoiceSeries = {
  invoicePrefix: string;
  nextInvoiceNumber: number;
  invoiceNumberFormat?: string;
  invoiceNumberPadding?: number;
};

export function formatInvoiceNumber(companyId: number, series: InvoiceSeries): string {
  const format = series.invoiceNumberFormat ?? defaultInvoiceNumberFormat;
  return format.replace(/\{(COMPANY|PREFIX|NUMBER)\}/g, (_, token: string) => {
    if (token === "COMPANY") return String(companyId).padStart(3, "0");
    if (token === "PREFIX") return series.invoicePrefix;
    return String(series.nextInvoiceNumber).padStart(series.invoiceNumberPadding ?? 4, "0");
  });
}

export function invoiceSeriesError(companyId: number, series: InvoiceSeries): string | null {
  const format = series.invoiceNumberFormat ?? defaultInvoiceNumberFormat;
  const padding = series.invoiceNumberPadding ?? 4;
  if (!format || format.length > 70 || (format.match(/\{NUMBER\}/g) ?? []).length !== 1) return "Include {NUMBER} exactly once in a format of up to 70 characters.";
  if (!/^[A-Z0-9 /_.-]*$/.test(format.replace(/\{(COMPANY|PREFIX|NUMBER)\}/g, ""))) return "Use letters, numbers, spaces, /, -, _, . and the supported placeholders only.";
  if (!/^[A-Z0-9 /_.-]{0,20}$/.test(series.invoicePrefix) || (format.includes("{PREFIX}") && !series.invoicePrefix.trim())) return "Enter a prefix of up to 20 characters, or remove {PREFIX} from the format.";
  if (!Number.isInteger(padding) || padding < 1 || padding > 12) return "Number length must be between 1 and 12 digits.";
  if (!Number.isInteger(series.nextInvoiceNumber) || series.nextInvoiceNumber < 1 || series.nextInvoiceNumber > 999999999) return "Next number must be a whole number between 1 and 999999999.";
  if (formatInvoiceNumber(companyId, series).length > 100) return "The complete invoice number cannot exceed 100 characters.";
  return null;
}

export function invoiceSeriesRevision(series: InvoiceSeries): string {
  return JSON.stringify([series.invoicePrefix, series.nextInvoiceNumber, series.invoiceNumberFormat ?? defaultInvoiceNumberFormat, series.invoiceNumberPadding ?? 4]);
}
