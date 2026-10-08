"use client";

import { useRef, useState } from "react";
import { Download, FilePlus2, Printer, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createA4LetterheadPdfBlob, downloadPdfBlob } from "@/lib/document-output";
import { defaultLetterhead, footerStyles, letterheadDocuments, readLetterheads, type LetterheadTemplate } from "@/lib/letterhead";
import { LetterheadPage, type LetterheadCompany } from "./letterhead-page";
import { LetterheadRichEditor } from "./letterhead-rich-editor";

type Company = LetterheadCompany & { id: number; letterheadDesign: string };

const colourPresets = ["#c82424", "#0f4c81", "#0f766e", "#1f2937", "#7c3aed", "#b45309"];

function EditorSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <section className="space-y-3 rounded-xl border bg-card p-4 text-card-foreground"><div><h3 className="font-semibold">{title}</h3>{description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}</div>{children}</section>;
}

function Toggle({ checked, onChange, label, hint, className = "" }: { checked: boolean; onChange: (checked: boolean) => void; label: string; hint?: string; className?: string }) {
  return <label className={`flex items-start gap-2 ${className}`}><input type="checkbox" className="mt-0.5" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span>{label}{hint && checked ? <span className="block text-xs text-amber-700 dark:text-amber-300">{hint}</span> : null}</span></label>;
}

export function LetterheadCenter({ company, onSaved }: { company: Company; onSaved: (company: Company) => void }) {
  const initial = readLetterheads(company.letterheadDesign);
  const [templates, setTemplates] = useState<LetterheadTemplate[]>(initial.templates);
  const [selectedId, setSelectedId] = useState(initial.templates[0]?.id || "");
  const [saving, setSaving] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const preview = useRef<HTMLDivElement>(null);
  const selected = templates.find((template) => template.id === selectedId);
  const current = selected || defaultLetterhead();
  const missing = { logo: !company.logoData, stamp: !company.stampData, trn: !company.trn, address: ![company.addressLine1, company.addressLine2, company.city].some(Boolean) };
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(initial.templates));
  const dirty = JSON.stringify(templates) !== savedJson;
  const update = (patch: Partial<LetterheadTemplate>) => {
    if (!selected) return;
    setTemplates((existing) => existing.map((template) => template.id === selected.id ? { ...template, ...patch } : template));
  };
  const add = () => {
    if (templates.length >= 20) return toast.error("Keep at most 20 saved letterheads.");
    const template = { ...defaultLetterhead(), id: crypto.randomUUID(), name: `Letterhead ${templates.length + 1}` };
    setTemplates((existing) => [...existing, template]);
    setSelectedId(template.id);
  };
  const remove = () => {
    if (!selected) return;
    const remaining = templates.filter((template) => template.id !== selected.id);
    setTemplates(remaining);
    setSelectedId(remaining[0]?.id || "");
  };
  const assign = (document: typeof letterheadDocuments[number][0], checked: boolean) => {
    setTemplates((existing) => existing.map((template) => ({
      ...template,
      documents: template.id === selectedId
        ? checked ? [...template.documents, document] : template.documents.filter((value) => value !== document)
        : template.documents.filter((value) => value !== document),
    })));
  };
  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/company-setup/letterhead", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: company.id, value: JSON.stringify({ templates }) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save the letterheads.");
      onSaved(result.record as Company);
      setSavedJson(JSON.stringify(templates));
      toast.success("Letterheads saved");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save the letterheads."); }
    finally { setSaving(false); }
  };
  const print = () => {
    if (!selected || !preview.current) return;
    const popup = window.open("", "_blank");
    if (!popup) return toast.error("Allow pop-ups to print the letterhead.");
    popup.opener = null;
    popup.document.write(`<!doctype html><html><head><title>Letterhead</title><style>@page{size:A4 portrait;margin:0}html,body{margin:0;padding:0;background:white}.letterhead-page{width:210mm!important;height:297mm!important;break-after:page;print-color-adjust:exact;-webkit-print-color-adjust:exact}.letterhead-page:last-child{break-after:auto}.letterhead-drag-handle{display:none}.print-controls{padding:12px;background:#f1f5f9}@media print{.print-controls{display:none}}</style></head><body><div class="print-controls"><button onclick="window.print()">Print / Save PDF</button></div>${preview.current.innerHTML}</body></html>`);
    popup.document.close();
    void Promise.all(Array.from(popup.document.images).map((image) => image.complete ? Promise.resolve() : image.decode().catch(() => undefined)))
      .then(() => window.setTimeout(() => { if (!popup.closed) popup.print(); }, 150));
  };
  const download = async () => {
    if (!selected || !preview.current) return;
    setPdfBusy(true);
    try {
      const element = preview.current.querySelector<HTMLElement>(".letterhead-page");
      if (!element) throw new Error("The letterhead preview is not ready.");
      const pdf = await createA4LetterheadPdfBlob(element, selected.name);
      const file = selected.name.replace(/[^\p{L}\p{N}._-]+/gu, "_") || "Letterhead";
      downloadPdfBlob(pdf, `${file}.pdf`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not create the PDF."); }
    finally { setPdfBusy(false); }
  };
  return <section className="space-y-5">
    <div className="rounded-xl border bg-white p-5">
      <h2 className="text-lg font-bold">Letterhead generator</h2>
      <p className="text-sm text-slate-500">Create named letterheads, assign each to document areas, and print or download a full A4 page.</p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="grid min-w-48 flex-1 gap-1 text-sm font-medium">Saved letterhead
          <select className="h-10 rounded-md border bg-white px-3" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
            {!selected && <option value="">Choose or create a letterhead</option>}
            {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
          </select>
        </label>
        <Button type="button" variant="outline" onClick={add}><FilePlus2 className="size-4" />New</Button>
        <Button type="button" variant="outline" disabled={!selected} onClick={remove}><Trash2 className="size-4" />Delete</Button>
        {dirty ? <span className="self-center rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-800 dark:text-amber-300">Unsaved changes</span> : null}<Button type="button" disabled={saving || !dirty} onClick={() => void save()}><Save className="size-4" />{saving ? "Saving…" : "Save letterheads"}</Button>
      </div>
    </div>
    {selected ? <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(290px,380px)_minmax(0,1fr)]">
      <div className="space-y-4">
        <EditorSection title="Letterhead" description="Name it, then pick the brand colour used for headings and the footer.">
          <label className="grid gap-1 text-sm font-medium">Name<Input maxLength={80} value={current.name} onChange={(event) => update({ name: event.target.value })} /></label>
          <div className="grid gap-2 text-sm font-medium">Colour
            <div className="flex flex-wrap items-center gap-2">
              {colourPresets.map((preset) => <button key={preset} type="button" aria-label={`Use colour ${preset}`} title={preset} onClick={() => update({ color: preset })} className={`size-7 rounded-full border-2 ${current.color.toLowerCase() === preset ? "border-foreground" : "border-transparent"}`} style={{ background: preset }} />)}
              <Input type="color" aria-label="Custom colour" className="h-8 w-12 p-1" value={current.color} onChange={(event) => update({ color: event.target.value })} />
              <span className="font-mono text-xs text-muted-foreground">{current.color}</span>
            </div>
          </div>
        </EditorSection>
        <EditorSection title="Header" description="Logos, phone and email come from Company Setup.">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Toggle checked={current.showLogo} onChange={(showLogo) => update({ showLogo })} label="Left logo" />
            <Toggle checked={current.showRightLogo} onChange={(showRightLogo) => update({ showRightLogo })} label="Right logo" />
            <Toggle checked={current.headerContact !== false} onChange={(headerContact) => update({ headerContact })} label="Phone, email & website line" className="col-span-2" />
          </div>
          {missing.logo && current.showLogo ? <p className="text-xs text-amber-700 dark:text-amber-300">No left logo uploaded yet: the company name is shown instead.</p> : null}
          <label className="grid gap-1 text-sm font-medium">Heading <span className="text-xs font-normal text-muted-foreground">English or Arabic, shown on the right</span><Input maxLength={120} value={current.heading} onChange={(event) => update({ heading: event.target.value })} placeholder="Optional" /></label>
          <label className="grid gap-1 text-sm font-medium">Subtitle<Input maxLength={180} value={current.subtitle} onChange={(event) => update({ subtitle: event.target.value })} placeholder="Optional, e.g. a tagline" /></label>
          <label className="grid gap-1 text-sm font-medium">Website<Input maxLength={160} value={current.website} onChange={(event) => update({ website: event.target.value })} placeholder="www.example.com" /></label>
        </EditorSection>
        <EditorSection title="Letter content" description="Type the letter. Drag the dashed handle in the preview to move the text.">
          <LetterheadRichEditor key={selected.id} template={current} onChange={(body, bodyHtml) => update({ body, bodyHtml })} />
          <details className="rounded-lg border px-3 py-2 text-sm"><summary className="cursor-pointer font-medium">Text position</summary>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <label>Left (mm)<Input type="number" min={0} max={170} value={current.bodyLeft ?? 13} onChange={(event) => update({ bodyLeft: Math.min(170, Math.max(0, Math.round(Number(event.target.value) || 0))) })} /></label>
              <label>Top (mm)<Input type="number" min={0} max={250} value={current.bodyTop ?? 48} onChange={(event) => update({ bodyTop: Math.min(250, Math.max(0, Math.round(Number(event.target.value) || 0))) })} /></label>
              <label>Width (mm)<Input type="number" min={20} max={210} value={current.bodyWidth ?? 184} onChange={(event) => update({ bodyWidth: Math.min(210, Math.max(20, Math.round(Number(event.target.value) || 20))) })} /></label>
            </div>
          </details>
        </EditorSection>
        <EditorSection title="Company stamp" description="Upload the stamp image in Company Setup → Company stamp.">
          <Toggle checked={current.showStamp} onChange={(showStamp) => update({ showStamp })} label="Show company stamp" />
          {current.showStamp && <div className="grid grid-cols-2 gap-3 text-sm">
            <label>Left (mm)<Input type="number" min={0} max={170} value={current.stampLeft} onChange={(event) => update({ stampLeft: Math.min(170, Math.max(0, Number(event.target.value) || 0)) })} /></label>
            <label>Top (mm)<Input type="number" min={0} max={260} value={current.stampTop} onChange={(event) => update({ stampTop: Math.min(260, Math.max(0, Number(event.target.value) || 0)) })} /></label>
            <p className="col-span-2 text-xs text-muted-foreground">You can also drag the stamp in the preview.</p>
          </div>}
          {current.showStamp && missing.stamp ? <p className="text-xs text-amber-700 dark:text-amber-300">No company stamp uploaded yet.</p> : null}
        </EditorSection>
        <EditorSection title="Footer" description="Printed at the bottom of every letterhead page.">
          <Toggle checked={current.showFooter !== false} onChange={(showFooter) => update({ showFooter })} label="Show footer" />
          {current.showFooter !== false && <>
            <div className="grid gap-1 text-sm font-medium">Style
              <div className="flex gap-2">{footerStyles.map(([value, label]) => <Button key={value} type="button" size="sm" variant={(current.footerStyle ?? "line") === value ? "default" : "outline"} onClick={() => update({ footerStyle: value })}>{label}</Button>)}</div>
            </div>
            <label className="grid gap-1 text-sm font-medium">Footer text<Textarea rows={2} maxLength={300} value={current.footer} onChange={(event) => update({ footer: event.target.value })} placeholder="Optional, e.g. a slogan or licence number" /></label>
            <div className="grid gap-2 text-sm">
              <Toggle checked={current.footerAddress !== false} onChange={(footerAddress) => update({ footerAddress })} label="Company address" hint={missing.address ? "Add the address in Company Setup" : undefined} />
              <Toggle checked={Boolean(current.footerContact)} onChange={(footerContact) => update({ footerContact })} label="Phone, email & website" />
              <Toggle checked={Boolean(current.footerTrn)} onChange={(footerTrn) => update({ footerTrn })} label="TRN" hint={missing.trn ? "Add the TRN in Company Setup" : undefined} />
            </div>
          </>}
        </EditorSection>
        <EditorSection title="Use this letterhead on" description="One letterhead per document type. Its header, stamp and footer appear on the selected documents; letter content stays on this page.">
          <div className="grid grid-cols-2 gap-2 text-sm">{letterheadDocuments.map(([key, label]) => <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={current.documents.includes(key)} onChange={(event) => assign(key, event.target.checked)} />{label}</label>)}</div>
        </EditorSection>
      </div>
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={print}><Printer className="size-4" />Print A4 / Save PDF</Button><Button type="button" variant="outline" disabled={pdfBusy} onClick={() => void download()}><Download className="size-4" />{pdfBusy ? "Creating PDF…" : "Download A4 PDF"}</Button></div>
        <div className="overflow-auto rounded-xl border bg-slate-100 p-3"><div ref={preview} className="w-max shadow-lg"><LetterheadPage template={current} company={company} onMoveStamp={(stampLeft, stampTop) => update({ stampLeft, stampTop })} onMoveBody={(bodyLeft, bodyTop) => update({ bodyLeft, bodyTop })} /></div></div>
      </div>
    </div> : <div className="rounded-xl border border-dashed bg-white p-10 text-center text-sm text-slate-500">Choose New to create your first letterhead.</div>}
  </section>;
}
