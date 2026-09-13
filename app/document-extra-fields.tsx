"use client";
import { Textarea } from "@/components/ui/textarea";

export type DocumentExtra = { comments: string; serialNumber: string };
export function DocumentExtraFields({ value, onChange, disabled = false }: { value: DocumentExtra; onChange: (value: DocumentExtra) => void; disabled?: boolean }) {
  return <div className="grid grid-cols-2 gap-3 rounded-lg border bg-slate-50 p-3">
    <label className="grid min-w-0 gap-2 text-sm font-medium">Comments<Textarea disabled={disabled} rows={3} className="min-w-0 w-full resize-y break-words" value={value.comments} onChange={event => onChange({ ...value, comments: event.target.value })} placeholder="Enter comments" /></label>
    <label className="grid min-w-0 gap-2 text-sm font-medium">Serial Number<Textarea disabled={disabled} rows={3} className="min-w-0 w-full resize-y break-words" value={value.serialNumber} onChange={event => onChange({ ...value, serialNumber: event.target.value })} placeholder="Enter serial numbers, one per line" /></label>
  </div>;
}
