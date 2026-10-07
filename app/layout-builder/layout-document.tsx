/* eslint-disable @next/next/no-img-element -- documents are printed from static markup with inline data-URL images; next/image cannot render there. */
import type { CSSProperties, ReactNode } from "react";
import type { DocumentData } from "@/lib/layout/document-data";
import { PageStamps, type MovePageStamp } from "../page-stamps";
import { contentBox, type Layout, type LineColumn, type Overlay, type Row, type Section } from "@/lib/layout/schema";
import { fontStacks } from "@/lib/layout/styles";
import { arabicColumnLabel, arabicLabel, arabicTitle } from "@/lib/layout/arabic-labels";

// Pure renderer shared by the editor canvas, the print frame and PDF output. No hooks or browser APIs,
// so it can also be rendered to static markup for printing.

export type RenderMode = "screen" | "print";

const money = (value: number) => value.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numeric: ReadonlySet<LineColumn> = new Set(["index", "quantity", "unitPrice", "subtotal", "vatRate", "vatAmount", "total"]);

export function sectionStyle(section: Section, baseSizePt: number): CSSProperties {
  const { style } = section;
  const size = `${Math.round(baseSizePt * style.fontScale * 100) / 100}pt`;
  return {
    textAlign: style.align, padding: `${style.paddingMm}mm`, background: style.background || undefined,
    fontSize: size, ...(style.fitRow ? { "--lb-base-size": size } : {}), fontWeight: style.bold ? 700 : undefined,
    fontStyle: style.italic ? "italic" : undefined, textDecoration: style.underline ? "underline" : undefined,
    color: style.textColor || undefined, fontFamily: style.font ? fontStacks[style.font] : undefined,
    ...(style.border !== "none" ? { "--lb-section-border": `${style.borderWidthPt}pt solid ${style.borderColor || "var(--lb-border)"}` } : {}),
  } as CSSProperties;
}

export function sectionClass(section: Section) {
  const border = section.style.border === "none" ? "" : ` lb-border-${section.style.border}`;
  const valign = section.style.verticalAlign === "top" ? "" : ` lb-valign-${section.style.verticalAlign}`;
  return `lb-section lb-align-${section.style.align}${section.avoidBreakInside ? " lb-avoid" : ""}${border}${valign}${section.style.fitRow ? " lb-fit" : ""}`;
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

/**
 * Free text for notes, terms and text blocks. Each line picks its own direction, so Arabic lines read right-to-left
 * beside English ones; "**bold**" prints bold and lines starting with "#" print as headings (the marks are hidden).
 */
export function RichText({ text }: { text: string }) {
  const inline = (line: string) => line.split(/\*\*(.+?)\*\*/g).map((part, index) => index % 2 ? <strong key={index}>{part}</strong> : part);
  return <div className="lb-rich">{text.split("\n").map((line, index) => {
    const heading = /^\s*#{1,6}\s+/.exec(line);
    if (heading) return <p key={index} dir="auto" className="lb-rich-line lb-rich-heading">{inline(line.slice(heading[0].length))}</p>;
    return <p key={index} dir="auto" className="lb-rich-line">{line.trim() ? inline(line) : "\u00a0"}</p>;
  })}</div>;
}

/** The body of one section, without its wrapper. */
export function SectionBody({ section, data, theme }: { section: Section; data: DocumentData; theme?: Layout["theme"] }): ReactNode {
  // Bilingual labels: English on the left, Arabic on the right (theme setting, on by default).
  const arabic = theme?.arabicLabels ?? false;
  const bilingual = (english: ReactNode, key: string) => arabic && arabicLabel(key) ? <span className="lb-bi"><span>{english}</span><span className="lb-ar" dir="rtl" lang="ar">{arabicLabel(key)}</span></span> : english;
  // Optional uploaded currency symbol image (e.g. the UAE dirham sign) replaces the "AED" code in totals.
  const currencyMark: ReactNode = theme?.currencySymbol && data.currency.toUpperCase() === "AED" ? <img className="lb-currency-symbol" src={theme.currencySymbol} alt="AED" /> : data.currency;
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
    case "title": return <p className="lb-title">{arabic && arabicTitle(section.props.text) ? <span className="lb-title-bi"><span>{section.props.text}</span><span className="lb-ar" dir="rtl" lang="ar">{arabicTitle(section.props.text)}</span></span> : section.props.text}</p>;
    case "billTo": return <><p className="lb-label">{bilingual(section.props.label, "billTo")}</p><Lines lines={data.billTo} empty="Customer details" /></>;
    case "shipTo": return <><p className="lb-label">{bilingual(section.props.label, "shipTo")}</p><Lines lines={data.shipTo} empty="—" /></>;
    case "details": return <dl className={`lb-details${section.props.cellBorder ? " lb-details-boxed" : ""}`} style={{ gridTemplateColumns: `repeat(${section.props.columns}, minmax(0, 1fr))`, ...(section.props.cellBorder && section.props.cellBorderColor ? { "--lb-detail-border": section.props.cellBorderColor } : {}) } as CSSProperties}>
      {section.props.fields.map((field) => <div key={field.key}><dt>{bilingual(field.label, field.key)}</dt><dd>{data.details[field.key] || "—"}</dd></div>)}
    </dl>;
    case "lineItems": {
      const { columns } = section.props;
      const totalWidth = columns.reduce((sum, column) => sum + column.width, 0) || 1;
      const heading: CSSProperties = { background: section.props.headingBackground || undefined, color: section.props.headingTextColor || undefined, fontWeight: section.props.headingBold ? 700 : 400 };
      return <table className={`lb-items lb-grid-${section.props.gridLines}${section.props.zebra ? " lb-zebra" : ""}${section.props.repeatHeading ? "" : " lb-no-repeat"}`}>
        <colgroup>{columns.map((column) => <col key={column.key} style={{ width: `${(column.width / totalWidth) * 100}%` }} />)}</colgroup>
        <thead><tr>{columns.map((column) => <th key={column.key} className={numeric.has(column.key) ? "lb-num" : undefined} style={heading}>{column.label}{arabic && arabicColumnLabel(column.key) ? <span className="lb-th-ar" dir="rtl" lang="ar">{arabicColumnLabel(column.key)}</span> : null}</th>)}</tr></thead>
        <tbody>{data.lines.length ? data.lines.map((_, index) => <tr key={index}>{columns.map((column) => <td key={column.key} className={numeric.has(column.key) ? "lb-num" : column.key === "description" || column.key === "comments" || column.key === "serialNumber" ? "lb-pre" : undefined}>{lineValue(data, column.key, index)}</td>)}</tr>)
          : <tr><td colSpan={columns.length} className="lb-empty">No lines</td></tr>}</tbody>
      </table>;
    }
    case "totals": return <table className="lb-totals" style={{ width: `${section.props.widthPercent}%` }}><tbody>
      {section.props.rows.map((row) => <tr key={row.key} className={row.key === "total" || row.key === "balance" ? "lb-grand" : undefined}><td>{bilingual(<>{row.label} ({currencyMark})</>, row.key)}</td><td>{money(data.totals[row.key])}</td></tr>)}
    </tbody></table>;
    case "notes": return <><p className="lb-label">{section.props.label}</p>{section.props.text || data.message ? <RichText text={section.props.text || data.message} /> : <p className="lb-empty">No message</p>}</>;
    case "terms": return <><p className="lb-label">{section.props.label}</p>{section.props.text || data.terms ? <RichText text={section.props.text || data.terms} /> : <p className="lb-empty">No terms</p>}</>;
    case "bankDetails": {
      const { bank } = data.company;
      return <><p className="lb-label">{section.props.label}</p><Lines lines={[bank.name, bank.accountName && `Account name: ${bank.accountName}`, bank.accountNumber && `Account no.: ${bank.accountNumber}`, bank.iban && `IBAN: ${bank.iban}`, bank.swift && `SWIFT: ${bank.swift}`].filter(Boolean) as string[]} empty="Add bank details in Company Setup" />{bank.stamp && <img className="lb-bank-stamp" src={bank.stamp} alt="" />}</>;
    }
    case "signature": return <span className="lb-signature" style={{ width: `${section.props.lineWidthMm}mm` }}>{section.props.label}</span>;
    case "text": return <RichText text={section.props.text} />;
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
      ? <div key={section.id} className={sectionClass(section)} style={sectionStyle(section, layout.theme.baseSizePt)}><SectionBody theme={layout.theme} section={section} data={data} /></div>
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

export type MoveStamp = MovePageStamp;

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
      <tbody><tr><td>{group("none")}</td></tr></tbody>
    </table>
    {data.stamps?.length ? <PageStamps stamps={data.stamps} widthMm={contentBox(layout.page).width} heightMm={contentBox(layout.page).height} mm={(value) => `${value}mm`} onMove={mode === "screen" ? onMoveStamp : undefined} /> : null}
    {layout.overlays.filter((overlay) => overlay[mode]).map((overlay) => <div key={overlay.id} className={`lb-overlay${overlay.pages === "all" ? " lb-every-page" : ""}`} style={overlayStyle(overlay, layout)}><OverlayBody overlay={overlay} data={data} /></div>)}
  </div>;
}
