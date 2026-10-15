"use client";

import { useState, type CSSProperties } from "react";
import { RotateCcw, Type } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { APP_FONTS, DEFAULT_TYPOGRAPHY, TEXT_SIZE_AREAS, TEXT_SIZE_MAX, TEXT_SIZE_MIN, TEXT_SIZE_STEP, typographyVariables, type AppTypography } from "@/lib/app-typography";

const pick = (setup: AppTypography): AppTypography => ({ appFont: setup.appFont ?? "", ...Object.fromEntries(TEXT_SIZE_AREAS.map((area) => [area.key, setup[area.key] ?? 100])) } as AppTypography);
const same = (a: AppTypography, b: AppTypography) => a.appFont === b.appFont && TEXT_SIZE_AREAS.every((area) => a[area.key] === b[area.key]);

/** Company Setup → Fonts & text: the app font and text sizes per area, with a live preview. Saved for the whole company. */
export function TypographySettings({ companyId, setup, disabled, onSaved }: { companyId: number; setup: AppTypography; disabled?: boolean; onSaved: (record: AppTypography) => void | Promise<void> }) {
  const saved = pick(setup);
  const [draft, setDraft] = useState<AppTypography>(saved);
  const [saving, setSaving] = useState(false);
  const changed = !same(draft, saved);
  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/company-setup/branding", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, field: "appTypography", value: draft }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save the fonts and text size.");
      const record = pick(data.record as AppTypography);
      setDraft(record);
      await onSaved(record);
      toast.success("Fonts and text size saved");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save the fonts and text size."); }
    finally { setSaving(false); }
  };
  const previewStyle = { ...typographyVariables(draft), fontFamily: "var(--font-sans)", fontSize: "calc(1rem * var(--app-text-base))" } as CSSProperties;
  const systemFonts = APP_FONTS.filter((font) => font.group === "System");
  const googleFonts = APP_FONTS.filter((font) => font.group === "Google");

  return <section aria-label="Font and text size settings" className="space-y-6 rounded-xl border bg-card p-5 shadow-sm">
    <div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"><Type className="size-5" /></div><div><h2 className="font-bold">Fonts and text size</h2><p className="text-sm text-muted-foreground">The font and text sizes everyone signed in to this company sees. Printed invoices and other documents keep the fonts set in Layout Builder.</p><p className="mt-1 text-xs text-muted-foreground">Saved separately with <span className="font-medium text-foreground">Save fonts and text</span>.</p></div></div>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="app-font">Font</Label>
          <select id="app-font" value={draft.appFont} onChange={(event) => setDraft((current) => ({ ...current, appFont: event.target.value }))} className="h-9 w-full rounded-md border bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <optgroup label="Installed on most computers">{systemFonts.map((font) => <option key={font.key} value={font.key}>{font.label}</option>)}</optgroup>
            <optgroup label="Web fonts">{googleFonts.map((font) => <option key={font.key} value={font.key}>{font.label}</option>)}</optgroup>
          </select>
          <p className="text-xs text-muted-foreground">Fonts marked Arabic + Latin have their own Arabic letters; the others show Arabic text in Noto Sans Arabic.</p>
        </div>
        <fieldset className="space-y-4">
          <legend className="text-sm font-medium">Text size</legend>
          {TEXT_SIZE_AREAS.map((area) => <div key={area.key} className="space-y-1">
            <div className="flex items-center justify-between gap-3"><Label htmlFor={`text-size-${area.key}`}>{area.label}</Label><span className="tabular-nums text-sm font-medium" aria-hidden="true">{draft[area.key]}%</span></div>
            <input id={`text-size-${area.key}`} type="range" min={TEXT_SIZE_MIN} max={TEXT_SIZE_MAX} step={TEXT_SIZE_STEP} value={draft[area.key]} aria-valuetext={`${draft[area.key]}%`} onChange={(event) => setDraft((current) => ({ ...current, [area.key]: Number(event.target.value) }))} className="w-full accent-primary" />
            <p className="text-xs text-muted-foreground">{area.detail}</p>
          </div>)}
        </fieldset>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Preview</p>
        <div className="app-typography-scope overflow-hidden rounded-xl border bg-background" style={previewStyle} aria-label="Font and text size preview">
          <div className="flex min-h-72">
            <nav data-app-text="sidebar" aria-label="Preview sidebar" className="w-36 shrink-0 space-y-1 bg-slate-900 p-3 text-slate-100"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Sales</p><p className="rounded-md bg-white/10 px-2 py-1 text-sm">Invoices</p><p className="px-2 py-1 text-sm">Customers</p><p className="px-2 py-1 text-sm">المبيعات</p></nav>
            <div className="min-w-0 flex-1 space-y-3 p-4">
              <h3 className="text-lg font-semibold">Tax invoice · فاتورة ضريبية</h3>
              <p className="text-sm text-muted-foreground">Base text: the quick brown fox jumps over the lazy dog. النص الأساسي للتطبيق.</p>
              <div data-app-text="forms" className="grid gap-1"><label className="text-sm font-medium" htmlFor="preview-customer">Customer</label><input id="preview-customer" readOnly tabIndex={-1} value="Al Noor Trading LLC" className="h-9 rounded-md border bg-background px-3 text-sm" /></div>
              <table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="py-1 font-medium">Item</th><th className="py-1 text-right font-medium">Amount</th></tr></thead><tbody><tr className="border-b"><td className="py-1">Laptop stand</td><td className="py-1 text-right tabular-nums">1,250.00</td></tr><tr><td className="py-1">حامل شاشة</td><td className="py-1 text-right tabular-nums">380.00</td></tr></tbody></table>
              <div className="rounded-md border bg-white p-2 text-slate-900" aria-label="Printed report sample"><p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Printed report</p><p style={{ fontSize: "calc(8pt * var(--app-text-print))" }}>Laptop stand · 1,250.00 · Customer: Al Noor Trading LLC</p></div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button type="button" variant="outline" disabled={disabled || saving || same(draft, DEFAULT_TYPOGRAPHY)} onClick={() => setDraft(DEFAULT_TYPOGRAPHY)}><RotateCcw className="size-4" />Reset to default</Button>
      <Button type="button" variant="outline" disabled={disabled || saving || !changed} onClick={() => setDraft(saved)}>Undo changes</Button>
      <Button type="button" className="brand-primary-button" disabled={disabled || saving || !changed} onClick={() => void save()}>{saving ? "Saving…" : "Save fonts and text"}</Button>
    </div>
  </section>;
}
