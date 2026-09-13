"use client";
import { Textarea } from "@/components/ui/textarea";

export type DocumentExtra = { comments: string; serialNumber: string };
export function DocumentExtraFields({ value, onChange, disabled = false }: { value: DocumentExtra; onChange: (value: DocumentExtra) => void; disabled?: boolean }) {
  return <div className="grid gap-4 rounded-xl border bg-slate-50 p-4 sm:grid-cols-2">
    <label className="grid gap-2 text-sm font-medium">Comments<Textarea disabled={disabled} rows={3} maxLength={5000} value={value.comments} onChange={event => onChange({ ...value, comments: event.target.value })} placeholder="Enter document comments" /></label>
    <label className="grid gap-2 text-sm font-medium">Serial Number<Textarea disabled={disabled} rows={3} maxLength={5000} value={value.serialNumber} onChange={event => onChange({ ...value, serialNumber: event.target.value })} placeholder="Enter serial numbers, one per line" /><span className="text-xs font-normal text-slate-500">For multiple items, enter one serial number per line.</span></label>
  </div>;
}
