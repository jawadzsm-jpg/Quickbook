// Upgrade options for the Product Customization Details RAM, Storage and Screen Details boxes. A box that says ONBOARD
// (soldered, cannot be upgraded) stays plain text and gets no upgrade dropdown; a box that says OTHERS becomes a
// dropdown of the saved options. Inventory Overview users pick from the same options for their copies (nothing saved).
// Options are shared by all companies and stored in specification_options under the scopes below.

export const customizationOptionFields = ["ram", "storage", "screen"] as const;
export type CustomizationOptionField = typeof customizationOptionFields[number];
export type CustomizationOptions = Record<CustomizationOptionField, Array<{ id: number; value: string }>>;
export type CustomizationUpgrades = Partial<Record<CustomizationOptionField, string>>;

export const customizationOptionScopes: Record<CustomizationOptionField, string> = {
  ram: "__customization_ram__",
  storage: "__customization_storage__",
  screen: "__customization_screen__",
};

export const customizationFieldLabels: Record<CustomizationOptionField, string> = { ram: "RAM", storage: "Storage", screen: "Screen Details" };

export const customizationItemFields = { ram: "customizationRam", storage: "customizationStorage", screen: "customizationScreen" } as const;

// Specification labels each box falls back to when its own field is empty.
export const customizationSpecLabels: Record<CustomizationOptionField, string[]> = {
  ram: ["RAM", "Memory", "RAM Capacity"],
  storage: ["Storage", "SSD", "Hard Drive", "Storage Capacity"],
  screen: ["Screen", "Display", "Screen Size"],
};

export const isCustomizationScope = (label: string) => Object.values(customizationOptionScopes).includes(label);

const letters = (value: unknown) => String(value ?? "").normalize("NFKC").toUpperCase().replace(/[^A-Z]/g, "");

/** True when the box says ONBOARD (also the common typo ONBORAD), e.g. "RAM ONBOARD" or "8GB ON-BOARD". */
export function isOnboardValue(value: unknown) {
  const text = letters(value);
  return text.includes("ONBOARD") || text.includes("ONBORAD");
}

/** True when the box says OTHERS (or OTHER): show the dropdown of saved options. */
export function isOthersValue(value: unknown) {
  const text = letters(value);
  return text === "OTHERS" || text === "OTHER";
}

/** The box value from a product's specifications JSON, used when its customization field is empty. */
export function specificationBoxValue(specifications: string, field: CustomizationOptionField) {
  try {
    const parsed = JSON.parse(specifications) as unknown;
    if (!Array.isArray(parsed)) return "";
    const wanted = new Set(customizationSpecLabels[field].map((label) => label.toLowerCase()));
    const match = parsed.find((entry) => entry && typeof entry === "object" && wanted.has(String((entry as { label?: unknown }).label ?? "").trim().toLowerCase()) && String((entry as { value?: unknown }).value ?? "").trim());
    return String((match as { value?: unknown } | undefined)?.value ?? "").trim().slice(0, 200);
  } catch { return ""; }
}

/** The box value shown for an item: its customization field, else the matching specification. */
export function customizationBoxValue(record: { specifications: string } & Partial<Record<typeof customizationItemFields[CustomizationOptionField], string>>, field: CustomizationOptionField) {
  return String(record[customizationItemFields[field]] ?? "").trim() || specificationBoxValue(record.specifications, field);
}

/**
 * Applies Inventory Overview upgrade picks to a " | " specification line: the part equal to the box's current value
 * (e.g. "16GB" or "15.6 INCH") is replaced by the upgrade; when that part is not in the line the upgrade is added at
 * the end.
 */
export function applyCustomizationUpgrades(line: string, current: Partial<Record<CustomizationOptionField, string>>, upgrades: CustomizationUpgrades) {
  const parts = line.split("|").map((part) => part.trim()).filter(Boolean);
  for (const field of customizationOptionFields) {
    const upgrade = String(upgrades[field] ?? "").trim();
    if (!upgrade) continue;
    const now = String(current[field] ?? "").trim().toLocaleUpperCase("en");
    const index = now ? parts.findIndex((part) => part.toLocaleUpperCase("en") === now) : -1;
    if (index >= 0) parts[index] = upgrade;
    else parts.push(upgrade);
  }
  return parts.join(" | ");
}
