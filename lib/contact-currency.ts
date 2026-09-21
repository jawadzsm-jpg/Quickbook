export type ContactCurrencyRecord = Record<string, unknown>;

export type SavedCurrencyRate = {
  currencyCode: string;
  rate: number;
};

export function applyContactCurrency(
  form: Record<string, string>,
  contacts: ContactCurrencyRecord[],
  party: string,
  contactType: "customer" | "vendor" | "employee",
  exchangeRates: SavedCurrencyRate[],
  baseCurrency: string,
) {
  const contact = contacts.find((entry) => entry.type === contactType && String(entry.name) === party);
  const currency = String(contact?.currency || form.currency || baseCurrency);
  const savedRate = exchangeRates.find((entry) => entry.currencyCode === currency)?.rate;

  return {
    ...form,
    party,
    currency,
    exchangeRate: currency === baseCurrency ? "1" : savedRate ? String(savedRate) : "",
  };
}
