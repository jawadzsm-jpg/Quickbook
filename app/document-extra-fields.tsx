"use client";
import { Textarea } from "@/components/ui/textarea";

export type DocumentExtra = { comments: string; serialNumber: string };
export function DocumentExtraFields({ value, onChange, disabled = false }: { value: DocumentExtra; onChange: (value: DocumentExtra) => void; disabled?: boolean }) {
  return <div className="grid gap-2 rounded-lg border bg-slate-50 p-2 sm:grid-cols-2">
    <label className="grid min-w-0 gap-1 text-sm font-medium">Comments<Textarea disabled={disabled} rows={2} className="min-h-12 w-full min-w-0 resize-y break-words py-2" value={value.comments} onChange={event => onChange({ ...value, comments: event.target.value })} placeholder="Enter comments" /></label>
    <label className="grid min-w-0 gap-1 text-sm font-medium">Serial Number<Textarea disabled={disabled} rows={2} className="min-h-12 w-full min-w-0 resize-y break-words py-2" value={value.serialNumber} onChange={event => onChange({ ...value, serialNumber: event.target.value })} placeholder="Enter serial numbers, one per line" /></label>
  </div>;
}
