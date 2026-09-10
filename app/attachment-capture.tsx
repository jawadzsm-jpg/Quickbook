"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Paperclip, Trash2 } from "lucide-react";
import { toast } from "sonner";

export type PendingAttachment = { fileName: string; mimeType: string; fileData: string; fileSize: number };

export function AttachmentCapture({ files, onChange, disabled, onReadingChange }: { files: PendingAttachment[]; onChange: (files: PendingAttachment[]) => void; disabled: boolean; onReadingChange: (reading: boolean) => void }) {
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  const [reading, setReading] = useState(false);
  async function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (selected.length + files.length > 10) return toast.error("Choose at most 10 attachments.");
    if (selected.some((file) => !file.size || file.size > 3_000_000)) return toast.error("Files must contain data and be no larger than 3 MB.");
    const selection = generation.current;
    setReading(true); onReadingChange(true);
    try {
      const next = await Promise.all(selected.map(async (file) => {
        const fileData = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
          reader.onabort = () => reject(new Error("File reading was cancelled."));
          reader.readAsDataURL(file);
        });
        return { fileName: file.name, mimeType: file.type || "application/octet-stream", fileData, fileSize: file.size };
      }));
      if (generation.current === selection) onChange([...files, ...next]);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not read attachments."); }
    finally { if (generation.current === selection) { setReading(false); onReadingChange(false); } }
  }
  return <fieldset disabled={disabled || reading} className="space-y-3 rounded-lg border p-3">
    <legend className="px-1 text-sm font-semibold">Attachments</legend>
    <label className="flex cursor-pointer items-center gap-2 text-sm"><Paperclip className="size-4" />Add files
      <input aria-label="Attach files" type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,.pdf,.csv,.txt,.xls,.xlsx,.doc,.docx" onChange={selectFiles} className="max-w-full text-xs" />
    </label>
    <p className="text-xs text-slate-500">{reading ? "Reading files…" : "Up to 10 files, 3 MB each. Saved together with this record."}</p>
    {files.map((file, index) => <div key={`${file.fileName}-${index}`} className="flex items-center justify-between gap-2 text-sm"><span className="truncate">{file.fileName}</span><button type="button" aria-label={`Remove ${file.fileName}`} onClick={() => onChange(files.filter((_, i) => i !== index))}><Trash2 className="size-4" /></button></div>)}
  </fieldset>;
}
