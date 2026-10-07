"use client";

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Copy, ImageUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { sectionLabels } from "@/lib/layout/defaults";
import type { LayoutAction, RowPatch, SectionPatch } from "@/lib/layout/reducer";
import { detailFields, layoutFonts, lineColumns, totalRows, type Layout, type Overlay, type Row, type Section } from "@/lib/layout/schema";

export type Dispatch = (action: LayoutAction, coalesceKey?: string) => void;
export type Selection = { kind: "section" | "row" | "overlay"; id: string } | null;

const columnNames: Record<(typeof lineColumns)[number], string> = { index: "Line #", sku: "Item / SKU", description: "Description", quantity: "Quantity", unitPrice: "Rate", serialNumber: "Serial number", comments: "Comments", subtotal: "Subtotal", vatRate: "VAT %", vatAmount: "VAT amount", total: "Amount" };
const detailNames: Record<(typeof detailFields)[number], string> = { number: "Document number", date: "Date", dueDate: "Due date", terms: "Terms", salesman: "Sales rep", reference: "Reference", trn: "Customer TRN", source: "Source document", status: "Status" };
const totalNames: Record<(typeof totalRows)[number], string> = { subtotal: "Subtotal", vat: "VAT", total: "Total", paid: "Paid", balance: "Balance due" };
const selectClass = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="grid gap-1 text-xs font-medium text-muted-foreground"><span>{label}</span>{children}{hint && <span className="font-normal">{hint}</span>}</label>;
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-center justify-between gap-3 text-sm"><span>{label}</span><Switch checked={checked} onCheckedChange={onChange} /></label>;
}
function NumberField({ label, value, min, max, step = 1, onChange, unit }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (value: number) => void }) {
  return <Field label={unit ? `${label} (${unit})` : label}><Input type="number" inputMode="decimal" min={min} max={max} step={step} value={value} onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next))); }} /></Field>;
}
function Group({ title, children }: { title: string; children: ReactNode }) {
  return <section className="grid gap-3 border-t pt-3 first:border-t-0 first:pt-0"><h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>{children}</section>;
}

function ColourField({ label, value, fallback, onChange }: { label: string; value: string; fallback: string; onChange: (value: string) => void }) {
  return <div className="flex items-end gap-1.5"><Field label={label}><input type="color" className="h-9 w-14 rounded-md border bg-background p-1" value={value || fallback} onChange={(event) => onChange(event.target.value)} /></Field>{value && <Button type="button" size="sm" variant="ghost" className="h-9 px-2 text-xs" onClick={() => onChange("")}>Default</Button>}</div>;
}

async function readImage(file: File | undefined) {
  if (!file) return null;
  if (!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type)) throw new Error("Choose a PNG, JPEG, WebP, GIF or SVG image.");
  if (file.size > 1_000_000) throw new Error("Choose an image under 1 MB.");
  return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("Could not read the image.")); reader.readAsDataURL(file); });
}
function ImagePicker({ value, onChange, onError }: { value: string; onChange: (value: string) => void; onError: (message: string) => void }) {
  return <div className="flex flex-wrap items-center gap-2">
    <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold"><ImageUp className="size-3.5" />{value ? "Replace image" : "Choose image"}
      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" className="sr-only" onChange={(event) => { void readImage(event.target.files?.[0]).then((data) => data && onChange(data)).catch((error: Error) => onError(error.message)); event.target.value = ""; }} /></label>
    {value && <Button type="button" size="sm" variant="ghost" onClick={() => onChange("")}>Remove</Button>}
  </div>;
}

/** Ordered list editor used for line-item columns, detail fields and total rows. */
function ListEditor<K extends string>({ items, all, names, onChange, width }: { items: { key: K; label: string; width?: number }[]; all: readonly K[]; names: Record<K, string>; onChange: (items: { key: K; label: string; width?: number }[]) => void; width?: boolean }) {
  const missing = all.filter((key) => !items.some((item) => item.key === key));
  const move = (index: number, by: number) => { const next = [...items]; const [item] = next.splice(index, 1); next.splice(index + by, 0, item); onChange(next); };
  return <div className="grid gap-2">
    {items.map((item, index) => <div key={item.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-1.5 rounded-md border p-2">
      <div className="grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_4.5rem]">
        <Field label={names[item.key]}><Input value={item.label} maxLength={200} onChange={(event) => onChange(items.map((entry) => entry.key === item.key ? { ...entry, label: event.target.value } : entry))} /></Field>
        {width && <Field label="Width"><Input type="number" min={3} max={100} value={item.width} onChange={(event) => onChange(items.map((entry) => entry.key === item.key ? { ...entry, width: Math.min(100, Math.max(3, Number(event.target.value) || 3)) } : entry))} /></Field>}
      </div>
      <div className="flex gap-0.5">
        <Button type="button" size="icon" variant="ghost" className="size-7" aria-label={`Move ${names[item.key]} up`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp className="size-3.5" /></Button>
        <Button type="button" size="icon" variant="ghost" className="size-7" aria-label={`Move ${names[item.key]} down`} disabled={index === items.length - 1} onClick={() => move(index, 1)}><ArrowDown className="size-3.5" /></Button>
        <Button type="button" size="icon" variant="ghost" className="size-7 text-destructive" aria-label={`Remove ${names[item.key]}`} disabled={items.length === 1} onClick={() => onChange(items.filter((entry) => entry.key !== item.key))}><Trash2 className="size-3.5" /></Button>
      </div>
    </div>)}
    {missing.length > 0 && <div className="flex flex-wrap gap-1.5">{missing.map((key) => <Button key={key} type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => onChange([...items, { key, label: names[key], ...(width ? { width: 10 } : {}) }])}><Plus className="size-3" />{names[key]}</Button>)}</div>}
  </div>;
}

function SectionProps({ section, update, onError }: { section: Section; update: (patch: SectionPatch, key?: string) => void; onError: (message: string) => void }) {
  const props = (value: Record<string, unknown>, key?: string) => update({ props: value }, key);
  const text = (label: string, name: string, value: string, multiline = false) => <Field label={label}>{multiline
    ? <Textarea rows={5} value={value} maxLength={15000} onChange={(event) => props({ [name]: event.target.value }, `${section.id}.${name}`)} />
    : <Input value={value} maxLength={200} onChange={(event) => props({ [name]: event.target.value }, `${section.id}.${name}`)} />}</Field>;
  const sideBySideToggle = (value: boolean) => <><Toggle label="Arabic and English side by side" checked={value} onChange={(next) => props({ sideBySide: next })} />{value && <p className="text-xs text-muted-foreground">Lines with Arabic go in the right column and the other lines in the left, in their original order.</p>}</>;
  switch (section.type) {
    case "companyHeader": return <div className="grid gap-2.5">
      {(["showLeftLogo", "showRightLogo", "showName", "showAddress", "showPhone", "showEmail", "showTrn"] as const).map((key) => <Toggle key={key} label={{ showLeftLogo: "Left logo", showRightLogo: "Right logo", showName: "Company name", showAddress: "Address", showPhone: "Phone", showEmail: "Email", showTrn: "Company TRN" }[key]} checked={section.props[key]} onChange={(value) => props({ [key]: value })} />)}
      <NumberField label="Logo height" unit="mm" min={8} max={60} value={section.props.logoHeightMm} onChange={(value) => props({ logoHeightMm: value }, `${section.id}.logo`)} />
      <Field label="Company name text" hint="Leave empty to use the name from Company Setup."><Input value={section.props.nameText} maxLength={200} onChange={(event) => props({ nameText: event.target.value }, `${section.id}.name`)} /></Field>
      <Field label="Company address text" hint="One line per row; leave empty to use Company Setup."><Textarea rows={3} value={section.props.addressText} maxLength={1000} onChange={(event) => props({ addressText: event.target.value }, `${section.id}.address`)} /></Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="VAT no. label"><Input value={section.props.trnLabel} maxLength={200} onChange={(event) => props({ trnLabel: event.target.value }, `${section.id}.trnLabel`)} /></Field>
        <Field label="Phone label"><Input value={section.props.phoneLabel} maxLength={200} onChange={(event) => props({ phoneLabel: event.target.value }, `${section.id}.phoneLabel`)} /></Field>
        <Field label="E-mail label"><Input value={section.props.emailLabel} maxLength={200} onChange={(event) => props({ emailLabel: event.target.value }, `${section.id}.emailLabel`)} /></Field>
      </div>
      <p className="text-xs text-muted-foreground">Logos, phone, e-mail and VAT number come from Company Setup.</p>
    </div>;
    case "title": return text("Title", "text", section.props.text);
    case "billTo": case "shipTo": case "bankDetails": return text("Heading", "label", section.props.label);
    case "details": return <div className="grid gap-3">
      <NumberField label="Columns" min={1} max={4} value={section.props.columns} onChange={(value) => props({ columns: Math.round(value) })} />
      <Toggle label="Border around each field" checked={section.props.cellBorder} onChange={(value) => props({ cellBorder: value })} />
      {section.props.cellBorder && <ColourField label="Field border colour" value={section.props.cellBorderColor} fallback="#cbd5e1" onChange={(value) => props({ cellBorderColor: value }, `${section.id}.cbc`)} />}
      <ListEditor items={section.props.fields} all={detailFields} names={detailNames} onChange={(fields) => props({ fields })} />
    </div>;
    case "lineItems": return <div className="grid gap-3">
      <Toggle label="Repeat heading on every page" checked={section.props.repeatHeading} onChange={(value) => props({ repeatHeading: value })} />
      <Toggle label="Shade alternate rows" checked={section.props.zebra} onChange={(value) => props({ zebra: value })} />
      <Field label="Lines"><select className={selectClass} value={section.props.gridLines} onChange={(event) => props({ gridLines: event.target.value })}><option value="rows">Between rows</option><option value="grid">Full grid</option><option value="none">None</option></select></Field>
      <div className="flex flex-wrap gap-3"><ColourField label="Heading background" value={section.props.headingBackground} fallback="#164e63" onChange={(value) => props({ headingBackground: value }, `${section.id}.hbg`)} /><ColourField label="Heading text" value={section.props.headingTextColor} fallback="#ffffff" onChange={(value) => props({ headingTextColor: value }, `${section.id}.htx`)} /></div>
      <Toggle label="Bold heading" checked={section.props.headingBold} onChange={(value) => props({ headingBold: value })} />
      <Toggle label="Comments and serial numbers under the description" checked={section.props.notesUnderDescription} onChange={(value) => props({ notesUnderDescription: value })} />
      <ListEditor items={section.props.columns} all={lineColumns} names={columnNames} width onChange={(columns) => props({ columns })} />
      <p className="text-xs text-muted-foreground">Widths are relative; the table always fits the page width.</p>
    </div>;
    case "totals": return <div className="grid gap-3">
      <NumberField label="Width" unit="% of column" min={30} max={100} value={section.props.widthPercent} onChange={(value) => props({ widthPercent: value }, `${section.id}.width`)} />
      <ListEditor items={section.props.rows} all={totalRows} names={totalNames} onChange={(rows) => props({ rows })} />
    </div>;
    case "notes": case "terms": return <div className="grid gap-3">{text("Heading", "label", section.props.label)}{text("Text (leave empty to use the document's own)", "text", section.props.text, true)}{sideBySideToggle(section.props.sideBySide)}</div>;
    case "signature": return <div className="grid gap-3">{text("Label", "label", section.props.label)}<NumberField label="Line width" unit="mm" min={20} max={120} value={section.props.lineWidthMm} onChange={(value) => props({ lineWidthMm: value }, `${section.id}.line`)} /></div>;
    case "text": return <div className="grid gap-3">{text("Text", "text", section.props.text, true)}{sideBySideToggle(section.props.sideBySide)}</div>;
    case "letterBody": return text("Text", "text", section.props.text, true);
    case "image": return <div className="grid gap-3"><ImagePicker value={section.props.src} onChange={(src) => props({ src })} onError={onError} /><NumberField label="Maximum height" unit="mm" min={5} max={120} value={section.props.heightMm} onChange={(value) => props({ heightMm: value }, `${section.id}.height`)} /></div>;
    case "spacer": return <NumberField label="Height" unit="mm" min={1} max={80} value={section.props.heightMm} onChange={(value) => props({ heightMm: value }, `${section.id}.height`)} />;
    case "divider": return <NumberField label="Thickness" unit="pt" min={0.25} max={4} step={0.25} value={section.props.thicknessPt} onChange={(value) => props({ thicknessPt: value }, `${section.id}.thickness`)} />;
  }
}

export function SectionInspector({ section, row, rowIndex, sectionIndex, layout, dispatch, onError }: { section: Section; row: Row; rowIndex: number; sectionIndex: number; layout: Layout; dispatch: Dispatch; onError: (message: string) => void }) {
  const update = (patch: SectionPatch, key?: string) => dispatch({ type: "updateSection", sectionId: section.id, patch }, key);
  const move = (target: Parameters<Dispatch>[0] & { type: "moveSection" }) => dispatch(target);
  // A section alone in its row moves past the neighbouring row; one sharing a row splits out just above/below it.
  const alone = row.sections.length === 1;
  const upIndex = alone ? rowIndex - 1 : rowIndex;
  const downIndex = alone ? rowIndex + 2 : rowIndex + 1;
  return <div className="grid gap-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{sectionLabels[section.type]}</h3>
      <div className="flex gap-1">
        <Button type="button" size="icon" variant="outline" className="size-8" aria-label="Move up to a new row" title="Move up" disabled={alone && rowIndex === 0} onClick={() => move({ type: "moveSection", sectionId: section.id, target: { kind: "newRow", rowIndex: upIndex } })}><ArrowUp className="size-4" /></Button>
        <Button type="button" size="icon" variant="outline" className="size-8" aria-label="Move down to a new row" title="Move down" disabled={alone && rowIndex === layout.rows.length - 1} onClick={() => move({ type: "moveSection", sectionId: section.id, target: { kind: "newRow", rowIndex: downIndex } })}><ArrowDown className="size-4" /></Button>
        <Button type="button" size="icon" variant="outline" className="size-8" aria-label="Move left" title="Move left" disabled={sectionIndex === 0} onClick={() => move({ type: "moveSection", sectionId: section.id, target: { kind: "row", rowId: row.id, index: sectionIndex - 1 } })}><ArrowLeft className="size-4" /></Button>
        <Button type="button" size="icon" variant="outline" className="size-8" aria-label="Move right" title="Move right" disabled={sectionIndex === row.sections.length - 1} onClick={() => move({ type: "moveSection", sectionId: section.id, target: { kind: "row", rowId: row.id, index: sectionIndex + 2 } })}><ArrowRight className="size-4" /></Button>
        <Button type="button" size="icon" variant="outline" className="size-8" aria-label="Duplicate section" title="Duplicate" onClick={() => dispatch({ type: "duplicateSection", sectionId: section.id })}><Copy className="size-4" /></Button>
        <Button type="button" size="icon" variant="outline" className="size-8 text-destructive" aria-label="Delete section" title="Delete" onClick={() => dispatch({ type: "removeSection", sectionId: section.id })}><Trash2 className="size-4" /></Button>
      </div>
    </div>
    <Group title="Content"><SectionProps section={section} update={update} onError={onError} /></Group>
    <Group title="Style">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Align"><select className={selectClass} value={section.style.align} onChange={(event) => update({ style: { align: event.target.value as Section["style"]["align"] } })}><option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option></select></Field>
        <Field label="Border"><select className={selectClass} value={section.style.border} onChange={(event) => update({ style: { border: event.target.value as Section["style"]["border"] } })}><option value="none">None</option><option value="box">Box</option><option value="top">Top line</option><option value="bottom">Bottom line</option></select></Field>
        <NumberField label="Padding" unit="mm" min={0} max={20} step={0.5} value={section.style.paddingMm} onChange={(value) => update({ style: { paddingMm: value } }, `${section.id}.padding`)} />
        <NumberField label="Text size" unit="×" min={0.6} max={2} step={0.05} value={section.style.fontScale} onChange={(value) => update({ style: { fontScale: value } }, `${section.id}.scale`)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Vertical alignment"><select className={selectClass} value={section.style.verticalAlign} onChange={(event) => update({ style: { verticalAlign: event.target.value as Section["style"]["verticalAlign"] } })}><option value="top">Top</option><option value="middle">Middle</option><option value="bottom">Bottom</option></select></Field>
        <Field label="Font"><select className={selectClass} value={section.style.font} onChange={(event) => update({ style: { font: event.target.value as Section["style"]["font"] } })}><option value="">Page font</option>{layoutFonts.map((font) => <option key={font}>{font}</option>)}</select></Field>
      </div>
      <div className="flex flex-wrap gap-3">
        <ColourField label="Text colour" value={section.style.textColor} fallback="#111827" onChange={(value) => update({ style: { textColor: value } }, `${section.id}.color`)} />
        <ColourField label="Background" value={section.style.background} fallback="#ffffff" onChange={(value) => update({ style: { background: value } }, `${section.id}.bg`)} />
      </div>
      {section.style.border !== "none" && <div className="flex flex-wrap items-end gap-3">
        <ColourField label="Border colour" value={section.style.borderColor} fallback="#cbd5e1" onChange={(value) => update({ style: { borderColor: value } }, `${section.id}.bc`)} />
        <div className="w-28"><NumberField label="Border width" unit="pt" min={0.25} max={4} step={0.25} value={section.style.borderWidthPt} onChange={(value) => update({ style: { borderWidthPt: value } }, `${section.id}.bw`)} /></div>
      </div>}
      <div className="grid grid-cols-3 gap-2">
        <Toggle label="Bold" checked={section.style.bold} onChange={(value) => update({ style: { bold: value } })} />
        <Toggle label="Italic" checked={section.style.italic} onChange={(value) => update({ style: { italic: value } })} />
        <Toggle label="Underline" checked={section.style.underline} onChange={(value) => update({ style: { underline: value } })} />
      </div>
      <Toggle label="Shrink text to fit the row" checked={section.style.fitRow} onChange={(value) => update({ style: { fitRow: value } })} />
      {section.style.fitRow && <p className="text-xs text-muted-foreground">Text gets smaller until this section is no taller than the other sections in its row (for example, terms next to the totals end level with Paid).</p>}
    </Group>
    <Group title="Visibility & printing">
      <Toggle label="Show on screen" checked={section.screen} onChange={(value) => update({ screen: value })} />
      <Toggle label="Include when printing" checked={section.print} onChange={(value) => update({ print: value })} />
      <Toggle label="Never split across pages" checked={section.avoidBreakInside} onChange={(value) => update({ avoidBreakInside: value })} />
    </Group>
    <RowSettings row={row} dispatch={dispatch} />
  </div>;
}

export function RowSettings({ row, dispatch }: { row: Row; dispatch: Dispatch }) {
  const update = (patch: RowPatch, key?: string) => dispatch({ type: "updateRow", rowId: row.id, patch }, key);
  return <Group title="Row">
    <Field label="Repeat on every printed page"><select className={selectClass} value={row.repeat} onChange={(event) => update({ repeat: event.target.value as Row["repeat"] })}><option value="none">No — part of the page body</option><option value="header">Yes — as page header</option><option value="footer">Yes — as page footer</option></select></Field>
    <Toggle label="Keep the whole row on one page" checked={row.keepTogether} onChange={(value) => update({ keepTogether: value })} />
    <div className="grid grid-cols-2 gap-2">
      <NumberField label="Space above" unit="mm" min={0} max={40} step={0.5} value={row.spaceBeforeMm} onChange={(value) => update({ spaceBeforeMm: value }, `${row.id}.space`)} />
      <NumberField label="Column gap" unit="mm" min={0} max={20} step={0.5} value={row.gapMm} onChange={(value) => update({ gapMm: value }, `${row.id}.gap`)} />
    </div>
    {row.sections.length > 1 && <div className="flex flex-wrap gap-1.5">{(row.sections.length === 2 ? [[1, 1], [2, 1], [1, 2], [3, 2], [2, 3]] : [[1, 1, 1], [2, 1, 1], [1, 2, 1], [1, 1, 2]]).map((ratios) =>
      <Button key={ratios.join(":")} type="button" size="sm" variant={ratios.join() === row.ratios.join() ? "default" : "outline"} className="h-7 px-2 text-xs" onClick={() => update({ ratios })}>{ratios.map((ratio) => Math.round(ratio / ratios.reduce((a, b) => a + b, 0) * 100)).join(" / ")}</Button>)}</div>}
  </Group>;
}

export function OverlayInspector({ overlay, dispatch, onError }: { overlay: Overlay; dispatch: Dispatch; onError: (message: string) => void }) {
  const update = (patch: Partial<Omit<Overlay, "id">>, key?: string) => dispatch({ type: "updateOverlay", overlayId: overlay.id, patch }, key);
  return <div className="grid gap-4">
    <div className="flex items-center justify-between gap-2"><h3 className="font-semibold capitalize">{overlay.kind} overlay</h3><Button type="button" size="icon" variant="outline" className="size-8 text-destructive" aria-label="Delete overlay" onClick={() => dispatch({ type: "removeOverlay", overlayId: overlay.id })}><Trash2 className="size-4" /></Button></div>
    {overlay.kind !== "image" && <Field label="Text" hint={overlay.kind === "stamp" ? "{status} is replaced by the document status, e.g. PAID." : undefined}><Input value={overlay.text} maxLength={200} onChange={(event) => update({ text: event.target.value }, `${overlay.id}.text`)} /></Field>}
    {overlay.kind !== "text" && <ImagePicker value={overlay.src} onChange={(src) => update({ src })} onError={onError} />}
    <div className="grid grid-cols-2 gap-2">
      <NumberField label="From left" unit="mm" min={0} max={500} step={0.5} value={overlay.xMm} onChange={(value) => update({ xMm: value }, `${overlay.id}.x`)} />
      <NumberField label="From top" unit="mm" min={0} max={500} step={0.5} value={overlay.yMm} onChange={(value) => update({ yMm: value }, `${overlay.id}.y`)} />
      <NumberField label="Width" unit="mm" min={5} max={300} step={0.5} value={overlay.widthMm} onChange={(value) => update({ widthMm: value }, `${overlay.id}.w`)} />
      <NumberField label="Height" unit="mm" min={5} max={300} step={0.5} value={overlay.heightMm} onChange={(value) => update({ heightMm: value }, `${overlay.id}.h`)} />
      <NumberField label="Rotation" unit="°" min={-180} max={180} value={overlay.rotateDeg} onChange={(value) => update({ rotateDeg: value }, `${overlay.id}.r`)} />
      <NumberField label="Opacity" unit="0–1" min={0.05} max={1} step={0.05} value={overlay.opacity} onChange={(value) => update({ opacity: value }, `${overlay.id}.o`)} />
    </div>
    <Field label="Pages"><select className={selectClass} value={overlay.pages} onChange={(event) => update({ pages: event.target.value as Overlay["pages"] })}><option value="first">First page only</option><option value="all">Every page</option></select></Field>
    <Toggle label="Show on screen" checked={overlay.screen} onChange={(value) => update({ screen: value })} />
    <Toggle label="Include when printing" checked={overlay.print} onChange={(value) => update({ print: value })} />
  </div>;
}

export function PageInspector({ layout, dispatch }: { layout: Layout; dispatch: Dispatch }) {
  const { page, theme } = layout;
  return <div className="grid gap-4">
    <h3 className="font-semibold">Page & theme</h3>
    <Group title="Paper">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Size"><select className={selectClass} value={page.size} onChange={(event) => dispatch({ type: "updatePage", patch: { size: event.target.value as Layout["page"]["size"] } })}><option value="A4">A4 (210 × 297 mm)</option><option value="Letter">Letter (8.5 × 11 in)</option></select></Field>
        <Field label="Orientation"><select className={selectClass} value={page.orientation} onChange={(event) => dispatch({ type: "updatePage", patch: { orientation: event.target.value as Layout["page"]["orientation"] } })}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></Field>
        {(["top", "right", "bottom", "left"] as const).map((side) => <NumberField key={side} label={`${side[0].toUpperCase()}${side.slice(1)} margin`} unit="mm" min={5} max={40} step={0.5} value={page.margins[side]} onChange={(value) => dispatch({ type: "updatePage", patch: { margins: { [side]: value } } }, `margin.${side}`)} />)}
      </div>
      <Toggle label="Page numbers (Chrome & Edge)" checked={page.pageNumbers} onChange={(value) => dispatch({ type: "updatePage", patch: { pageNumbers: value } })} />
    </Group>
    <Group title="Theme">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Font"><select className={selectClass} value={theme.font} onChange={(event) => dispatch({ type: "updateTheme", patch: { font: event.target.value as Layout["theme"]["font"] } })}>{layoutFonts.map((font) => <option key={font}>{font}</option>)}</select></Field>
        <NumberField label="Text size" unit="pt" min={7} max={14} step={0.5} value={theme.baseSizePt} onChange={(value) => dispatch({ type: "updateTheme", patch: { baseSizePt: value } }, "theme.size")} />
      </div>
      <div className="flex flex-wrap gap-3">{(["accent", "text", "border"] as const).map((key) => <Field key={key} label={{ accent: "Accent", text: "Text", border: "Lines" }[key]}><input type="color" className="h-9 w-14 rounded-md border bg-background p-1" value={theme[key]} onChange={(event) => dispatch({ type: "updateTheme", patch: { [key]: event.target.value } }, `theme.${key}`)} /></Field>)}</div>
      <Toggle label="Arabic labels (English left, Arabic right)" checked={theme.arabicLabels} onChange={(value) => dispatch({ type: "updateTheme", patch: { arabicLabels: value } })} />
      <Field label="AED currency symbol"><div className="grid gap-1.5"><ImagePicker value={theme.currencySymbol} onChange={(currencySymbol) => dispatch({ type: "updateTheme", patch: { currencySymbol } })} onError={(message) => toast.error(message)} /><p className="text-xs text-muted-foreground">Upload the official UAE dirham symbol (PNG, SVG or WebP). It replaces “AED” in the totals of AED documents.</p></div></Field>
    </Group>
    <Group title="Overlays">
      <p className="text-xs text-muted-foreground">Overlays float above the page (stamps, watermarks, free text). Everything else flows so long documents never overlap.</p>
      <div className="flex flex-wrap gap-1.5">{(["stamp", "text", "image"] as const).map((kind) => <Button key={kind} type="button" size="sm" variant="outline" className="h-8" disabled={layout.overlays.length >= 12} onClick={() => dispatch({ type: "addOverlay", kind })}><Plus className="size-3.5" />{kind[0].toUpperCase() + kind.slice(1)}</Button>)}</div>
    </Group>
  </div>;
}
