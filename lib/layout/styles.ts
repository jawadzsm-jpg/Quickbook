import { contentBox, type Layout } from "./schema";

export const fontStacks: Record<Layout["theme"]["font"], string> = {
  Arial: "Arial, 'Helvetica Neue', Helvetica, sans-serif",
  Helvetica: "Helvetica, Arial, sans-serif",
  Verdana: "Verdana, Geneva, sans-serif",
  Georgia: "Georgia, 'Times New Roman', serif",
  "Times New Roman": "'Times New Roman', Times, serif",
};

/**
 * Document CSS shared by the editor canvas, the print frame and PDF output.
 * Every rule is scoped to `.lb-doc` and uses explicit colours, so the paper looks the same in the app's
 * light/dark themes and in print. Sizes are in mm/pt so screen and paper share one geometry.
 */
export function layoutCss(layout: Layout) {
  const box = contentBox(layout.page);
  const { theme } = layout;
  return `
.lb-doc{--lb-accent:${theme.accent};--lb-text:${theme.text};--lb-border:${theme.border};--lb-size:${theme.baseSizePt}pt;
  position:relative;box-sizing:border-box;width:${box.width}mm;color:var(--lb-text);background:#fff;font-family:${fontStacks[theme.font]};
  font-size:var(--lb-size);line-height:1.35;-webkit-print-color-adjust:exact;print-color-adjust:exact;text-align:left;}
.lb-doc *,.lb-doc *::before,.lb-doc *::after{box-sizing:border-box;border-color:var(--lb-border);}
.lb-doc p{margin:0}
.lb-frame{width:100%;border-collapse:collapse;border:0}
.lb-frame>thead,.lb-frame>tfoot,.lb-frame>tbody{border:0}
.lb-frame>*>tr>td{padding:0;border:0;vertical-align:top}
.lb-row{display:grid;align-items:stretch;min-width:0}
.lb-row.lb-keep{break-inside:avoid;page-break-inside:avoid}
.lb-section{min-width:0;overflow-wrap:anywhere;word-break:normal}
.lb-section.lb-avoid{break-inside:avoid;page-break-inside:avoid}
.lb-border-box{border:var(--lb-section-border,0.75pt solid var(--lb-border));border-radius:1mm}
.lb-border-top{border-top:var(--lb-section-border,0.75pt solid var(--lb-border))}
.lb-border-bottom{border-bottom:var(--lb-section-border,0.75pt solid var(--lb-border))}
.lb-valign-middle,.lb-valign-bottom{display:flex;flex-direction:column}
.lb-valign-middle{justify-content:center}
.lb-valign-bottom{justify-content:flex-end}
.lb-items.lb-grid-grid th,.lb-items.lb-grid-grid td{border:0.5pt solid var(--lb-border)}
.lb-items.lb-grid-none td{border-bottom:0}
.lb-label{font-size:0.82em;font-weight:700;color:var(--lb-accent);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:1mm}
.lb-muted{color:#475569}
.lb-pre{white-space:pre-wrap}
.lb-header{display:flex;align-items:center;gap:4mm}
.lb-header-main{flex:1;min-width:0}
.lb-company{font-size:1.6em;font-weight:700;color:var(--lb-accent);line-height:1.15}
.lb-logo{display:block;object-fit:contain;max-width:60mm}
.lb-title{font-weight:700;color:var(--lb-accent);line-height:1.15}
.lb-details{display:grid;gap:2mm 4mm}
.lb-details dt{font-size:0.82em;color:#475569;margin:0}
.lb-details dd{margin:0;font-weight:600}
.lb-items{width:100%;border-collapse:collapse;table-layout:fixed}
.lb-items th{background:var(--lb-accent);color:#fff;font-weight:700;font-size:0.9em;padding:1.4mm 1.6mm;text-align:left;vertical-align:bottom}
.lb-items td{padding:1.4mm 1.6mm;border-bottom:0.5pt solid var(--lb-border);vertical-align:top}
.lb-items tr{break-inside:avoid;page-break-inside:avoid}
.lb-items.lb-zebra tbody tr:nth-child(even) td{background:#f1f5f9}
.lb-items .lb-num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.lb-items.lb-no-repeat thead{display:table-row-group}
.lb-totals{border-collapse:collapse;margin-left:auto}
.lb-totals td{padding:1mm 1.6mm;border-bottom:0.5pt solid var(--lb-border)}
.lb-totals td:last-child{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.lb-totals tr.lb-grand td{font-weight:700;font-size:1.1em;border-top:1pt solid var(--lb-text);border-bottom:0}
.lb-signature{display:inline-block;margin-top:14mm;border-top:0.75pt solid var(--lb-text);padding-top:1mm}
.lb-image{display:block;max-width:100%;object-fit:contain}
.lb-align-center .lb-image,.lb-align-center .lb-signature{margin-left:auto;margin-right:auto}
.lb-align-right .lb-image{margin-left:auto}
.lb-align-right .lb-totals{margin-left:auto}
.lb-align-left .lb-totals{margin-left:0;margin-right:auto}
.lb-align-center .lb-totals{margin-left:auto;margin-right:auto}
.lb-empty{color:#94a3b8;font-style:italic}
.lb-overlay{position:absolute;display:flex;align-items:center;justify-content:center;overflow:hidden;pointer-events:none}
.lb-overlay img{width:100%;height:100%;object-fit:contain}
.lb-overlay-text{white-space:pre-wrap;text-align:center}
.lb-bank-stamp{display:block;max-width:32mm;max-height:22mm;margin-top:2mm;object-fit:contain}
.lb-stamp{border:0.9mm solid var(--lb-accent);border-radius:2mm;color:var(--lb-accent);font-weight:800;font-size:1.6em;text-transform:uppercase;letter-spacing:0.08em}
`;
}

/** Page rules for printing: paper size, margins and (where supported) page numbers in the bottom margin. */
export function layoutPageCss(layout: Layout) {
  const { page } = layout;
  const { margins } = page;
  const numbers = page.pageNumbers ? `@bottom-right{content:"Page " counter(page) " of " counter(pages);font:8pt Arial,sans-serif;color:#64748b}` : "";
  return `@page{size:${page.size} ${page.orientation};margin:${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm;${numbers}}
html,body{margin:0;padding:0;background:#fff}
.lb-overlay.lb-every-page{position:fixed}
`;
}
