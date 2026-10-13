// EasyBook edition (client-safe): limits on companies, inventories and warehouses for this installation.

export const editions = ["multi_company", "single_company", "single_inventory", "single_warehouse"] as const;
export type Edition = typeof editions[number];
export const DEFAULT_EDITION: Edition = "multi_company";

export type EditionLimits = { multiCompany: boolean; multiInventory: boolean; multiWarehouse: boolean };
export const editionDetails: Record<Edition, EditionLimits & { label: string; description: string }> = {
  multi_company: { label: "Multi company", description: "Many companies, each with many inventories and warehouses.", multiCompany: true, multiInventory: true, multiWarehouse: true },
  single_company: { label: "Single company", description: "One company with many inventories and warehouses.", multiCompany: false, multiInventory: true, multiWarehouse: true },
  single_inventory: { label: "Single company · one inventory", description: "One company and one inventory with many warehouses.", multiCompany: false, multiInventory: false, multiWarehouse: true },
  single_warehouse: { label: "Single company · one warehouse", description: "One company, one inventory and one warehouse.", multiCompany: false, multiInventory: false, multiWarehouse: false },
};

export const isEdition = (value: unknown): value is Edition => editions.includes(value as Edition);
export const editionOf = (value: unknown): Edition => isEdition(value) ? value : DEFAULT_EDITION;

/** Active records counted against an edition: companies, and the busiest company / inventory. */
export type EditionUsage = { companies: number; inventories: { name: string; count: number }; warehouses: { name: string; count: number } };

/** What must be deactivated or removed before switching to `edition`; empty when the switch is allowed. */
export function editionBlockers(edition: Edition, usage: EditionUsage) {
  const limits = editionDetails[edition], blockers: string[] = [];
  if (!limits.multiCompany && usage.companies > 1) blockers.push(`There are ${usage.companies} active companies. Delete all but one first.`);
  if (!limits.multiInventory && usage.inventories.count > 1) blockers.push(`${usage.inventories.name} has ${usage.inventories.count} active inventories. Remove all but one first.`);
  if (!limits.multiWarehouse && usage.warehouses.count > 1) blockers.push(`${usage.warehouses.name} has ${usage.warehouses.count} active warehouses. Deactivate all but the default first.`);
  return blockers;
}

export const editionLimitMessage = (what: "company" | "inventory" | "warehouse", edition: Edition) =>
  `Your EasyBook edition (${editionDetails[edition].label}) allows only one ${what}. An All-Admin can change the edition in Admin Controls.`;
