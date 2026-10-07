// Product import for the Inventory page: turns spreadsheet rows (CSV, .xlsx or Excel XML .xls) into the same
// payloads "Add new" sends, so every server rule (unique names, SKUs, item numbers, VAT codes) still applies.

export const ITEM_IMPORT_MAX_ROWS = 2000;
const MAX_SPECIFICATIONS = 30;

type Field = "name" | "sku" | "itemNumber" | "category" | "quantity" | "reorderPoint" | "salesPrice" | "cost" | "status" | "itemType";

const headerAliases: Record<string, Field> = {
  name: "name", item: "name", itemname: "name", product: "name", productname: "name", itemdescription: "name", description: "name",
  sku: "sku",
  itemno: "itemNumber", itemnumber: "itemNumber", itemcode: "itemNumber",
  category: "category",
  qty: "quantity", quantity: "quantity", onhand: "quantity", stock: "quantity", openingqty: "quantity", openingquantity: "quantity",
  reorder: "reorderPoint", reorderpoint: "reorderPoint", reorderlevel: "reorderPoint",
  salesprice: "salesPrice", price: "salesPrice", sellingprice: "salesPrice", saleprice: "salesPrice",
  cost: "cost", avgcost: "cost", averagecost: "cost", unitcost: "cost", purchaseprice: "cost",
  status: "status",
  type: "itemType", itemtype: "itemType",
};

const headerKey = (header: string) => header.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Accepts "AED 6,000.00", "6000", "1.5"; empty becomes 0. */
export function importNumber(value: string) {
  if (!value.trim() || /^[-–—]$/.test(value.trim())) return 0;
  const cleaned = value.replace(/[^0-9.-]/g, "");
  if (!/\d/.test(cleaned)) return Number.NaN; // text such as "abc" is reported, not read as 0
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : Number.NaN;
}

/** RFC 4180 CSV: quoted fields, doubled quotes, commas/newlines inside quotes; also accepts semicolon or tab files. */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, "");
  const firstLine = source.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [",", ";", "\t"].map((character) => [character, firstLine.split(character).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') { field += '"'; index++; }
      else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"' && field === "") quoted = true;
    else if (character === delimiter) { row.push(field); field = ""; }
    else if (character === "\n" || character === "\r") {
      if (character === "\r" && source[index + 1] === "\n") index++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += character;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
/** Text of a markup fragment: tags dropped, entities decoded. The result is only used as data, never as HTML. */
function markupText(fragment: string) {
  return fragment.split(/<br\s*\/?>/i).join("\n").split(/<[^>]*>/).join("")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => code[0] === "#"
      ? String.fromCodePoint(code[1].toLowerCase() === "x" ? Number.parseInt(code.slice(2), 16) : Number(code.slice(1)))
      : entities[code.toLowerCase()] ?? match);
}

/**
 * Rows from Excel 2003 XML spreadsheets (often saved as .xls, like this app's own exports) or HTML-table .xls files,
 * read as plain text so the file is never interpreted as a web page. Returns null when neither format is present.
 */
export function markupTableRows(text: string): string[][] | null {
  const xmlRows = [...text.matchAll(/<(?:ss:)?Row\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:ss:)?Row>)/gi)];
  if (xmlRows.length) return xmlRows.map((row) => {
    const cells: string[] = [];
    for (const cell of (row[1] ?? "").matchAll(/<(?:ss:)?Cell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:ss:)?Cell>)/gi)) {
      const index = Number(/\bss:Index="(\d+)"/i.exec(cell[1])?.[1]);
      if (index > 0) while (cells.length < index - 1) cells.push("");
      cells.push(markupText(cell[2] ?? "").trim());
    }
    return cells;
  });
  const htmlRows = [...text.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  if (htmlRows.length) return htmlRows.map((row) => [...row[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((cell) => markupText(cell[1]).trim()));
  return null;
}

export type ImportRow = { line: number; payload: Record<string, unknown>; label: string; error?: string };

/**
 * The first row with a recognised Name/Item/Description header is the header row. Known columns map to item fields;
 * every other named column becomes a specification (label = header). Rows with no name are reported, not sent.
 */
export function rowsToItems(rows: string[][]): { rows: ImportRow[]; columns: { header: string; field: string }[]; error?: string } {
  const headerIndex = rows.findIndex((row) => row.some((cell) => headerAliases[headerKey(cell)] === "name"));
  if (headerIndex < 0) return { rows: [], columns: [], error: "Add a header row with a Name (or Item / Description) column." };
  const headers = rows[headerIndex].map((cell) => cell.trim());
  const seen = new Set<Field>();
  const columns = headers.map((header) => {
    const field = headerAliases[headerKey(header)];
    if (field && !seen.has(field)) { seen.add(field); return { header, field: field as string }; }
    return { header, field: header ? "specification" : "" };
  });
  const body = rows.slice(headerIndex + 1).map((cells, offset) => ({ cells: cells.map((cell) => String(cell ?? "").trim()), line: headerIndex + offset + 2 }))
    .filter(({ cells }) => cells.some(Boolean));
  if (body.length > ITEM_IMPORT_MAX_ROWS) return { rows: [], columns, error: `Import up to ${ITEM_IMPORT_MAX_ROWS} products at a time; this file has ${body.length}.` };
  return {
    columns,
    rows: body.map(({ cells, line }) => {
      const payload: Record<string, unknown> = { kind: "items" };
      let specificationIndex = 0;
      columns.forEach((column, index) => {
        const value = cells[index] ?? "";
        if (!column.field || !value) return;
        if (column.field === "specification") {
          if (specificationIndex < MAX_SPECIFICATIONS) { payload[`specLabel${specificationIndex}`] = column.header; payload[`specValue${specificationIndex}`] = value; specificationIndex++; }
        } else if (["quantity", "reorderPoint", "salesPrice", "cost"].includes(column.field)) payload[column.field] = importNumber(value);
        else if (column.field === "status") payload.status = /inactive|no|false|0/i.test(value) ? "inactive" : "active";
        else if (column.field === "itemType") payload.itemType = /service/i.test(value) ? "service" : /non/i.test(value) ? "non-stock-part" : "stock-part";
        else payload[column.field] = value;
      });
      const label = String(payload.name ?? payload.sku ?? `Row ${line}`);
      if (!payload.name) return { line, payload, label, error: "Name is empty." };
      const badNumber = ["quantity", "reorderPoint", "salesPrice", "cost"].find((key) => key in payload && (!Number.isFinite(payload[key] as number) || (payload[key] as number) < 0));
      if (badNumber) return { line, payload, label, error: `${columns.find((column) => column.field === badNumber)?.header ?? badNumber} must be a number of 0 or more.` };
      return { line, payload, label };
    }),
  };
}

export const ITEM_IMPORT_TEMPLATE = "Name,SKU,Category,Quantity,Reorder point,Sales price,Cost,Brand,Model,Condition,Processor,RAM,Storage\n"
  + "DELL LATITUDE 5440,,DELL BRAND NEW LAPTOPS,5,1,3200,2650,DELL,LATITUDE 5440,BRAND NEW,CORE I5-1345U,16GB RAM,512GB SSD\n";
