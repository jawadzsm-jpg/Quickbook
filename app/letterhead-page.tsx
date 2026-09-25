"use client";

import Image from "next/image";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { LetterheadTemplate } from "@/lib/letterhead";

export type LetterheadCompany = {
  name: string; logoData: string; rightLogoData?: string; stampData?: string;
  phone: string; email?: string; addressLine1?: string; addressLine2?: string;
  city?: string; country?: string;
};

export function LetterheadBrand({ template, company }: { template: LetterheadTemplate; company: LetterheadCompany }) {
  const details = [company.phone, company.email, template.website].filter(Boolean);
  return <header className="letterhead-brand" style={{ borderBottom: "1px solid #9ca3af", paddingBottom: 13, marginBottom: 22, color: "#24282d" }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, minHeight: 76 }}>
      <div style={{ flex: "1 1 45%", minWidth: 0 }}>
        {template.showLogo && company.logoData
          ? <Image src={company.logoData} alt={company.name} width={230} height={90} unoptimized style={{ width: "auto", maxWidth: "100%", maxHeight: 85, objectFit: "contain" }} />
          : <strong style={{ color: template.color, fontSize: 22 }}>{company.name}</strong>}
      </div>
      <div style={{ flex: "1 1 55%", textAlign: "right", minWidth: 0 }}>
        {template.showRightLogo && company.rightLogoData
          ? <Image src={company.rightLogoData} alt={`${company.name} right logo`} width={230} height={90} unoptimized style={{ width: "auto", maxWidth: "100%", maxHeight: 85, objectFit: "contain" }} /> : null}
        {template.heading ? <div dir="auto" style={{ color: template.color, fontWeight: 800, fontSize: 26, lineHeight: 1.2, overflowWrap: "anywhere" }}>{template.heading}</div> : null}
        {template.subtitle ? <div dir="auto" style={{ color: template.color, fontWeight: 700, fontSize: 14, overflowWrap: "anywhere" }}>{template.subtitle}</div> : null}
      </div>
    </div>
    {details.length ? <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "5px 24px", paddingTop: 12, fontSize: 13, fontWeight: 700, overflowWrap: "anywhere" }}>
      {company.phone ? <span>☎ {company.phone}</span> : null}
      {company.email ? <span>✉ {company.email}</span> : null}
      {template.website ? <span>◉ {template.website}</span> : null}
    </div> : null}
  </header>;
}

export function LetterheadStamp({ template, company, onMove }: { template: LetterheadTemplate; company: LetterheadCompany; onMove?: (left: number, top: number) => void }) {
  if (!template.showStamp || !company.stampData) return null;
  const begin = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!onMove || event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX, startY = event.clientY;
    const page = event.currentTarget.closest<HTMLElement>(".letterhead-page");
    const pixelsPerMm = (page?.getBoundingClientRect().width || 794) / 210;
    const move = (next: PointerEvent) => onMove(
      Math.max(0, Math.min(170, Math.round(template.stampLeft + (next.clientX - startX) / pixelsPerMm))),
      Math.max(0, Math.min(260, Math.round(template.stampTop + (next.clientY - startY) / pixelsPerMm))),
    );
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
    window.addEventListener("pointercancel", stop, { once: true });
  };
  return <div className="letterhead-stamp" onPointerDown={begin} title={onMove ? "Drag stamp to move" : undefined}
    style={{ position: "absolute", left: `${template.stampLeft}mm`, top: `${template.stampTop}mm`, cursor: onMove ? "grab" : undefined, touchAction: "none", zIndex: 2 }}>
    <Image src={company.stampData} alt="Company stamp" width={130} height={95} unoptimized style={{ maxWidth: "32mm", maxHeight: "23mm", objectFit: "contain" }} />
  </div>;
}

export function LetterheadPage({ template, company, onMoveStamp }: { template: LetterheadTemplate; company: LetterheadCompany; onMoveStamp?: (left: number, top: number) => void }) {
  const address = [company.addressLine1, company.addressLine2, company.city, company.country].filter(Boolean).join(", ");
  return <article className="letterhead-page" style={{ boxSizing: "border-box", position: "relative", width: "210mm", minHeight: "297mm", padding: "13mm", background: "#fff", color: "#24282d", fontFamily: "Arial, sans-serif", fontSize: 13, overflow: "hidden" }}>
    <LetterheadBrand template={template} company={company} />
    <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", lineHeight: 1.6, minHeight: "190mm" }}>{template.body}</div>
    {template.footer ? <footer style={{ borderTop: `1px solid ${template.color}`, paddingTop: 8, color: template.color, textAlign: "center", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{template.footer}</footer> : null}
    {address ? <p style={{ textAlign: "center", fontSize: 11, marginTop: 10, overflowWrap: "anywhere" }}>{address}</p> : null}
    <LetterheadStamp template={template} company={company} onMove={onMoveStamp} />
  </article>;
}
