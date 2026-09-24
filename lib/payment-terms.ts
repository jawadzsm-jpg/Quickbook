export function dueDateForPaymentTerms(transactionDate: string, terms: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(transactionDate)) return undefined;
  const date = new Date(`${transactionDate}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== transactionDate) return undefined;
  const normalized = terms.trim().toLowerCase();
  let days: number | undefined;
  if (/^(due on receipt|advance payment)$/.test(normalized)) days = 0;
  else {
    const match = normalized.match(/\bnet\s*(\d{1,4})\b/i) ?? normalized.match(/\b(\d{1,4})\s*days?\b/i);
    if (match) days = Number(match[1]);
  }
  if (days === undefined || !Number.isInteger(days) || days < 0 || days > 3650) return undefined;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
