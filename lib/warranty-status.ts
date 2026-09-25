export const warrantyStatuses = [
  "Returned to Supplier",
  "Under Process",
  "Completed",
  "Returned to Customer",
] as const;

export type WarrantyStatus = typeof warrantyStatuses[number];

export function normalizeWarrantyStatus(value: string): WarrantyStatus | null {
  if (value === "Returned") return "Returned to Customer";
  return warrantyStatuses.find((status) => status === value) ?? null;
}
