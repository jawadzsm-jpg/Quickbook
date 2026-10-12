"use client";

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Option = { id: number; name: string; code: string; isDefault: boolean; active: boolean };

/**
 * Warehouse a stock document posts to. Shown only when the inventory has more than one active warehouse; otherwise the
 * document uses the inventory's default warehouse and nothing changes for the user. An empty value means "default";
 * a chosen warehouse (the default included) is sent as its id, so edits can move a document back to the default.
 */
export function WarehousePicker({ companyId, locationId, value, onChange, disabled = false }: { companyId: number; locationId: number; value: string; onChange: (warehouseId: string) => void; disabled?: boolean }) {
  const [options, setOptions] = useState<Option[]>([]);
  useEffect(() => {
    if (!companyId || !locationId) return;
    const controller = new AbortController();
    fetch(`/api/warehouses?companyId=${companyId}&locationId=${locationId}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? (await response.json()).warehouses as Option[] : [])
      .then((rows) => setOptions(rows))
      .catch(() => { if (!controller.signal.aborted) setOptions([]); });
    return () => controller.abort();
  }, [companyId, locationId]);
  const usable = options.filter((option) => option.active || String(option.id) === value);
  const fallback = usable.find((option) => option.isDefault);
  const known = usable.some((option) => String(option.id) === value);
  // A warehouse from another inventory (after the inventory changes) falls back to the default warehouse.
  useEffect(() => { if (value && options.length && !options.some((option) => String(option.id) === value)) onChange(""); }, [value, options, onChange]);
  // Hidden while the inventory has only its default warehouse (unless the document already uses an inactive one).
  if (usable.length < 2) return null;
  return <div className="space-y-2">
    <Label>Warehouse</Label>
    <Select disabled={disabled} value={known ? value : String(fallback?.id ?? "")} onValueChange={(next) => onChange(String(next))}>
      <SelectTrigger className="w-full" aria-label="Warehouse"><SelectValue placeholder="Default warehouse" /></SelectTrigger>
      <SelectContent>{usable.map((option) => <SelectItem key={option.id} value={String(option.id)}>{option.name}{option.isDefault ? " (default)" : ""}{option.active ? "" : " · inactive"}</SelectItem>)}</SelectContent>
    </Select>
  </div>;
}
