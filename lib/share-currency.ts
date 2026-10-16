// Inventory Overview share currency: prices are kept in the company's base currency and can be shown and shared
// (WhatsApp, Telegram, email, print, Excel) in USD or EUR using the company's saved exchange rates.
// Exchange rates are base-currency units per one foreign unit (USD 3.6725 means 1 USD = 3.6725 AED).

export const shareCurrencies = ["USD", "EUR"] as const;
export type ShareCurrency = (typeof shareCurrencies)[number];

const symbols: Record<string, string> = { USD: "$", EUR: "€" };

/** The currency's symbol ($, €), or an empty string when it has none here (AED and the rest use their code). */
export function shareCurrencySymbol(code: string) {
  return symbols[String(code).toUpperCase()] ?? "";
}

/** "USD ($)" for the currency picker; the base currency shows as its code. */
export function shareCurrencyOption(code: string) {
  const symbol = shareCurrencySymbol(code);
  return symbol ? `${code} (${symbol})` : code;
}

/**
 * The saved rate for `code`: 1 for the base currency, the active saved rate otherwise, or null when no usable rate is
 * saved (missing, inactive, zero, negative or not a number).
 */
export function shareCurrencyRate(rates: Array<{ currencyCode: string; rate: number | string; active?: boolean }>, baseCurrency: string, code: string): number | null {
  const wanted = String(code).toUpperCase();
  if (!wanted || wanted === String(baseCurrency).toUpperCase()) return 1;
  const entry = rates.find((rate) => String(rate.currencyCode).toUpperCase() === wanted && rate.active !== false);
  const rate = Number(entry?.rate);
  return entry && Number.isFinite(rate) && rate > 0 ? rate : null;
}

/** A base-currency amount in the chosen currency, rounded to 2 decimals (base amount ÷ rate). */
export function convertSharePrice(baseAmount: number, rate: number) {
  if (!Number.isFinite(baseAmount) || !Number.isFinite(rate) || rate <= 0) return 0;
  return Math.round((baseAmount / rate) * 100) / 100;
}

/** The message shown when a currency is picked but the company has no saved rate for it. */
export function missingShareRateMessage(code: string, baseCurrency: string, companyName: string) {
  return `No ${code} exchange rate is saved for ${companyName || "this company"}. Add the ${code} to ${baseCurrency} rate in Currencies to share prices in ${code}.`;
}
