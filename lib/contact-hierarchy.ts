export type ContactNode = {
  id: number; companyId: number; type: string; status: string;
  parentContactId?: number | null; salesOwnerId?: number | null;
};

/** Validate organization links without moving balances or changing ledger accounts. */
export function contactOrganization(
  payload: Record<string, unknown>, current: ContactNode, rows: ContactNode[], salesOwnerId?: number,
): { status: "active" | "inactive"; parentContactId: number | null } {
  const status = payload.status === undefined ? current.status : String(payload.status);
  if (status !== "active" && status !== "inactive") throw new Error("Select Active or Inactive.");
  const raw = payload.parentContactId === undefined ? current.parentContactId : payload.parentContactId;
  const parentContactId = raw === "" || raw === null || raw === undefined ? null : Number(raw);
  if (parentContactId !== null && (!Number.isSafeInteger(parentContactId) || parentContactId <= 0)) throw new Error("Select a valid parent account.");
  if (current.type !== "customer" && current.type !== "vendor") {
    if (parentContactId !== null) throw new Error("Only customers and vendors can have sub-accounts.");
    return { status, parentContactId: null };
  }
  const byId = new Map(rows.filter(row => row.companyId === current.companyId && row.type === current.type).map(row => [row.id, row]));
  if (parentContactId !== null) {
    const parent = byId.get(parentContactId);
    if (!parent || (salesOwnerId !== undefined && parent.salesOwnerId !== salesOwnerId)) throw new Error("Select an accessible parent of the same type in this company.");
    if (status === "active" && parent.status === "inactive") throw new Error("Activate the parent account before activating this sub-account.");
    const visited = new Set<number>([current.id]);
    let next: number | null | undefined = parentContactId;
    while (next != null) {
      if (visited.has(next)) throw new Error("A sub-account cannot link to itself or one of its descendants.");
      visited.add(next);
      const ancestor = byId.get(next);
      if (!ancestor) throw new Error("The parent account hierarchy is invalid.");
      next = ancestor.parentContactId;
    }
  }
  if (status === "inactive" && rows.some(row => row.companyId === current.companyId && row.parentContactId === current.id && row.status === "active")) throw new Error("Make active sub-accounts inactive or move them before deactivating this parent.");
  return { status, parentContactId };
}
