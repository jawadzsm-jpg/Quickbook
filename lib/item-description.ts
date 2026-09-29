export type ItemSpecification = { label?: string; value?: string };
type DescriptionItem = { [key: string]: unknown; name?: unknown; description?: unknown; specifications?: unknown };

const capitalText = (value: unknown) => String(value ?? "").normalize("NFKC").trim().toLocaleUpperCase("en");
const comparableText = (value: unknown) => capitalText(value).replace(/[^\p{L}\p{N}]+/gu, "");

function descriptionParts(value: unknown) {
  return capitalText(value).split("|").map((part) => part.trim()).filter(Boolean);
}

export function itemTitleWithSku(name: unknown, sku: unknown) {
  const title = capitalText(name);
  const code = capitalText(sku);
  if (!code || comparableText(title).endsWith(comparableText(code))) return title;
  return `${title}-${code}`;
}

export function inventoryItemTitle(name: unknown) {
  return capitalText(name);
}

export function inventoryItemDetails(description: unknown, itemNumber?: unknown) {
  const number = capitalText(itemNumber).replace(/^#/, "");
  const details = itemSpecificationDescription(description, undefined, undefined, number)
    .replace(/\s*(?:\|\s*)?(?:ITEM\s*(?:NO\.?|NUMBER)\s*[:#]?\s*)?#\s*\d+\s*$/i, "").trim();
  return [details, number ? `#${number}` : ""].filter(Boolean).join(" ");
}

export function itemSpecificationDescription(value: unknown, name?: unknown, sku?: unknown, itemNumber?: unknown) {
  const code = comparableText(sku);
  const number = comparableText(itemNumber);
  const title = comparableText(name);
  const parts = descriptionParts(value).filter((part) => {
    const comparable = comparableText(part);
    if (/^SKU\s*:/i.test(part) || /^ITEM\s*(?:NO\.?|NUMBER)\s*[:#]?/i.test(part)) return false;
    if (code && comparable === code) return false;
    if (number && (comparable === number || comparable === `ITEMNO${number}` || comparable === `ITEMNUMBER${number}`)) return false;
    return true;
  });

  let consumed = "";
  while (title && parts.length) {
    const candidate = comparableText(`${consumed} ${parts[0]}`);
    if (!candidate || !title.startsWith(candidate)) break;
    consumed = `${consumed} ${parts.shift()}`;
  }
  return parts.join(" | ");
}

export function invoiceItemDescription(value: unknown, itemNumber?: unknown) {
  const description = itemSpecificationDescription(value, undefined, undefined, itemNumber);
  const number = capitalText(itemNumber).replace(/^#/, "");
  return [description, number ? `ITEM NO. #${number}` : ""].filter(Boolean).join(" | ");
}

export function generatedItemDescription(specifications: ItemSpecification[], name?: unknown, sku?: unknown, itemNumber?: unknown) {
  const values = specifications
    .map((specification) => capitalText(specification.value))
    .filter((value) => value && value !== "NO")
    .join(" | ");
  return itemSpecificationDescription(values, name, sku, itemNumber);
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
