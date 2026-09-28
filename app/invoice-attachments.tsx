"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { Download, Paperclip, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type PendingFile = { fileName: string; mimeType: string; fileData: string; fileSize: number };
type SavedFile = { id: number; file_name: string; file_size: number };

export function InvoiceAttachments({ companyId, invoiceId, pending, onPendingChange, canEdit = true }: {
  companyId: number; invoiceId?: number | null; pending?: PendingFile[];
  onPendingChange?: (files: PendingFile[]) => void; canEdit?: boolean;
}) {
  const [saved, setSaved] = useState<SavedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const url = `/api/attachments?companyId=${companyId}&entityType=transaction&entityId=${invoiceId}`;
  useEffect(() => {
    if (!invoiceId) return;
    const controller = new AbortController();
    fetch(url, { signal: controller.signal }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load attachments.");
      setSaved(data.attachments); setError("");
    }).catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load attachments."); });
    return () => controller.abort();
  }, [invoiceId, url, revision]);

  async function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!selected.length) return;
    if (selected.length + saved.length + (pending?.length ?? 0) > 10) return toast.error("Each invoice can have up to 10 attachments.");
    if (selected.some((file) => !file.size || file.size > 3_000_000)) return toast.error("Each attachment must be between 1 byte and 3 MB.");
    setLoading(true);
    try {
      const files = await Promise.all(selected.map(async (file) => ({
        fileName: file.name, mimeType: file.type || "application/octet-stream", fileSize: file.size,
        fileData: await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); }),
      })));
      if (invoiceId) {
        const response = await fetch("/api/attachments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, entityType: "transaction", entityId: invoiceId, attachments: files }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not upload attachments.");
        setRevision((value) => value + 1);
        toast.success("Invoice attachments saved");
      } else onPendingChange?.([...(pending ?? []), ...files]);
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Could not add attachments."); }
    finally { setLoading(false); }
  }

  async function removeSaved(id: number) {
    setLoading(true);
    try {
      const response = await fetch("/api/attachments", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, id }) });
      if (!response.ok) throw new Error((await response.json()).error || "Could not remove attachment.");
      setSaved((files) => files.filter((file) => file.id !== id));
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Could not remove attachment."); }
    finally { setLoading(false); }
  }

  return <section className="document-internal-only space-y-3 rounded-xl border border-border bg-background p-4 text-foreground" aria-label="Invoice attachments">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="flex items-center gap-2 text-sm font-semibold"><Paperclip className="size-4" />Invoice attachments</h3><p className="text-xs text-muted-foreground">Up to 10 files, 3 MB each. Kept with this invoice and excluded from print and PDF.</p></div>
      {canEdit && <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent"><Paperclip className="size-4" />{loading ? "Working…" : "Add files"}<input type="file" multiple disabled={loading} accept="image/png,image/jpeg,image/webp,image/gif,.pdf,.txt,.csv,.xls,.xlsx,.doc,.docx" className="sr-only" onChange={addFiles} /></label>}</div>
    {error && <p role="alert" className="text-sm text-destructive">{error} <button type="button" className="underline" onClick={() => setRevision((value) => value + 1)}>Retry</button></p>}
    {[...saved.map((file) => ({ name: file.file_name, size: file.file_size, id: file.id })), ...(pending ?? []).map((file, index) => ({ name: file.fileName, size: file.fileSize, index }))].map((file) => <div key={"id" in file ? `saved-${file.id}` : `pending-${file.index}`} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><span className="min-w-0 flex-1 truncate">{file.name} <span className="text-muted-foreground">({Math.ceil(file.size / 1024)} KB){"index" in file ? " · saves with invoice" : ""}</span></span>{"id" in file && <a href={`${url}&attachmentId=${file.id}`} download aria-label={`Download ${file.name}`} className="text-emerald-700 hover:underline dark:text-emerald-400"><Download className="size-4" /></a>}{canEdit && <Button type="button" size="icon" variant="ghost" disabled={loading} aria-label={`Remove ${file.name}`} onClick={() => "id" in file ? void removeSaved(file.id) : onPendingChange?.((pending ?? []).filter((_, index) => index !== file.index))}><Trash2 className="size-4 text-rose-600" /></Button>}</div>)}
    {!saved.length && !pending?.length && !error && <p className="text-sm text-muted-foreground">No attachments yet.</p>}
  </section>;
}
