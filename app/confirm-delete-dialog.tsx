"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

// One row of "what will be deleted": empty values are skipped so callers can pass optional fields as they are.
export type DeleteDetail = { label: string; value: ReactNode };

export type DeleteConfirmation = {
  title: string;
  description?: ReactNode;
  details?: DeleteDetail[];
  // Linked records or effects that change with this delete (stock reversed, files removed, …).
  affected?: ReactNode[];
  confirmLabel?: string;
};

const shown = (value: ReactNode) => value !== null && value !== undefined && value !== false && String(value).trim() !== "";

export function DeleteDetailsList({ details = [], affected = [] }: Pick<DeleteConfirmation, "details" | "affected">) {
  const rows = details.filter((detail) => shown(detail.value));
  const effects = affected.filter(shown);
  if (!rows.length && !effects.length) return null;
  return <div className="space-y-3 text-sm">
    {rows.length ? <dl className="divide-y rounded-lg border bg-muted/40" aria-label="Record to delete">{rows.map((detail) => <div key={detail.label} className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-3 px-3 py-2"><dt className="text-muted-foreground">{detail.label}</dt><dd className="min-w-0 font-medium break-words [overflow-wrap:anywhere]">{detail.value}</dd></div>)}</dl> : null}
    {effects.length ? <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"><p className="flex items-center gap-2 font-medium"><AlertTriangle className="size-4 shrink-0" />Also affected</p><ul className="mt-1.5 list-disc space-y-1 pl-6">{effects.map((effect, index) => <li key={index}>{effect}</li>)}</ul></div> : null}
  </div>;
}

// The single delete confirmation used across the app: details of the record, Cancel, and a destructive Delete button.
export function ConfirmDeleteDialog({ open, onOpenChange, onConfirm, busy = false, confirmDisabled = false, title, description, details, affected, confirmLabel = "Delete", children }: DeleteConfirmation & { open: boolean; onOpenChange: (open: boolean) => void; onConfirm: () => void; busy?: boolean; confirmDisabled?: boolean; children?: ReactNode }) {
  return <AlertDialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
    <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
      <AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{description ?? "This cannot be undone."}</AlertDialogDescription></AlertDialogHeader>
      <DeleteDetailsList details={details} affected={affected} />
      {children}
      <AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><Button type="button" variant="destructive" disabled={busy || confirmDisabled} onClick={onConfirm}><Trash2 className="size-4" />{busy ? "Deleting…" : confirmLabel}</Button></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}

// Promise-based replacement for window.confirm: `if (!(await confirmDelete({...}))) return;` and render `confirmDeleteDialog` once.
export function useConfirmDelete() {
  const [request, setRequest] = useState<DeleteConfirmation>({ title: "" });
  const [open, setOpen] = useState(false);
  const resolver = useRef<((confirmed: boolean) => void) | null>(null);
  const settle = useCallback((confirmed: boolean) => { resolver.current?.(confirmed); resolver.current = null; setOpen(false); }, []);
  const confirmDelete = useCallback((confirmation: DeleteConfirmation) => new Promise<boolean>((resolve) => {
    resolver.current?.(false);
    resolver.current = resolve;
    setRequest(confirmation);
    setOpen(true);
  }), []);
  const confirmDeleteDialog = <ConfirmDeleteDialog {...request} open={open} onOpenChange={(next) => { if (!next) settle(false); }} onConfirm={() => settle(true)} />;
  return { confirmDelete, confirmDeleteDialog };
}
