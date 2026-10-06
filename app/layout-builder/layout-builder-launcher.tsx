"use client";

import { LayoutTemplate } from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { DocumentData } from "@/lib/layout/document-data";
import { migrateDocumentDesign } from "@/lib/layout/migrate";
import { parseLayout, type Layout } from "@/lib/layout/schema";
import { companyDocumentData, type CompanyBranding } from "./company-data";

// The editor pulls in dnd-kit; load it only when the builder is opened.
const LayoutBuilder = dynamic(() => import("./layout-builder").then((module) => module.LayoutBuilder), { ssr: false, loading: () => <p className="p-6 text-sm text-muted-foreground">Loading layout builder…</p> });

/** Saved layout, or the current Company Setup design converted on first open. */
export function storedLayout(documentLayout: string, documentDesign: string): Layout {
  if (documentLayout) { try { return parseLayout(documentLayout); } catch { /* fall back to the converted design */ } }
  return migrateDocumentDesign(documentDesign);
}

export function LayoutBuilderLauncher({ setup, onSaved, disabled }: { setup: CompanyBranding & { id: number; documentLayout: string; documentDesign: string }; onSaved: (documentLayout: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const initial = useMemo(() => storedLayout(setup.documentLayout, setup.documentDesign), [setup.documentLayout, setup.documentDesign]);
  const company = useMemo<DocumentData["company"]>(() => companyDocumentData(setup), [setup]);
  const enabled = Boolean(setup.documentLayout) && initial.enabled;

  async function save(layout: Layout) {
    setSaving(true);
    try {
      const documentLayout = JSON.stringify(layout);
      const response = await fetch("/api/company-setup", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId: setup.id, documentLayout }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not save the layout.");
      onSaved(result.record?.documentLayout ?? documentLayout);
    } finally { setSaving(false); }
  }

  return <section className="rounded-xl border bg-card p-5 shadow-sm">
    <div className="flex flex-wrap items-start gap-3">
      <div className="grid size-10 place-items-center rounded-xl bg-indigo-100 text-indigo-700"><LayoutTemplate className="size-5" /></div>
      <div className="min-w-0 flex-1">
        <h2 className="flex flex-wrap items-center gap-2 font-bold">Layout Builder <Badge variant="outline">New</Badge>{enabled ? <Badge className="bg-emerald-400 text-slate-950 hover:bg-emerald-400">Used for invoice printing</Badge> : <Badge variant="outline">Not used for printing yet</Badge>}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Drag sections to design the invoice page. Pages are laid out in millimetres, so printing and “Save as PDF” match the preview exactly, however many lines an invoice has.</p>
      </div>
      <Button type="button" disabled={disabled} onClick={() => setOpen(true)}><LayoutTemplate className="size-4" />Open Layout Builder</Button>
    </div>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="h-[96dvh] overflow-y-auto sm:max-w-none" style={{ "--dialog-width": "1680px" } as React.CSSProperties}>
        <DialogHeader><DialogTitle>Invoice Layout Builder</DialogTitle><DialogDescription>Drag sections from the left onto the page, select one to edit it on the right. Turn on “Use for printing” and save to print invoices with this layout.</DialogDescription></DialogHeader>
        {open && <LayoutBuilder key={setup.id} initial={initial} company={company} saving={saving} onSave={save} />}
      </DialogContent>
    </Dialog>
  </section>;
}
