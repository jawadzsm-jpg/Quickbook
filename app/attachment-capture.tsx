"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Paperclip, Trash2, X } from "lucide-react";

type PendingAttachment = { fileName: string; mimeType: string; fileData: string; fileSize: number };

const supportedTransactionTypes = new Set(["invoice", "bill", "customer payment", "bill payment", "vendor payment", "cheque"]);

function detectRelevantDialog() {
  const dialog = document.querySelector<HTMLElement>('[role="dialog"][data-state="open"][data-record-kind]');
  if (!dialog) return false;
  const { recordKind, recordType } = dialog.dataset;
  return (recordKind === "transactions" && supportedTransactionTypes.has(recordType ?? ""))
    || (recordKind === "contacts" && recordType === "employee");
}

export function AttachmentCapture() {
  const [visible, setVisible] = useState(false);
  const [files, setFiles] = useState<PendingAttachment[]>([]);
  const filesRef = useRef<PendingAttachment[]>([]);
  useEffect(() => { filesRef.current = files; }, [files]);

  useEffect(() => {
    const update = () => setVisible(detectRelevantDialog());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["open", "data-state", "class", "data-record-kind", "data-record-type"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await originalFetch(input, init);
      try {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url.endsWith("/api/records") && String(init?.method ?? "GET").toUpperCase() === "POST" && response.ok && filesRef.current.length) {
          const requestBody = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : null;
          const kind = String(requestBody?.kind ?? "");
          const type = String(requestBody?.type ?? "");
          const relevant = (kind === "transactions" && supportedTransactionTypes.has(type)) || (kind === "contacts" && type === "employee");
          if (relevant) {
            const result = await response.clone().json() as { record?: { id?: number } };
            const entityId = Number(result.record?.id);
            const companyId = Number(requestBody?.companyId);
            if (entityId > 0 && companyId > 0) {
              const save = await originalFetch("/api/attachments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ companyId, entityType: kind === "contacts" ? "employee" : "transaction", entityId, attachments: filesRef.current }),
              });
              if (save.ok) setFiles([]);
            }
          }
        }
      } catch { /* The record save must never fail because attachment processing failed. */ }
      return response;
    };
    return () => { window.fetch = originalFetch; };
  }, []);

  async function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []).slice(0, Math.max(0, 10 - files.length));
    const next: PendingAttachment[] = [];
    for (const file of selected) {
      if (file.size > 3_000_000) continue;
      const fileData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      next.push({ fileName: file.name, mimeType: file.type || "application/octet-stream", fileData, fileSize: file.size });
    }
    setFiles((current) => [...current, ...next].slice(0, 10));
    event.target.value = "";
  }

  if (!visible) return null;
  return <div className="fixed bottom-5 right-5 z-[100] w-[min(380px,calc(100vw-2rem))] rounded-xl border bg-white shadow-2xl">
    <div className="flex items-center justify-between border-b p-3"><div className="flex items-center gap-2"><Paperclip className="size-4" /><div><p className="text-sm font-semibold">Attachments</p><p className="text-xs text-slate-500">Invoice · Bill · Payment · Paid to · Employee</p></div></div><button type="button" aria-label="Clear attachments" onClick={() => setFiles([])} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X className="size-4" /></button></div>
    <div className="space-y-3 p-3">
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed p-3 text-sm font-medium text-slate-700 hover:bg-slate-50"><Paperclip className="size-4" />Add files<input className="hidden" type="file" multiple accept="image/*,.pdf,.csv,.txt,.xls,.xlsx,.doc,.docx" onChange={selectFiles} /></label>
      <p className="text-xs text-slate-500">Up to 10 files, 3 MB each. Files are saved when you save the record.</p>
      {files.length ? <div className="max-h-40 space-y-1 overflow-y-auto">{files.map((file, index) => <div key={`${file.fileName}-${index}`} className="flex items-center gap-2 rounded-md bg-slate-50 px-2 py-2 text-xs"><span className="min-w-0 flex-1 truncate">{file.fileName}</span><span className="text-slate-400">{Math.ceil(file.fileSize / 1024)} KB</span><button type="button" aria-label={`Remove ${file.fileName}`} onClick={() => setFiles((current) => current.filter((_, position) => position !== index))} className="text-slate-400 hover:text-rose-600"><Trash2 className="size-3.5" /></button></div>)}</div> : null}
    </div>
  </div>;
}