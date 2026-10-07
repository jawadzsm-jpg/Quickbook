// Supplier bank details saved on vendor contacts. Free text with length limits; IBAN and SWIFT are upper-cased.

export const vendorBankFields = [
  { key: "bankName", label: "Bank Name", max: 120 },
  { key: "bankAccountName", label: "Account Name", max: 120 },
  { key: "bankAccountNumber", label: "Account Number", max: 80 },
  { key: "bankIban", label: "IBAN", max: 80 },
  { key: "bankSwift", label: "SWIFT / BIC", max: 40 },
] as const;
export type VendorBankKey = typeof vendorBankFields[number]["key"];

/** Validated bank fields present in a payload (only the keys that were sent). Throws on values that are too long. */
export function vendorBankChanges(payload: Record<string, unknown>) {
  const changes: Partial<Record<VendorBankKey, string>> = {};
  for (const field of vendorBankFields) {
    if (payload[field.key] === undefined) continue;
    const value = String(payload[field.key] ?? "").trim();
    if (value.length > field.max) throw new Error(`${field.label} must be ${field.max} characters or fewer.`);
    changes[field.key] = field.key === "bankIban" || field.key === "bankSwift" ? value.toUpperCase() : value;
  }
  return changes;
}

/** Readable lines for a supplier's bank details, skipping empty fields. */
export function vendorBankLines(contact: Record<string, unknown>) {
  return [
    contact.bankName ? String(contact.bankName) : "",
    contact.bankAccountName ? `Account name: ${contact.bankAccountName}` : "",
    contact.bankAccountNumber ? `Account no.: ${contact.bankAccountNumber}` : "",
    contact.bankIban ? `IBAN: ${contact.bankIban}` : "",
    contact.bankSwift ? `SWIFT: ${contact.bankSwift}` : "",
  ].filter(Boolean);
}
