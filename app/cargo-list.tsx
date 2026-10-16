"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2, Truck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cargoModes } from "@/lib/cargo";
import { countries } from "@/lib/countries";
import { useConfirmDelete } from "./confirm-delete-dialog";

type Cargo = { id: number; name: string; telephone: string; mobile: string; email: string; modes: string[]; destinations: string[]; address: string; notes: string; createdByUserId: number | null; createdByName: string; createdAt: string };
type Draft = { name: string; telephone: string; mobile: string; email: string; modes: string[]; destinations: string[]; address: string; notes: string };
const emptyDraft: Draft = { name: "", telephone: "", mobile: "", email: "", modes: [], destinations: [], address: "", notes: "" };

/** Shared cargo / freight agent list. Every user can add; the creator or an administrator can edit; administrators can delete. */
export function CargoList({ companyId, isAdmin }: { companyId: number; isAdmin: boolean }) {
  const { confirmDelete, confirmDeleteDialog } = useConfirmDelete();
  const [records, setRecords] = useState<Cargo[]>([]);
  const [userId, setUserId] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Cargo | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [country, setCountry] = useState("");
  const [saving, setSaving] = useState(false);

  // Fetches the list and only sets state once the response arrives.
  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/cargos?companyId=${companyId}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load the cargo list.");
      setRecords(data.records); setUserId(data.userId);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not load the cargo list."); }
    finally { setLoading(false); }
  }, [companyId]);
  useEffect(() => {
    let active = true;
    fetch(`/api/cargos?companyId=${companyId}`).then(async (response) => {
      const data = await response.json();
      if (!active) return;
      if (!response.ok) throw new Error(data.error || "Could not load the cargo list.");
      setRecords(data.records); setUserId(data.userId);
    }).catch((error) => { if (active) toast.error(error instanceof Error ? error.message : "Could not load the cargo list."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [companyId]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return needle ? records.filter((cargo) => [cargo.id, cargo.name, cargo.telephone, cargo.mobile, cargo.email, cargo.modes.join(" "), cargo.destinations.join(" "), cargo.address, cargo.createdByName].join(" ").toLocaleLowerCase().includes(needle)) : records;
  }, [records, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * pageSize, current * pageSize);
  const canEdit = (cargo: Cargo) => isAdmin || cargo.createdByUserId === userId;

  const open = (cargo: Cargo | "new") => {
    setEditing(cargo); setCountry("");
    setDraft(cargo === "new" ? emptyDraft : { name: cargo.name, telephone: cargo.telephone, mobile: cargo.mobile, email: cargo.email, modes: cargo.modes, destinations: cargo.destinations, address: cargo.address, notes: cargo.notes });
  };
  const addCountry = (name: string) => { const value = name.trim(); if (value && !draft.destinations.includes(value)) setDraft({ ...draft, destinations: [...draft.destinations, value] }); setCountry(""); };
  const save = async () => {
    if (!draft.name.trim()) return toast.error("Enter the cargo name.");
    setSaving(true);
    try {
      const isNew = editing === "new";
      const response = await fetch("/api/cargos", { method: isNew ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, ...(isNew ? {} : { id: (editing as Cargo).id }), ...draft }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save the cargo.");
      toast.success(isNew ? "Cargo added" : "Cargo updated");
      setEditing(null); await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save the cargo."); }
    finally { setSaving(false); }
  };
  const remove = async (cargo: Cargo) => {
    if (!(await confirmDelete({ title: `Delete cargo ${cargo.name}?`, description: "The cargo agent is removed from the shared list for everyone. This cannot be undone.", details: [{ label: "Type", value: "Cargo / freight agent" }, { label: "Name", value: cargo.name }, { label: "Telephone", value: cargo.telephone }, { label: "Mobile", value: cargo.mobile }, { label: "Email", value: cargo.email }, { label: "Modes", value: cargo.modes.join(", ") }, { label: "Destinations", value: cargo.destinations.join(", ") }, { label: "Added by", value: cargo.createdByName }], confirmLabel: "Delete cargo" }))) return;
    const response = await fetch(`/api/cargos?companyId=${companyId}&id=${cargo.id}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return toast.error(data.error || "Could not delete the cargo.");
    toast.success("Cargo deleted"); await load();
  };
  const listText = (values: string[]) => values.length ? values.join(", ") : "—";

  return <section className="space-y-4 rounded-xl border bg-card p-4 text-card-foreground sm:p-5">{confirmDeleteDialog}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3"><div className="brand-soft-icon grid size-10 place-items-center rounded-xl"><Truck className="size-5" /></div><div><h2 className="font-bold">Cargo list</h2><p className="text-sm text-muted-foreground">Cargo and freight agents shared by everyone in this company.</p></div></div>
      <Button type="button" onClick={() => open("new")}><Plus className="size-4" />Add cargo</Button>
    </div>
    <div className="flex flex-wrap items-end justify-between gap-3 text-sm">
      <label className="flex items-center gap-2">Show<select className="h-9 rounded-md border bg-background px-2" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>{[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}</select>entries</label>
      <label className="flex min-w-0 items-center gap-2">Search<Input className="h-9 w-56 max-w-full" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Name, phone, country…" /></label>
    </div>
    {loading ? <p className="py-10 text-center text-sm text-muted-foreground">Loading cargo list…</p> : !filtered.length ? <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">{records.length ? "No cargo matches your search." : "No cargo yet. Click Add cargo to add the first one."}</div> : <>
      {/* Table from 1,280 px; narrower screens use the cards below. */}
      <div className="hidden overflow-x-auto rounded-lg border xl:block">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs font-semibold text-muted-foreground"><tr>{["ID", "Cargo name", "Telephone", "Mobile", "Email", "Mode", "Destination countries", "Address", "Created by", ""].map((heading) => <th key={heading} className="px-3 py-2.5">{heading}</th>)}</tr></thead>
          <tbody>{visible.map((cargo) => <tr key={cargo.id} className="border-t align-top">
            <td className="px-3 py-2.5 font-bold text-red-600 tabular-nums">{cargo.id}</td>
            <td className="px-3 py-2.5 font-medium uppercase">{cargo.name}</td>
            <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{cargo.telephone || "—"}</td>
            <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{cargo.mobile || "—"}</td>
            <td className="break-words px-3 py-2.5">{cargo.email ? <a className="underline underline-offset-2" href={`mailto:${cargo.email}`}>{cargo.email.split("@")[0]}{cargo.email.includes("@") ? <>@<wbr />{cargo.email.slice(cargo.email.indexOf("@") + 1)}</> : null}</a> : "—"}</td>
            <td className="px-3 py-2.5">{listText(cargo.modes)}</td>
            <td className="px-3 py-2.5">{listText(cargo.destinations)}</td>
            <td className="whitespace-pre-line px-3 py-2.5">{cargo.address || "—"}</td>
            <td className="px-3 py-2.5">{cargo.createdByName || "—"}</td>
            <td className="px-2 py-2"><div className="flex justify-end [&_button]:size-8">{canEdit(cargo) && <Button type="button" variant="ghost" size="icon" aria-label={`Edit ${cargo.name}`} onClick={() => open(cargo)}><Pencil className="size-4" /></Button>}{isAdmin && <Button type="button" variant="ghost" size="icon" className="text-destructive" aria-label={`Delete ${cargo.name}`} onClick={() => void remove(cargo)}><Trash2 className="size-4" /></Button>}</div></td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="grid gap-3 md:grid-cols-[repeat(2,minmax(0,1fr))] xl:hidden">{visible.map((cargo) => <article key={cargo.id} className="rounded-xl border p-4 text-sm">
        <div className="flex items-start justify-between gap-2"><div><p className="text-xs font-bold text-red-600">#{cargo.id}</p><h3 className="font-semibold uppercase">{cargo.name}</h3></div><div className="flex gap-1">{canEdit(cargo) && <Button type="button" variant="ghost" size="icon" aria-label={`Edit ${cargo.name}`} onClick={() => open(cargo)}><Pencil className="size-4" /></Button>}{isAdmin && <Button type="button" variant="ghost" size="icon" className="text-destructive" aria-label={`Delete ${cargo.name}`} onClick={() => void remove(cargo)}><Trash2 className="size-4" /></Button>}</div></div>
        <dl className="mt-3 grid grid-cols-2 gap-3">{([["Telephone", cargo.telephone], ["Mobile", cargo.mobile], ["Mode", listText(cargo.modes)], ["Destinations", listText(cargo.destinations)], ["Email", cargo.email], ["Created by", cargo.createdByName]] as const).map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="break-words font-medium">{value || "—"}</dd></div>)}<div className="col-span-2"><dt className="text-xs text-muted-foreground">Address</dt><dd className="whitespace-pre-line break-words font-medium">{cargo.address || "—"}</dd></div></dl>
      </article>)}</div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="text-muted-foreground">Showing {(current - 1) * pageSize + 1}–{Math.min(current * pageSize, filtered.length)} of {filtered.length}</span><div className="flex gap-1"><Button type="button" variant="outline" size="sm" disabled={current <= 1} onClick={() => setPage(current - 1)}>Previous</Button>{Array.from({ length: pages }, (_, index) => index + 1).slice(Math.max(0, current - 3), Math.max(0, current - 3) + 5).map((number) => <Button key={number} type="button" size="sm" variant={number === current ? "default" : "outline"} onClick={() => setPage(number)}>{number}</Button>)}<Button type="button" variant="outline" size="sm" disabled={current >= pages} onClick={() => setPage(current + 1)}>Next</Button></div></div>
    </>}
    <Dialog open={editing !== null} onOpenChange={(value) => { if (!value) setEditing(null); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{editing === "new" ? "Add cargo" : "Edit cargo"}</DialogTitle><DialogDescription>Cargo name is required; everything else is optional.</DialogDescription></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="cargo-name">Cargo name *</Label><Input id="cargo-name" maxLength={160} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="e.g. FAST PHOENIX CARGO SERVICES LLC" /></div>
          <div className="space-y-1.5"><Label htmlFor="cargo-telephone">Telephone</Label><Input id="cargo-telephone" maxLength={40} value={draft.telephone} onChange={(event) => setDraft({ ...draft, telephone: event.target.value })} placeholder="+97145470420" /></div>
          <div className="space-y-1.5"><Label htmlFor="cargo-mobile">Mobile</Label><Input id="cargo-mobile" maxLength={40} value={draft.mobile} onChange={(event) => setDraft({ ...draft, mobile: event.target.value })} placeholder="+971504658431" /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="cargo-email">Email</Label><Input id="cargo-email" type="email" maxLength={160} value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></div>
          <fieldset className="space-y-1.5 sm:col-span-2"><legend className="text-sm font-medium">Mode</legend><div className="flex flex-wrap gap-3">{cargoModes.map((mode) => <label key={mode} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.modes.includes(mode)} onChange={(event) => setDraft({ ...draft, modes: event.target.checked ? [...draft.modes, mode] : draft.modes.filter((entry) => entry !== mode) })} />{mode}</label>)}</div></fieldset>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="cargo-country">Destination countries</Label>
            <div className="flex gap-2"><Input id="cargo-country" list="cargo-countries" value={country} onChange={(event) => setCountry(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCountry(country); } }} placeholder="Type a country and press Enter" /><Button type="button" variant="outline" onClick={() => addCountry(country)}>Add</Button></div>
            <datalist id="cargo-countries">{countries.filter((entry) => entry.code !== "OTHER").map((entry) => <option key={entry.code} value={entry.name} />)}</datalist>
            {draft.destinations.length > 0 && <div className="flex flex-wrap gap-1.5">{draft.destinations.map((name) => <span key={name} className="inline-flex items-center gap-1 rounded-full border bg-muted px-2.5 py-1 text-xs font-medium">{name}<button type="button" aria-label={`Remove ${name}`} className="text-muted-foreground hover:text-foreground" onClick={() => setDraft({ ...draft, destinations: draft.destinations.filter((entry) => entry !== name) })}>×</button></span>)}</div>}
          </div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="cargo-address">Address</Label><Textarea id="cargo-address" rows={2} maxLength={1000} value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="cargo-notes">Notes</Label><Textarea id="cargo-notes" rows={2} maxLength={2000} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Optional: contact person, rates, transit times…" /></div>
        </div>
        <DialogFooter><Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button type="button" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save cargo"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
