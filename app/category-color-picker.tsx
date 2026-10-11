"use client";

import { useState } from "react";
import { Check, Palette } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { autoCategoryColor, categoryColor, categoryColorKey, categoryPalette } from "@/lib/category-colors";

/** Palette for one category's colour. Saving updates every place the category is shown. */
export function CategoryColorPicker({ category, saved, onSaved, compact = false }: {
  category: string; saved: Record<string, string>; onSaved: (colors: Record<string, string>) => void; compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const key = categoryColorKey(category);
  const current = categoryColor(category, saved);
  const isAuto = !saved[key];

  async function choose(color: string) {
    setSaving(true);
    try {
      const response = await fetch("/api/category-colors", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category: key, color }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save the category colour.");
      onSaved(data.categoryColors ?? {});
      setOpen(false);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save the category colour."); }
    finally { setSaving(false); }
  }

  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <button type="button" aria-label={`Colour for ${key}`} title={`Colour for ${key}`} className={compact ? "inline-grid size-6 place-items-center rounded-full hover:bg-black/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-current dark:hover:bg-white/10" : "inline-flex h-9 items-center gap-2 rounded-md border bg-card px-3 text-sm hover:bg-muted"}>
        {compact ? <Palette className="size-3.5 opacity-70" /> : <><span className={`size-4 rounded-full ${current.swatch}`} />{isAuto ? `Auto (${current.label})` : current.label}<Palette className="size-4 opacity-60" /></>}
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-64 p-3">
      <p className="mb-2 text-xs font-semibold text-muted-foreground">Colour for {key}</p>
      <div className="grid grid-cols-6 gap-2">
        {categoryPalette.map((color) => <button key={color.id} type="button" disabled={saving} title={color.label} aria-label={color.label} aria-pressed={!isAuto && current.id === color.id} onClick={() => void choose(color.id)} className={`grid size-8 place-items-center rounded-full ${color.swatch} ring-offset-2 ring-offset-background hover:ring-2 hover:ring-foreground/40 aria-pressed:ring-2 aria-pressed:ring-foreground`}>{!isAuto && current.id === color.id ? <Check className="size-4 text-white drop-shadow" /> : null}</button>)}
      </div>
      <button type="button" disabled={saving || isAuto} onClick={() => void choose("auto")} className="mt-3 flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs hover:bg-muted disabled:opacity-60">
        <span className={`size-4 rounded-full ${autoCategoryColor(category).swatch}`} />Auto ({autoCategoryColor(category).label}){isAuto ? <Check className="ml-auto size-4" /> : null}
      </button>
    </PopoverContent>
  </Popover>;
}
