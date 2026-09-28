export type ItemSpecification = { label?: string; value?: string };
type DescriptionItem = { [key: string]: unknown; name?: unknown; description?: unknown; specifications?: unknown };

const capitalText = (value: unknown) => String(value ?? "").normalize("NFKC").trim().toLocaleUpperCase("en");

export function generatedItemDescription(specifications: ItemSpecification[], sku?: unknown, itemNumber?: unknown) {
  const generatedSku = capitalText(sku);
  const generatedItemNumber = capitalText(itemNumber);
  const parts: string[] = [];
  let skuAdded = false;

  for (const specification of specifications) {
    const value = capitalText(specification.value);
    if (!value || value === "NO") continue;
    parts.push(value);
    if (capitalText(specification.label) === "MODEL" && generatedSku) {
      parts.push(`SKU: ${generatedSku}`);
      skuAdded = true;
    }
  }

  if (generatedSku && !skuAdded) parts.push(`SKU: ${generatedSku}`);
  if (generatedItemNumber) parts.push(`ITEM NO. #${generatedItemNumber.replace(/^#/, "")}`);
  return parts.join(" | ");
}

export function itemDescription(item?: DescriptionItem | null): string {
  if (!item) return "";
  try {
    const specs: unknown = JSON.parse(String(item.specifications ?? "[]"));
    if (Array.isArray(specs)) {
      const values = specs.map((specification) => typeof specification?.value === "string" ? specification.value.trim() : "").filter(Boolean).join(" | ");
      if (values) return values;
    }
  } catch { /* Older items may only have a plain-text description. */ }
  return String(item.description ?? "").trim();
}

export function fullItemDescription(item?: DescriptionItem | null): string {
  const name = String(item?.name ?? "").trim();
  const description = itemDescription(item);
  return name && description && name !== description ? `${name}\n${description}` : name || description;
}

// Preserve custom wording and saved full descriptions. Expand legacy name-only lines.
export function documentItemDescription(saved: unknown, item?: DescriptionItem | null): string {
  const description = String(saved ?? "").trim();
  return !description || description === String(item?.name ?? "").trim()
    ? fullItemDescription(item) || description
    : description;
}
