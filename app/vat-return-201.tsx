"use client";

import { Fragment, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, FileSpreadsheet, FileText, MapPin, Printer } from "lucide-react";
import { toast } from "sonner";
import { AccountHistory } from "./account-history";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { uaeEmirates, vat201Layout, vat201TemplatePath, vat201Totals, vat201Workbook, type Vat201Box, type Vat201BoxKey, type Vat201Manual, type Vat201Source } from "@/lib/vat-return";

type VatAccount = { id: number; code: string; name: string };
export type Vat201Data = {
  boxes: Record<Vat201BoxKey, Vat201Box>;
  unallocated: Vat201Box;
  sources: Partial<Record<Vat201BoxKey | "unallocated", Vat201Source[]>>;
  company: { name: string; trn: string; emirate: string; emirateName: string };
  inventories: Array<{ id: number; name: string; active: boolean; emirate: string }>;
  accounts: { output: VatAccount[]; input: VatAccount[] };
};

// The VAT ledger each box's documents actually post to. Reverse-charge and import bills debit Recoverable VAT only;
// their output side (Boxes 3 and 6) is reported on the return but not credited to VAT Payable.
const outputBoxes = new Set<string>(["1a", "1b", "1c", "1d", "1e", "1f", "1g", "unallocated"]);
const inputBoxes = new Set<string>(["3", "6", "9", "10"]);
const selfAssessedBoxes = new Set<string>(["3", "6"]);
const manualFields: Partial<Record<Vat201BoxKey, Partial<Record<keyof Vat201Box, keyof Vat201Manual>>>> = {
  "2": { amount: "touristAmount", vat: "touristVat" },
  "7": { amount: "importAdjustmentAmount", vat: "importAdjustmentVat" },
  "9": { adjustment: "box9Adjustment" },
};
const manualHints: Partial<Record<Vat201BoxKey, string>> = {
  "2": "Not recorded in EasyBook — enter the refunds paid to tourists from your tax-refund operator statement (as positive amounts).",
  "7": "Not recorded in EasyBook — enter any customs adjustments to imported goods.",
};

const aed = (value: number) => {
  const text = new Intl.NumberFormat("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(value));
  return value < -0.004 ? `(${text})` : text;
};
const safeName = (value: string) => value.replace(/[^\w.-]+/g, " ").trim().replace(/\s+/g, "-");

export function Vat201Return({ companyId, periodStart, periodEnd, data, loading, canWrite, onOpenDocument, onChanged }: {
  companyId: number; periodStart: string; periodEnd: string; data?: Vat201Data; loading: boolean; canWrite: boolean;
  onOpenDocument: (id: number) => void; onChanged: () => Promise<void> | void;
}) {
  const [manual, setManual] = useState<Record<keyof Vat201Manual, string>>({ touristAmount: "", touristVat: "", importAdjustmentAmount: "", importAdjustmentVat: "", box9Adjustment: "" });
  const [open, setOpen] = useState<string | null>(null);
  const [account, setAccount] = useState<VatAccount | null>(null);
  const [busy, setBusy] = useState(false);
  const [savingEmirate, setSavingEmirate] = useState<number | null>(null);
  const manualValues = useMemo(() => Object.fromEntries(Object.entries(manual).map(([key, value]) => [key, Number(value) || 0])) as Vat201Manual, [manual]);
  const boxes = useMemo(() => data ? vat201Totals(data.boxes, data.unallocated, manualValues) : undefined, [data, manualValues]);
  const unallocated = data?.unallocated;
  const hasUnallocated = Boolean(unallocated && (Math.abs(unallocated.amount) > 0.001 || Math.abs(unallocated.vat) > 0.001 || Math.abs(unallocated.adjustment) > 0.001));
  const heading = data ? `${data.company.name}${data.company.trn ? ` · TRN ${data.company.trn}` : ""} · Tax period ${periodStart} to ${periodEnd}` : "";
  const fileBase = `VAT201-${safeName(data?.company.name || "Company")}-${periodStart}-to-${periodEnd}`;

  async function saveEmirate(locationId: number, emirate: string) {
    setSavingEmirate(locationId);
    try {
      const response = await fetch("/api/vat-management", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "emirate", companyId, locationId, emirate }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save the emirate");
      toast.success("Emirate saved; the return is updated");
      await onChanged();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save the emirate"); }
    finally { setSavingEmirate(null); }
  }

  function returnRows() {
    if (!boxes) return [];
    return vat201Layout.map((row) => ({ box: row.box, description: row.label, amount: row.cells.amount ? boxes[row.box].amount : null, vat: row.cells.vat ? boxes[row.box].vat : null, adjustment: row.cells.adjustment ? boxes[row.box].adjustment : null }));
  }

  async function exportReturn(format: "xlsx" | "pdf" | "print") {
    if (!boxes || busy) return;
    if (format === "xlsx" && hasUnallocated) { toast.error("Set the emirate of every inventory first: the template has no row for supplies without an emirate."); return; }
    const popup = format === "print" ? window.open("", "_blank") : null;
    if (format === "print" && !popup) { toast.error("Allow pop-ups to open the A4 print preview."); return; }
    if (popup) { popup.opener = null; popup.document.body.textContent = "Preparing A4 print preview…"; }
    setBusy(true);
    try {
      let blob: Blob;
      if (format === "xlsx") {
        const template = await fetch(vat201TemplatePath, { cache: "force-cache" });
        if (!template.ok) throw new Error("The VAT return template could not be loaded.");
        blob = new Blob([await vat201Workbook(await template.arrayBuffer(), boxes, heading) as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      } else {
        const { reportPdf } = await import("@/lib/report-export");
        const rows = returnRows().map((row) => ({ ...row, box: row.box }));
        const content = await reportPdf({ key: "vat-201-return", title: "VAT Return (VAT201)", description: heading, generatedAt: new Date().toISOString(), currency: "AED", period: { label: `${periodStart} to ${periodEnd}` }, columns: [{ key: "box", label: "Box" }, { key: "description", label: "Description" }, { key: "amount", label: "Amount (AED)", type: "money" }, { key: "vat", label: "VAT Amount (AED)", type: "money" }, { key: "adjustment", label: "Adjustment (AED)", type: "money" }], rows }, data?.company.name || "Company", "Company-wide · all inventories");
        blob = new Blob([content], { type: "application/pdf" });
      }
      const url = URL.createObjectURL(blob);
      if (popup) popup.location.href = url;
      else { const link = document.createElement("a"); link.href = url; link.download = `${fileBase}.${format}`; link.click(); }
      setTimeout(() => URL.revokeObjectURL(url), 300000);
    } catch (error) { popup?.close(); toast.error(error instanceof Error ? error.message : "Export failed."); }
    finally { setBusy(false); }
  }

  const ledgerFor = (box: string) => [...(outputBoxes.has(box) ? data?.accounts.output ?? [] : []), ...(inputBoxes.has(box) ? data?.accounts.input ?? [] : [])];

  const cell = (box: Vat201BoxKey, field: keyof Vat201Box) => {
    const row = vat201Layout.find((entry) => entry.box === box);
    if (!row?.cells[field] || !boxes) return <span className="text-slate-300">—</span>;
    const manualKey = manualFields[box]?.[field];
    if (manualKey) return <Input aria-label={`Box ${box} ${field}`} type="number" step="0.01" inputMode="decimal" className="ml-auto h-8 w-32 text-right tabular-nums" placeholder="0.00" value={manual[manualKey]} onChange={(event) => setManual((old) => ({ ...old, [manualKey]: event.target.value }))} />;
    return <span className={`tabular-nums ${boxes[box][field] < -0.004 ? "text-red-600 dark:text-red-400" : ""}`}>{aed(boxes[box][field])}</span>;
  };

  const sourceRows = (key: Vat201BoxKey | "unallocated") => {
    const list = data?.sources[key] ?? [];
    const ledgers = ledgerFor(key);
    return <tr><td colSpan={5} className="bg-slate-50 px-4 py-3 dark:bg-slate-900/40">
      {ledgers.length ? <p className="mb-2 text-xs text-slate-600">VAT posts to {ledgers.map((ledger, index) => <Fragment key={ledger.id}>{index ? " and " : ""}<button type="button" className="font-semibold text-emerald-700 underline underline-offset-2 dark:text-emerald-300" onClick={() => setAccount(ledger)}>{ledger.code} · {ledger.name}</button></Fragment>)}.{selfAssessedBoxes.has(key) ? " The output VAT in this box is self-assessed on the return; these bills do not post it to VAT Payable." : ""}</p> : null}
      {list.length ? <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-xs"><thead><tr className="text-left text-slate-500"><th className="py-1 pr-3">Date</th><th className="py-1 pr-3">Document</th><th className="py-1 pr-3">Type</th><th className="py-1 pr-3">Customer / supplier</th><th className="py-1 pr-3">Inventory</th><th className="py-1 pr-3">VAT code</th><th className="py-1 pr-3 text-right">Amount</th><th className="py-1 pr-3 text-right">VAT</th><th className="py-1 text-right">Adjustment</th></tr></thead>
        <tbody>{list.map((source) => <tr key={`${source.transactionId ?? `a${source.adjustmentId}`}-${source.vatCode}`} className="border-t">
          <td className="py-1.5 pr-3">{source.date}</td>
          <td className="py-1.5 pr-3">{source.transactionId ? <button type="button" className="font-semibold text-emerald-700 underline underline-offset-2 dark:text-emerald-300" onClick={() => onOpenDocument(source.transactionId!)}>{source.number}</button> : <span className="font-mono">{source.number}</span>}</td>
          <td className="py-1.5 pr-3 capitalize">{source.type}</td><td className="py-1.5 pr-3">{source.party}</td><td className="py-1.5 pr-3">{source.inventory || "—"}</td><td className="py-1.5 pr-3 font-mono">{source.vatCode || "—"}</td>
          <td className="py-1.5 pr-3 text-right tabular-nums">{aed(source.amount)}</td><td className="py-1.5 pr-3 text-right tabular-nums">{aed(source.vat)}</td><td className="py-1.5 text-right tabular-nums">{source.adjustment ? aed(source.adjustment) : "—"}</td>
        </tr>)}</tbody></table></div> : <p className="text-xs text-slate-500">{manualHints[key as Vat201BoxKey] ?? "No posted documents in this period."}</p>}
    </td></tr>;
  };

  const boxRow = (row: (typeof vat201Layout)[number]) => {
    const count = data?.sources[row.box]?.length ?? 0;
    const expandable = !row.total && (count > 0 || ledgerFor(row.box).length > 0 || Boolean(manualHints[row.box]));
    const expanded = open === row.box;
    return <Fragment key={row.box}>
      <tr className={`border-t ${row.total ? "bg-slate-50 font-bold dark:bg-slate-900/40" : ""}`}>
        <td className="w-14 px-4 py-2.5 font-bold">{row.box}</td>
        <td className="px-2 py-2.5">{expandable ? <button type="button" aria-expanded={expanded} className="flex items-start gap-1.5 text-left hover:text-emerald-700" onClick={() => setOpen(expanded ? null : row.box)}>{expanded ? <ChevronDown className="mt-0.5 size-4 shrink-0" /> : <ChevronRight className="mt-0.5 size-4 shrink-0" />}<span>{row.label}{count ? <span className="ml-2 text-xs font-normal text-slate-500">{count} source{count === 1 ? "" : "s"}</span> : null}</span></button> : row.label}</td>
        <td className="px-4 py-2.5 text-right">{cell(row.box, "amount")}</td>
        <td className="px-4 py-2.5 text-right">{row.section === "net" ? null : cell(row.box, "vat")}</td>
        <td className="px-4 py-2.5 text-right">{row.section === "net" ? null : cell(row.box, "adjustment")}</td>
      </tr>
      {expanded ? sourceRows(row.box) : null}
    </Fragment>;
  };

  const section = (title: string, part: "output" | "input" | "net") => <div className="overflow-x-auto">
    <table className="w-full min-w-[760px] text-sm">
      <thead><tr className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-900/40"><th className="px-4 py-2" colSpan={2}>{title}</th><th className="px-4 py-2 text-right">{part === "net" ? "Amount (AED)" : "Amount (AED)"}</th><th className="px-4 py-2 text-right">{part === "net" ? "" : "VAT Amount (AED)"}</th><th className="px-4 py-2 text-right">{part === "net" ? "" : "Adjustment (AED)"}</th></tr></thead>
      <tbody>
        {vat201Layout.filter((row) => row.section === part).map((row) => <Fragment key={row.box}>
          {boxRow(row)}
          {row.box === "1g" && hasUnallocated && unallocated ? <>
            <tr className="border-t bg-amber-50 dark:bg-amber-950/30"><td className="px-4 py-2.5"><AlertTriangle className="size-4 text-amber-600" /></td><td className="px-2 py-2.5"><button type="button" className="flex items-center gap-1.5 text-left font-semibold text-amber-800 dark:text-amber-300" onClick={() => setOpen(open === "unallocated" ? null : "unallocated")}>{open === "unallocated" ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}Standard rated supplies with no emirate — set the inventory emirate below</button></td><td className="px-4 py-2.5 text-right tabular-nums">{aed(unallocated.amount)}</td><td className="px-4 py-2.5 text-right tabular-nums">{aed(unallocated.vat)}</td><td className="px-4 py-2.5 text-right tabular-nums">{aed(unallocated.adjustment)}</td></tr>
            {open === "unallocated" ? sourceRows("unallocated") : null}
          </> : null}
        </Fragment>)}
      </tbody>
    </table>
  </div>;

  return <section className="overflow-hidden rounded-xl border bg-white shadow-sm" aria-busy={loading}>
    <div className="flex flex-col gap-3 border-b p-5 lg:flex-row lg:items-start lg:justify-between">
      <div><h3 className="font-bold text-slate-900">VAT Return (VAT201)</h3><p className="mt-1 text-sm text-slate-500">Auto-filled from posted documents and VAT adjustments for {periodStart} to {periodEnd}, in AED. Click a box to see the documents and VAT account behind it.</p></div>
      <div className="grid grid-cols-3 gap-2 sm:flex">
        <Button variant="outline" size="sm" disabled={!boxes || busy} onClick={() => void exportReturn("xlsx")}><FileSpreadsheet className="size-4" />Excel</Button>
        <Button variant="outline" size="sm" disabled={!boxes || busy} onClick={() => void exportReturn("pdf")}><FileText className="size-4" />PDF</Button>
        <Button variant="outline" size="sm" disabled={!boxes || busy} onClick={() => void exportReturn("print")}><Printer className="size-4" />Print</Button>
      </div>
    </div>
    {!data ? <p className="p-5 text-sm text-slate-500">{loading ? "Loading the VAT return…" : "Choose a tax period to prepare the return."}</p> : <>
      {section("VAT on Sales and All Other Outputs", "output")}
      {section("VAT on Expenses and All Other Inputs", "input")}
      {section("Net VAT Due", "net")}
      {account ? <div className="border-t p-4"><div className="mb-3 flex items-center justify-between gap-3"><h4 className="font-bold">{account.code} · {account.name} · account history</h4><Button variant="outline" size="sm" onClick={() => setAccount(null)}>Close account</Button></div><AccountHistory accountId={account.id} companyId={companyId} onOpen={onOpenDocument} /></div> : null}
      <details className="border-t p-5" open={hasUnallocated}>
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-900"><MapPin className="size-4 text-slate-500" />Emirate of each inventory (Box 1a–1g)</summary>
        <p className="mt-2 text-xs text-slate-500">Standard-rated sales go to the emirate of the inventory (branch) that made them. An inventory left on “Company emirate” uses {data.company.emirateName ? <strong>{data.company.emirateName}</strong> : "the emirate in the Company Setup city — none is set yet"}.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{data.inventories.map((inventory) => <label key={inventory.id} className="grid gap-1 rounded-lg border p-3 text-sm"><span className="font-semibold">{inventory.name}{inventory.active ? "" : " (inactive)"}</span>
          <select className="h-9 rounded-md border bg-transparent px-2 text-sm disabled:opacity-60" aria-label={`Emirate of ${inventory.name}`} disabled={!canWrite || savingEmirate === inventory.id} value={inventory.emirate} onChange={(event) => void saveEmirate(inventory.id, event.target.value)}>
            <option value="">Company emirate{data.company.emirateName ? ` (${data.company.emirateName})` : ""}</option>
            {uaeEmirates.map((emirate) => <option key={emirate.key} value={emirate.key}>{emirate.name}</option>)}
          </select></label>)}</div>
      </details>
    </>}
  </section>;
}
