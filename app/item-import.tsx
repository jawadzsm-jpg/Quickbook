"use client";

import { useRef, useState } from "react";
import { Download, FileUp, LoaderCircle, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ITEM_IMPORT_TEMPLATE, parseCsv, rowsToItems, type ImportRow } from "@/lib/item-import";

type Result = { line: number; label: string; ok: boolean; message: string };

const cellText = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const cell = value as { text?: unknown; result?: unknown; richText?: { text: string }[] };
    if (cell.richText) return cell.richText.map((part) => part.text).join("");
    if (cell.result !== undefined) return cellText(cell.result);
    if (cell.text !== undefined) return cellText(cell.text);
  }
  return String(value);
};

/** Reads CSV, .xlsx and Excel XML / HTML ".xls" files (including this app's own Excel exports) into rows of text. */
async function readSpreadsheet(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt")) return parseCsv(await file.text());
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer.slice(0, 4));
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) { // ZIP: a real .xlsx workbook
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets.find((entry) => entry.actualRowCount > 0) ?? workbook.worksheets[0];
    if (!sheet) return [];
    const rows: string[][] = [];
    sheet.eachRow({ includeEmpty: true }, (row) => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      rows.push(values.map(cellText));
    });
    return rows;
  }
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf) throw new Error("This is an old binary .xls file. Open it in Excel and save it as .xlsx or CSV, then import again.");
  const text = new TextDecoder().decode(buffer);
  const document = new DOMParser().parseFromString(text, /<\?xml/i.test(text.slice(0, 200)) ? "application/xml" : "text/html");
  const xmlRows = [...document.getElementsByTagNameNS("*", "Row")];
  if (xmlRows.length) { // Excel 2003 XML spreadsheet
    return xmlRows.map((row) => {
      const cells: string[] = [];
      for (const cell of [...row.children].filter((child) => child.localName === "Cell")) {
        const index = Number(cell.getAttributeNS("urn:schemas-microsoft-com:office:spreadsheet", "Index") || cell.getAttribute("ss:Index"));
        if (index > 0) while (cells.length < index - 1) cells.push("");
        cells.push(cell.textContent ?? "");
      }
      return cells;
    });
  }
  const tableRows = [...document.querySelectorAll("tr")];
  if (tableRows.length) return tableRows.map((row) => [...row.querySelectorAll("th,td")].map((cell) => cell.textContent ?? ""));
  return parseCsv(text);
}

export function ItemImport({ companyId, locationId, locationName, onImported }: { companyId: number; locationId: number; locationName: string; onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<{ rows: ImportRow[]; columns: { header: string; field: string }[]; error?: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const input = useRef<HTMLInputElement>(null);

  const reset = () => { setFileName(""); setParsed(null); setResults([]); setProgress(0); if (input.current) input.current.value = ""; };

  async function choose(file: File | undefined) {
    if (!file) return;
    setResults([]); setProgress(0); setFileName(file.name);
    try { setParsed(rowsToItems(await readSpreadsheet(file))); }
    catch (error) { setParsed({ rows: [], columns: [], error: error instanceof Error ? error.message : "Could not read this file." }); }
  }

  async function runImport() {
    if (!parsed) return;
    const ready = parsed.rows.filter((row) => !row.error);
    if (!ready.length) return;
    setRunning(true); setProgress(0);
    const outcome: Result[] = parsed.rows.filter((row) => row.error).map((row) => ({ line: row.line, label: row.label, ok: false, message: row.error! }));
    // One item at a time, through the same endpoint as "Add new", so duplicate checks see earlier rows.
    for (const [index, row] of ready.entries()) {
      try {
        const response = await fetch("/api/records", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...row.payload, companyId, locationId }) });
        const data = await response.json().catch(() => ({}));
        outcome.push(response.ok ? { line: row.line, label: row.label, ok: true, message: `Added · SKU ${data.record?.sku ?? ""}` } : { line: row.line, label: row.label, ok: false, message: data.error || `Failed (${response.status})` });
      } catch { outcome.push({ line: row.line, label: row.label, ok: false, message: "Network error" }); }
      setProgress(index + 1);
    }
    outcome.sort((a, b) => a.line - b.line);
    setResults(outcome); setRunning(false);
    const added = outcome.filter((entry) => entry.ok).length;
    if (added) onImported();
    if (added === outcome.length) toast.success(`${added} ${added === 1 ? "product" : "products"} imported.`);
    else toast.warning(`${added} imported, ${outcome.length - added} skipped. See the list for reasons.`);
  }

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob(["﻿" + ITEM_IMPORT_TEMPLATE], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "product-import-template.csv"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const ready = parsed?.rows.filter((row) => !row.error).length ?? 0;
  const invalid = parsed ? parsed.rows.length - ready : 0;
  const fieldNames: Record<string, string> = { name: "Name", sku: "SKU", itemNumber: "Item No.", category: "Category", quantity: "Opening quantity", reorderPoint: "Reorder point", salesPrice: "Sales price", cost: "Cost", status: "Status", itemType: "Item type", specification: "Specification" };

  return <>
    <Button type="button" variant="outline" onClick={() => { reset(); setOpen(true); }}><Upload className="size-4" />Import</Button>
    <Dialog open={open} onOpenChange={(next) => { if (!running) setOpen(next); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import products</DialogTitle>
          <DialogDescription>Add many products at once from Excel (.xlsx, .xls) or CSV into {locationName}. Each row is saved like “Add new”: SKUs and item numbers are generated when empty, and names must be unique.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={input} type="file" accept=".xlsx,.xls,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" className="hidden" onChange={(event) => void choose(event.target.files?.[0])} />
          <Button type="button" disabled={running} onClick={() => input.current?.click()}><FileUp className="size-4" />{fileName ? "Choose another file" : "Choose file"}</Button>
          <Button type="button" variant="outline" onClick={downloadTemplate}><Download className="size-4" />Download template (CSV)</Button>
          {fileName && <span className="truncate text-sm text-muted-foreground">{fileName}</span>}
        </div>
        <p className="text-xs text-muted-foreground">Columns: <strong>Name</strong> (required), SKU, Item No., Category, Quantity, Reorder point, Sales price, Cost, Status, Type. Any other column (Brand, Model, RAM…) is saved as a specification. Prices like “AED 6,000.00” are fine.</p>
        {parsed?.error && <p role="alert" className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">{parsed.error}</p>}
        {parsed && !parsed.error && !results.length && <div className="grid gap-3">
          <div className="flex flex-wrap gap-1.5 text-xs">{parsed.columns.filter((column) => column.field).map((column, index) => <span key={index} className="rounded-full border px-2 py-0.5"><strong>{column.header}</strong> → {fieldNames[column.field] ?? column.field}</span>)}</div>
          <div data-output-render className="max-h-64 overflow-auto rounded-md border text-sm">
            <table className="w-full"><thead className="sticky top-0 bg-muted text-left text-xs"><tr><th className="px-2 py-1.5">Row</th><th className="px-2 py-1.5">Name</th><th className="px-2 py-1.5 text-right">Qty</th><th className="px-2 py-1.5 text-right">Sales price</th><th className="px-2 py-1.5">Check</th></tr></thead>
              <tbody>{parsed.rows.slice(0, 200).map((row) => <tr key={row.line} className="border-t"><td className="px-2 py-1 text-muted-foreground">{row.line}</td><td className="px-2 py-1">{row.label}</td><td className="px-2 py-1 text-right tabular-nums">{String(row.payload.quantity ?? 0)}</td><td className="px-2 py-1 text-right tabular-nums">{String(row.payload.salesPrice ?? 0)}</td><td className={`px-2 py-1 text-xs ${row.error ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>{row.error ?? "Ready"}</td></tr>)}</tbody>
            </table>
          </div>
          {parsed.rows.length > 200 && <p className="text-xs text-muted-foreground">Showing the first 200 of {parsed.rows.length} rows.</p>}
        </div>}
        {results.length > 0 && <div data-output-render className="max-h-72 overflow-auto rounded-md border text-sm">
          <table className="w-full"><thead className="sticky top-0 bg-muted text-left text-xs"><tr><th className="px-2 py-1.5">Row</th><th className="px-2 py-1.5">Name</th><th className="px-2 py-1.5">Result</th></tr></thead>
            <tbody>{results.map((result) => <tr key={result.line} className="border-t"><td className="px-2 py-1 text-muted-foreground">{result.line}</td><td className="px-2 py-1">{result.label}</td><td className={`px-2 py-1 text-xs ${result.ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>{result.message}</td></tr>)}</tbody>
          </table>
        </div>}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {running && <span className="mr-auto inline-flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Importing {progress} of {ready}…</span>}
          {!running && invalid > 0 && !results.length && <span className="mr-auto text-xs text-muted-foreground">{invalid} {invalid === 1 ? "row needs" : "rows need"} fixing and will be skipped.</span>}
          <Button type="button" variant="outline" disabled={running} onClick={() => setOpen(false)}>{results.length ? "Close" : "Cancel"}</Button>
          {!results.length && <Button type="button" disabled={running || !ready} onClick={() => void runImport()}>{running ? "Importing…" : `Import ${ready} ${ready === 1 ? "product" : "products"}`}</Button>}
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
