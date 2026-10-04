import { normalizeComparableText } from "./text-normalization";

export const normalizeCustomerName = normalizeComparableText;

export function normalizeCustomerPhone(value: string) {
  return value.replace(/[\s().-]/g, "");
}

export function validInternationalPhone(value: string) {
  return /^\+[1-9]\d{6,14}$/.test(normalizeCustomerPhone(value));
}

export function customerNameSimilarity(a: string, b: string) {
  const left = Array.from(normalizeCustomerName(a));
  const right = Array.from(normalizeCustomerName(b));
  if (!left.length || !right.length) return 0;
  let previous = right.map((_, i) => i + 1); previous.unshift(0);
  for (let i = 1; i <= left.length; i++) {
    const current = [i];
    for (let j = 1; j <= right.length; j++) current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1));
    previous = current;
  }
  return 1 - previous[right.length] / Math.max(left.length, right.length);
}

export function customerConflict(
  candidate: { name: string; company: string; phone: string; whatsapp: string; trn: string },
  existing: { id: number; name: string; company: string; phone: string; whatsapp: string; trn: string }[],
  excludeId?: number,
) {
  if (candidate.name.length > 200 || candidate.company.length > 200) return "Customer names must be at most 200 characters.";
  const company = normalizeCustomerName(candidate.company);
  const name = normalizeCustomerName(candidate.name);
  const phones = [candidate.phone, candidate.whatsapp].filter(Boolean).map(normalizeCustomerPhone);
  const trn = candidate.trn.trim();
  for (const contact of existing) {
    if (contact.id === excludeId) continue;
    if ([company, name].some(value => value && [contact.company, contact.name].some(saved => customerNameSimilarity(value, saved) >= 0.7))) {
      return `Customer name is at least 70% similar to an existing customer: ${contact.company || contact.name}.`;
    }
    const savedPhones = [contact.phone, contact.whatsapp].filter(Boolean).map(normalizeCustomerPhone);
    if (phones.some((phone) => savedPhones.includes(phone))) return `Mobile/contact number already belongs to ${contact.company || contact.name}.`;
    if (trn && trn === contact.trn.trim()) return `TRN already belongs to ${contact.company || contact.name}.`;
  }
  return null;
}
