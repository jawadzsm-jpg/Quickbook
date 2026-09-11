"use client";
import { useEffect, useState } from "react";
import { Download } from "lucide-react";

type Attachment = { id: number; file_name: string; file_size: number };
export function RecordAttachments({ companyId, entityId }: { companyId: number; entityId: number }) {
  const [files, setFiles] = useState<Attachment[]>([]);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const url = `/api/attachments?companyId=${companyId}&entityType=transaction&entityId=${entityId}`;
  useEffect(() => {
    const controller = new AbortController();
    fetch(url, { signal: controller.signal }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load attachments.");
      setFiles(data.attachments); setError("");
    }).catch((error) => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Could not load attachments."); });
    return () => controller.abort();
  }, [url, attempt]);
  return <section className="document-internal-only space-y-2 rounded-lg border p-3" aria-label="Saved attachments">
    <h3 className="text-sm font-semibold">Saved attachments</h3>
    {error ? <p role="alert" className="text-sm text-rose-700">{error} <button type="button" className="underline" onClick={() => setAttempt(attempt + 1)}>Retry</button></p> : files.length ? files.map((file) => <a key={file.id} href={`${url}&attachmentId=${file.id}`} download className="flex items-center gap-2 text-sm text-emerald-700 underline"><Download className="size-4" />{file.file_name} ({Math.ceil(file.file_size / 1024)} KB)</a>) : <p className="text-sm text-slate-500">No attachments.</p>}
  </section>;
}
