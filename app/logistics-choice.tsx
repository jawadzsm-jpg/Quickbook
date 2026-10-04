"use client";
import { useState } from "react";
import { Check, ChevronDown, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { LogisticsOption } from "@/lib/item-logistics";

export function LogisticsChoice({ label, value, options, disabled, onChange, onAdd, onDelete, onEdit }: {
  label: string; value: string; options: LogisticsOption[]; disabled: boolean;
  onDelete: (option: LogisticsOption) => Promise<void>;
  onEdit: (option: LogisticsOption, value: string, label: string) => Promise<void>;
  onChange: (value: string) => void; onAdd: (value: string, label: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false), [editing, setEditing] = useState<LogisticsOption | null>(null);
  const [custom, setCustom] = useState(""), [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const blocked = busy || disabled;
  const filtered = options.filter(option => `${option.value} ${option.label}`.toLowerCase().includes(query.toLowerCase()));
  function closeEditor() { setAdding(false); setEditing(null); setCustom(""); setDescription(""); }
  async function saveChoice() {
    if (!custom.trim() || blocked) return;
    setBusy(true);
    try {
      if (editing) { await onEdit(editing, custom, description); setQuery(""); }
      else { await onAdd(custom, description); setOpen(false); }
      closeEditor();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save choice."); }
    finally { setBusy(false); }
  }
  async function remove(option: LogisticsOption) {
    if (blocked) return;
    setBusy(true);
    try { await onDelete(option); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not delete choice."); }
    finally { setBusy(false); }
  }
  return <div className="min-w-0 space-y-1 text-sm">
    <span>{label}</span>
    <Popover open={open} onOpenChange={next => { if (!busy) { setOpen(next); if (!next) closeEditor(); } }}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" disabled={disabled} className="w-full min-w-0 justify-between font-normal" aria-label={`Select ${label}`}>
          <span className="truncate">{value || `Select ${label}`}</span><ChevronDown className="size-4 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 max-w-[calc(100vw-2rem)] space-y-3">
        {adding || editing ? <div className="space-y-3">
          <p className="font-semibold">{editing ? "Edit" : "Add"} {label}</p>
          <label className="block space-y-1"><span>{label}</span><Input autoFocus disabled={blocked} aria-label={`${editing ? "Edit" : "New"} ${label}`} value={custom} maxLength={label === "HS code" ? 12 : 80} placeholder={label === "HS code" ? "6–12 digit HS code" : "Country name"} onChange={e => setCustom(e.target.value)} /></label>
          {label === "HS code" && <label className="block space-y-1"><span>Description</span><Input disabled={blocked} aria-label="HS code description" value={description} maxLength={100} placeholder="Description (optional)" onChange={e => setDescription(e.target.value)} /></label>}
          <p className="text-xs text-muted-foreground">{editing ? "Updates this company's choice only. Select the updated choice and Save Changes to apply it to an item. Saved documents remain unchanged." : "Saved as a reusable choice for this company. Save Changes to apply it to the item."}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={blocked || !custom.trim()} onClick={() => void saveChoice()}>{busy ? "Saving…" : editing ? "Save choice" : "Add and select"}</Button>
            <Button type="button" variant="outline" disabled={blocked} onClick={closeEditor}>Cancel</Button>
          </div>
        </div> : <>
          <Input aria-label={`Search ${label}`} placeholder={`Search ${label}…`} value={query} onChange={e => setQuery(e.target.value)} />
          <div className="max-h-60 overflow-y-auto" role="group" aria-label={`${label} choices`}>
            <button type="button" disabled={blocked} className="w-full rounded px-2 py-2 text-left text-sm hover:bg-accent" onClick={() => { onChange(""); setOpen(false); }}>Clear selection</button>
            {filtered.map(option => <div key={option.value} className="flex items-center gap-1 rounded hover:bg-accent/50">
              <button type="button" disabled={blocked} aria-pressed={value === option.value} className="flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-accent" onClick={() => { onChange(option.value); setOpen(false); }}>
                <span className="min-w-0 flex-1 break-words">{option.value}{option.label ? ` · ${option.label}` : ""}</span>{value === option.value && <Check className="size-4 shrink-0" />}
              </button>
              <Button type="button" variant="ghost" size="icon" disabled={blocked} className="shrink-0 text-blue-600 dark:text-blue-400" title="Edit choice" aria-label={`Edit ${label} ${option.value}`} onClick={() => { setEditing(option); setCustom(option.value); setDescription(option.label); }}><Pencil className="size-4" /></Button>
              <Button type="button" variant="ghost" size="icon" disabled={blocked} className="shrink-0 text-rose-600 dark:text-rose-400" title="Delete choice" aria-label={`Delete ${label} ${option.value}`} onClick={() => void remove(option)}><Trash2 className="size-4" /></Button>
            </div>)}
            {!filtered.length && <p className="p-2 text-sm text-muted-foreground">No matching choices.</p>}
          </div>
          <Button type="button" variant="outline" className="w-full" disabled={blocked} onClick={() => { setAdding(true); setCustom(query); setDescription(""); }}><Plus className="size-4" />Add {label}</Button>
        </>}
      </PopoverContent>
    </Popover>
  </div>;
}
