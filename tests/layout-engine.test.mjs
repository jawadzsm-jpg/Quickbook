import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, logLevel: "silent", resolve: { alias: { "@": root } }, server: { middlewareMode: true, hmr: false, ws: false, watch: { ignored: ["**/.next/**"] } } });
after(() => vite.close());

const { defaultLayout, newSection } = await vite.ssrLoadModule("/lib/layout/defaults.ts");
const { historyReducer, initialHistory, layoutReducer } = await vite.ssrLoadModule("/lib/layout/reducer.ts");
const { parseLayout, contentBox } = await vite.ssrLoadModule("/lib/layout/schema.ts");
const { migrateDocumentDesign } = await vite.ssrLoadModule("/lib/layout/migrate.ts");
const { defaultDocumentDesign } = await vite.ssrLoadModule("/lib/document-design.ts");
const { mockDocument } = await vite.ssrLoadModule("/lib/layout/document-data.ts");

const sectionTypesOf = (layout) => layout.rows.map((row) => row.sections.map((section) => section.type).join("+"));

test("default invoice and letterhead layouts validate and keep a body row", () => {
  for (const kind of ["invoice", "letterhead"]) {
    const layout = parseLayout(JSON.stringify(defaultLayout(kind)));
    assert.equal(layout.kind, kind);
    assert.ok(layout.rows.some((row) => row.repeat === "none"));
  }
  assert.deepEqual(contentBox(defaultLayout().page), { pageWidth: 210, pageHeight: 297, width: 186, height: 271 });
  assert.equal(contentBox({ ...defaultLayout().page, orientation: "landscape", size: "Letter" }).pageWidth, 279.4);
});

test("validation rejects unsafe or inconsistent layouts", () => {
  const layout = defaultLayout();
  assert.throws(() => parseLayout({ ...layout, rows: [{ ...layout.rows[0], ratios: [1, 1] }] }), /width ratio/);
  assert.throws(() => parseLayout({ ...layout, rows: [layout.rows[0], layout.rows[0]] }), /unique/);
  assert.throws(() => parseLayout({ ...layout, rows: layout.rows.map((row) => ({ ...row, repeat: "header" })) }), /page body/);
  assert.throws(() => parseLayout({ ...layout, overlays: [{ id: "o1", kind: "image", xMm: 0, yMm: 0, widthMm: 10, heightMm: 10, rotateDeg: 0, opacity: 1, text: "", src: "javascript:alert(1)", pages: "first", screen: true, print: true }] }), /image/i);
  assert.throws(() => parseLayout({ ...layout, extra: true }));
});

test("sections move between rows, spill out of full rows and drop empty rows", () => {
  let layout = defaultLayout();
  const parties = layout.rows[2];
  const details = layout.rows[3].sections[0];
  layout = layoutReducer(layout, { type: "moveSection", sectionId: details.id, target: { kind: "row", rowId: parties.id, index: 1 } });
  assert.deepEqual(sectionTypesOf(layout).slice(0, 4), ["companyHeader", "title", "billTo+details+shipTo", "lineItems"]);
  assert.deepEqual(layout.rows[2].ratios, [1, 1, 1]);
  // A fourth section cannot join a full row; it lands in a new row directly below.
  const title = layout.rows[1].sections[0];
  layout = layoutReducer(layout, { type: "moveSection", sectionId: title.id, target: { kind: "row", rowId: parties.id, index: 0 } });
  assert.deepEqual(sectionTypesOf(layout).slice(0, 3), ["companyHeader", "billTo+details+shipTo", "title"]);
  // Moving within the same row accounts for the removed position.
  const row = layout.rows[1];
  layout = layoutReducer(layout, { type: "moveSection", sectionId: row.sections[0].id, target: { kind: "row", rowId: row.id, index: 3 } });
  assert.equal(sectionTypesOf(layout)[1], "details+shipTo+billTo");
});

test("new-row drops, row moves, duplicates and removals keep the layout valid", () => {
  let layout = defaultLayout();
  const lineItems = layout.rows[4].sections[0];
  layout = layoutReducer(layout, { type: "moveSection", sectionId: lineItems.id, target: { kind: "newRow", rowIndex: 1 } });
  assert.equal(sectionTypesOf(layout)[1], "lineItems");
  layout = layoutReducer(layout, { type: "moveRow", rowId: layout.rows[1].id, toIndex: 4 });
  assert.equal(sectionTypesOf(layout)[4], "lineItems");
  layout = layoutReducer(layout, { type: "addSection", sectionType: "signature", target: { kind: "newRow", rowIndex: 99 } });
  assert.equal(sectionTypesOf(layout).at(-1), "signature");
  layout = layoutReducer(layout, { type: "duplicateSection", sectionId: layout.rows.at(-1).sections[0].id });
  assert.equal(sectionTypesOf(layout).at(-1), "signature+signature");
  parseLayout(layout);
  // The last body row can never be removed.
  const single = { ...defaultLayout(), rows: [defaultLayout().rows[0]] };
  assert.equal(layoutReducer(single, { type: "removeSection", sectionId: single.rows[0].sections[0].id }), single);
});

test("history undoes and redoes, and coalesces rapid edits under one key", () => {
  const layout = defaultLayout();
  const id = layout.rows[1].sections[0].id;
  let history = initialHistory(layout);
  history = historyReducer(history, { type: "apply", action: { type: "updateSection", sectionId: id, patch: { props: { text: "T" } } }, coalesceKey: "title", at: 1000 });
  history = historyReducer(history, { type: "apply", action: { type: "updateSection", sectionId: id, patch: { props: { text: "Ta" } } }, coalesceKey: "title", at: 1200 });
  history = historyReducer(history, { type: "apply", action: { type: "updateSection", sectionId: id, patch: { props: { text: "Tax" } } }, coalesceKey: "title", at: 1400 });
  assert.equal(history.past.length, 1);
  history = historyReducer(history, { type: "apply", action: { type: "updatePage", patch: { size: "Letter" } }, at: 5000 });
  assert.equal(history.past.length, 2);
  history = historyReducer(history, { type: "undo" });
  assert.equal(history.present.page.size, "A4");
  history = historyReducer(history, { type: "undo" });
  assert.equal(history.present.rows[1].sections[0].props.text, "Tax Invoice");
  history = historyReducer(history, { type: "redo" });
  assert.equal(history.present.rows[1].sections[0].props.text, "Tax");
  // A no-op action does not create an undo step.
  assert.equal(historyReducer(history, { type: "apply", action: { type: "moveRow", rowId: "missing", toIndex: 0 } }), history);
});

test("v1 Company Setup designs migrate into an equivalent valid layout", () => {
  const design = structuredClone(defaultDocumentDesign);
  design.title = "Commercial Invoice"; design.paper = "Letter"; design.margin = 15; design.color = "#123456"; design.statusStamp = true;
  design.columns = design.columns.map((column) => column.key === "serialNumber" ? { ...column, print: false } : column);
  design.message = "Thanks"; design.disclaimer = "No returns";
  design.customBoxes = [{ id: "box-1", text: "Stamp here", screen: true, print: true, left: 96, down: 192, width: 192, height: 96, fontSize: 11, bold: false, border: true }];
  const layout = migrateDocumentDesign(JSON.stringify(design));
  assert.equal(layout.enabled, false);
  assert.equal(layout.page.size, "Letter"); assert.equal(layout.page.margins.left, 15); assert.equal(layout.theme.accent, "#123456");
  const sections = layout.rows.flatMap((row) => row.sections);
  assert.equal(sections.find((section) => section.type === "title").props.text, "Commercial Invoice");
  const columns = sections.find((section) => section.type === "lineItems").props.columns.map((column) => column.key);
  assert.ok(columns.includes("description") && !columns.includes("serialNumber"));
  assert.deepEqual(sections.find((section) => section.type === "totals").props.rows.map((row) => row.key), ["subtotal", "vat", "total", "balance"]);
  assert.equal(sections.find((section) => section.type === "notes").props.text, "Thanks");
  assert.equal(sections.find((section) => section.type === "terms").props.text, "No returns");
  const box = layout.overlays.find((overlay) => overlay.kind === "text");
  assert.deepEqual([box.xMm, box.yMm, box.widthMm, box.heightMm], [25.4, 50.8, 50.8, 25.4]);
  assert.ok(layout.overlays.some((overlay) => overlay.kind === "stamp"));
});

test("mock documents provide 3, 25 and 120 line invoices with consistent totals", () => {
  for (const [size, count] of [["short", 3], ["medium", 25], ["long", 120]]) {
    const doc = mockDocument(size);
    assert.equal(doc.lines.length, count);
    assert.equal(doc.totals.total, Math.round((doc.totals.subtotal + doc.totals.vat) * 100) / 100);
  }
  assert.ok(newSection("lineItems").avoidBreakInside === false);
});
