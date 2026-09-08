"use client";

import { FormEvent, useEffect, useState } from "react";
import { BadgeCheck, CircleOff, Pencil, Plus, Percent } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

export type VatCodeRecord = { id: number; companyId: number; code: string; name: string; rate: number; description: string; active: boolean; system: boolean };
type VatForm = { code: string; name: string; rate: string; description: string };
const emptyForm: VatForm = { code: "", name: "", rate: "5", description: "" };

export function VatCodeCenter({ companyId, companyName, onChanged }: { companyId: number; companyName: string; onChanged?: () => void }) {
  const [codes, setCodes] = useState<VatCodeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<VatCodeRecord | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<VatForm>(emptyForm);

  async function loadCodes() {
    if (!companyId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/vat-codes?companyId=${companyId}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load VAT codes");
      setCodes(data.codes);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not load VAT codes"); }
    finally { setLoading(false); }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { void loadCodes(); }, [companyId]);

  function addCode() {
    setEditing(null); setForm(emptyForm); setOpen(true);
  }

  function editCode(code: VatCodeRecord) {
    setEditing(code); setForm({ code: code.code, name: code.name, rate: String(code.rate), description: code.description }); setOpen(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true);
    try {
      const response = await fetch("/api/vat-codes", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, ...(editing ? { id: editing.id, active: editing.active } : {}), ...form, rate: Number(form.rate) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save VAT code");
      setOpen(false); await loadCodes(); onChanged?.(); toast.success(editing ? "VAT code updated" : "VAT code added");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save VAT code"); }
    finally { setSaving(false); }
  }

  async function toggle(code: VatCodeRecord) {
    try {
      const response = await fetch("/api/vat-codes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, id: code.id, name: code.name, rate: code.rate, description: code.description, active: !code.active }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update VAT code");
      await loadCodes(); onChanged?.(); toast.success(data.record.active ? "VAT code activated" : "VAT code deactivated");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not update VAT code"); }
  }

  return <div className="space-y-5">
    <section className="rounded-xl border bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b p-5"><div><h2 className="font-bold">VAT codes</h2><p className="mt-1 text-sm text-slate-500">Manage tax choices for {companyName}. Active codes appear on invoices, bills and expenses.</p></div><Button onClick={addCode}><Plus className="size-4" />Add VAT code</Button></div>
      <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Rate</TableHead><TableHead>Details</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>
        {loading ? <TableRow><TableCell colSpan={6} className="py-10 text-center text-slate-500">Loading VAT codes…</TableCell></TableRow> : codes.map((code) => <TableRow key={code.id}><TableCell><div className="flex items-center gap-2"><span className="font-mono font-semibold">{code.code}</span>{code.system ? <Badge variant="outline">System</Badge> : null}</div></TableCell><TableCell className="font-medium">{code.name}</TableCell><TableCell><Badge className="bg-sky-100 text-sky-800 hover:bg-sky-100"><Percent className="size-3" />{code.rate.toLocaleString()}%</Badge></TableCell><TableCell className="max-w-md text-sm text-slate-500">{code.description || "—"}</TableCell><TableCell><Badge className={code.active ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : "bg-slate-100 text-slate-600 hover:bg-slate-100"}>{code.active ? "Active" : "Inactive"}</Badge></TableCell><TableCell><div className="flex justify-end gap-2"><Button variant="outline" size="sm" onClick={() => editCode(code)}><Pencil className="size-4" />Edit</Button><Button variant="outline" size="sm" disabled={code.system} title={code.system ? "Standard VAT codes must remain active" : undefined} onClick={() => toggle(code)}>{code.active ? <CircleOff className="size-4" /> : <BadgeCheck className="size-4" />}{code.active ? "Deactivate" : "Activate"}</Button></div></TableCell></TableRow>)}
        {!loading && !codes.length ? <TableRow><TableCell colSpan={6} className="py-10 text-center text-slate-500">No VAT codes configured.</TableCell></TableRow> : null}
      </TableBody></Table></div>
    </section>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>{editing ? "Edit VAT code" : "Add VAT code"}</DialogTitle><DialogDescription>Set the code shown in dropdowns, its calculation rate, and helpful details.</DialogDescription></DialogHeader><form onSubmit={save} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Code</Label><Input value={form.code} disabled={Boolean(editing)} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase().replaceAll(" ", "_") })} placeholder="REDUCED" maxLength={20} required /></div><div className="space-y-2"><Label>Rate (%)</Label><Input type="number" min="0" max="100" step="0.01" value={form.rate} disabled={Boolean(editing?.system)} onChange={(event) => setForm({ ...form, rate: event.target.value })} required />{editing?.system ? <p className="text-xs text-slate-500">The rate is protected because this code is used by built-in VAT rules.</p> : null}</div></div><div className="space-y-2"><Label>Name</Label><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Reduced rate" maxLength={80} required /></div><div className="space-y-2"><Label>Details</Label><Textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Explain when staff should use this VAT code" maxLength={500} rows={4} /></div><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save VAT code"}</Button></DialogFooter></form></DialogContent></Dialog>
  </div>;
}
