// Upgrade options for the Product Customization Details RAM, Storage and Screen Details boxes. A box that says ONBOARD
// (soldered, cannot be upgraded) stays plain text and gets no upgrade dropdown; a box that says OTHERS becomes a
// dropdown of the saved options. Inventory Overview users pick from the same options for their copies (nothing saved).
// Options are shared by all companies and stored in specification_options under the scopes below. RAM and Storage
// options may carry a price (excluding VAT, in the base currency of the company being viewed, like the selling price)
// that Inventory Overview adds to the item's price when the upgrade is picked.

export const customizationOptionFields = ["ram", "storage", "screen"] as const;
export type CustomizationOptionField = typeof customizationOptionFields[number];
export type CustomizationOption = { id: number; value: string; price: number };
export type CustomizationOptions = Record<CustomizationOptionField, CustomizationOption[]>;
export type CustomizationUpgrades = Partial<Record<CustomizationOptionField, string>>;

export const customizationOptionScopes: Record<CustomizationOptionField, string> = {
  ram: "__customization_ram__",
  storage: "__customization_storage__",
  screen: "__customization_screen__",
};

/** Boxes whose upgrade options can have a price. */
export const pricedCustomizationFields: readonly CustomizationOptionField[] = ["ram", "storage"];

/** An upgrade price from user input: blank is 0; otherwise a number from 0 to 1,000,000 rounded to 2 decimals, or null when invalid. */
export function parseUpgradePrice(value: unknown) {
  const text = String(value ?? "").replace(/,/g, "").trim();
  if (!text) return 0;
  const price = Number(text);
  return Number.isFinite(price) && price >= 0 && price <= 1_000_000 ? Math.round(price * 100) / 100 : null;
}

/** The total price of the picked upgrades (RAM and Storage options with a price; Screen Details has none). */
export function upgradesPrice(options: CustomizationOptions, upgrades: CustomizationUpgrades | undefined) {
  let total = 0;
  for (const field of pricedCustomizationFields) {
    const picked = String(upgrades?.[field] ?? "").trim();
    if (picked) total += Number(options[field]?.find((option) => option.value === picked)?.price) || 0;
  }
  return Math.round(total * 100) / 100;
}

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

// How each box's value looks in a product line, e.g. "8GB RAM", "16GB DDR5", "512GB SSD", "1TB NVME",
// "FHD (1920×1080)", "QHD 165HZ IPS". Graphics memory ("4GB GDDR6") is not RAM; the screen size ("15.6 INCH") is kept.
const linePatterns: Record<CustomizationOptionField, { match: RegExp; skip?: RegExp }> = {
  ram: { match: /\bRAM\b|MEMORY|\b(?:LP)?DDR\d|^\d{1,2}\s*GB$/, skip: /GRAPHIC|GPU|VRAM|GDDR|RTX|GTX|RADEON|SSD|HDD|NVME|EMMC|STORAGE/ },
  storage: { match: /SSD|HDD|NVME|EMMC|STORAGE|HARD\s*(?:DRIVE|DISK)|^\d+(?:\.\d+)?\s*TB$|^\d{3,4}\s*GB$/, skip: /GRAPHIC|GPU|VRAM|GDDR|\bRAM\b/ },
  screen: { match: /\b(?:FHD|QHD|UHD|WQHD|WUXGA|WQXGA|WXGA|HD\+?|4K|2K|3K|2\.5K|2\.8K|OLED|AMOLED|IPS|TN|VA|RETINA)\b|\d{3,4}\s*[X×]\s*\d{3,4}|\d{2,3}\s*HZ\b|NITS/, skip: /GRAPHIC|GPU|RTX|GTX|RADEON|IRIS|ARC\b/ },
};

/**
 * Applies Inventory Overview upgrade picks to a " | " specification line, in that place: the RAM upgrade replaces the
 * RAM part (e.g. "8GB RAM"), the Storage upgrade the storage part ("512GB SSD") and the Screen Details upgrade the
 * resolution / panel part ("FHD (1920×1080)"; the screen size stays). A part equal to the box's current value is used
 * when no part looks like that box; with neither, the upgrade is added at the end. Nothing is saved.
 */
export function applyCustomizationUpgrades(line: string, current: Partial<Record<CustomizationOptionField, string>>, upgrades: CustomizationUpgrades) {
  const parts = line.split("|").map((part) => part.trim()).filter(Boolean);
  const used = new Set<number>();
  for (const field of customizationOptionFields) {
    const upgrade = String(upgrades[field] ?? "").trim();
    if (!upgrade) continue;
    const { match, skip } = linePatterns[field];
    const now = String(current[field] ?? "").trim().toLocaleUpperCase("en");
    const free = (index: number) => !used.has(index);
    let index = parts.findIndex((part, at) => { const text = part.normalize("NFKC").toLocaleUpperCase("en"); return free(at) && match.test(text) && !skip?.test(text); });
    if (index < 0 && now && !(field === "screen" && /INCH|"$/.test(now))) index = parts.findIndex((part, at) => free(at) && part.toLocaleUpperCase("en") === now);
    if (index >= 0) { parts[index] = upgrade; used.add(index); }
    else parts.push(upgrade);
  }
  return parts.join(" | ");
}
