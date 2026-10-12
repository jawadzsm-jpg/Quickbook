"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ImageUp, Printer, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { chequeFieldKeys, chequeFieldLabels, chequePieces, chequePrintDocument, defaultChequeTemplate, normalizeChequeTemplate, type ChequeFieldKey, type ChequeTemplate } from "@/lib/cheque-template";
import { uaeChequeLayouts } from "@/lib/uae-cheque-layouts";
import { amountInWords, printIsolatedDocument } from "./uae-bank-cheque";

type Handle = ChequeFieldKey | "words2";
const sample = (date: string) => ({ date, payee: "ABC General Trading LLC", amount: 125430.5, currency: "AED", words: amountInWords(125430.5, "AED"), crossed: true });
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date());
const handleLabel = (handle: Handle) => handle === "words2" ? "Amount in words · line 2" : chequeFieldLabels[handle];
const lineHeightMm = (fontPt: number) => fontPt * 0.3528 * 1.4;

/**
 * Company Setup → Cheque templates. Pick a bank, drag each field onto its line (optionally over a scan of a blank cheque),
 * set how the cheque sits in the printer, test-print on plain paper, and save. Every cheque from that bank uses it.
 */
export function ChequeTemplateDesigner({ companyId, disabled = false }: { companyId: number; disabled?: boolean }) {
  const [layoutKey, setLayoutKey] = useState(uaeChequeLayouts[0].key);
  const [template, setTemplate] = useState<ChequeTemplate>(() => defaultChequeTemplate(uaeChequeLayouts[0].key));
  const [background, setBackground] = useState("");
  const [saved, setSaved] = useState(false);
  const [savedAt, setSavedAt] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Handle>("date");
  const [savedLayouts, setSavedLayouts] = useState<string[]>([]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(3);
  const drag = useRef<{ handle: Handle; startX: number; startY: number; left: number; top: number } | null>(null);

  const loadList = useCallback(async () => {
    const response = await fetch(`/api/cheque-templates?companyId=${companyId}`, { cache: "no-store" });
    if (response.ok) setSavedLayouts(((await response.json()).templates as Array<{ layoutKey: string }>).map((row) => row.layoutKey));
  }, [companyId]);
  const load = useCallback(async (key: string) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/cheque-templates?companyId=${companyId}&layoutKey=${encodeURIComponent(key)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load the cheque template.");
      setTemplate(normalizeChequeTemplate(key, data.template)); setBackground(String(data.backgroundData || "")); setSaved(Boolean(data.saved));
      setSavedAt(data.updatedAt ? `${new Date(data.updatedAt).toLocaleString("en-GB", { timeZone: "Asia/Dubai", day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}${data.updatedByName ? ` by ${data.updatedByName}` : ""}` : "");
      setDirty(false);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not load the cheque template."); }
    finally { setBusy(false); }
  }, [companyId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (companyId) { void load(layoutKey); void loadList(); } }, [companyId, layoutKey, load, loadList]);

  // Scale the cheque (mm) to the available width, up to 4 px per mm.
  useLayoutEffect(() => {
    const element = canvasRef.current?.parentElement;
    if (!element) return;
    const update = () => setScale(Math.min(4, Math.max(1.5, (element.clientWidth - 2) / template.widthMm)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [template.widthMm]);

  // Values are kept as typed (so typing "190" is not clamped at "1"); the server checks the ranges on save.
  const change = (next: ChequeTemplate) => { if (Object.values({ w: next.widthMm, h: next.heightMm, x: next.offsetXMm, y: next.offsetYMm, p: next.datePitchMm, g: next.dateGroupGapMm }).every(Number.isFinite)) { setTemplate(next); setDirty(true); } };
  const box = (handle: Handle) => handle === "words2" ? { ...template.wordsLine2, fontPt: template.fields.words.fontPt } : template.fields[handle];
  const moveHandle = (handle: Handle, left: number, top: number) => {
    const snap = (value: number) => Math.round(value * 2) / 2;
    if (handle === "words2") change({ ...template, wordsLine2: { ...template.wordsLine2, left: snap(left), top: snap(top) } });
    else change({ ...template, fields: { ...template.fields, [handle]: { ...template.fields[handle], left: snap(left), top: snap(top) } } });
  };
  const setField = (handle: Handle, key: "left" | "top" | "width" | "fontPt", raw: string) => {
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    if (handle === "words2") { if (key === "fontPt") change({ ...template, fields: { ...template.fields, words: { ...template.fields.words, fontPt: value } } }); else change({ ...template, wordsLine2: { ...template.wordsLine2, [key]: value } }); }
    else change({ ...template, fields: { ...template.fields, [handle]: { ...template.fields[handle], [key]: value } } });
  };
  const onPointerDown = (handle: Handle) => (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelected(handle);
    const current = box(handle);
    drag.current = { handle, startX: event.clientX, startY: event.clientY, left: current.left, top: current.top };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = drag.current;
    if (!active) return;
    moveHandle(active.handle, active.left + (event.clientX - active.startX) / scale, active.top + (event.clientY - active.startY) / scale);
  };
  const onPointerUp = () => { drag.current = null; };
  const nudge = (handle: Handle, dx: number, dy: number) => { const current = box(handle); moveHandle(handle, current.left + dx, current.top + dy); };

  const chooseBackground = (file?: File) => {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 2_000_000) return toast.error("Upload a PNG, JPG or WebP cheque scan smaller than 2 MB.");
    const reader = new FileReader();
    reader.onload = () => { setBackground(String(reader.result || "")); setDirty(true); };
    reader.readAsDataURL(file);
  };
  const save = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/cheque-templates", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, layoutKey, template: normalizeChequeTemplate(layoutKey, template), backgroundData: background }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save the cheque template.");
      toast.success(`${uaeChequeLayouts.find((layout) => layout.key === layoutKey)?.name} template saved`);
      await load(layoutKey); await loadList();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save the cheque template."); }
    finally { setBusy(false); }
  };
  const reset = async () => {
    if (!window.confirm("Go back to the built-in positions for this bank? The saved template and cheque scan are removed.")) return;
    setBusy(true);
    try {
      if (saved) { const response = await fetch("/api/cheque-templates", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, layoutKey }) }); if (!response.ok) throw new Error((await response.json()).error || "Could not reset the template."); }
      setTemplate(defaultChequeTemplate(layoutKey)); setBackground(""); setSaved(false); setSavedAt(""); setDirty(false); await loadList();
      toast.success("Built-in positions restored");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not reset the template."); }
    finally { setBusy(false); }
  };
  const testPrint = () => {
    const document = chequePrintDocument(normalizeChequeTemplate(layoutKey, template), sample(today()), { testOutline: true });
    printIsolatedDocument("Cheque test print", document.styles, document.html);
  };

  const layoutName = uaeChequeLayouts.find((layout) => layout.key === layoutKey)?.name ?? layoutKey;
  const pieces = chequePieces(template, sample(today()));
  const current = box(selected);
  const handles: Handle[] = [...chequeFieldKeys, "words2"];
  const numberInput = (id: string, label: string, value: number, onChange: (value: string) => void, step = 0.5) => <label className="grid gap-1 text-xs font-medium text-muted-foreground" htmlFor={id}>{label}<Input id={id} type="number" step={step} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="h-8" /></label>;

  return <div className="grid gap-4">
    <div className="flex flex-wrap items-end gap-3">
      <label className="grid min-w-64 flex-1 gap-1 text-sm font-medium">Bank cheque book
        <select className="h-9 rounded-md border bg-background px-2 text-sm" value={layoutKey} disabled={busy} onChange={(event) => { if (dirty && !window.confirm("Discard the unsaved changes to this template?")) return; setLayoutKey(event.target.value); }}>
          {uaeChequeLayouts.map((layout) => <option key={layout.key} value={layout.key}>{layout.name}{savedLayouts.includes(layout.key) ? " · saved" : ""}</option>)}
        </select>
      </label>
      <p className="pb-2 text-xs text-muted-foreground">{saved ? `Saved template${savedAt ? ` · ${savedAt}` : ""}` : "Built-in positions (not saved yet)"}{dirty ? " · unsaved changes" : ""}</p>
    </div>

    <div className="rounded-xl border bg-muted/40 p-3">
      <p className="mb-2 text-xs text-muted-foreground">Drag each field onto its line, or select it and type the position. Blue boxes are guides only; the sample text shows what prints. {layoutName} · {template.widthMm} × {template.heightMm} mm</p>
      <div className="overflow-hidden">
        <div ref={canvasRef} role="application" aria-label={`${layoutName} cheque layout`} className="relative mx-auto touch-none select-none border border-slate-400 bg-[#f6f2dc] shadow-sm" style={{ width: template.widthMm * scale, height: template.heightMm * scale, backgroundImage: background ? `url(${background})` : undefined, backgroundSize: "100% 100%" }} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          {!background ? <div className="pointer-events-none absolute inset-0 grid place-items-center text-xl font-black uppercase tracking-[.25em] text-slate-400/40">{layoutName}</div> : null}
          {pieces.map((piece) => <div key={piece.key} className="pointer-events-none absolute whitespace-nowrap font-bold uppercase leading-[1.15]" style={{ color: "#0b1220", left: piece.left * scale, top: piece.top * scale, width: piece.width * scale, fontSize: piece.fontPt * 0.3528 * scale, textAlign: piece.align, transform: piece.rotate ? `rotate(${piece.rotate}deg)` : undefined, transformOrigin: "left top" }}>{piece.text}</div>)}
          {handles.map((handle) => { const position = box(handle); return <div key={handle} role="button" tabIndex={0} aria-label={`Move ${handleLabel(handle)}`} title={handleLabel(handle)} onPointerDown={onPointerDown(handle)} onFocus={() => setSelected(handle)} onKeyDown={(event) => { const step = event.shiftKey ? 2 : 0.5; const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }; const move = moves[event.key]; if (move) { event.preventDefault(); nudge(handle, move[0], move[1]); } }} className={`absolute cursor-move rounded-sm border ${selected === handle ? "border-sky-600 bg-sky-400/20 ring-2 ring-sky-500/40" : "border-dashed border-sky-500/70 bg-sky-300/10 hover:bg-sky-300/20"}`} style={{ left: position.left * scale, top: position.top * scale, width: position.width * scale, height: lineHeightMm(position.fontPt) * scale }} />; })}
        </div>
      </div>
    </div>

    <div className="grid gap-4 lg:grid-cols-3">
      <section className="grid content-start gap-3 rounded-xl border p-3">
        <div className="flex flex-wrap gap-1.5">{handles.map((handle) => <Button key={handle} type="button" size="sm" variant={selected === handle ? "default" : "outline"} className="h-7 px-2 text-xs" onClick={() => setSelected(handle)}>{handleLabel(handle)}</Button>)}</div>
        <div className="grid grid-cols-2 gap-2">
          {numberInput("field-left", "Left (mm)", current.left, (value) => setField(selected, "left", value))}
          {numberInput("field-top", "Top (mm)", current.top, (value) => setField(selected, "top", value))}
          {numberInput("field-width", "Width (mm)", current.width, (value) => setField(selected, "width", value))}
          {numberInput("field-font", "Font size (pt)", current.fontPt, (value) => setField(selected, "fontPt", value))}
        </div>
        <p className="text-xs text-muted-foreground">Arrow keys move the selected field 0.5 mm (Shift: 2 mm).</p>
      </section>
      <section className="grid content-start gap-3 rounded-xl border p-3">
        <p className="text-sm font-semibold">Cheque and date</p>
        <div className="grid grid-cols-2 gap-2">
          {numberInput("cheque-width", "Cheque width (mm)", template.widthMm, (value) => change({ ...template, widthMm: Number(value) }))}
          {numberInput("cheque-height", "Cheque height (mm)", template.heightMm, (value) => change({ ...template, heightMm: Number(value) }))}
        </div>
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">Date style<select className="h-8 w-full min-w-0 rounded-md border bg-background px-2 text-sm text-foreground" value={template.dateMode} disabled={disabled} onChange={(event) => change({ ...template, dateMode: event.target.value === "boxes" ? "boxes" : "text" })}><option value="text">One block · 12/10/2026</option><option value="boxes">Digit boxes · D D M M Y Y Y Y</option></select></label>
        {template.dateMode === "boxes" ? <div className="grid grid-cols-2 gap-2">
          {numberInput("date-pitch", "Box spacing (mm)", template.datePitchMm, (value) => change({ ...template, datePitchMm: Number(value) }), 0.1)}
          {numberInput("date-gap", "Gap between DD MM YYYY (mm)", template.dateGroupGapMm, (value) => change({ ...template, dateGroupGapMm: Number(value) }), 0.1)}
        </div> : null}
      </section>
      <section className="grid content-start gap-3 rounded-xl border p-3">
        <p className="text-sm font-semibold">Printer feed</p>
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">Paper<select className="h-8 w-full min-w-0 rounded-md border bg-background px-2 text-sm text-foreground" value={template.page} disabled={disabled} onChange={(event) => change({ ...template, page: event.target.value === "a4" ? "a4" : "cheque" })}><option value="cheque">Cheque size ({template.widthMm} × {template.heightMm} mm)</option><option value="a4">A4 (cheque placed on the page)</option></select></label>
        {template.page === "a4" ? <label className="grid gap-1 text-xs font-medium text-muted-foreground">Cheque position in the tray<select className="h-8 w-full min-w-0 rounded-md border bg-background px-2 text-sm text-foreground" value={template.align} disabled={disabled} onChange={(event) => change({ ...template, align: event.target.value as ChequeTemplate["align"] })}><option value="left">Left edge</option><option value="center">Centred</option><option value="right">Right edge</option></select></label> : null}
        <div className="grid grid-cols-2 gap-2">
          {numberInput("feed-x", "Move all: right + / left − (mm)", template.offsetXMm, (value) => change({ ...template, offsetXMm: Number(value) }))}
          {numberInput("feed-y", "Move all: down + / up − (mm)", template.offsetYMm, (value) => change({ ...template, offsetYMm: Number(value) }))}
        </div>
        <p className="text-xs text-muted-foreground">If every field prints shifted the same way, fix it here. Print at 100% / Actual size with no margins. If the print comes out smaller (everything pulled toward the top-left), the printer is scaling the cheque-size page: choose A4 here instead.</p>
      </section>
    </div>

    <div className="flex flex-wrap items-center gap-2">
      <label className={`inline-flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium ${disabled ? "pointer-events-none opacity-50" : "cursor-pointer hover:bg-muted"}`}><ImageUp className="size-4" />{background ? "Change cheque scan" : "Upload cheque scan"}<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={disabled} onChange={(event) => { chooseBackground(event.target.files?.[0]); event.target.value = ""; }} /></label>
      {background ? <Button type="button" variant="outline" disabled={disabled} onClick={() => { setBackground(""); setDirty(true); }}><Trash2 className="size-4" />Remove scan</Button> : null}
      <Button type="button" variant="outline" onClick={testPrint}><Printer className="size-4" />Test print on plain paper</Button>
      <Button type="button" variant="outline" disabled={disabled || busy} onClick={() => void reset()}><RotateCcw className="size-4" />Reset to built-in</Button>
      <Button type="button" className="ml-auto" disabled={disabled || busy || !dirty} onClick={() => void save()}><Save className="size-4" />{busy ? "Saving…" : "Save template"}</Button>
    </div>
    <p className="text-xs text-muted-foreground">Test print: print on plain paper, hold it against a real cheque (or over it against a window) and adjust until the text sits on the lines. The scan is only a guide on screen; it never prints.</p>
  </div>;
}
