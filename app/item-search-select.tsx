"use client";
import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { matchesSearch } from "@/lib/search";
import { inactiveCodeMatches } from "@/lib/inactive-item-match";
import { InactiveItemNotice } from "./inactive-item-notice";
import { cn } from "@/lib/utils";

export type ItemSearchOption = { value: string; label: string; detail?: string; search?: readonly unknown[] };

type SearchableItem = Record<string, unknown>;
/** Every product field people search by: SKU, item no., name, model/part no., UPC, serial, category and specifications. */
export function itemSearchFields(item: SearchableItem) {
  return [item.sku, item.itemNumber, item.name, item.description, item.partNumber, item.upcNumber, item.itemSerialNumber, item.category, item.specifications, item.customizationDetails];
}
/** Secondary line under a product: item no., part no. and UPC when present. */
export function itemSearchDetail(item: SearchableItem) {
  return [item.itemNumber ? `Item #${String(item.itemNumber)}` : "", item.partNumber ? `Part ${String(item.partNumber)}` : "", item.upcNumber ? `UPC ${String(item.upcNumber)}` : ""].filter(Boolean).join(" · ");
}

const RESULT_LIMIT = 200;

// A product dropdown with a search box. Drop-in for a Radix Select: same value / onValueChange contract.
export function ItemSearchSelect({ value, onValueChange, options, placeholder = "Select product", ariaLabel, disabled, className, display, inactiveItems, onReactivated, companyId }: {
  value: string; onValueChange: (value: string) => void; options: ItemSearchOption[]; placeholder?: string; ariaLabel?: string; disabled?: boolean; className?: string;
  /** Text shown on the closed control instead of the selected option's label. */
  display?: string;
  /** Inactive items: a part number / SKU / item no. search that matches one says it is in Inactive items. */
  inactiveItems?: ReadonlyArray<SearchableItem & { id: number }>;
  /** Given when the user may reactivate items; called after one was reactivated (reload the item list). */
  onReactivated?: (item: SearchableItem & { id: number }) => void;
  companyId?: number;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((option) => option.value === value);
  const matches = useMemo(() => {
    const found = options.filter((option) => matchesSearch([option.label, option.detail, ...(option.search ?? [])], query));
    return { shown: found.slice(0, RESULT_LIMIT), total: found.length };
  }, [options, query]);
  const inactiveMatches = useMemo(() => inactiveItems?.length ? inactiveCodeMatches(inactiveItems, query, 3) : [], [inactiveItems, query]);

  return <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery(""); }}>
    <PopoverTrigger asChild>
      <Button type="button" variant="outline" role="combobox" aria-expanded={open} aria-label={ariaLabel} disabled={disabled} className={cn("h-10 w-full min-w-0 justify-between border-input bg-card px-3 font-normal", className)}>
        <span className={cn("min-w-0 truncate text-left", !selected && !display && "text-muted-foreground")}>{display || selected?.label || placeholder}</span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-60" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-[min(40rem,calc(100vw-2rem))] p-0">
      <Command shouldFilter={false}>
        <CommandInput autoFocus value={query} onValueChange={setQuery} placeholder="Search SKU, item no., name, model / part no., UPC or serial…" />
        {inactiveMatches.length > 0 && <InactiveItemNotice compact matches={inactiveMatches} companyId={companyId} onReactivated={onReactivated ? (item) => { onReactivated(item); } : undefined} />}
        <CommandList className="max-h-80">
          <CommandEmpty>{inactiveMatches.length ? "No active product matches." : "No matching products."}</CommandEmpty>
          <CommandGroup>
            {matches.shown.map((option) => <CommandItem key={option.value} value={option.value} onSelect={() => { onValueChange(option.value); setOpen(false); setQuery(""); }} className="items-start">
              <Check className={cn("mt-0.5 size-4 shrink-0", option.value === value ? "opacity-100" : "opacity-0")} />
              <span className="min-w-0"><span className="block whitespace-normal break-words">{option.label}</span>{option.detail ? <span className="block text-xs text-muted-foreground">{option.detail}</span> : null}</span>
            </CommandItem>)}
          </CommandGroup>
          {matches.total > RESULT_LIMIT ? <p className="px-3 py-2 text-xs text-muted-foreground">Showing {RESULT_LIMIT} of {matches.total}. Type more to narrow the list.</p> : null}
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>;
}
