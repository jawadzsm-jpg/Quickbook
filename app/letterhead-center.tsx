"use client";

import { useRef, useState } from "react";
import { Download, FilePlus2, Printer, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createA4LetterheadPdfBlob, downloadPdfBlob } from "@/lib/document-output";
import { defaultLetterhead, letterheadDocuments, readLetterheads, type LetterheadTemplate } from "@/lib/letterhead";
import { LetterheadPage, type LetterheadCompany } from "./letterhead-page";
import { LetterheadRichEditor } from "./letterhead-rich-editor";

type Company = LetterheadCompany & { id: number; letterheadDesign: string };

export function LetterheadCenter({ company, onSaved }: { company: Company; onSaved: (company: Company) => void }) {
  const initial = readLetterheads(company.letterheadDesign);
  const [templates, setTemplates] = useState<LetterheadTemplate[]>(initial.templates);
  const [selectedId, setSelectedId] = useState(initial.templates[0]?.id || "");
  const [saving, setSaving] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const preview = useRef<HTMLDivElement>(null);
  const selected = templates.find((template) => template.id === selectedId);
  const current = selected || defaultLetterhead();
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
        <Button type="button" disabled={saving} onClick={() => void save()}><Save className="size-4" />{saving ? "Saving…" : "Save letterheads"}</Button>
      </div>
    </div>
    {selected ? <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(290px,380px)_minmax(0,1fr)]">
      <div className="space-y-5 rounded-xl border bg-white p-5">
        <label className="grid gap-1 text-sm font-medium">Save with name<Input maxLength={80} value={current.name} onChange={(event) => update({ name: event.target.value })} /></label>
        <label className="flex items-center gap-3 text-sm font-medium">Letterhead color<Input type="color" className="h-10 w-16" value={current.color} onChange={(event) => update({ color: event.target.value })} />{current.color}</label>
        <label className="grid gap-1 text-sm font-medium">Heading (English or Arabic)<Input maxLength={120} value={current.heading} onChange={(event) => update({ heading: event.target.value })} placeholder="Company name or Arabic heading" /></label>
        <label className="grid gap-1 text-sm font-medium">Subtitle<Input maxLength={180} value={current.subtitle} onChange={(event) => update({ subtitle: event.target.value })} /></label>
        <label className="grid gap-1 text-sm font-medium">Website<Input maxLength={160} value={current.website} onChange={(event) => update({ website: event.target.value })} placeholder="www.example.com" /></label>
        <p className="text-xs text-slate-500">Logo, right logo, phone, and email come from Company Setup.</p>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={current.showLogo} onChange={(event) => update({ showLogo: event.target.checked })} />Left logo</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={current.showRightLogo} onChange={(event) => update({ showRightLogo: event.target.checked })} />Right logo</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={current.showStamp} onChange={(event) => update({ showStamp: event.target.checked })} />Company stamp</label>
        </div>
        {current.showStamp && <div className="grid grid-cols-2 gap-3 text-sm">
          <label>Stamp left (mm)<Input type="number" min={0} max={170} value={current.stampLeft} onChange={(event) => update({ stampLeft: Math.min(170, Math.max(0, Number(event.target.value) || 0)) })} /></label>
          <label>Stamp top (mm)<Input type="number" min={0} max={260} value={current.stampTop} onChange={(event) => update({ stampTop: Math.min(260, Math.max(0, Number(event.target.value) || 0)) })} /></label>
          <p className="col-span-2 text-xs text-slate-500">You can also drag the stamp in the preview. Upload the image in Company Setup → Company stamp.</p>
        </div>}
        <LetterheadRichEditor key={selected.id} template={current} onChange={(body, bodyHtml) => update({ body, bodyHtml })} />
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label>Text left (mm)<Input type="number" min={0} max={170} value={current.bodyLeft ?? 13} onChange={(event) => update({ bodyLeft: Math.min(170, Math.max(0, Math.round(Number(event.target.value) || 0))) })} /></label>
          <label>Text top (mm)<Input type="number" min={0} max={250} value={current.bodyTop ?? 48} onChange={(event) => update({ bodyTop: Math.min(250, Math.max(0, Math.round(Number(event.target.value) || 0))) })} /></label>
          <label>Text width (mm)<Input type="number" min={20} max={210} value={current.bodyWidth ?? 184} onChange={(event) => update({ bodyWidth: Math.min(210, Math.max(20, Math.round(Number(event.target.value) || 20))) })} /></label>
        </div>
        <label className="grid gap-1 text-sm font-medium">Footer<Textarea rows={2} maxLength={300} value={current.footer} onChange={(event) => update({ footer: event.target.value })} /></label>
        <fieldset className="rounded-lg border p-3"><legend className="px-1 text-sm font-bold">Use this letterhead on</legend>
          <div className="grid grid-cols-2 gap-2 text-sm">{letterheadDocuments.map(([key, label]) => <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={current.documents.includes(key)} onChange={(event) => assign(key, event.target.checked)} />{label}</label>)}</div>
          <p className="mt-2 text-xs text-slate-500">One letterhead per document type. Its header and stamp appear on the selected documents; letter content stays on the standalone page.</p>
        </fieldset>
      </div>
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={print}><Printer className="size-4" />Print A4 / Save PDF</Button><Button type="button" variant="outline" disabled={pdfBusy} onClick={() => void download()}><Download className="size-4" />{pdfBusy ? "Creating PDF…" : "Download A4 PDF"}</Button></div>
        <div className="overflow-auto rounded-xl border bg-slate-100 p-3"><div ref={preview} className="w-max shadow-lg"><LetterheadPage template={current} company={company} onMoveStamp={(stampLeft, stampTop) => update({ stampLeft, stampTop })} onMoveBody={(bodyLeft, bodyTop) => update({ bodyLeft, bodyTop })} /></div></div>
      </div>
    </div> : <div className="rounded-xl border border-dashed bg-white p-10 text-center text-sm text-slate-500">Choose New to create your first letterhead.</div>}
  </section>;
}
