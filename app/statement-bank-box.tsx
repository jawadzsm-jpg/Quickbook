"use client";

import type { PointerEvent as ReactPointerEvent } from "react";

export type StatementBankBoxValue = { show: boolean; left: number; remark: string | null };
export const STATEMENT_BANK_BOX_WIDTH_MM = 80;

/** Printable width the statement's left offset is measured in (A4 minus the 10 mm PDF margins). */
export const statementContentWidthMm = (landscape: boolean) => (landscape ? 297 : 210) - 20;

/**
 * Controls and preview for the bank details box on customer statements. The box sits after the statement
 * table (so it never covers activity rows) and can be dragged or typed to any left position; print and PDF
 * use the same offset.
 */
export function StatementBankBox({ currency, lines, defaultRemark, value, onChange, landscape, title = "Bank details", toggleLabel, missingText, remarkLabel = "Remark on this statement", remarkHint }: {
  currency: string; lines: string[] | null; defaultRemark: string;
  value: StatementBankBoxValue; onChange: (value: StatementBankBoxValue) => void; landscape: boolean;
  title?: string; toggleLabel?: string; missingText?: string; remarkLabel?: string; remarkHint?: string;
}) {
  const widthMm = statementContentWidthMm(landscape);
  const maxLeft = widthMm - STATEMENT_BANK_BOX_WIDTH_MM;
  const left = Math.max(0, Math.min(maxLeft, value.left));
  const remark = value.remark ?? defaultRemark;
  const drag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const area = event.currentTarget.parentElement;
    const pixelsPerMm = (area?.getBoundingClientRect().width || widthMm * 96 / 25.4) / widthMm;
    const startX = event.clientX;
    const move = (next: PointerEvent) => onChange({ ...value, left: Math.max(0, Math.min(maxLeft, Math.round(left + (next.clientX - startX) / pixelsPerMm))) });
    const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); window.removeEventListener("pointercancel", stop); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  };
  return <section className="statement-bank-box grid gap-3" aria-label={`${title} box`}>
    <div className="grid gap-3 rounded-xl border bg-card p-4 text-sm text-card-foreground print:hidden">
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={Boolean(lines) && value.show} disabled={!lines} onChange={(event) => onChange({ ...value, show: event.target.checked })} />{toggleLabel ?? `Bank details box (${currency})`}</label>
        {!lines && <span className="text-muted-foreground">{missingText ?? `Add a ${currency} bank account in Company Setup → Bank account.`}</span>}
        {lines && value.show && <label className="flex items-center gap-2">Left (mm)<input type="number" min={0} max={maxLeft} className="h-9 w-24 rounded-md border bg-background px-3 text-foreground" value={left} onChange={(event) => onChange({ ...value, left: Math.max(0, Math.min(maxLeft, Number(event.target.value) || 0)) })} /></label>}
      </div>
      {lines && value.show && <label className="grid gap-1"><span className="font-medium">{remarkLabel}</span><textarea rows={2} maxLength={500} className="w-full rounded-md border bg-background px-3 py-2 text-foreground" value={remark} placeholder="Payment note, correspondent bank instructions…" onChange={(event) => onChange({ ...value, remark: event.target.value })} /><span className="text-xs text-muted-foreground">{remarkHint ?? `Starts with the ${currency} account’s remark from Company Setup. Drag the box sideways or type Left; it prints after the statement table.`}</span></label>}
    </div>
    {lines && value.show && <div className="statement-bank-box-area relative">
      <div role="group" aria-label={`${title} (${currency})`} title="Drag sideways to move" onPointerDown={drag}
        className="statement-bank-box-card cursor-ew-resize touch-none rounded border bg-card p-2 text-[8pt] leading-snug text-card-foreground"
        style={{ marginLeft: `${left / widthMm * 100}%`, width: `${STATEMENT_BANK_BOX_WIDTH_MM / widthMm * 100}%`, borderColor: "#94a3b8" }}>
        <strong className="block uppercase tracking-wide">{title}</strong>
        {lines.map((line, index) => <div key={index}>{line}</div>)}
        {remark ? <div className="mt-1 whitespace-pre-wrap" style={{ color: "#b91c1c" }}>{remark}</div> : null}
      </div>
    </div>}
  </section>;
}
