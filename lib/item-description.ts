type DescriptionItem = { [key: string]: unknown; name?: unknown; description?: unknown; specifications?: unknown };

export function itemDescription(item?: DescriptionItem | null): string {
  if (!item) return "";
  try {
    const specs: unknown = JSON.parse(String(item.specifications ?? "[]"));
    if (Array.isArray(specs)) {
      const values = specs.map((spec) => typeof spec?.value === "string" ? spec.value.trim() : "").filter(Boolean).join(" | ");
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
