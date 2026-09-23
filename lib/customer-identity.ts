import { normalizeComparableText } from "./text-normalization";

export const normalizeCustomerName = normalizeComparableText;

export function normalizeCustomerPhone(value: string) {
  return value.replace(/[\s().-]/g, "");
}

export function validInternationalPhone(value: string) {
  return /^\+[1-9]\d{6,14}$/.test(normalizeCustomerPhone(value));
}

export function customerConflict(
  candidate: { name: string; company: string; phone: string; whatsapp: string; trn: string },
  existing: { id: number; name: string; company: string; phone: string; whatsapp: string; trn: string }[],
  excludeId?: number,
) {
  const company = normalizeCustomerName(candidate.company);
  const name = normalizeCustomerName(candidate.name);
  const phones = [candidate.phone, candidate.whatsapp].filter(Boolean).map(normalizeCustomerPhone);
  const trn = candidate.trn.trim();
  for (const contact of existing) {
    if (contact.id === excludeId) continue;
    if (company && company === normalizeCustomerName(contact.company) || name && name === normalizeCustomerName(contact.name)) {
      return `Customer name already exists: ${contact.company || contact.name}.`;
    }
    const savedPhones = [contact.phone, contact.whatsapp].filter(Boolean).map(normalizeCustomerPhone);
    if (phones.some((phone) => savedPhones.includes(phone))) return `Mobile/contact number already belongs to ${contact.company || contact.name}.`;
    if (trn && trn === contact.trn.trim()) return `TRN already belongs to ${contact.company || contact.name}.`;
  }
  return null;
}
