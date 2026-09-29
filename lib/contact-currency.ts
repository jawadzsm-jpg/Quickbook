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

export function vendorPayableAccount(
  contacts: ContactCurrencyRecord[],
  accounts: ContactCurrencyRecord[],
  party: string,
  currency: string,
) {
  const vendor = contacts.find((entry) => entry.type === "vendor" && String(entry.name) === party);
  const payable = accounts.filter((account) => account.active && account.systemRole === "AP" && account.currency === currency);
  return String(payable.find((account) => Number(account.id) === Number(vendor?.ledgerAccountId))?.name
    ?? payable[0]?.name ?? "");
}


export function customerReceivableAccount(
  contacts: ContactCurrencyRecord[],
  accounts: ContactCurrencyRecord[],
  party: string,
  currency: string,
) {
  const customer = contacts.find((entry) => entry.type === "customer" && String(entry.name) === party);
  const receivables = accounts.filter((account) => account.active && account.systemRole === "AR" && account.currency === currency);
  return String(receivables.find((account) => Number(account.id) === Number(customer?.ledgerAccountId))?.name
    ?? receivables[0]?.name ?? "");
}
