"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Check, LayoutGrid, PackageSearch, Warehouse } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { editionBlockers, editionDetails, editions, type Edition, type EditionUsage } from "@/lib/edition";

type State = { edition: Edition; usage: EditionUsage; canChange: boolean };

const limitText = (multi: boolean, one: string, many: string) => multi ? many : one;

/** Admin Controls → EasyBook edition: how many companies, inventories and warehouses this installation may use. */
export function EditionSettings() {
  const [state, setState] = useState<State | null>(null);
  const [selected, setSelected] = useState<Edition | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchState = useCallback(async () => {
    const response = await fetch("/api/edition", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load the EasyBook edition.");
    return data as State;
  }, []);

  useEffect(() => {
    let active = true;
    fetchState().then((data) => { if (active) { setState(data); setSelected(data.edition); } })
      .catch((error) => { if (active) toast.error(error instanceof Error ? error.message : "Could not load the EasyBook edition."); });
    return () => { active = false; };
  }, [fetchState]);

  async function save() {
    if (!state || !selected || selected === state.edition) return;
    if (!window.confirm(`Switch EasyBook to ${editionDetails[selected].label}? The page reloads so every screen follows the new edition.`)) return;
    setSaving(true);
    try {
      const response = await fetch("/api/edition", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ edition: selected }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not change the edition.");
      toast.success(`EasyBook edition: ${editionDetails[selected].label}`);
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not change the edition."); setSaving(false); }
  }

  if (!state) return <p role="status" className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground">Loading EasyBook edition…</p>;
  const blockers = selected ? editionBlockers(selected, state.usage) : [];

  return <section className="min-w-0 rounded-2xl border bg-card text-card-foreground shadow-sm" aria-label="EasyBook edition">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b p-4 sm:p-5">
      <div className="flex min-w-0 flex-1 basis-80 gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary"><LayoutGrid className="size-5" /></div><div className="min-w-0"><h2 className="text-lg font-semibold">EasyBook edition</h2><p className="mt-1 text-sm text-muted-foreground">Choose how many companies, inventories and warehouses this EasyBook may use. Screens for adding more are hidden when the edition allows only one.{state.canChange ? "" : " Only an All-Admin can change the edition."}</p></div></div>
      <Badge variant="secondary">Current: {editionDetails[state.edition].label}</Badge>
    </header>
    <div className="space-y-4 p-4 sm:p-5">
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground"><span className="flex items-center gap-1.5"><Building2 className="size-4" />{state.usage.companies} active {state.usage.companies === 1 ? "company" : "companies"}</span><span className="flex items-center gap-1.5"><PackageSearch className="size-4" />Up to {state.usage.inventories.count} {state.usage.inventories.count === 1 ? "inventory" : "inventories"} per company</span><span className="flex items-center gap-1.5"><Warehouse className="size-4" />Up to {state.usage.warehouses.count} {state.usage.warehouses.count === 1 ? "warehouse" : "warehouses"} per inventory</span></p>
      <div role="radiogroup" aria-label="EasyBook edition" className="grid gap-3 sm:grid-cols-2">{editions.map((edition) => {
        const details = editionDetails[edition], checked = selected === edition, current = state.edition === edition;
        return <button key={edition} type="button" role="radio" aria-checked={checked} disabled={!state.canChange || saving} onClick={() => setSelected(edition)} className={`min-w-0 rounded-xl border p-4 text-left transition-colors disabled:cursor-default ${checked ? "border-primary bg-primary/10 ring-1 ring-primary" : "bg-background hover:bg-muted/60"} ${!state.canChange && !current ? "opacity-60" : ""}`}>
          <span className="flex items-start justify-between gap-2"><span className="font-semibold">{details.label}</span>{current ? <Badge variant="outline">Current</Badge> : checked ? <Check className="size-4 text-primary" /> : null}</span>
          <span className="mt-1 block text-sm text-muted-foreground">{details.description}</span>
          <span className="mt-3 flex flex-wrap gap-1.5 text-xs">
            <span className="rounded-full border px-2 py-0.5">{limitText(details.multiCompany, "1 company", "Many companies")}</span>
            <span className="rounded-full border px-2 py-0.5">{limitText(details.multiInventory, "1 inventory", "Many inventories")}</span>
            <span className="rounded-full border px-2 py-0.5">{limitText(details.multiWarehouse, "1 warehouse", "Many warehouses")}</span>
          </span>
        </button>;
      })}</div>
      {selected && selected !== state.edition && blockers.length > 0 && <div role="alert" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm"><p className="font-medium">{editionDetails[selected].label} cannot be used yet:</p><ul className="mt-1 list-disc space-y-0.5 pl-5">{blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul><p className="mt-2 text-xs text-muted-foreground">Nothing is hidden or deleted when the edition changes, so extra records must be removed first.</p></div>}
      {state.canChange && <div className="flex justify-end"><Button type="button" disabled={saving || !selected || selected === state.edition || blockers.length > 0} onClick={() => void save()}>{saving ? "Saving…" : "Change edition"}</Button></div>}
    </div>
  </section>;
}
