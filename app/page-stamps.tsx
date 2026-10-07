/* eslint-disable @next/next/no-img-element -- also rendered to static print markup with inline data-URL images. */
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type { DocumentStamp } from "@/lib/layout/document-data";

// Company stamp and bank details box placed freely on the document (millimetres from the content area's
// top-left corner). No hooks or browser APIs during render, so classic templates, Layout Builder documents
// and their static print markup all share it; dragging only runs in pointer handlers.

export type MovePageStamp = (kind: DocumentStamp["kind"], left: number, top: number) => void;
export const PAGE_STAMP_SIZE = { company: { width: 34, height: 25 }, bank: { width: 80, height: 40 }, status: { width: 40, height: 14 } } as const;

/** Keep a stamp inside the area it is placed in. */
export function clampPageStamp(kind: DocumentStamp["kind"], left: number, top: number, widthMm: number, heightMm: number) {
  const size = PAGE_STAMP_SIZE[kind];
  return {
    left: Math.max(0, Math.min(Math.floor(widthMm - size.width), Math.round(left))),
    top: Math.max(0, Math.min(Math.floor(heightMm - size.height), Math.round(top))),
  };
}

export function PageStamps({ stamps, widthMm, heightMm, mm, onMove }: {
  stamps: DocumentStamp[];
  /** Width and height of the area the coordinates refer to. */
  widthMm: number; heightMm: number;
  /** CSS length for a millimetre value in the host's units. */
  mm: (value: number) => string;
  onMove?: MovePageStamp;
}) {
  const begin = (stamp: DocumentStamp, event: ReactPointerEvent<HTMLDivElement>) => {
    if (!onMove || event.button !== 0) return;
    event.preventDefault();
    const host = event.currentTarget.offsetParent as HTMLElement | null;
    const pixelsPerMm = (host?.getBoundingClientRect().width || widthMm * 96 / 25.4) / widthMm;
    const startX = event.clientX, startY = event.clientY;
    const move = (next: PointerEvent) => {
      const position = clampPageStamp(stamp.kind, stamp.left + (next.clientX - startX) / pixelsPerMm, stamp.top + (next.clientY - startY) / pixelsPerMm, widthMm, heightMm);
      onMove(stamp.kind, position.left, position.top);
    };
    const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); window.removeEventListener("pointercancel", stop); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  };
  return <>{stamps.map((stamp) => {
    const size = PAGE_STAMP_SIZE[stamp.kind];
    const position = clampPageStamp(stamp.kind, stamp.left, stamp.top, widthMm, heightMm);
    const style: CSSProperties = { position: "absolute", left: mm(position.left), top: mm(position.top), zIndex: 6, touchAction: "none", cursor: onMove ? "move" : undefined };
    const drag = onMove ? { onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => begin(stamp, event), title: "Drag to move" } : {};
    // Document status stamp (e.g. OPEN, PAID) lifted from a Layout Builder overlay so it can be moved.
    if (stamp.kind === "status") return <div key="status" className="page-stamp page-status-stamp" style={{ ...style, width: mm(size.width), height: mm(size.height), display: "flex", alignItems: "center", justifyContent: "center", border: `${mm(0.9)} solid #1f4e66`, borderRadius: mm(2), color: "#1f4e66", fontFamily: "Arial, sans-serif", fontWeight: 800, fontSize: "14pt", letterSpacing: "0.08em", textTransform: "uppercase", transform: "rotate(-8deg)", opacity: 0.85, background: "transparent" }} {...drag}>{stamp.text}</div>;
    if (stamp.kind === "company") return <div key="company" className="page-stamp page-company-stamp" style={style} {...drag}>
      {stamp.src ? <img src={stamp.src} alt="Company stamp" draggable={false} style={{ display: "block", maxWidth: mm(size.width - 2), maxHeight: mm(size.height - 2), objectFit: "contain" }} /> : null}
    </div>;
    return <div key="bank" className="page-stamp page-bank-box" style={{ ...style, width: mm(size.width), padding: mm(2), border: "1px solid #94a3b8", borderRadius: mm(1), background: "#fff", color: "#0f172a", fontFamily: "Arial, sans-serif", fontSize: "8pt", lineHeight: 1.35, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }} {...drag}>
      <div style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: mm(0.8) }}>{stamp.title || "Bank details"}</div>
      {(stamp.lines ?? []).map((line, index) => <div key={index}>{line}</div>)}
      {stamp.remark ? <div style={{ marginTop: mm(1), color: "#b91c1c" }}>{stamp.remark}</div> : null}
      {stamp.src ? <img src={stamp.src} alt="Bank stamp" draggable={false} style={{ display: "block", marginTop: mm(1), maxWidth: mm(32), maxHeight: mm(22), objectFit: "contain" }} /> : null}
    </div>;
  })}</>;
}
