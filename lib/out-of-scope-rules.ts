// Items bought outside the scope of VAT are sold outside it too. This file has no database access so the sales
// document form can share it with the server.

export const OUT_OF_SCOPE_CODE = "OUT_OF_SCOPE";

/** Customer documents whose item lines follow the out-of-scope rule. */
export const outOfScopeSalesTypes: ReadonlySet<string> = new Set(["invoice", "pending invoice", "quotation", "estimate", "proforma invoice", "sales order", "sales receipt", "credit memo"]);

type SalesLine = { itemId?: number | string | null; quantity: number | string; vatCode?: string; description?: string };

const isSale = (line: SalesLine) => Number(line.quantity) > 0;
const lineName = (line: SalesLine) => String(line.description ?? "").split("\n")[0].trim() || `item ${line.itemId}`;

/** True when a sale line (positive quantity) carries an out-of-scope item. */
export function hasOutOfScopeItem(lines: readonly SalesLine[], outOfScope: ReadonlySet<number>) {
  return lines.some((line) => isSale(line) && outOfScope.has(Number(line.itemId)));
}

/**
 * Why the lines break the rule, or "" when they follow it: an out-of-scope item must be sold on OUT_OF_SCOPE, and a
 * document with one may not also sell other stock items (each document has one VAT code). Stock returns are ignored.
 */
export function outOfScopeProblem(lines: readonly SalesLine[], outOfScope: ReadonlySet<number>) {
  if (!hasOutOfScopeItem(lines, outOfScope)) return "";
  const other = lines.find((line) => isSale(line) && line.itemId && !outOfScope.has(Number(line.itemId)));
  if (other) return `Items bought as Out of scope (OUT_OF_SCOPE) must be sold on their own document. Put ${lineName(other)} on a separate document.`;
  const wrong = lines.find((line) => isSale(line) && String(line.vatCode ?? "").toUpperCase() !== OUT_OF_SCOPE_CODE);
  return wrong ? `${lineName(wrong)}: items bought as Out of scope must be sold with the OUT_OF_SCOPE VAT code.` : "";
}
