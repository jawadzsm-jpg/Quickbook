import { partNumberInLine } from "@/lib/item-description";

/** Days without any document, stock movement or edit after which an item with no stock is made inactive (lib/item-idle.ts). */
export const ITEM_IDLE_DAYS = 90;

type ItemLike = Record<string, unknown>;

// Codes compare without case, spaces or punctuation: "90nb1603 m002s0" finds "90NB1603-M002S0".
const code = (value: unknown) => String(value ?? "").normalize("NFKC").toLocaleUpperCase("en").replace(/[^\p{L}\p{N}]+/gu, "");

/** The item's part number: its Part Number field, else its Part Number / MPN specification; capitals. */
export function itemPartNumber(item: ItemLike) {
  let value = String(item.partNumber ?? "").trim();
  if (!value) {
    try {
      const parsed = typeof item.specifications === "string" ? JSON.parse(item.specifications) : item.specifications;
      if (Array.isArray(parsed)) value = String(parsed.find((entry) => ["PART NUMBER", "MPN"].includes(String(entry?.label ?? "").trim().toUpperCase()) && String(entry?.value ?? "").trim())?.value ?? "");
    } catch { value = ""; }
  }
  return value.normalize("NFKC").trim().toLocaleUpperCase("en");
}

/** Codes people search an item by: part number (field, specification or the code in its product line), SKU, item no. and UPC. */
export function itemSearchCodes(item: ItemLike) {
  return [itemPartNumber(item), partNumberInLine(item.description), item.sku, item.itemNumber, item.upcNumber].map(code).filter(Boolean);
}

/**
 * Inactive items whose part number, SKU, item no. or UPC matches the search: the whole search or one of its words, at
 * least 3 characters; a code of 4+ characters may also be part of a longer code. Used to tell people "You have this item
 * — it is in Inactive items" when a list or picker hides inactive items.
 */
export function inactiveCodeMatches<T extends ItemLike>(items: readonly T[], query: string, limit = 5): T[] {
  const terms = [...new Set([query, ...query.split(/\s+/)].map(code).filter((term) => term.length >= 3))];
  if (!terms.length) return [];
  const found: T[] = [];
  for (const item of items) {
    if (String(item.status ?? "active") !== "inactive") continue;
    const codes = itemSearchCodes(item);
    if (codes.some((value) => terms.some((term) => value === term || (term.length >= 4 && value.includes(term))))) found.push(item);
    if (found.length >= limit) break;
  }
  return found;
}
