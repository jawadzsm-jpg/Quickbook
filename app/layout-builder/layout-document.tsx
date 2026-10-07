/* eslint-disable @next/next/no-img-element -- documents are printed from static markup with inline data-URL images; next/image cannot render there. */
import type { CSSProperties, ReactNode } from "react";
import type { DocumentData, DocumentStamp } from "@/lib/layout/document-data";
import { contentBox, type Layout, type LineColumn, type Overlay, type Row, type Section } from "@/lib/layout/schema";
import { fontStacks } from "@/lib/layout/styles";

// Pure renderer shared by the editor canvas, the print frame and PDF output. No hooks or browser APIs,
// so it can also be rendered to static markup for printing.

export type RenderMode = "screen" | "print";

const money = (value: number) => value.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numeric: ReadonlySet<LineColumn> = new Set(["index", "quantity", "unitPrice", "subtotal", "vatRate", "vatAmount", "total"]);

export function sectionStyle(section: Section, baseSizePt: number): CSSProperties {
  const { style } = section;
  return {
    textAlign: style.align, padding: `${style.paddingMm}mm`, background: style.background || undefined,
    fontSize: `${Math.round(baseSizePt * style.fontScale * 100) / 100}pt`, fontWeight: style.bold ? 700 : undefined,
    fontStyle: style.italic ? "italic" : undefined, textDecoration: style.underline ? "underline" : undefined,
    color: style.textColor || undefined, fontFamily: style.font ? fontStacks[style.font] : undefined,
    ...(style.border !== "none" ? { "--lb-section-border": `${style.borderWidthPt}pt solid ${style.borderColor || "var(--lb-border)"}` } : {}),
  } as CSSProperties;
}

export function sectionClass(section: Section) {
  const border = section.style.border === "none" ? "" : ` lb-border-${section.style.border}`;
  const valign = section.style.verticalAlign === "top" ? "" : ` lb-valign-${section.style.verticalAlign}`;
  return `lb-section lb-align-${section.style.align}${section.avoidBreakInside ? " lb-avoid" : ""}${border}${valign}`;
}

function Lines({ lines, empty }: { lines: string[]; empty: string }) {
  const filled = lines.filter((line) => line.trim());
  return filled.length ? <>{filled.map((line, index) => <p key={index}>{line}</p>)}</> : <p className="lb-empty">{empty}</p>;
}

function lineValue(data: DocumentData, column: LineColumn, index: number) {
  const line = data.lines[index];
  switch (column) {
    case "index": return String(index + 1);
    case "quantity": return line.quantity.toLocaleString("en", { maximumFractionDigits: 3 });
    case "unitPrice": case "subtotal": case "vatAmount": case "total": return money(line[column]);
    case "vatRate": return `${line.vatRate}%`;
    default: return line[column];
  }
}

/** The body of one section, without its wrapper. */
export function SectionBody({ section, data }: { section: Section; data: DocumentData }): ReactNode {
  switch (section.type) {
    case "companyHeader": {
      const { props } = section; const { company } = data;
      const logo = (src: string, side: string) => src ? <img className="lb-logo" src={src} alt={`${company.name} ${side} logo`} style={{ height: `${props.logoHeightMm}mm` }} /> : null;
      return <div className="lb-header">
        {props.showLeftLogo && logo(company.leftLogo, "left")}
        <div className="lb-header-main">
          {props.showName && <p className="lb-company">{props.nameText || company.name}</p>}
          {props.showAddress && (props.addressText ? props.addressText.split("\n") : company.addressLines).map((line, index) => <p key={index} className="lb-muted">{line}</p>)}
          {(props.showPhone && company.phone) || (props.showEmail && company.email) ? <p className="lb-muted">{[props.showPhone && company.phone && `${props.phoneLabel} ${company.phone}`.trim(), props.showEmail && company.email && `${props.emailLabel} ${company.email}`.trim()].filter(Boolean).join(" · ")}</p> : null}
          {props.showTrn && company.trn && <p className="lb-muted">{`${props.trnLabel} ${company.trn}`.trim()}</p>}
        </div>
        {props.showRightLogo && logo(company.rightLogo, "right")}
      </div>;
    }
    case "title": return <p className="lb-title">{section.props.text}</p>;
    case "billTo": return <><p className="lb-label">{section.props.label}</p><Lines lines={data.billTo} empty="Customer details" /></>;
    case "shipTo": return <><p className="lb-label">{section.props.label}</p><Lines lines={data.shipTo} empty="—" /></>;
    case "details": return <dl className="lb-details" style={{ gridTemplateColumns: `repeat(${section.props.columns}, minmax(0, 1fr))` }}>
      {section.props.fields.map((field) => <div key={field.key}><dt>{field.label}</dt><dd>{data.details[field.key] || "—"}</dd></div>)}
    </dl>;
    case "lineItems": {
      const { columns } = section.props;
      const totalWidth = columns.reduce((sum, column) => sum + column.width, 0) || 1;
      const heading: CSSProperties = { background: section.props.headingBackground || undefined, color: section.props.headingTextColor || undefined, fontWeight: section.props.headingBold ? 700 : 400 };
      return <table className={`lb-items lb-grid-${section.props.gridLines}${section.props.zebra ? " lb-zebra" : ""}${section.props.repeatHeading ? "" : " lb-no-repeat"}`}>
        <colgroup>{columns.map((column) => <col key={column.key} style={{ width: `${(column.width / totalWidth) * 100}%` }} />)}</colgroup>
        <thead><tr>{columns.map((column) => <th key={column.key} className={numeric.has(column.key) ? "lb-num" : undefined} style={heading}>{column.label}</th>)}</tr></thead>
        <tbody>{data.lines.length ? data.lines.map((_, index) => <tr key={index}>{columns.map((column) => <td key={column.key} className={numeric.has(column.key) ? "lb-num" : column.key === "description" || column.key === "comments" || column.key === "serialNumber" ? "lb-pre" : undefined}>{lineValue(data, column.key, index)}</td>)}</tr>)
          : <tr><td colSpan={columns.length} className="lb-empty">No lines</td></tr>}</tbody>
      </table>;
    }
    case "totals": return <table className="lb-totals" style={{ width: `${section.props.widthPercent}%` }}><tbody>
      {section.props.rows.map((row) => <tr key={row.key} className={row.key === "total" || row.key === "balance" ? "lb-grand" : undefined}><td>{row.label} ({data.currency})</td><td>{money(data.totals[row.key])}</td></tr>)}
    </tbody></table>;
    case "notes": return <><p className="lb-label">{section.props.label}</p><p className="lb-pre">{section.props.text || data.message || <span className="lb-empty">No message</span>}</p></>;
    case "terms": return <><p className="lb-label">{section.props.label}</p><p className="lb-pre">{section.props.text || data.terms || <span className="lb-empty">No terms</span>}</p></>;
    case "bankDetails": {
      const { bank } = data.company;
      return <><p className="lb-label">{section.props.label}</p><Lines lines={[bank.name, bank.accountName && `Account name: ${bank.accountName}`, bank.accountNumber && `Account no.: ${bank.accountNumber}`, bank.iban && `IBAN: ${bank.iban}`, bank.swift && `SWIFT: ${bank.swift}`].filter(Boolean) as string[]} empty="Add bank details in Company Setup" />{bank.stamp && <img className="lb-bank-stamp" src={bank.stamp} alt="" />}</>;
    }
    case "signature": return <span className="lb-signature" style={{ width: `${section.props.lineWidthMm}mm` }}>{section.props.label}</span>;
    case "text": return <p className="lb-pre">{section.props.text}</p>;
    case "image": return section.props.src ? <img className="lb-image" src={section.props.src} alt="" style={{ maxHeight: `${section.props.heightMm}mm` }} /> : <p className="lb-empty">Choose an image</p>;
    case "spacer": return <div style={{ height: `${section.props.heightMm}mm` }} />;
    case "divider": return <div style={{ borderTop: `${section.props.thicknessPt}pt solid var(--lb-accent)` }} />;
    case "letterBody": return <p className="lb-pre">{section.props.text}</p>;
  }
}

export const rowStyle = (row: Row): CSSProperties => ({ gridTemplateColumns: row.ratios.map((ratio) => `minmax(0, ${ratio}fr)`).join(" "), columnGap: `${row.gapMm}mm`, marginTop: `${row.spaceBeforeMm}mm` });

function RowView({ row, layout, data, mode }: { row: Row; layout: Layout; data: DocumentData; mode: RenderMode }) {
  const visible = row.sections.filter((section) => section[mode]);
  if (!visible.length) return null;
  // Hidden sections keep their column so the remaining ones do not stretch across the row.
  return <div className={`lb-row${row.keepTogether ? " lb-keep" : ""}`} style={rowStyle(row)}>
    {row.sections.map((section) => section[mode]
      ? <div key={section.id} className={sectionClass(section)} style={sectionStyle(section, layout.theme.baseSizePt)}><SectionBody section={section} data={data} /></div>
      : <div key={section.id} />)}
  </div>;
}

export function overlayStyle(overlay: Overlay, layout: Layout): CSSProperties {
  // Overlays are stored in page coordinates; the document box starts at the top-left margin.
  return {
    left: `${overlay.xMm - layout.page.margins.left}mm`, top: `${overlay.yMm - layout.page.margins.top}mm`,
    width: `${overlay.widthMm}mm`, height: `${overlay.heightMm}mm`, opacity: overlay.opacity,
    transform: overlay.rotateDeg ? `rotate(${overlay.rotateDeg}deg)` : undefined,
  };
}

export function OverlayBody({ overlay, data }: { overlay: Overlay; data: DocumentData }) {
  if (overlay.kind === "image") return overlay.src ? <img src={overlay.src} alt="" /> : null;
  if (overlay.kind === "stamp" && overlay.src) return <img src={overlay.src} alt="" />;
  const text = overlay.text.replaceAll("{status}", data.status || "");
  return <span className={overlay.kind === "stamp" ? "lb-stamp lb-overlay-text" : "lb-overlay-text"} style={overlay.kind === "stamp" ? { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" } : undefined}>{text}</span>;
}

export type MoveStamp = (kind: DocumentStamp["kind"], left: number, top: number) => void;
const STAMP_MAX_TOP = 20;

/**
 * Company and bank stamps in a flowing area after the body, so they never cover the totals. On screen each
 * stamp can be dragged within the area; printed markup simply places them.
 */
function StampArea({ stamps, widthMm, onMove }: { stamps: DocumentStamp[]; widthMm: number; onMove?: MoveStamp }) {
  const maxLeft = Math.max(0, Math.floor(widthMm - 32));
  const begin = (stamp: DocumentStamp, event: React.PointerEvent<HTMLDivElement>) => {
    if (!onMove || event.button !== 0) return;
    event.preventDefault();
    const area = event.currentTarget.parentElement;
    const pixelsPerMm = (area?.getBoundingClientRect().width || widthMm * 96 / 25.4) / widthMm;
    const startX = event.clientX, startY = event.clientY;
    const move = (next: PointerEvent) => onMove(stamp.kind,
      Math.max(0, Math.min(maxLeft, Math.round(stamp.left + (next.clientX - startX) / pixelsPerMm))),
      Math.max(0, Math.min(STAMP_MAX_TOP, Math.round(stamp.top + (next.clientY - startY) / pixelsPerMm))));
    const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); window.removeEventListener("pointercancel", stop); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  };
  return <div className="lb-stamp-area" style={{ height: `${Math.max(...stamps.map((stamp) => Math.min(STAMP_MAX_TOP, stamp.top))) + 25}mm` }}>
    {stamps.map((stamp) => <div key={stamp.kind} className="lb-stamp-image" title={onMove ? "Drag stamp to move" : undefined} onPointerDown={onMove ? (event) => begin(stamp, event) : undefined}
      style={{ left: `${Math.min(maxLeft, stamp.left)}mm`, top: `${Math.min(STAMP_MAX_TOP, stamp.top)}mm`, cursor: onMove ? "grab" : undefined }}>
      <img src={stamp.src} alt={stamp.kind === "bank" ? "Bank stamp" : "Company stamp"} />
    </div>)}
  </div>;
}

/**
 * The full document. Repeating rows go in the table header/footer groups, which browsers repeat on
 * every printed page; body rows flow and break between rows, table lines and avoid-break sections.
 */
export function LayoutDocument({ layout, data, mode, onMoveStamp }: { layout: Layout; data: DocumentData; mode: RenderMode; onMoveStamp?: MoveStamp }) {
  const group = (repeat: Row["repeat"]) => layout.rows.filter((row) => row.repeat === repeat).map((row) => <RowView key={row.id} row={row} layout={layout} data={data} mode={mode} />);
  const header = group("header");
  const footer = group("footer");
  return <div className="lb-doc">
    <table className="lb-frame">
      {header.length > 0 && <thead><tr><td>{header}</td></tr></thead>}
      {footer.length > 0 && <tfoot><tr><td>{footer}</td></tr></tfoot>}
      <tbody><tr><td>{group("none")}{data.stamps?.length ? <StampArea stamps={data.stamps} widthMm={contentBox(layout.page).width} onMove={mode === "screen" ? onMoveStamp : undefined} /> : null}</td></tr></tbody>
    </table>
    {layout.overlays.filter((overlay) => overlay[mode]).map((overlay) => <div key={overlay.id} className={`lb-overlay${overlay.pages === "all" ? " lb-every-page" : ""}`} style={overlayStyle(overlay, layout)}><OverlayBody overlay={overlay} data={data} /></div>)}
  </div>;
}
