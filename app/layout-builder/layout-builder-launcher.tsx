"use client";

import { LayoutTemplate } from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { layoutForDocumentType } from "@/lib/layout/defaults";
import type { DocumentData } from "@/lib/layout/document-data";
import { migrateDocumentDesign } from "@/lib/layout/migrate";
import { layoutDocumentTypes, parseLayoutCollection, serializeLayoutCollection, type Layout, type LayoutCollection, type LayoutDocumentType } from "@/lib/layout/schema";
import { companyDocumentData, type CompanyBranding } from "./company-data";

// The editor pulls in dnd-kit; load it only when the builder is opened.
const LayoutBuilder = dynamic(() => import("./layout-builder").then((module) => module.LayoutBuilder), { ssr: false, loading: () => <p className="p-6 text-sm text-muted-foreground">Loading layout builder…</p> });

/** Document types whose screens print with their Layout Builder design today. */
export const printConnectedTypes: ReadonlySet<LayoutDocumentType> = new Set(["Invoice", "Commercial Invoice", "Quotation", "Estimate", "Proforma Invoice", "Sales Order", "Bill", "Purchase Order", "Purchase Return", "Credit Note", "Refund", "Sales Receipt", "Delivery Note", "Packing List"]);

/** Saved layouts by document type; the first open converts the Company Setup design into the Invoice layout. */
export function storedLayouts(documentLayout: string, documentDesign: string): LayoutCollection {
  let collection: LayoutCollection = {};
  if (documentLayout) { try { collection = parseLayoutCollection(documentLayout); } catch { /* fall back to the converted design */ } }
  return collection.Invoice ? collection : { ...collection, Invoice: migrateDocumentDesign(documentDesign) };
}

export function LayoutBuilderLauncher({ setup, onSaved, disabled }: { setup: CompanyBranding & { id: number; documentLayout: string; documentDesign: string }; onSaved: (documentLayout: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [documentType, setDocumentType] = useState<LayoutDocumentType>("Invoice");
  const [dirty, setDirty] = useState(false);
  const collection = useMemo(() => storedLayouts(setup.documentLayout, setup.documentDesign), [setup.documentLayout, setup.documentDesign]);
  const initial = useMemo(() => collection[documentType] ?? layoutForDocumentType(documentType, collection.Invoice), [collection, documentType]);
  const company = useMemo<DocumentData["company"]>(() => companyDocumentData(setup), [setup]);
  const saved = setup.documentLayout ? collection : {};
  const printing = layoutDocumentTypes.filter((type) => saved[type]?.enabled && printConnectedTypes.has(type));

  async function save(layout: Layout) {
    setSaving(true);
    try {
      const documentLayout = serializeLayoutCollection({ ...collection, [documentType]: layout });
      const response = await fetch("/api/company-setup", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId: setup.id, documentLayout }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not save the layout.");
      onSaved(result.record?.documentLayout ?? documentLayout);
      setDirty(false);
    } finally { setSaving(false); }
  }

  const switchType = (next: LayoutDocumentType) => {
    if (next === documentType) return;
    if (dirty && !window.confirm(`Discard unsaved changes to the ${documentType} layout?`)) return;
    setDirty(false);
    setDocumentType(next);
  };

  return <section className="rounded-xl border bg-card p-5 shadow-sm">
    <div className="flex flex-wrap items-start gap-3">
      <div className="grid size-10 place-items-center rounded-xl bg-indigo-100 text-indigo-700"><LayoutTemplate className="size-5" /></div>
      <div className="min-w-0 flex-1">
        <h2 className="flex flex-wrap items-center gap-2 font-bold">Layout Builder {printing.length ? <Badge className="bg-emerald-400 text-slate-950 hover:bg-emerald-400">Printing: {printing.join(", ")}</Badge> : <Badge variant="outline">Not used for printing yet</Badge>}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Design each document type by dragging sections onto the page. Pages are laid out in millimetres, so printing and “Save as PDF” match the preview exactly.</p>
      </div>
      <Button type="button" disabled={disabled} onClick={() => setOpen(true)}><LayoutTemplate className="size-4" />Open Layout Builder</Button>
    </div>
    <Dialog open={open} onOpenChange={(next) => { if (!next && dirty && !window.confirm("Close without saving your layout changes?")) return; setOpen(next); if (!next) setDirty(false); }}>
      <DialogContent className="h-[96dvh] overflow-y-auto sm:max-w-none" style={{ "--dialog-width": "1680px" } as React.CSSProperties}>
        <DialogHeader>
          <DialogTitle>Layout Builder</DialogTitle>
          <DialogDescription>Choose a document type, drag sections onto the page and edit them on the right. Turn on “Use for printing” and save to print that document type with this layout.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm font-medium" htmlFor="layout-document-type">Document type</label>
          <select id="layout-document-type" className="h-9 min-w-56 rounded-md border border-input bg-background px-2 text-sm" value={documentType} onChange={(event) => switchType(event.target.value as LayoutDocumentType)}>
            {layoutDocumentTypes.map((type) => <option key={type} value={type}>{type}{saved[type] ? saved[type]!.enabled ? " — printing" : " — saved" : ""}</option>)}
          </select>
          {!printConnectedTypes.has(documentType) && <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900">This layout is saved for {documentType}, but that screen still prints with its own layout for now.</span>}
          {!saved[documentType] && documentType !== "Invoice" && <span className="text-xs text-muted-foreground">New layout, started from your Invoice layout.</span>}
        </div>
        {open && <LayoutBuilder key={`${setup.id}:${documentType}`} initial={initial} company={company} saving={saving} onSave={save} onDirtyChange={setDirty} />}
      </DialogContent>
    </Dialog>
  </section>;
}
