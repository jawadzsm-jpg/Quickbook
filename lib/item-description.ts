export type ItemSpecification = { label?: string; value?: string };
type DescriptionItem = { [key: string]: unknown; name?: unknown; description?: unknown; specifications?: unknown };

const capitalText = (value: unknown) => String(value ?? "").normalize("NFKC").trim().toLocaleUpperCase("en");
const comparableText = (value: unknown) => capitalText(value).replace(/[^\p{L}\p{N}]+/gu, "");

function descriptionParts(value: unknown) {
  return capitalText(value).split("|").map((part) => part.trim()).filter((part) => part && part !== "NO");
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

/** True when the item's Model specification is "NO" (the item has no model). */
export function itemHasNoModel(specifications: unknown) {
  try {
    const parsed: unknown = typeof specifications === "string" ? JSON.parse(specifications || "[]") : specifications;
    return Array.isArray(parsed) && parsed.some((specification) => capitalText(specification?.label) === "MODEL" && capitalText(specification?.value) === "NO");
  } catch { return false; }
}

/**
 * The name and SKU an Inventory Overview line is built from. With Model "NO" the saved name (Brand + Model) ends in
 * that "NO" and the generated SKU would stand in for the model, so both are left out; saved items are not changed.
 */
export function inventoryLineNameSku(item: { name?: unknown; sku?: unknown; specifications?: unknown }) {
  if (!itemHasNoModel(item.specifications)) return { name: item.name, sku: item.sku };
  return { name: capitalText(item.name).replace(/(?:^|\s+)NO$/, ""), sku: "" };
}

const inventoryConditions =new Set(["BRAND NEW", "OPEN BOX", "REFURBISHED", "RENEWED", "USED"]);

/** An item line's parts: identity (name and SKU), condition (BRAND NEW…) and the remaining details. */
export function inventoryLineParts(name: unknown, sku: unknown, description: unknown, itemNumber?: unknown) {
  const title = inventoryItemTitle(name);
  const code = capitalText(sku);
  const identity = code && !comparableText(title).endsWith(comparableText(code)) ? `${title} ${code}` : title;
  const parts = descriptionParts(itemSpecificationDescription(description, name, sku, itemNumber));
  const conditionIndex = parts.findIndex((part) => inventoryConditions.has(part));
  const condition = conditionIndex >= 0 ? parts.splice(conditionIndex, 1)[0] : "";
  return { identity, condition, details: parts.join(" | ") };
}

const measurement = /^\d+(?:\.\d+)?(?:GB|TB|MB|GHZ|MHZ|HZ|W|MAH|INCH|K)$/;
const resolution = /^\d{3,4}X\d{3,4}$/;
/**
 * A part number written in a product line ("... | 90NB1603-M002S0 | ..."): the last "|" section that is one code of
 * 6+ letters, digits and dashes with both a letter and a digit. Sizes (16GB, 1TB), resolutions (1920X1200) and the
 * trailing #Item No. are skipped. Returns "" when there is none.
 */
export function partNumberInLine(line: unknown) {
  const sections = capitalText(line).split("|").map((part) => part.trim().replace(/\s*#\d+$/, ""));
  return sections.filter((part) => /^[A-Z0-9][A-Z0-9./-]{5,}$/.test(part) && /[A-Z]/.test(part) && /\d/.test(part) && !measurement.test(part) && !resolution.test(part)).at(-1) ?? "";
}

/** The item's condition (BRAND NEW, OPEN BOX, REFURBISHED, RENEWED or USED) from its description, or "" when none is given. */
export function inventoryItemCondition(name: unknown, sku: unknown, description: unknown, itemNumber?: unknown) {
  return inventoryLineParts(name, sku, description, itemNumber).condition;
}

/** The one-line item text with its "#Item No." at the end; `withNumber: false` leaves the number out (share copies). */
export function inventoryItemLine(name: unknown, sku: unknown, description: unknown, itemNumber?: unknown, withNumber = true) {
  const { identity, condition, details } = inventoryLineParts(name, sku, description, itemNumber);
  const number = withNumber ? capitalText(itemNumber).replace(/^#/, "") : "";
  const detailsWithNumber = [details, number ? `#${number}` : ""].filter(Boolean).join(" ");
  return [identity, condition, detailsWithNumber].filter(Boolean).join(" | ");
}

/**
 * Emoji around the title and condition: Inventory Overview passes the user's chosen style; "" leaves them plain.
 * The item number is used only to strip "Item No." from the description; shared text never shows the "#Item No.".
 */
export function inventorySocialShareText(name: unknown, sku: unknown, description: unknown, channel: "whatsapp" | "telegram", itemNumber?: unknown, emoji: { title: string; condition: string } = { title: "🔺", condition: "⚡" }) {
  const { identity, condition, details } = inventoryLineParts(name, sku, description, itemNumber);
  const bold = (value: string) => channel === "whatsapp" ? `*${value}*` : `**${value}**`;
  const around = (mark: string, value: string) => mark ? `${mark} ${value} ${mark}` : value;
  const heading = [around(emoji.title, bold(identity)), condition ? around(emoji.condition, bold(condition)) : ""].filter(Boolean).join(" | ");
  return [condition ? `${heading} |` : heading, details ? bold(details) : ""].filter(Boolean).join("\n");
}

export function inventoryItemDetails(description: unknown, itemNumber?: unknown) {
  const number = capitalText(itemNumber).replace(/^#/, "");
  const details = itemSpecificationDescription(description, undefined, undefined, number)
    .replace(/\s*(?:\|\s*)?(?:ITEM\s*(?:NO\.?|NUMBER)\s*[:#]?\s*)?#\s*\d+\s*$/i, "").trim();
  return [details, number ? `#${number}` : ""].filter(Boolean).join(" ");
}

export function inventoryShareDescription(description: unknown, itemNumber?: unknown) {
  const number = capitalText(itemNumber).replace(/^#/, "");
  const details = itemSpecificationDescription(description, undefined, undefined, number)
    .replace(/\s*(?:\|\s*)?(?:ITEM\s*(?:NO\.?|NUMBER)\s*[:#]?\s*)?#\s*[\p{L}\p{N}-]+\s*$/iu, "")
    .trim();
  return descriptionParts(details).filter((part) => part !== "NO").join(" | ");
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
      const values = specs.map((specification) => typeof specification?.value === "string" ? specification.value.trim() : "").filter((value) => value && capitalText(value) !== "NO").join(" | ");
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
