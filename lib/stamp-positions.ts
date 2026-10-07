// Saved stamp placement per document type (tax-invoice, quotation, delivery-note, ...): whether the company
// stamp and the bank details box are shown, and where each sits. `page: true` marks positions on the first page
// (millimetres from the printable area's top-left); older entries without it were offsets in a strip below the totals.

export type StampPlacement = { show: boolean; left: number; top: number; page?: boolean };
export type DocumentStampPositions = { company?: StampPlacement; bank?: StampPlacement };
export type StampPositions = Record<string, DocumentStampPositions>;

const MAX_DOCUMENT_TYPES = 40;
const placement = (value: unknown): StampPlacement => {
  const entry = value as Record<string, unknown> | null;
  if (!entry || typeof entry !== "object" || typeof entry.show !== "boolean") throw new Error("Invalid stamp position.");
  const left = Number(entry.left), top = Number(entry.top);
  if (!Number.isInteger(left) || left < 0 || left > 300 || !Number.isInteger(top) || top < 0 || top > 300) throw new Error("Stamp positions must be whole millimetres between 0 and 300.");
  return { show: entry.show, left, top, ...(entry.page === true ? { page: true } : {}) };
};

/** Validate stored or submitted stamp positions; throws on invalid input. */
export function parseStampPositions(value: unknown): StampPositions {
  if (value === undefined || value === null || value === "") return {};
  const raw = typeof value === "string" ? JSON.parse(value) : value;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid stamp positions.");
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > MAX_DOCUMENT_TYPES) throw new Error("Too many document types in stamp positions.");
  const result: StampPositions = {};
  for (const [type, stamps] of entries) {
    if (!/^[a-z][a-z-]{0,39}$/.test(type) || !stamps || typeof stamps !== "object") throw new Error("Invalid stamp positions.");
    const { company, bank } = stamps as Record<string, unknown>;
    result[type] = { ...(company !== undefined ? { company: placement(company) } : {}), ...(bank !== undefined ? { bank: placement(bank) } : {}) };
  }
  return result;
}

export function readStampPositions(value: unknown): StampPositions {
  try { return parseStampPositions(value); } catch { return {}; }
}
