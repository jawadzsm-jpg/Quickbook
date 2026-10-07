import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, logLevel: "silent", esbuild: { jsx: "automatic" }, resolve: { alias: { "@": root } }, server: { middlewareMode: true, hmr: false, ws: false, watch: { ignored: ["**/.next/**"] } } });
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

test("print HTML carries page rules, repeating rows, copies and escaped titles", async () => {
  const { layoutHtml } = await vite.ssrLoadModule("/app/layout-builder/print-layout.tsx");
  const layout = defaultLayout();
  layout.page = { ...layout.page, size: "Letter", orientation: "landscape", margins: { top: 15, right: 12, bottom: 18, left: 12 } };
  layout.rows[0].repeat = "header";
  layout.overlays = [{ id: "stamp-1", kind: "stamp", xMm: 100, yMm: 20, widthMm: 40, heightMm: 14, rotateDeg: -8, opacity: 0.85, text: "{status}", src: "", pages: "first", screen: true, print: true }];
  const doc = mockDocument("short");
  const html = await layoutHtml(layout, [{ data: doc, label: "CUSTOMER COPY" }, { data: { ...doc, status: "Paid" }, label: "INVENTORY TEAM COPY" }], "Invoice <1> & co");
  assert.match(html, /@page\{size:Letter landscape;margin:15mm 12mm 18mm 12mm;/);
  assert.match(html, /counter\(page\)/);
  assert.match(html, /<title>Invoice &lt;1&gt; &amp; co<\/title>/);
  assert.equal(html.match(/class="lb-copy"/g).length, 2);
  assert.ok(html.includes("CUSTOMER COPY") && html.includes("INVENTORY TEAM COPY"));
  // The repeating company header lives in the table header group so browsers print it on every page.
  assert.match(html, /<thead><tr><td><div class="lb-row"[^>]*>.*ComNet International/);
  assert.ok(html.includes(">Open<") && html.includes(">Paid<"));
  // Overlays are positioned relative to the margin box.
  assert.match(html, /left:88mm;top:5mm/);
});

test("saved invoices map onto the renderer input without freight or pending lines", async () => {
  const { transactionDocumentData } = await vite.ssrLoadModule("/app/layout-builder/company-data.ts");
  const data = transactionDocumentData(
    { number: "INV-9", transactionDate: "2026-10-06", dueDate: "2026-11-05", salesman: "Sara", currency: "AED", subtotal: 300, vatAmount: 15, total: 315, status: "open", party: "Acme", deliveryAddress: "Warehouse 4" },
    [{ description: "Laptop", sku: "L1", quantity: 2, unitPrice: 100, subtotal: 200, vatRate: 5, vatAmount: 10, total: 210 }, { description: "Mouse", quantity: 1, unitPrice: 100, vatAmount: 5 }, { description: "Freight", isFreightCharge: true, quantity: 1, unitPrice: 9 }, { description: "Later", pending: true, quantity: 1, unitPrice: 1 }],
    { billingName: "Acme Trading LLC", city: "Dubai", country: "United Arab Emirates", trn: "100" },
    { name: "ComNet", logoData: "", phone: "1", trn: "200", addressLine1: "Shop 1", addressLine2: "", city: "Dubai", country: "UAE", bankName: "ENBD" },
  );
  assert.deepEqual(data.billTo, ["Acme Trading LLC", "Dubai, United Arab Emirates", "TRN 100"]);
  assert.deepEqual(data.shipTo, ["Warehouse 4"]);
  assert.deepEqual(data.lines.map((line) => [line.description, line.total]), [["Laptop", 210], ["Mouse", 105]]);
  assert.deepEqual(data.totals, { subtotal: 300, vat: 15, total: 315, paid: 0, balance: 315 });
  assert.equal(data.details.number, "INV-9"); assert.equal(data.company.addressLines.at(-1), "Dubai, UAE"); assert.equal(data.company.bank.name, "ENBD");
});

test("bank accounts validate per currency and documents pick the account matching their currency", async () => {
  const { parseBankAccounts, bankForCurrency, bankLines, draftBankAccounts } = await vite.ssrLoadModule("/lib/bank-accounts.ts");
  const usd = { id: "b1", currency: "usd", bankName: "Mashreq", accountName: "ComNet LLC", accountNumber: "0191", iban: "ae070330000010191", swift: "boml" };
  const accounts = parseBankAccounts(JSON.stringify([usd]));
  assert.deepEqual(accounts[0], { id: "b1", currency: "USD", bankName: "Mashreq", accountName: "ComNet LLC", accountNumber: "0191", iban: "AE070330000010191", swift: "BOML" });
  assert.throws(() => parseBankAccounts([usd, { ...usd, id: "b2" }]), /one bank account per currency/);
  assert.throws(() => parseBankAccounts([{ ...usd, currency: "US" }]), /three-letter/);
  assert.throws(() => parseBankAccounts([{ id: "b3", currency: "EUR" }]), /bank name, account number or IBAN/);
  assert.equal(draftBankAccounts(JSON.stringify([{ ...usd, currency: "U" }]))[0].currency, "U"); // half-typed entries survive editing
  const company = { bankName: "Emirates NBD", bankAccountNumber: "1015", bankCurrency: "AED", baseCurrency: "AED", bankAccounts: JSON.stringify(accounts) };
  assert.equal(bankForCurrency(company, "USD").bankName, "Mashreq");
  assert.equal(bankForCurrency(company, "AED").bankName, "Emirates NBD");
  assert.equal(bankForCurrency(company, "EUR").bankName, "Emirates NBD"); // no EUR account: default account
  assert.equal(bankForCurrency({}, "USD"), null);
  assert.deepEqual(bankLines(bankForCurrency(company, "USD")), ["Mashreq", "Account name: ComNet LLC", "Account no.: 0191", "IBAN: AE070330000010191", "SWIFT: BOML", "Currency: USD"]);
  const { transactionDocumentData } = await vite.ssrLoadModule("/app/layout-builder/company-data.ts");
  const branding = { name: "ComNet", logoData: "", phone: "", trn: "", addressLine1: "", addressLine2: "", city: "", country: "", ...company };
  assert.equal(transactionDocumentData({ currency: "USD", total: 1 }, [], null, branding).company.bank.name, "Mashreq");
  assert.equal(transactionDocumentData({ currency: "AED", total: 1 }, [], null, branding).company.bank.name, "Emirates NBD");
});

test("each currency's bank account carries its own stamp onto documents", async () => {
  const { parseBankAccounts, bankForCurrency, validBankStamp } = await vite.ssrLoadModule("/lib/bank-accounts.ts");
  const usdStamp = "data:image/png;base64,VVNE", aedStamp = "data:image/webp;base64,QUVE";
  const usd = { id: "b1", currency: "USD", bankName: "Mashreq", accountName: "", accountNumber: "0191", iban: "", swift: "", stampData: usdStamp };
  assert.equal(parseBankAccounts([usd])[0].stampData, usdStamp);
  assert.equal("stampData" in parseBankAccounts([{ ...usd, stampData: "" }])[0], false);
  assert.throws(() => parseBankAccounts([{ ...usd, stampData: "data:image/svg+xml;base64,PHN2Zz4=" }]), /bank stamp/);
  assert.equal(validBankStamp(`data:image/png;base64,${"A".repeat(700_000)}`), false);
  const company = { bankName: "Emirates NBD", bankAccountNumber: "1015", bankCurrency: "AED", baseCurrency: "AED", bankStampData: aedStamp, bankAccounts: JSON.stringify([usd]) };
  assert.equal(bankForCurrency(company, "USD").stampData, usdStamp);
  assert.equal(bankForCurrency(company, "AED").stampData, aedStamp);
  assert.equal(bankForCurrency(company, "EUR").stampData, aedStamp); // falls back with the default account
  const { transactionDocumentData } = await vite.ssrLoadModule("/app/layout-builder/company-data.ts");
  const branding = { name: "ComNet", logoData: "", phone: "", trn: "", addressLine1: "", addressLine2: "", city: "", country: "", ...company };
  assert.equal(transactionDocumentData({ currency: "USD", total: 1 }, [], null, branding).company.bank.stamp, usdStamp);
  assert.equal(transactionDocumentData({ currency: "AED", total: 1 }, [], null, { ...branding, bankStampData: "" }).company.bank.stamp, "");
});

test("saved designs gain the movable Bank Details footer field", async () => {
  const { readDocumentDesign, defaultDocumentDesign } = await vite.ssrLoadModule("/lib/document-design.ts");
  const legacy = structuredClone(defaultDocumentDesign);
  legacy.footer = legacy.footer.filter((field) => field.key !== "bankDetails");
  const design = readDocumentDesign(JSON.stringify(legacy));
  const bank = design.footer.find((field) => field.key === "bankDetails");
  assert.ok(bank && bank.print && bank.screen);
  assert.equal(readDocumentDesign(JSON.stringify(design)).footer.filter((field) => field.key === "bankDetails").length, 1);
});

test("layouts are kept per document type and older saves load as the Invoice layout", async () => {
  const { parseLayoutCollection, serializeLayoutCollection, parseLayout } = await vite.ssrLoadModule("/lib/layout/schema.ts");
  const { layoutForDocumentType } = await vite.ssrLoadModule("/lib/layout/defaults.ts");
  const invoice = defaultLayout();
  assert.deepEqual(Object.keys(parseLayoutCollection(JSON.stringify(invoice))), ["Invoice"]);
  const quote = layoutForDocumentType("Quotation", invoice);
  assert.equal(quote.rows.flatMap((row) => row.sections).find((section) => section.type === "title").props.text, "Quotation");
  assert.equal(quote.enabled, false);
  assert.notEqual(quote.rows[0].id, invoice.rows[0].id);
  const roundTrip = parseLayoutCollection(serializeLayoutCollection({ Invoice: invoice, Quotation: quote }));
  assert.deepEqual(Object.keys(roundTrip), ["Invoice", "Quotation"]);
  assert.throws(() => parseLayoutCollection(JSON.stringify({ version: 3, layouts: { Flyer: invoice } })), /Unknown document type/);
  // Layouts saved before the new style options load with defaults.
  const legacy = structuredClone(invoice);
  for (const row of legacy.rows) for (const section of row.sections) { for (const key of ["verticalAlign", "borderColor", "borderWidthPt", "textColor", "font", "italic", "underline"]) delete section.style[key]; if (section.type === "companyHeader") for (const key of ["nameText", "addressText", "phoneLabel", "emailLabel", "trnLabel"]) delete section.props[key]; if (section.type === "lineItems") for (const key of ["headingBackground", "headingTextColor", "headingBold", "gridLines"]) delete section.props[key]; }
  const loaded = parseLayout(JSON.stringify(legacy));
  assert.equal(loaded.rows[0].sections[0].style.verticalAlign, "top");
  assert.equal(loaded.rows[0].sections[0].props.trnLabel, "TRN");
});

test("section styles, company labels and table heading options render", async () => {
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { LayoutDocument } = await vite.ssrLoadModule("/app/layout-builder/layout-document.tsx");
  const layout = defaultLayout();
  const header = layout.rows[0].sections[0];
  header.props = { ...header.props, nameText: "ComNet Intl", phoneLabel: "Phone:", trnLabel: "VAT No.", emailLabel: "E-mail:" };
  header.style = { ...header.style, textColor: "#aa0000", underline: true, italic: true, font: "Georgia", border: "box", borderColor: "#00aa00", borderWidthPt: 2, verticalAlign: "middle" };
  const items = layout.rows.flatMap((row) => row.sections).find((section) => section.type === "lineItems");
  items.props = { ...items.props, headingBackground: "#ffee00", headingTextColor: "#000000", headingBold: false, gridLines: "grid" };
  const html = renderToStaticMarkup(React.createElement(LayoutDocument, { layout, data: mockDocument("short"), mode: "print" }));
  assert.match(html, /ComNet Intl/); assert.match(html, /Phone: \+971/); assert.match(html, /VAT No\. 100349940500003/); assert.match(html, /E-mail: sales@/);
  assert.match(html, /color:#aa0000/); assert.match(html, /text-decoration:underline/); assert.match(html, /font-style:italic/); assert.match(html, /Georgia/);
  assert.match(html, /--lb-section-border:2pt solid #00aa00/); assert.match(html, /lb-valign-middle/);
  assert.match(html, /lb-grid-grid/); assert.match(html, /background:#ffee00;color:#000000;font-weight:400/);
});

test("Layout Builder documents print the company stamp and bank details box where they were placed", async () => {
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { LayoutDocument } = await vite.ssrLoadModule("/app/layout-builder/layout-document.tsx");
  const stamps = [
    { kind: "company", src: "data:image/png;base64,Q08=", left: 150, top: 240 },
    { kind: "bank", title: "Bank details", lines: ["ENBD", "IBAN: AE07"], remark: "Do not use Standard Chartered as intermediary", left: 400, top: 500 },
  ];
  const html = renderToStaticMarkup(React.createElement(LayoutDocument, { layout: defaultLayout(), data: { ...mockDocument("short"), stamps }, mode: "print" }));
  assert.match(html, /position:absolute;left:150mm;top:240mm[^"]*"><img src="data:image\/png;base64,Q08=" alt="Company stamp"/);
  // The A4 portrait content box is 186 x 271 mm; the 80 x 40 mm bank box is kept inside it.
  assert.match(html, /class="page-stamp page-bank-box" style="position:absolute;left:106mm;top:231mm/);
  assert.match(html, /IBAN: AE07/); assert.match(html, /Do not use Standard Chartered as intermediary/);
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(LayoutDocument, { layout: defaultLayout(), data: mockDocument("short"), mode: "print" })), /page-stamp/);
});

test("bank remarks are validated per account and default to the company bank remark", async () => {
  const { parseBankAccounts, bankForCurrency } = await vite.ssrLoadModule("/lib/bank-accounts.ts");
  const usd = { id: "b1", currency: "USD", bankName: "Mashreq", accountName: "", accountNumber: "1", iban: "", swift: "", remark: "  Use SWIFT only  " };
  assert.equal(parseBankAccounts([usd])[0].remark, "Use SWIFT only");
  assert.throws(() => parseBankAccounts([{ ...usd, remark: "x".repeat(501) }]), /remark under 500/);
  const company = { bankName: "ENBD", bankAccountNumber: "9", bankCurrency: "AED", bankRemark: "AED note", bankAccounts: JSON.stringify([usd]) };
  assert.equal(bankForCurrency(company, "AED").remark, "AED note");
  assert.equal(bankForCurrency(company, "USD").remark, "  Use SWIFT only  ".trim());
});

test("packing list bank details box prints escaped account lines and remark at its millimetre position", async () => {
  const { bankBoxHtml, bankBoxLimits } = await vite.ssrLoadModule("/app/bank-box-placement.tsx");
  const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const html = bankBoxHtml(["ENBD", "IBAN: AE07 <x>"], "Pay via SWIFT & quote invoice", 45, 116, escape);
  assert.match(html, /position:absolute;left:45mm;top:116mm;width:80mm/);
  assert.match(html, /IBAN: AE07 &lt;x&gt;/); assert.match(html, /Pay via SWIFT &amp; quote invoice/);
  assert.deepEqual(bankBoxLimits("landscape"), { page: { width: 297, height: 210, maxLeft: 242, maxTop: 160 }, maxLeft: 197, maxTop: 150 });
});
