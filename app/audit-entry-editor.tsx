"use client";

import { useState, type FormEvent } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useConfirmDelete } from "./confirm-delete-dialog";

type AuditRow = Record<string, string | number | null>;

// Audit Trail report rows show "—" for an entry saved without details.
const rawDetails = (row: AuditRow) => String(row.details ?? "") === "—" ? "" : String(row.details ?? "");
const entryDetails = (row: AuditRow) => [
  { label: "Date / Time (Dubai)", value: String(row.date ?? "") },
  { label: "By", value: String(row.actor ?? "") },
  { label: "Action", value: String(row.action ?? "") },
  { label: "Record", value: `${String(row.entity ?? "")} #${String(row.entityId ?? "")}` },
];
const deletedHistory = (row: AuditRow) => ["transaction", "journal entry"].includes(String(row.entity)) && ["deleted", "voided"].includes(String(row.action));

/** All-Admin only (the API enforces it): Edit and Delete buttons for Audit Trail rows, the edit dialog and the shared delete confirmation. */
export function useAuditEntryEditor({ companyId, onChanged }: { companyId: number; onChanged: () => Promise<void> }) {
  const { confirmDelete, confirmDeleteDialog } = useConfirmDelete();
  const [editing, setEditing] = useState<AuditRow | null>(null);
  const [details, setDetails] = useState("");
  const [saving, setSaving] = useState(false);

  const send = async (method: "PATCH" | "DELETE", body: Record<string, unknown>) => {
    const response = await fetch("/api/audit-log", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, ...body }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not change the audit entry.");
  };

  const remove = async (row: AuditRow) => {
    const confirmed = await confirmDelete({ title: "Delete this audit entry?",
      description: "The entry is removed from the Audit Trail. A record of the deletion, with the removed entry, is kept.",
      details: [...entryDetails(row), { label: "Details / reason", value: rawDetails(row) }],
      affected: deletedHistory(row) ? ["Also removed from the Voided/Deleted Transactions reports"] : [],
    });
    if (!confirmed) return;
    try { await send("DELETE", { id: Number(row.auditId) }); toast.success("Audit entry deleted"); await onChanged(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not delete the audit entry."); }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    try { await send("PATCH", { id: Number(editing.auditId), details, expectedDetails: rawDetails(editing) }); toast.success("Audit entry updated"); setEditing(null); await onChanged(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not update the audit entry."); }
    finally { setSaving(false); }
  };

  const actions = (row: AuditRow) => Number(row.auditId) > 0 ? <span className="inline-flex gap-1 print:hidden">
    <Button type="button" size="icon-sm" variant="ghost" aria-label={`Edit audit entry ${row.action} ${row.entity} #${row.entityId}`} title="Edit" onClick={() => { setEditing(row); setDetails(rawDetails(row)); }}><Pencil className="size-4" /></Button>
    <Button type="button" size="icon-sm" variant="ghost" className="text-destructive hover:text-destructive" aria-label={`Delete audit entry ${row.action} ${row.entity} #${row.entityId}`} title="Delete" onClick={() => void remove(row)}><Trash2 className="size-4" /></Button>
  </span> : null;

  const dialogs = <>
    {confirmDeleteDialog}
    <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open && !saving) setEditing(null); }}>
      <DialogContent className="sm:max-w-lg"><form onSubmit={save} className="space-y-4">
        <DialogHeader><DialogTitle>Edit audit entry</DialogTitle><DialogDescription>Correct the details (reason / notes) of this entry. The previous text is kept in a separate audit record.</DialogDescription></DialogHeader>
        {editing && <dl className="divide-y rounded-lg border bg-muted/40 text-sm" aria-label="Audit entry">{entryDetails(editing).map((detail) => <div key={detail.label} className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-3 px-3 py-2"><dt className="text-muted-foreground">{detail.label}</dt><dd className="min-w-0 font-medium break-words">{detail.value || "—"}</dd></div>)}</dl>}
        <div className="space-y-2"><Label htmlFor="audit-entry-details">Details / reason</Label><Textarea id="audit-entry-details" value={details} maxLength={4000} rows={6} required onChange={(event) => setDetails(event.target.value)} /></div>
        <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" disabled={saving || !details.trim()}>{saving ? "Saving…" : "Save"}</Button></DialogFooter>
      </form></DialogContent>
    </Dialog>
  </>;

  return { actions, dialogs };
}
