"use client";

import { DndContext, DragOverlay, MouseSensor, TouchSensor, useDraggable, useSensor, useSensors, type DragEndEvent, type DragMoveEvent, type DragStartEvent } from "@dnd-kit/core";
import { AlertTriangle, Eye, EyeOff, GripVertical, Layers, Printer, Redo2, Save, SlidersHorizontal, Undo2 } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { sectionLabels } from "@/lib/layout/defaults";
import { mockDocument, mockSizes, type DocumentData, type MockSize } from "@/lib/layout/document-data";
import { historyReducer, initialHistory, MAX_SECTIONS_PER_ROW, type DropTarget, type LayoutAction } from "@/lib/layout/reducer";
import { contentBox, sectionTypes, type Layout, type Row, type SectionType } from "@/lib/layout/schema";
import { layoutCss } from "@/lib/layout/styles";
import { OverlayInspector, PageInspector, SectionInspector, type Selection } from "./inspector";
import { OverlayBody, overlayStyle, rowStyle, SectionBody, sectionClass, sectionStyle } from "./layout-document";
import { measurePageFit, type FitReport } from "./page-fit";
import { printLayout } from "./print-layout";

const PX_PER_MM = 96 / 25.4;
const editorCss = `
.lbe-row{position:relative}
.lbe-row:hover>.lbe-row-handle,.lbe-row.lbe-selected>.lbe-row-handle{opacity:1}
.lbe-row-handle{position:absolute;left:-9mm;top:0;width:6mm;height:100%;min-height:6mm;display:flex;align-items:flex-start;justify-content:center;padding-top:0.5mm;opacity:0;color:#2563eb;background:none;border:0;cursor:grab;touch-action:none}
.lbe-row-handle:focus-visible{opacity:1;outline:2px solid #2563eb}
.lbe-row.lbe-selected{outline:1px dashed #93c5fd;outline-offset:1mm}
.lbe-section{position:relative;cursor:pointer;outline:1px dashed transparent;outline-offset:0}
.lbe-section:hover{outline-color:#93c5fd}
.lbe-section.lbe-selected{outline:2px solid #2563eb}
.lbe-section.lbe-hidden{opacity:0.4}
.lbe-tag{position:absolute;top:-4.2mm;left:0;display:none;align-items:center;gap:0.8mm;height:4mm;padding:0 1.2mm;border-radius:1mm 1mm 0 0;background:#2563eb;color:#fff;font:600 2.6mm/1 Arial,sans-serif;white-space:nowrap;z-index:2}
.lbe-section:hover>.lbe-tag,.lbe-section.lbe-selected>.lbe-tag{display:flex}
.lbe-grip{display:flex;border:0;background:none;color:inherit;padding:0;cursor:grab;touch-action:none}
.lbe-split{position:absolute;top:0;bottom:0;width:3mm;margin-left:-1.5mm;cursor:col-resize;touch-action:none;z-index:3;display:flex;justify-content:center}
.lbe-split::after{content:"";width:0.6mm;height:100%;border-radius:1mm;background:#2563eb;opacity:0}
.lbe-row:hover .lbe-split::after,.lbe-split:focus-visible::after{opacity:0.5}
.lbe-overlay{position:absolute;cursor:move;outline:1px dashed #a855f7;touch-action:none;z-index:4}
.lbe-overlay.lbe-selected{outline:2px solid #9333ea}
.lbe-resize{position:absolute;right:-1.6mm;bottom:-1.6mm;width:3.2mm;height:3.2mm;background:#9333ea;border-radius:0.6mm;cursor:nwse-resize}
.lbe-break{position:absolute;left:-12mm;right:-12mm;height:0;border-top:1px dashed #f97316;pointer-events:none;z-index:5}
.lbe-break span{position:absolute;right:0;top:-3.6mm;font:600 2.6mm/1 Arial,sans-serif;color:#c2410c;background:#fff7ed;padding:0.5mm 1mm;border-radius:0.8mm}
.lbe-repeat{position:absolute;right:0;top:-4.2mm;height:4mm;padding:0 1.2mm;font:600 2.4mm/4mm Arial,sans-serif;color:#0f766e;background:#ccfbf1;border-radius:1mm 1mm 0 0}
.lbe-issue{outline:2px solid #f97316!important}
`;

type DragSource = { kind: "palette"; sectionType: SectionType } | { kind: "section"; id: string } | { kind: "row"; id: string };
type Indicator = { left: number; top: number; width: number; height: number };
type Drop = { target: DropTarget | { kind: "rowMove"; toIndex: number }; indicator: Indicator } | null;

function PaletteItem({ type }: { type: SectionType }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `palette:${type}`, data: { kind: "palette", sectionType: type } satisfies DragSource });
  return <button ref={setNodeRef} type="button" {...attributes} {...listeners} className={`flex w-full shrink-0 cursor-grab items-center gap-2 rounded-md border bg-card px-2.5 py-2 text-left text-sm font-medium shadow-xs touch-none hover:border-primary/60 ${isDragging ? "opacity-40" : ""}`} title={`Drag ${sectionLabels[type]} onto the page`}><GripVertical className="size-3.5 shrink-0 text-muted-foreground" />{sectionLabels[type]}</button>;
}

function SectionGrip({ id, label }: { id: string; label: string }) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: `section:${id}`, data: { kind: "section", id } satisfies DragSource });
  return <button ref={setNodeRef} type="button" className="lbe-grip" aria-label={`Drag ${label}`} {...attributes} {...listeners}><GripVertical style={{ width: "3mm", height: "3mm" }} /></button>;
}

function RowGrip({ id, index }: { id: string; index: number }) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: `row:${id}`, data: { kind: "row", id } satisfies DragSource });
  return <button ref={setNodeRef} type="button" className="lbe-row-handle" aria-label={`Drag row ${index + 1}`} {...attributes} {...listeners}><GripVertical style={{ width: "4mm", height: "4mm" }} /></button>;
}

export function LayoutBuilder({ initial, company, onSave, onDirtyChange, saving = false }: { initial: Layout; company?: Partial<DocumentData["company"]>; onSave: (layout: Layout) => Promise<void> | void; onDirtyChange?: (dirty: boolean) => void; saving?: boolean }) {
  const [history, dispatchHistory] = useReducer(historyReducer, initial, initialHistory);
  const layout = history.present;
  const [saved, setSaved] = useState(() => JSON.stringify(initial));
  const dirty = JSON.stringify(layout) !== saved;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  const [selection, setSelection] = useState<Selection>(null);
  const [sample, setSample] = useState<MockSize>("short");
  const [preview, setPreview] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [drag, setDrag] = useState<DragSource | null>(null);
  const [drop, setDrop] = useState<Drop>(null);
  const [fit, setFit] = useState<FitReport>({ breaks: [], pages: 1, issues: [] });
  const [announcement, setAnnouncement] = useState("");
  const [scale, setScale] = useState(1);
  const [wide, setWide] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const [paperHeight, setPaperHeight] = useState(0);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);

  const dispatch = useCallback((action: LayoutAction, coalesceKey?: string) => dispatchHistory({ type: "apply", action, coalesceKey }), []);
  const data = useMemo<DocumentData>(() => { const doc = mockDocument(sample); return { ...doc, company: { ...doc.company, ...company } }; }, [sample, company]);
  const box = contentBox(layout.page);
  const sectionLabel = useCallback((id: string) => { for (const row of layout.rows) { const section = row.sections.find((entry) => entry.id === id); if (section) return sectionLabels[section.type]; } return "Section"; }, [layout.rows]);

  // Scale the true-size paper to the available width; the canvas never reflows the document itself.
  useLayoutEffect(() => {
    const element = canvasRef.current;
    const root = rootRef.current;
    if (!element || !root) return;
    const measure = () => {
      setWide(root.clientWidth >= 1100);
      setScale(Math.max(0.3, Math.min(1.25, (element.clientWidth - 24) / (box.pageWidth * PX_PER_MM))));
    };
    measure(); // before first paint, so narrow screens never flash the three-panel layout
    const observer = new ResizeObserver(measure);
    // A CSS-scaled element keeps its unscaled layout height, so size the wrapper from the measured paper.
    const paper = new ResizeObserver(() => setPaperHeight(paperRef.current?.offsetHeight ?? 0));
    observer.observe(element); observer.observe(root);
    if (paperRef.current) paper.observe(paperRef.current);
    return () => { observer.disconnect(); paper.disconnect(); };
  }, [box.pageWidth]);

  // Recompute predicted page breaks and fit warnings after every render of the document.
  useEffect(() => {
    const frame = requestAnimationFrame(() => { if (docRef.current) setFit(measurePageFit(docRef.current, layout, sectionLabel)); });
    return () => cancelAnimationFrame(frame);
  }, [layout, data, scale, sectionLabel]);

  const selected = (() => {
    if (selection?.kind === "section") for (const [rowIndex, row] of layout.rows.entries()) { const index = row.sections.findIndex((section) => section.id === selection.id); if (index >= 0) return { kind: "section" as const, row, rowIndex, index, section: row.sections[index] }; }
    if (selection?.kind === "overlay") { const overlay = layout.overlays.find((entry) => entry.id === selection.id); if (overlay) return { kind: "overlay" as const, overlay }; }
    if (selection?.kind === "row") { const rowIndex = layout.rows.findIndex((row) => row.id === selection.id); if (rowIndex >= 0) return { kind: "row" as const, row: layout.rows[rowIndex], rowIndex }; }
    return null;
  })();

  const select = (next: Selection) => { setSelection(next); if (!wide && next) setInspectorOpen(true); };
  // Quick jumps matching the familiar Header / Columns / Footer tabs.
  const jumpTo = (part: "header" | "columns" | "footer") => {
    const sections = layout.rows.flatMap((row) => row.sections);
    const target = part === "header" ? sections.find((section) => section.type === "companyHeader") ?? sections[0]
      : part === "columns" ? sections.find((section) => section.type === "lineItems")
      : sections.find((section) => section.type === "totals") ?? sections.find((section) => section.type === "terms") ?? layout.rows.at(-1)?.sections[0];
    if (!target) { toast.info(part === "columns" ? "Add a Line items section to edit columns." : "Add a section first."); return; }
    select({ kind: "section", id: target.id });
    requestAnimationFrame(() => docRef.current?.querySelector(`[data-section-id="${CSS.escape(target.id)}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
  };

  // ---- Drag & drop: targets are computed from the pointer against measured rows, then shown as one line. ----
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 4 } }), useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }));
  const computeDrop = useCallback((x: number, y: number, source: DragSource): Drop => {
    const doc = docRef.current;
    if (!doc) return null;
    const docRect = doc.getBoundingClientRect();
    const rows = [...doc.querySelectorAll<HTMLElement>(":scope > [data-row-id]")].map((element) => ({ element, rect: element.getBoundingClientRect(), id: element.dataset.rowId! }));
    if (!rows.length) return null;
    const line = (top: number): Indicator => ({ left: docRect.left, top: top - 1, width: docRect.width, height: 3 });
    const boundary = (index: number) => index <= 0 ? rows[0].rect.top - 4 : index >= rows.length ? rows.at(-1)!.rect.bottom + 4 : (rows[index - 1].rect.bottom + rows[index].rect.top) / 2;
    if (source.kind === "row") {
      let index = rows.findIndex((row) => y < row.rect.top + row.rect.height / 2);
      if (index < 0) index = rows.length;
      const from = rows.findIndex((row) => row.id === source.id);
      return { target: { kind: "rowMove", toIndex: from >= 0 && from < index ? index - 1 : index }, indicator: line(boundary(index)) };
    }
    if (y < rows[0].rect.top) return { target: { kind: "newRow", rowIndex: 0 }, indicator: line(boundary(0)) };
    for (const [index, row] of rows.entries()) {
      const below = rows[index + 1];
      if (y > row.rect.bottom && (!below || y < below.rect.top)) return { target: { kind: "newRow", rowIndex: index + 1 }, indicator: line(boundary(index + 1)) };
      if (y < row.rect.top || y > row.rect.bottom) continue;
      const edge = Math.min(14, row.rect.height * 0.25);
      if (y < row.rect.top + edge) return { target: { kind: "newRow", rowIndex: index }, indicator: line(boundary(index)) };
      if (y > row.rect.bottom - edge) return { target: { kind: "newRow", rowIndex: index + 1 }, indicator: line(boundary(index + 1)) };
      const sections = [...row.element.querySelectorAll<HTMLElement>(":scope > [data-section-id]")].map((element) => element.getBoundingClientRect());
      const fromThisRow = source.kind === "section" && row.element.querySelector(`[data-section-id="${CSS.escape(source.id)}"]`);
      if (sections.length >= MAX_SECTIONS_PER_ROW && !fromThisRow) return { target: { kind: "newRow", rowIndex: index + 1 }, indicator: line(boundary(index + 1)) };
      let position = sections.findIndex((rect) => x < rect.left + rect.width / 2);
      if (position < 0) position = sections.length;
      const xLine = position === 0 ? sections[0].left - 3 : position === sections.length ? sections.at(-1)!.right + 3 : (sections[position - 1].right + sections[position].left) / 2;
      return { target: { kind: "row", rowId: row.id, index: position }, indicator: { left: xLine - 1, top: row.rect.top, width: 3, height: row.rect.height } };
    }
    return { target: { kind: "newRow", rowIndex: rows.length }, indicator: line(boundary(rows.length)) };
  }, []);

  const pointerOf = (event: Event | null) => {
    if (!event) return null;
    if ("touches" in event && (event as TouchEvent).touches.length) { const touch = (event as TouchEvent).touches[0]; return { x: touch.clientX, y: touch.clientY }; }
    if ("clientX" in event) return { x: (event as MouseEvent).clientX, y: (event as MouseEvent).clientY };
    return null;
  };
  const onDragStart = (event: DragStartEvent) => { setDrag(event.active.data.current as DragSource); pointerStart.current = pointerOf(event.activatorEvent); setDrop(null); };
  const onDragMove = (event: DragMoveEvent) => {
    const start = pointerStart.current; const source = event.active.data.current as DragSource;
    if (!start || !source) return;
    setDrop(computeDrop(start.x + event.delta.x, start.y + event.delta.y, source));
  };
  const finishDrag = (event: DragEndEvent | null) => {
    const source = event?.active.data.current as DragSource | undefined;
    if (event && source && drop) {
      if (drop.target.kind === "rowMove" && source.kind === "row") dispatch({ type: "moveRow", rowId: source.id, toIndex: drop.target.toIndex });
      else if (drop.target.kind !== "rowMove" && source.kind === "section") dispatch({ type: "moveSection", sectionId: source.id, target: drop.target });
      else if (drop.target.kind !== "rowMove" && source.kind === "palette") dispatch({ type: "addSection", sectionType: source.sectionType, target: drop.target });
      setAnnouncement(source.kind === "palette" ? `${sectionLabels[source.sectionType]} added.` : "Moved.");
    }
    setDrag(null); setDrop(null); pointerStart.current = null;
  };

  // ---- Column width handles and overlay moves use plain pointer capture, converted to mm. ----
  const startSplit = (event: ReactPointerEvent<HTMLElement>, row: Row, index: number) => {
    event.preventDefault(); event.stopPropagation();
    const rowElement = event.currentTarget.parentElement!;
    event.currentTarget.setPointerCapture(event.pointerId);
    const total = row.ratios.reduce((sum, ratio) => sum + ratio, 0);
    const pair = row.ratios[index] + row.ratios[index + 1];
    const before = row.ratios.slice(0, index).reduce((sum, ratio) => sum + ratio, 0);
    const move = (moveEvent: PointerEvent) => {
      const rect = rowElement.getBoundingClientRect();
      const fraction = (moveEvent.clientX - rect.left) / rect.width; // position of the divider within the row
      const snapped = Math.round(fraction * 20) / 20 * total; // 5% steps
      const left = Math.min(pair - total * 0.1, Math.max(total * 0.1, snapped - before));
      const ratios = [...row.ratios]; ratios[index] = Math.round(left * 100) / 100; ratios[index + 1] = Math.round((pair - left) * 100) / 100;
      dispatch({ type: "updateRow", rowId: row.id, patch: { ratios } }, `split.${row.id}`);
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  const startOverlay = (event: ReactPointerEvent<HTMLElement>, id: string, mode: "move" | "resize") => {
    event.preventDefault(); event.stopPropagation();
    const overlay = layout.overlays.find((entry) => entry.id === id)!;
    setSelection({ kind: "overlay", id });
    const origin = { x: event.clientX, y: event.clientY };
    const toMm = (pixels: number) => pixels / (PX_PER_MM * scale);
    const move = (moveEvent: PointerEvent) => {
      const dx = toMm(moveEvent.clientX - origin.x), dy = toMm(moveEvent.clientY - origin.y);
      const round = (value: number) => Math.round(value * 2) / 2;
      const patch = mode === "move"
        ? { xMm: round(Math.min(box.pageWidth - overlay.widthMm, Math.max(0, overlay.xMm + dx))), yMm: round(Math.min(box.pageHeight - overlay.heightMm, Math.max(0, overlay.yMm + dy))) }
        : { widthMm: round(Math.min(box.pageWidth - overlay.xMm, Math.max(5, overlay.widthMm + dx))), heightMm: round(Math.min(box.pageHeight - overlay.yMm, Math.max(5, overlay.heightMm + dy))) };
      dispatch({ type: "updateOverlay", overlayId: id, patch }, `overlay.${mode}.${id}`);
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };

  // ---- Keyboard: undo/redo, delete, and Alt+arrows to move the selected section without a mouse. ----
  const onKeyDown = (event: React.KeyboardEvent) => {
    const typing = (event.target as HTMLElement).closest("input, textarea, select, [contenteditable=true]");
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === "z") { event.preventDefault(); dispatchHistory({ type: event.shiftKey ? "redo" : "undo" }); return; }
    if (mod && event.key.toLowerCase() === "y") { event.preventDefault(); dispatchHistory({ type: "redo" }); return; }
    if (typing || selected?.kind !== "section") return;
    const { row, rowIndex, index, section } = selected;
    const alone = row.sections.length === 1;
    const target: DropTarget | null = !event.altKey ? null
      : event.key === "ArrowUp" ? (alone && rowIndex === 0 ? null : { kind: "newRow", rowIndex: alone ? rowIndex - 1 : rowIndex })
      : event.key === "ArrowDown" ? (alone && rowIndex === layout.rows.length - 1 ? null : { kind: "newRow", rowIndex: alone ? rowIndex + 2 : rowIndex + 1 })
      : event.key === "ArrowLeft" ? (index === 0 ? null : { kind: "row", rowId: row.id, index: index - 1 })
      : event.key === "ArrowRight" ? (index === row.sections.length - 1 ? null : { kind: "row", rowId: row.id, index: index + 2 }) : null;
    if (target) { event.preventDefault(); dispatch({ type: "moveSection", sectionId: section.id, target }); setAnnouncement(`${sectionLabels[section.type]} moved.`); return; }
    if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); dispatch({ type: "removeSection", sectionId: section.id }); setSelection(null); setAnnouncement(`${sectionLabels[section.type]} deleted.`); }
    if (event.key === "Escape") setSelection(null);
  };

  const save = async () => {
    try { await onSave(layout); setSaved(JSON.stringify(layout)); toast.success("Layout saved."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not save the layout."); }
  };
  const issueIds = new Set(fit.issues.map((issue) => issue.id));

  const inspector = selected?.kind === "section"
    ? <SectionInspector section={selected.section} row={selected.row} rowIndex={selected.rowIndex} sectionIndex={selected.index} layout={layout} dispatch={dispatch} onError={(message) => toast.error(message)} />
    : selected?.kind === "overlay" ? <OverlayInspector overlay={selected.overlay} dispatch={dispatch} onError={(message) => toast.error(message)} />
    : <PageInspector layout={layout} dispatch={dispatch} />;

  const paperStyle: CSSProperties = { width: `${box.pageWidth}mm`, minHeight: `${box.pageHeight}mm`, padding: `${layout.page.margins.top}mm ${layout.page.margins.right}mm ${layout.page.margins.bottom}mm ${layout.page.margins.left}mm`, transform: `scale(${scale})`, transformOrigin: "top left" };

  return <div ref={rootRef} className="grid min-w-0 gap-3" onKeyDown={onKeyDown}>
    <style>{layoutCss(layout)}{editorCss}</style>
    <div aria-live="polite" className="sr-only">{announcement}</div>

    {/* Toolbar */}
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2">
      <Input aria-label="Layout name" className="h-8 w-full min-w-0 sm:w-44" value={layout.name} maxLength={80} onChange={(event) => dispatch({ type: "updateMeta", patch: { name: event.target.value } }, "name")} />
      <div className="flex gap-1">
        <Button type="button" size="icon" variant="outline" className="size-8" aria-label="Undo" title="Undo (Ctrl/⌘ Z)" disabled={!history.past.length} onClick={() => dispatchHistory({ type: "undo" })}><Undo2 className="size-4" /></Button>
        <Button type="button" size="icon" variant="outline" className="size-8" aria-label="Redo" title="Redo (Ctrl/⌘ Shift Z)" disabled={!history.future.length} onClick={() => dispatchHistory({ type: "redo" })}><Redo2 className="size-4" /></Button>
      </div>
      <div className="flex rounded-md border p-0.5" role="group" aria-label="Jump to">{(["header", "columns", "footer"] as const).map((part) => <Button key={part} type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs capitalize" onClick={() => jumpTo(part)}>{part}</Button>)}</div>
      <div className="flex rounded-md border p-0.5" role="group" aria-label="Sample document">{(Object.keys(mockSizes) as MockSize[]).map((size) => <Button key={size} type="button" size="sm" variant={sample === size ? "default" : "ghost"} aria-pressed={sample === size} className="h-7 px-2 text-xs" onClick={() => setSample(size)}>{mockSizes[size].label}</Button>)}</div>
      <Button type="button" size="sm" variant="outline" className="h-8" aria-pressed={preview} onClick={() => { setPreview(!preview); setSelection(null); }}>{preview ? <EyeOff className="size-4" /> : <Eye className="size-4" />}{preview ? "Edit" : "Preview"}</Button>
      <span className="text-xs text-muted-foreground">{fit.pages} {fit.pages === 1 ? "page" : "pages"} · {layout.page.size} {layout.page.orientation}</span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm"><Switch checked={layout.enabled} onCheckedChange={(enabled) => dispatch({ type: "updateMeta", patch: { enabled } })} />Use for printing</label>
        {!wide && <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => setInspectorOpen(true)}><SlidersHorizontal className="size-4" />Properties</Button>}
        <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => void printLayout(layout, data, `${layout.name} – test print`).catch((error: Error) => toast.error(error.message))}><Printer className="size-4" />Test print</Button>
        <Button type="button" size="sm" className="h-8" disabled={!dirty || saving} onClick={() => void save()}><Save className="size-4" />{saving ? "Saving…" : dirty ? "Save layout" : "Saved"}</Button>
      </div>
    </div>

    {fit.issues.length > 0 && <div role="status" className="grid gap-1 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-sm text-amber-900">
      <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="size-4" />Check before printing</p>
      {fit.issues.slice(0, 5).map((issue, index) => <button key={index} type="button" className="text-left underline-offset-2 hover:underline" onClick={() => setSelection(issue.id.startsWith("overlay") ? { kind: "overlay", id: issue.id } : issue.id.startsWith("row") ? { kind: "row", id: issue.id } : issue.id === "page" ? null : { kind: "section", id: issue.id })}>{issue.message}</button>)}
    </div>}

    <DndContext sensors={sensors} autoScroll={{ threshold: { x: 0, y: 0.06 }, acceleration: 4 }} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={finishDrag} onDragCancel={() => finishDrag(null)}>
      <div className={wide ? "grid grid-cols-[200px_minmax(0,1fr)_320px] items-start gap-3" : "grid gap-3"}>
        {!preview && <aside className={wide ? "sticky top-2 grid gap-1.5" : "flex gap-1.5 overflow-x-auto pb-1 [&>button]:w-auto"} aria-label="Sections">
          {wide && <p className="flex items-center gap-1.5 px-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Layers className="size-3.5" />Drag onto the page</p>}
          {sectionTypes.filter((type) => layout.kind === "letterhead" || type !== "letterBody").map((type) => <PaletteItem key={type} type={type} />)}
        </aside>}

        <div ref={canvasRef} className={`min-w-0 overflow-auto rounded-xl border bg-slate-200/70 p-3 dark:bg-slate-900 ${preview && wide ? "col-span-2" : ""}`} onClick={(event) => { if (event.target === event.currentTarget) setSelection(null); }}>
          <div style={{ width: box.pageWidth * PX_PER_MM * scale, height: paperHeight ? paperHeight * scale : undefined, overflow: "hidden" }}>
            <div ref={paperRef} className="relative bg-white shadow-lg" style={paperStyle} onClick={(event) => { if (event.target === event.currentTarget) setSelection(null); }}>
              <div ref={docRef} className="lb-doc" style={{ width: `${box.width}mm` }}>
                {layout.rows.map((row, rowIndex) => <div key={row.id} data-row-id={row.id} data-repeat={row.repeat} data-keep={row.keepTogether} data-label={row.sections.map((section) => sectionLabels[section.type]).join(" + ")}
                  className={`lb-row lbe-row${row.keepTogether ? " lb-keep" : ""}${selection?.kind === "row" && selection.id === row.id ? " lbe-selected" : ""}${issueIds.has(row.id) ? " lbe-issue" : ""}`} style={rowStyle(row)}>
                  {!preview && <RowGrip id={row.id} index={rowIndex} />}
                  {row.repeat !== "none" && !preview && <span className="lbe-repeat">Repeats as page {row.repeat}</span>}
                  {row.sections.map((section) => {
                    const hidden = !section.print;
                    if (preview && !section.screen) return <div key={section.id} data-section-id={section.id} data-section-type={section.type} />;
                    return <div key={section.id} data-section-id={section.id} data-section-type={section.type}
                      className={`${sectionClass(section)}${preview ? "" : " lbe-section"}${selection?.kind === "section" && selection.id === section.id ? " lbe-selected" : ""}${hidden && !preview ? " lbe-hidden" : ""}${issueIds.has(section.id) ? " lbe-issue" : ""}`}
                      style={sectionStyle(section, layout.theme.baseSizePt)} onClick={preview ? undefined : (event) => { event.stopPropagation(); select({ kind: "section", id: section.id }); }}>
                      {!preview && <span className="lbe-tag"><SectionGrip id={section.id} label={sectionLabels[section.type]} />{sectionLabels[section.type]}{hidden ? " · not printed" : ""}</span>}
                      <SectionBody section={section} data={data} />
                    </div>;
                  })}
                  {!preview && row.sections.slice(0, -1).map((_, index) => {
                    const total = row.ratios.reduce((sum, ratio) => sum + ratio, 0);
                    const left = row.ratios.slice(0, index + 1).reduce((sum, ratio) => sum + ratio, 0) / total;
                    return <span key={index} role="separator" aria-orientation="vertical" aria-label="Drag to resize columns" tabIndex={0} className="lbe-split" style={{ left: `${left * 100}%` }} onPointerDown={(event) => startSplit(event, row, index)}
                      onKeyDown={(event) => { if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return; event.preventDefault(); const step = total * 0.05 * (event.key === "ArrowLeft" ? -1 : 1); const ratios = [...row.ratios]; const pair = ratios[index] + ratios[index + 1]; ratios[index] = Math.min(pair - total * 0.1, Math.max(total * 0.1, ratios[index] + step)); ratios[index + 1] = pair - ratios[index]; dispatch({ type: "updateRow", rowId: row.id, patch: { ratios } }, `split.${row.id}`); }} />;
                  })}
                </div>)}
                {fit.breaks.map((top, index) => <div key={index} className="lbe-break" style={{ top: `${top}mm` }}><span>Page {index + 2}</span></div>)}
              </div>
              {layout.overlays.filter((overlay) => overlay.screen || !preview).map((overlay) => <div key={overlay.id} className={`lb-overlay${preview ? "" : " lbe-overlay"}${selection?.kind === "overlay" && selection.id === overlay.id ? " lbe-selected" : ""}`}
                style={{ ...overlayStyle(overlay, layout), left: `${overlay.xMm}mm`, top: `${overlay.yMm}mm`, pointerEvents: preview ? "none" : "auto" }}
                onPointerDown={preview ? undefined : (event) => startOverlay(event, overlay.id, "move")} onClick={(event) => event.stopPropagation()}>
                <OverlayBody overlay={overlay} data={data} />
                {!preview && <span className="lbe-resize" onPointerDown={(event) => startOverlay(event, overlay.id, "resize")} />}
              </div>)}
            </div>
          </div>
        </div>

        {wide && !preview && <aside className="sticky top-2 max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-xl border bg-card p-3" aria-label="Properties">{inspector}</aside>}
      </div>
      {typeof document !== "undefined" && drop && createPortal(<div aria-hidden="true" style={{ position: "fixed", zIndex: 1000, pointerEvents: "none", background: "#2563eb", borderRadius: 2, boxShadow: "0 0 0 2px rgba(37,99,235,.25)", ...drop.indicator }} />, document.body)}
      <DragOverlay dropAnimation={null}>{drag && <div className="rounded-md border border-primary bg-card px-3 py-1.5 text-sm font-semibold shadow-lg">{drag.kind === "palette" ? sectionLabels[drag.sectionType] : drag.kind === "row" ? "Row" : sectionLabel(drag.id)}</div>}</DragOverlay>
    </DndContext>

    {!wide && <Sheet open={inspectorOpen} onOpenChange={setInspectorOpen}>
      <SheetContent side="right" className="w-[min(100vw,380px)] overflow-y-auto p-4">
        <SheetHeader className="p-0"><SheetTitle>Properties</SheetTitle><SheetDescription>Edit the selected section, or the page when nothing is selected.</SheetDescription></SheetHeader>
        {inspector}
      </SheetContent>
    </Sheet>}
  </div>;
}
