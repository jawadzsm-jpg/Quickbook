"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FileSpreadsheet, FileText, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type ExportTable = { title: string; headers: string[]; rows: string[][] };

function visible(element: Element) {
  const html = element as HTMLElement;
  const style = window.getComputedStyle(html);
  const rect = html.getBoundingClientRect();
  return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
}

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function nearestTitle(table: HTMLTableElement, index: number) {
  let node: Element | null = table.parentElement;
  while (node && node !== document.body) {
    const heading = node.querySelector(":scope > h1, :scope > h2, :scope > h3, :scope > div > h1, :scope > div > h2, :scope > div > h3");
    if (heading && visible(heading)) {
      const text = cleanText(heading.textContent ?? "");
      if (text) return text;
    }
    node = node.parentElement;
  }
  const pageHeading = Array.from(document.querySelectorAll("main h1, main h2, [data-slot='sidebar-inset'] h1, [data-slot='sidebar-inset'] h2"))
    .find((heading) => visible(heading) && cleanText(heading.textContent ?? ""));
  return pageHeading ? cleanText(pageHeading.textContent ?? "") : `Table ${index + 1}`;
}

function activeDialog() {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]')).filter(visible).at(-1) ?? null;
}

function extractVisibleTables(): ExportTable[] {
  // A modal export must never include tables from the page behind it.
  const root = activeDialog() ?? document;
  const tables = Array.from(root.querySelectorAll("table"))
    .filter((table): table is HTMLTableElement => table instanceof HTMLTableElement && visible(table));

  return tables.map((table, index) => {
    const headerCells = Array.from(table.querySelectorAll("thead th"));
    let headers = headerCells.map((cell) => cleanText(cell.textContent ?? ""));
    const bodyRows = Array.from(table.querySelectorAll("tbody tr"));
    let rows = bodyRows.map((row) => Array.from(row.querySelectorAll("th,td")).map((cell) => cleanText(cell.textContent ?? "")));

    if (headers.length === 0) {
      const first = table.querySelector("tr");
      if (first) {
        headers = Array.from(first.querySelectorAll("th,td")).map((cell) => cleanText(cell.textContent ?? ""));
        const allRows = Array.from(table.querySelectorAll("tr"));
        rows = allRows.slice(1).map((row) => Array.from(row.querySelectorAll("th,td")).map((cell) => cleanText(cell.textContent ?? "")));
      }
    }

    const width = Math.max(headers.length, ...rows.map((row) => row.length), 0);
    if (headers.length < width) headers = [...headers, ...Array.from({ length: width - headers.length }, (_, i) => `Column ${headers.length + i + 1}`)];
    rows = rows.map((row) => [...row, ...Array(Math.max(0, width - row.length)).fill("")]);
    return { title: nearestTitle(table, index), headers, rows };
  }).filter((table) => table.headers.length > 0 || table.rows.length > 0);
}

function fileBase(tables: ExportTable[]) {
  const raw = tables[0]?.title || "comnet-export";
  const safe = raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const date = new Date().toISOString().slice(0, 10);
  return `${safe || "comnet-export"}-${date}`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value: string) {
  let safe = value;
  if (/^[=+\-@]/.test(safe)) safe = `'${safe}`;
  return `"${safe.replaceAll('"', '""')}"`;
}

function exportCsv(tables: ExportTable[]) {
  const lines: string[] = [];
  tables.forEach((table, index) => {
    if (index) lines.push("");
    lines.push(csvCell(table.title));
    if (table.headers.length) lines.push(table.headers.map(csvCell).join(","));
    table.rows.forEach((row) => lines.push(row.map(csvCell).join(",")));
  });
  downloadBlob(new Blob(["\uFEFF", lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), `${fileBase(tables)}.csv`);
}

function htmlEscape(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function exportExcel(tables: ExportTable[]) {
  const sections = tables.map((table) => `<h2>${htmlEscape(table.title)}</h2><table border="1"><thead><tr>${table.headers.map((header) => `<th>${htmlEscape(header)}</th>`).join("")}</tr></thead><tbody>${table.rows.map((row) => `<tr>${row.map((cell) => `<td>${htmlEscape(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`).join("<br/>");
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif}table{border-collapse:collapse;margin-bottom:20px}th,td{padding:6px 8px;text-align:left}th{font-weight:700;background:#f3f4f6}</style></head><body>${sections}</body></html>`;
  downloadBlob(new Blob(["\uFEFF", html], { type: "application/vnd.ms-excel;charset=utf-8" }), `${fileBase(tables)}.xls`);
}

function asciiPdfText(value: string) {
  return value.normalize("NFKD").replace(/[^\x20-\x7E]/g, "?").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function pdfBytes(lines: string[]) {
  const encoder = new TextEncoder();
  const perPage = 52;
  const pages = Array.from({ length: Math.max(1, Math.ceil(lines.length / perPage)) }, (_, index) => lines.slice(index * perPage, (index + 1) * perPage));
  const objects: string[] = [];
  const pageIds: number[] = [];
  const fontId = 3;

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  pages.forEach((page, pageIndex) => {
    const pageId = 4 + pageIndex * 2;
    const contentId = pageId + 1;
    pageIds.push(pageId);
    const text = page.map((line) => `(${asciiPdfText(line.slice(0, 115))}) Tj T*`).join("\n");
    const stream = `BT\n/F1 9 Tf\n40 802 Td\n12 TL\n${text}\nET`;
    const length = encoder.encode(stream).length;
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${length} >>\nstream\n${stream}\nendstream`;
  });
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  const maxId = objects.length - 1;
  let pdf = "%PDF-1.4\n%âãÏÓ\n";
  const offsets = Array(maxId + 1).fill(0);
  for (let id = 1; id <= maxId; id++) {
    offsets[id] = encoder.encode(pdf).length;
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = encoder.encode(pdf).length;
  pdf += `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= maxId; id++) pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return encoder.encode(pdf);
}

function exportPdf(tables: ExportTable[]) {
  const lines: string[] = ["ComNet Enterprise Accounting", `Exported: ${new Date().toLocaleString("en-AE")}`, ""];
  tables.forEach((table, index) => {
    if (index) lines.push("", "----------------------------------------", "");
    lines.push(table.title, "");
    if (table.headers.length) lines.push(table.headers.join(" | "), "-".repeat(Math.min(110, Math.max(20, table.headers.join(" | ").length))));
    table.rows.forEach((row) => lines.push(row.join(" | ")));
  });
  downloadBlob(new Blob([pdfBytes(lines)], { type: "application/pdf" }), `${fileBase(tables)}.pdf`);
}

export function DataExportToolbar() {
  const [hasTables, setHasTables] = useState(false);
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const check = () => {
      const dialog = activeDialog();
      setHasTables(extractVisibleTables().length > 0);
      setTarget(dialog ? dialog.querySelector<HTMLElement>('[data-export-slot="dialog"]') : document.querySelector<HTMLElement>('[data-export-slot="page"]'));
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class", "hidden"] });
    window.addEventListener("resize", check);
    return () => { observer.disconnect(); window.removeEventListener("resize", check); };
  }, []);

  if (!hasTables || !target) return null;

  function run(kind: "excel" | "pdf" | "csv") {
    const tables = extractVisibleTables();
    if (!tables.length) return toast.error("No report or transaction table is visible to export.");
    try {
      if (kind === "excel") exportExcel(tables);
      if (kind === "pdf") exportPdf(tables);
      if (kind === "csv") exportCsv(tables);
      toast.success(`${kind === "excel" ? "Excel" : kind.toUpperCase()} export created`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not export this table.");
    }
  }

  const toolbar = <div className="flex flex-wrap items-center justify-end gap-2 print:hidden" role="group" aria-label="Export current report or transaction table">
    <span className="px-2 text-xs font-semibold text-muted-foreground">Export</span>
    <Button type="button" size="sm" variant="outline" className="shadow-sm" onClick={() => run("excel")}><FileSpreadsheet className="size-4" />Excel</Button>
    <Button type="button" size="sm" variant="outline" className="shadow-sm" onClick={() => run("pdf")}><FileText className="size-4" />PDF</Button>
    <Button type="button" size="sm" variant="outline" className="shadow-sm" onClick={() => run("csv")}><Table2 className="size-4" />CSV</Button>
  </div>;
  // Keep export controls inside the modal's focus and pointer boundary.
  return createPortal(toolbar, target);
}
