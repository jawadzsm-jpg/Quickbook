"use client";
import { useState } from "react";
import { CheckCircle2, ExternalLink, FileCode2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { MOF_EINVOICING_URL, companyEInvoiceIssues, customerEInvoiceStatus, invoiceEInvoiceStatus } from "@/lib/einvoice-readiness";

export type EInvoiceCompany = { id: number; name: string; trn: string; addressLine1: string; city: string; country: string; einvoiceEnabled: boolean; peppolParticipantId: string; einvoiceAsp: string; einvoiceAspAccount: string; einvoiceGoLive: string };
type Row = Record<string, unknown>;
type EInvoiceFields = Pick<EInvoiceCompany, "einvoiceEnabled" | "peppolParticipantId" | "einvoiceAsp" | "einvoiceAspAccount" | "einvoiceGoLive">;

/** Badge for a customer or invoice: ready, B2C (no TRN) or the missing items. Shown only when e-invoicing is on. */
export function EInvoiceBadge({ status, issues }: { status: "ready" | "b2c" | "issues"; issues: string[] }) {
  if (status === "ready") return <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300" title="Ready for UAE e-invoicing">E-invoice ready</Badge>;
  if (status === "b2c") return <Badge variant="outline" className="text-muted-foreground" title="No customer TRN: treated as B2C, outside the first B2B/B2G e-invoicing phase">B2C · no TRN</Badge>;
  return <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300" title={`Missing for e-invoicing: ${issues.join("; ")}`}>E-invoice: {issues.length} missing</Badge>;
}

/** Company e-invoicing settings, saved on their own (Company Setup and the E-Invoicing page share this). */
export function EInvoicingSettings({ company, canEdit, onSaved }: { company: EInvoiceCompany; canEdit: boolean; onSaved: (values: EInvoiceFields) => void | Promise<void> }) {
  const [form, setForm] = useState<EInvoiceFields>({ einvoiceEnabled: company.einvoiceEnabled, peppolParticipantId: company.peppolParticipantId, einvoiceAsp: company.einvoiceAsp, einvoiceAspAccount: company.einvoiceAspAccount, einvoiceGoLive: company.einvoiceGoLive });
  const [saving, setSaving] = useState(false);
  const issues = companyEInvoiceIssues({ ...company, ...form });
  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/company-setup", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId: company.id, ...form }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save e-invoicing settings.");
      const record = data.record as EInvoiceFields;
      const saved = { einvoiceEnabled: record.einvoiceEnabled, peppolParticipantId: record.peppolParticipantId, einvoiceAsp: record.einvoiceAsp, einvoiceAspAccount: record.einvoiceAspAccount, einvoiceGoLive: record.einvoiceGoLive };
      setForm(saved);
      await onSaved(saved);
      toast.success("E-invoicing settings saved");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save e-invoicing settings."); } finally { setSaving(false); }
  };
  const field = (key: "peppolParticipantId" | "einvoiceAsp" | "einvoiceAspAccount", label: string, hint: string) => <div className="space-y-2"><Label htmlFor={`einvoice-${key}`}>{label}</Label><Input id={`einvoice-${key}`} value={form[key]} disabled={!canEdit} maxLength={120} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /><p className="text-xs text-muted-foreground">{hint}</p></div>;
  return <div className="space-y-4">
    <label className="flex items-center gap-3 text-sm font-medium"><Switch checked={form.einvoiceEnabled} disabled={!canEdit} onCheckedChange={(checked) => setForm({ ...form, einvoiceEnabled: checked })} aria-label="UAE e-invoicing on or off" />Prepare this company for UAE e-invoicing {form.einvoiceEnabled ? <Badge variant="secondary">On</Badge> : <Badge variant="outline">Off</Badge>}</label>
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2"><Label>Company TRN</Label><Input value={company.trn} disabled readOnly /><p className="text-xs text-muted-foreground">Edited in Company Setup → Company identity (15 digits).</p></div>
      {field("peppolParticipantId", "Peppol participant ID", "Issued when you register with your Accredited Service Provider.")}
      {field("einvoiceAsp", "Accredited Service Provider (ASP)", "The MoF-accredited provider that exchanges and reports your e-invoices.")}
      {field("einvoiceAspAccount", "ASP account / reference", "Your customer or account reference with the ASP.")}
      <div className="space-y-2"><Label htmlFor="einvoice-go-live">Go-live date</Label><Input id="einvoice-go-live" type="date" value={form.einvoiceGoLive} disabled={!canEdit} onChange={(event) => setForm({ ...form, einvoiceGoLive: event.target.value })} /><p className="text-xs text-muted-foreground">When your company must start issuing e-invoices.</p></div>
    </div>
    {issues.length ? <p role="status" className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200"><TriangleAlert className="mt-0.5 size-4 shrink-0" />Still needed: {issues.join(", ")}.</p> : <p className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-200"><CheckCircle2 className="size-4" />Company e-invoicing details are complete.</p>}
    {canEdit && <div className="flex justify-end"><Button type="button" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save e-invoicing settings"}</Button></div>}
  </div>;
}

/** Management > E-Invoicing (UAE): what the framework needs, the company settings, and customer and invoice readiness. */
export function EInvoicingCenter({ company, customers, invoices, canEdit, onSaved, onOpenCompanySetup }: { company: EInvoiceCompany; customers: Row[]; invoices: Row[]; canEdit: boolean; onSaved: (values: EInvoiceFields) => void | Promise<void>; onOpenCompanySetup: () => void }) {
  const byName = new Map(customers.map((customer) => [String(customer.name), customer]));
  const customerRows = customers.map((customer) => ({ customer, ...customerEInvoiceStatus(customer as never) }));
  const invoiceRows = invoices.map((invoice) => ({ invoice, ...invoiceEInvoiceStatus(invoice, byName.get(String(invoice.party)) as never, company) }));
  const count = (rows: Array<{ status: string }>, status: string) => rows.filter((row) => row.status === status).length;
  const tile = (label: string, value: number, tone: string) => <div className="rounded-xl border bg-card p-4"><p className="text-xs font-medium text-muted-foreground">{label}</p><p className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>{value}</p></div>;
  return <div className="space-y-5">
    <section className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-lg bg-sky-500/15 text-sky-700 dark:text-sky-300"><FileCode2 className="size-5" /></div><div><h2 className="text-lg font-semibold">UAE e-invoicing</h2><p className="max-w-3xl text-sm text-muted-foreground">The Ministry of Finance framework uses the <strong>Peppol</strong> exchange network, the UAE <strong>PINT-AE</strong> invoice specification and <strong>structured XML</strong>, sent and reported through an <strong>Accredited Service Provider (ASP)</strong>. A PDF invoice, even with a QR code, is not a compliant e-invoice on its own.</p></div></div>
        <a href={MOF_EINVOICING_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent">Ministry of Finance guidance<ExternalLink className="size-3.5" /></a></div>
      <p className="mt-3 text-xs text-muted-foreground">EasyBook checks readiness here; it does not create or send the XML yet. Your ASP converts and submits invoices.</p>
    </section>
    <section className="rounded-2xl border bg-card p-5 shadow-sm"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{company.name} settings</h3><Button type="button" variant="outline" size="sm" onClick={onOpenCompanySetup}>Open Company Setup</Button></div><EInvoicingSettings key={company.id} company={company} canEdit={canEdit} onSaved={onSaved} /></section>
    <section className="rounded-2xl border bg-card p-5 shadow-sm">
      <h3 className="font-semibold">Readiness</h3><p className="text-sm text-muted-foreground">Customers in this company and the invoices loaded for the active inventory. Customers without a TRN are B2C, outside the first B2B/B2G phase.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">{tile("Customers ready", count(customerRows, "ready"), "text-emerald-600")}{tile("Customers B2C", count(customerRows, "b2c"), "text-muted-foreground")}{tile("Customers missing details", count(customerRows, "issues"), "text-amber-600")}{tile("Invoices ready", count(invoiceRows, "ready"), "text-emerald-600")}{tile("Invoices B2C", count(invoiceRows, "b2c"), "text-muted-foreground")}{tile("Invoices missing details", count(invoiceRows, "issues"), "text-amber-600")}</div>
      {[["Customers to complete", customerRows.filter((row) => row.status === "issues").map((row) => [String(row.customer.name), row.issues] as const)], ["Invoices to complete", invoiceRows.filter((row) => row.status === "issues").map((row) => [`${String(row.invoice.number)} · ${String(row.invoice.party)}`, row.issues] as const)]].map(([title, rows]) => (rows as Array<readonly [string, string[]]>).length ? <div key={String(title)} className="mt-4"><h4 className="text-sm font-semibold">{String(title)}</h4><ul className="mt-2 divide-y rounded-lg border text-sm">{(rows as Array<readonly [string, string[]]>).slice(0, 25).map(([name, issues]) => <li key={name} className="flex flex-wrap justify-between gap-2 px-3 py-2"><span className="font-medium">{name}</span><span className="text-amber-700 dark:text-amber-300">{issues.join("; ")}</span></li>)}</ul></div> : null)}
    </section>
  </div>;
}
