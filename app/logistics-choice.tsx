"use client";
import { useState } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { LogisticsOption } from "@/lib/item-logistics";

export function LogisticsChoice({ label, value, options, disabled, onChange, onAdd }: {
  label: string; value: string; options: LogisticsOption[]; disabled: boolean;
  onChange: (value: string) => void; onAdd: (value: string, label: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false), [custom, setCustom] = useState(""), [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const filtered = options.filter(option => `${option.value} ${option.label}`.toLowerCase().includes(query.toLowerCase()));
  async function add() {
    if (!custom.trim() || busy) return;
    setBusy(true);
    try { await onAdd(custom, description); setOpen(false); setAdding(false); setCustom(""); setDescription(""); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not add choice."); }
    finally { setBusy(false); }
  }
  return <div className="min-w-0 space-y-1 text-sm"><span>{label}</span><Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button type="button" variant="outline" disabled={disabled} className="w-full min-w-0 justify-between font-normal" aria-label={`Select ${label}`}><span className="truncate">{value || `Select ${label}`}</span><ChevronDown className="size-4 shrink-0" /></Button></PopoverTrigger><PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] space-y-3"><Input aria-label={`Search ${label}`} placeholder={`Search ${label}…`} value={query} onChange={e => setQuery(e.target.value)} /><div className="max-h-52 overflow-y-auto" role="listbox" aria-label={`${label} choices`}><button type="button" className="w-full rounded px-2 py-2 text-left text-sm hover:bg-accent" onClick={() => { onChange(""); setOpen(false); }}>Clear selection</button>{filtered.map(option => <button key={option.value} type="button" role="option" aria-selected={value === option.value} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-accent" onClick={() => { onChange(option.value); setOpen(false); }}><span className="min-w-0 flex-1 break-words">{option.value}{option.label ? ` · ${option.label}` : ""}</span>{value === option.value && <Check className="size-4 shrink-0" />}</button>)}{!filtered.length && <p className="p-2 text-sm text-muted-foreground">No matching choices.</p>}</div><Button type="button" variant="outline" className="w-full" onClick={() => { setAdding(!adding); setCustom(query); }}><Plus className="size-4" />Add {label}</Button>{adding && <div className="space-y-2 border-t pt-3"><Input aria-label={`New ${label}`} value={custom} maxLength={label === "HS code" ? 12 : 80} placeholder={label === "HS code" ? "6–12 digit HS code" : "Country name"} onChange={e => setCustom(e.target.value)} />{label === "HS code" && <Input aria-label="HS code description" value={description} maxLength={100} placeholder="Description (optional)" onChange={e => setDescription(e.target.value)} />}<p className="text-xs text-muted-foreground">Saved as a reusable choice for this company. Save Changes to apply it to the item.</p><Button type="button" disabled={busy || !custom.trim()} onClick={() => void add()}>{busy ? "Adding…" : "Add and select"}</Button></div>}</PopoverContent></Popover></div>;
}
