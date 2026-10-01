import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

async function sourceModule(path) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}
const { isValidEmail } = await sourceModule("../lib/email-validation.ts");
const { hashAdminPin, verifyAdminPin } = await sourceModule("../lib/admin-pin.ts");
const { dashboardMetrics } = await sourceModule("../lib/dashboard-metrics.ts");
const { filterZeroQohRows, hasInventoryQohFilter } = await sourceModule("../lib/inventory-report-filter.ts");
const { linkReportAccounts } = await sourceModule("../lib/report-account-links.ts");
const { filterRecordListByDate, recordListReport } = await sourceModule("../lib/record-list-export.ts");
const { normalizeComparableText, uppercaseText } = await sourceModule("../lib/text-normalization.ts");
const { dueDateForPaymentTerms } = await sourceModule("../lib/payment-terms.ts");
const { chequeAlignmentBounds, uaeChequeLayout, validChequeAlignment } = await sourceModule("../lib/uae-cheque-layouts.ts");
const { countries } = await sourceModule("../lib/countries.ts");
const { generatedItemDescription, inventoryItemDetails, inventoryItemLine, inventoryItemTitle, inventoryShareDescription, invoiceItemDescription, itemSpecificationDescription, itemTitleWithSku } = await sourceModule("../lib/item-description.ts");

test("item identity appears once in titles and Item No. is reserved for invoice lines", () => {
  assert.equal(generatedItemDescription([
    { label: "Brand", value: "asus" },
    { label: "Model", value: "vivobook 15" },
    { label: "Touchscreen", value: "no" },
    { label: "RAM", value: "16gb" },
  ], "ASUS VIVOBOOK 15", "a1b2c3", "13025"), "16GB");
  assert.equal(itemTitleWithSku("Dell Alienware 16 Aurora AC16250", "73B1DA"), "DELL ALIENWARE 16 AURORA AC16250-73B1DA");
  assert.equal(inventoryItemTitle("Dell Alienware 16 Aurora AC16250 73B1DA |Brand New"), "DELL ALIENWARE 16 AURORA AC16250 73B1DA |BRAND NEW");
  assert.equal(inventoryItemLine("Dell Alienware 16 Aurora AC16250", "73B1DA", "BRAND NEW | CORE 7-240H | 16GB RAM", "13040"), "DELL ALIENWARE 16 AURORA AC16250 73B1DA | BRAND NEW | CORE 7-240H | 16GB RAM #13040");
  assert.equal(inventoryItemLine("Dell Alienware 16 Aurora AC16250 73B1DA", "73B1DA", "BRAND NEW", "13040"), "DELL ALIENWARE 16 AURORA AC16250 73B1DA | BRAND NEW | #13040");
  assert.equal(inventoryItemDetails("CORE 7-240H | 16GB RAM | MANUFACTURE WARRANTY ONLY", "10754"), "CORE 7-240H | 16GB RAM | MANUFACTURE WARRANTY ONLY #10754");
  assert.equal(inventoryItemDetails("CORE 7-240H | MANUFACTURE WARRANTY ONLY #10754", "10754"), "CORE 7-240H | MANUFACTURE WARRANTY ONLY #10754");
  assert.equal(inventoryItemDetails("CORE 7-240H | ITEM NO. #10754", "10754"), "CORE 7-240H #10754");
  assert.equal(inventoryShareDescription("BRAND NEW | NO | DOS | NO #13041", "13041"), "BRAND NEW | DOS");
  assert.equal(inventoryShareDescription("BRAND NEW | 16GB RAM | ITEM NO. #13041", "13041"), "BRAND NEW | 16GB RAM");
  assert.equal(itemSpecificationDescription("DELL ALIENWARE | 16 AURORA AC16250 | SKU: 73B1DA | BRAND NEW | ITEM NO. #13040", "DELL ALIENWARE 16 AURORA AC16250", "73B1DA", "13040"), "BRAND NEW");
  assert.equal(invoiceItemDescription("BRAND NEW | ITEM NO. #13040", "13040"), "BRAND NEW | ITEM NO. #13040");
  const app = readFileSync(new URL("../app/enterprise-app.tsx", import.meta.url), "utf8");
  const records = readFileSync(new URL("../app/api/records/route.ts", import.meta.url), "utf8");
  assert.match(app, /Duplicate draft .* is not saved\. Press Save record to create it, or Cancel to discard it/);
  assert.doesNotMatch(app, /duplicateItemId: id/);
  assert.match(app, /duplicateOfItemId/);
  assert.match(app, /Generated SKU/);
  assert.match(records, /previewIdentity/);
  assert.match(records, /generatedItemDescription\(specifications, name, sku, itemNumber\)/);
  const salesTemplate = readFileSync(new URL("../app/sales-document-template.tsx", import.meta.url), "utf8");
  assert.match(salesTemplate, /\["CUSTOMER COPY", "INVENTORY TEAM COPY"\]/);
  assert.match(salesTemplate, /showItemNumberAtEnd=\{signedInvoiceCopies\}/);
});

test("customer and vendor forms offer every country with search", () => {
  const app = readFileSync(new URL("../app/enterprise-app.tsx", import.meta.url), "utf8");
  assert.ok(countries.length >= 250);
  assert.deepEqual(countries[0], { code: "AE", name: "United Arab Emirates" });
  for (const name of ["Afghanistan", "Australia", "Hong Kong", "India", "Saudi Arabia", "United Kingdom", "United States", "Zimbabwe", "Other"]) assert.ok(countries.some((country) => country.name === name));
  assert.match(app, /function SearchableCountryChoice/);
  assert.match(app, /Search by country name or code/);
  assert.equal((app.match(/<SearchableCountryChoice form=\{form\} setForm=\{setForm\} \/>/g) || []).length, 2);
});

test("warranty migration sends each SQL command separately to the production driver", () => {
  const migration = readFileSync(new URL("../drizzle/0063_warranty_slips.sql", import.meta.url), "utf8");
  const statements = migration.split("--> statement-breakpoint").map((part) => part.trim());
  assert.equal(statements.length, 4);
  assert.ok(statements.every((statement) => (statement.match(/;/g) || []).length === 1));
});

test("supplier tracking migration sends separate SQL commands to the production driver", () => {
  const migration = readFileSync(new URL("../drizzle/0064_warranty_supplier_tracking.sql", import.meta.url), "utf8");
  const statements = migration.split("--> statement-breakpoint").map((part) => part.trim());
  assert.equal(statements.length, 8);
  assert.ok(statements.every((statement) => (statement.match(/;/g) || []).length === 1));
});

test("supplier bills and Warranty RMA slips are connected in both directions", () => {
  const app = readFileSync(new URL("../app/enterprise-app.tsx", import.meta.url), "utf8");
  const warranty = readFileSync(new URL("../app/warranty-center.tsx", import.meta.url), "utf8");
  const api = readFileSync(new URL("../app/api/warranty-slips/route.ts", import.meta.url), "utf8");
  assert.match(app, /Warranty \/ RMA connection/);
  assert.match(app, /warranty-bill-open/);
  assert.match(app, /comnet-warranty-source-bill/);
  assert.match(warranty, /sourcePurchaseBillId/);
  assert.match(warranty, /purchaseBillId: bill\.id, purchaseNumber: bill\.number, purchaseDate: bill\.transactionDate/);
  assert.match(warranty, /Supplier bill/);
  assert.match(warranty, /View supplier bill/);
  assert.match(warranty, /warranty-purchase-bill-view/);
  assert.match(api, /The purchase bill does not belong to this supplier/);
  assert.match(api, /purchaseNumber: purchaseBill\?\.number/);
});

test("cheque print calibration keeps the amount and every field on the paper", () => {
  const habib = uaeChequeLayout("habib-bank-ag-zurich");
  const original = { x: 0, y: 0, amountX: 0, dateX: 0, crossingX: 0 };
  assert.deepEqual(chequeAlignmentBounds(habib, true, original).x, { min: -7, max: 4 });
  assert.equal(validChequeAlignment(habib, true, { ...original, x: 25 }), false);
  assert.equal(validChequeAlignment(habib, true, { ...original, amountX: -25 }), true);
  assert.equal(validChequeAlignment(habib, true, { ...original, amountX: 5 }), false);
  assert.equal(validChequeAlignment(habib, true, { ...original, amountX: -25, x: 8 }), true);
  assert.equal(validChequeAlignment(habib, true, { ...original, amountX: -25, x: 9 }), false);
  assert.equal(validChequeAlignment(habib, true, { ...original, dateX: -25 }), true);
  assert.equal(validChequeAlignment(habib, true, { ...original, dateX: 25 }), true);
  assert.equal(validChequeAlignment(habib, true, { ...original, dateX: 35, x: 8, amountX: -25 }), false);
  assert.equal(validChequeAlignment(habib, true, { ...original, dateX: 32 }), true);
  assert.equal(validChequeAlignment(habib, true, { ...original, dateX: 38 }), false);
  assert.equal(validChequeAlignment(habib, true, { ...original, amountX: -100 }), true);
  assert.equal(validChequeAlignment(habib, true, { ...original, crossingX: 100 }), true);
  assert.equal(validChequeAlignment(habib, true, { ...original, crossingX: 136 }), false);
  assert.equal(validChequeAlignment(habib, true, { ...original, crossingX: -8 }), false);
});

test("email validation accepts ordinary addresses and rejects malformed or oversized input", () => {
  for (const email of ["name@example.com", "name+sales@example.co.uk"]) assert.equal(isValidEmail(email), true);
  for (const email of ["", "@example.com", "name@@example.com", "name@example", "name@.com", "name@example..com", "name @example.com", "!@".repeat(100_000), "!@!.".repeat(100_000)]) assert.equal(isValidEmail(email), false);
});

test("master record comparison ignores case, spacing and punctuation while item text uses capitals", () => {
  const variants = ["Example LLC", "example l.l.c", " EXAMPLE-Llc "];
  assert.equal(new Set(variants.map(normalizeComparableText)).size, 1);
  assert.equal(uppercaseText("  Gaming laptop Pro  "), "GAMING LAPTOP PRO");
});
test("stock PIN verification rejects absent, wrong and malformed credentials", () => {
  const stored = hashAdminPin("583921");
  assert.equal(verifyAdminPin("583921", stored), true);
  assert.equal(verifyAdminPin("583922", stored), false);
  assert.equal(verifyAdminPin("", stored), false);
  assert.equal(verifyAdminPin("583921", ""), false);
  assert.equal(verifyAdminPin("583921", "invalid"), false);
});

test("dark mode keeps striped report rows and darkest utility text readable", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const pnl = readFileSync(new URL("../app/profit-loss-report.tsx", import.meta.url), "utf8");
  assert.match(css, /even\\:bg-slate-50:nth-child\(even\).*background-color: #152136/);
  for (const token of ["text-slate-950", "text-emerald-950", "text-sky-950", "text-amber-950", "text-red-950"]) assert.match(css, new RegExp(`\\.${token}`));
  assert.match(pnl, /dark:even:bg-slate-900/);
  assert.match(pnl, /dark:bg-emerald-950 dark:text-emerald-100/);
});

test("notification errors stay readable in light and dark mode", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.app-shell \{ isolation: auto; \}/);
  assert.match(css, /\[data-sonner-toaster\]\s*\{[^}]*z-index: 2147483647 !important;[^}]*isolation: isolate;/s);
  assert.match(css, /\[data-sonner-toast\]\[data-type="error"\][^{]*\{[^}]*background: #fff1f2 !important;[^}]*color: #881337 !important;/s);
  assert.match(css, /\[data-sonner-toaster\]\[data-theme="dark"\] \[data-sonner-toast\]\[data-type="error"\][^{]*\{[^}]*background: #4c0519 !important;[^}]*color: #ffe4e6 !important;/s);
  assert.match(css, /\[data-sonner-toast\] \[data-title\][^{]*\{[^}]*font-weight: 750 !important;/s);
  assert.match(css, /backdrop-filter: none !important/);
});

test("inventory loads independently, aggregates history in SQL, and paginates long lists", () => {
  const app = readFileSync(new URL("../app/enterprise-app.tsx", import.meta.url), "utf8");
  const recordsRoute = readFileSync(new URL("../app/api/records/route.ts", import.meta.url), "utf8");
  assert.match(app, /setRecords\(\(current\) => \(\{ \.\.\.current, \[kind\]: data\.records \}\)\)/);
  assert.match(app, /onRefresh=\{currentKind === "items" \? refreshItems : loadData\}/);
  assert.match(app, /const inventoryPageSize = 100;/);
  assert.match(app, /Showing \{\(visibleItemPage - 1\) \* inventoryPageSize \+ 1\}/);
  assert.match(recordsRoute, /value: sql<number>`coalesce\(sum\(/);
  assert.match(recordsRoute, /onPo: sql<number>`coalesce\(sum\(greatest\(0,/);
  assert.equal((recordsRoute.match(/\.groupBy\(transactionLines\.itemId\)/g) || []).length >= 2, true);
  assert.match(readFileSync(new URL("../drizzle/0070_inventory_read_indexes.sql", import.meta.url), "utf8"), /idx_transactions_company_location_type_status/);
  assert.doesNotMatch(recordsRoute, /const purchaseCostLines = await/);
  assert.doesNotMatch(recordsRoute, /const openPoLines = await/);
});

test("the full app shares dark-mode coverage and responsive phone, tablet, and desktop layout rules", () => {
  const app = readFileSync(new URL("../app/enterprise-app.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /Shared responsive contract for every application workspace and modal/);
  assert.match(css, /@media screen and \(max-width: 767px\)/);
  assert.match(css, /@media screen and \(min-width: 768px\) and \(max-width: 1180px\)/);
  assert.match(css, /\[data-slot="dialog-content"\][\s\S]*width: calc\(100vw - \.75rem\) !important/);
  assert.match(css, /\[data-slot="table-container"\][\s\S]*-webkit-overflow-scrolling: touch/);
  for (const token of [
    String.raw`.bg-slate-50\/70`,
    String.raw`.bg-blue-50\/60`,
    String.raw`.bg-emerald-50\/40`,
    String.raw`.bg-rose-50\/70`,
    ".bg-teal-50",
    ".text-cyan-700",
    ".text-indigo-700",
  ]) assert.ok(css.includes(token));
  assert.match(app, /ml-auto flex max-w-full flex-wrap items-center justify-end/);
  assert.match(app, /w-\[min\(165px,42vw\)\] sm:w-\[165px\]/);
});

test("invoice edit keeps compact line comments once and offers add line at the bottom", () => {
  const editor = readFileSync(new URL("../app/enterprise-app.tsx", import.meta.url), "utf8");
  const extraFields = readFileSync(new URL("../app/document-extra-fields.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(editor, /\["invoice", "bill"\]\.includes\(form\.type\).*<DocumentExtraFields/);
  assert.match(editor, />Add Another Line<\/Button>/);
  assert.match(extraFields, /rows=\{2\}/);
  assert.match(extraFields, /min-h-12/);
});

test("sales documents save manageable payment terms without a duplicate add-sales-rep action", () => {
  const editor = readFileSync(new URL("../app/enterprise-app.tsx", import.meta.url), "utf8");
  const terms = readFileSync(new URL("../app/payment-terms-picker.tsx", import.meta.url), "utf8");
  const salesRep = readFileSync(new URL("../app/payment-sales-rep.tsx", import.meta.url), "utf8");
  const records = readFileSync(new URL("../app/api/records/route.ts", import.meta.url), "utf8");
  assert.match(editor, /<PaymentTermsPicker/);
  assert.match(terms, /Select, add, rename or remove a choice/);
  assert.doesNotMatch(salesRep, /Add sales rep|\+ Add sales rep/);
  assert.match(records, /const terms = String\(payload\.terms/);
  assert.match(records, /dueDate, terms, salesman/);
});

test("payment terms update the due date from the transaction date", () => {
  assert.equal(dueDateForPaymentTerms("2026-09-24", "Net 7"), "2026-10-01");
  assert.equal(dueDateForPaymentTerms("2026-09-24", "7 days"), "2026-10-01");
  assert.equal(dueDateForPaymentTerms("2026-09-24", "Due on receipt"), "2026-09-24");
  assert.equal(dueDateForPaymentTerms("2026-09-24", "50% advance · 50% on delivery"), undefined);
});

test("purchase returns are linked, stock-posting, and available as A4 documents", () => {
  const app = readFileSync(new URL("../app/enterprise-app.tsx", import.meta.url), "utf8");
  const vendorBoundary = readFileSync(new URL("../app/vendor-center-error-boundary.tsx", import.meta.url), "utf8");
  const source = readFileSync(new URL("../app/purchase-return-source.tsx", import.meta.url), "utf8");
  const api = readFileSync(new URL("../app/api/records/route.ts", import.meta.url), "utf8");
  const template = readFileSync(new URL("../app/sales-document-template.tsx", import.meta.url), "utf8");
  assert.match(app, /label: "Return Purchases"/);
  assert.match(app, /function VendorCenter[\s\S]*VendorCenterErrorBoundary/);
  assert.match(app, /function VendorCenterContent[\s\S]*label: "Return Purchases"/);
  assert.match(app, /Array\.isArray\(data\.records\) \? data\.records : \[\]/);
  assert.match(vendorBoundary, /Vendor Center needs to reload/);
  assert.match(source, /Original supplier bill/);
  assert.match(api, /kind === "purchase-return-bills"/);
  assert.match(api, /Return quantity exceeds the quantity remaining/);
  assert.match(api, /\["invoice", "sales receipt", "vendor credit"\]/);
  assert.match(api, /type === "vendor credit"[\s\S]*Accounts Payable/);
  assert.match(template, /"purchase-return": "Purchase Return"/);
  assert.match(template, /createA4PdfBlob/);
});

test("inventory checks keep the checker, date and time on each completed count", () => {
  const api = readFileSync(new URL("../app/api/inventory-check-reports/route.ts", import.meta.url), "utf8");
  const report = readFileSync(new URL("../app/inventory-check-reports.tsx", import.meta.url), "utf8");
  assert.match(api, /checkedByUserId: user\.id/);
  assert.match(api, /checkedBy: clean\(user\.fullName/);
  assert.match(api, /checkedByEmail: clean\(user\.email/);
  assert.match(api, /checkedAt/);
  assert.match(api, /Math\.abs\(entry\.countedQuantity - countedQuantity\)/);
  assert.match(report, /By \{entry\?\.checkedBy/);
  assert.match(report, /formatCheckDate\(entry\?\.checkedAt \|\| detail\.createdAt\)/);
  assert.match(report, /Report date &amp; time/);
});

test("VAT codes restore UAE defaults and support edit, safe delete, linked documents, attachments, and stamped A4 output", () => {
  const center = readFileSync(new URL("../app/vat-code-center.tsx", import.meta.url), "utf8");
  const api = readFileSync(new URL("../app/api/vat-codes/route.ts", import.meta.url), "utf8");
  const attachments = readFileSync(new URL("../app/api/attachments/route.ts", import.meta.url), "utf8");
  const clear = readFileSync(new URL("../app/api/company-setup/clear/route.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../drizzle/0066_restore_standard_vat_codes.sql", import.meta.url), "utf8");
  assert.match(center, /Edit VAT code/);
  assert.match(center, /Delete VAT code/);
  assert.match(center, /linked areas/);
  assert.match(center, /entityType: "vat_code"/);
  assert.match(center, /A4 portrait/);
  assert.match(center, /<LetterheadStamp/);
  assert.match(center, /reportPdf\(report/);
  assert.match(api, /export async function DELETE/);
  assert.match(api, /Deactivate it instead of deleting it/);
  assert.match(api, /transaction_lines line[\s\S]*JOIN transactions/);
  assert.match(attachments, /"vat_code"/);
  assert.match(clear, /standardVatCodes\.map/);
  assert.match(migration, /REVERSE_CHARGE/);
});

test("UAE imported-goods VAT requires customs references and keeps them on the supplier bill", () => {
  const api = readFileSync(new URL("../app/api/records/route.ts", import.meta.url), "utf8");
  const app = readFileSync(new URL("../app/enterprise-app.tsx", import.meta.url), "utf8");
  const template = readFileSync(new URL("../app/custom-invoice-template.tsx", import.meta.url), "utf8");
  const defaults = readFileSync(new URL("../lib/standard-vat-codes.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../drizzle/0068_uae_import_goods_documents.sql", import.meta.url), "utf8");
  assert.match(defaults, /IMPORT_GOODS[\s\S]*Goods imported into the UAE/);
  assert.match(api, /usesImportGoodsVat[\s\S]*"bill", "purchase order"/);
  assert.match(api, /Bill of Entry No\. and Airway Bill No\./);
  assert.match(app, /name="billOfEntryNumber"/);
  assert.match(app, /name="airwayBillNumber"/);
  assert.match(app, /usesImportGoodsVat[\s\S]*documentLabel=\{form\.type === "bill" \? "Bill" : "Invoice"\}/);
  assert.match(template, /Bill of Entry No\./);
  assert.match(template, /Airway Bill No\./);
  assert.match(migration, /bill_of_entry_number/);
  assert.match(migration, /airway_bill_number/);
});

test("memorised reports live in Report Center categories with selectable A4 print and PDF actions", () => {
  const app = readFileSync(new URL("../app/enterprise-app.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(app, /\["All", "Memorised Reports", \.\.\.reportCategoryOrder\]/);
  assert.match(app, /onOpenMemorised\(savedReport\)/);
  assert.match(app, /definition\?\.\[1\] \|\| `Linked to \$\{category\} reports`/);
  assert.match(app, /<Printer className="size-4" \/>Print · A4/);
  assert.match(app, /kind === "pdf" \? "PDF · A4"/);
  assert.match(css, /@page report-portrait \{ size: A4 portrait; margin: 10mm; \}/);
  assert.match(css, /@page report-landscape \{ size: A4 landscape; margin: 10mm; \}/);
});

test("vendor report library includes selected-vendor reports, native currencies, and movable A4 stamps", () => {
  const app = readFileSync(new URL("../app/enterprise-app.tsx", import.meta.url), "utf8");
  const api = readFileSync(new URL("../app/api/reports/route.ts", import.meta.url), "utf8");
  const pdf = readFileSync(new URL("../lib/report-export.ts", import.meta.url), "utf8");
  assert.match(app, /\["QuickReport", "Selected vendor activity in transaction currency", "Vendors", "supplier-quickreport"\]/);
  assert.match(app, /\["Open Balance", "Selected vendor's unpaid bills in transaction currency", "Vendors", "supplier-open-balance"\]/);
  assert.match(app, /Vendor for QuickReport \/ Open Balance/);
  assert.match(app, /Transaction currency/);
  assert.match(app, /const stampReport = isVendorReport/);
  assert.match(api, /vendorCurrencyTransactions = scopedTransactions\.filter\(\(row\) => row\.currency === reportCurrency\)/);
  assert.match(pdf, /format: "a4"/);
  assert.match(pdf, /report currency/);
});

test("all 13 Profit & Loss reports share professional A4 output, movable stamps, and source-document links", () => {
  const app = readFileSync(new URL("../app/enterprise-app.tsx", import.meta.url), "utf8");
  const pnlView = readFileSync(new URL("../app/profit-loss-report.tsx", import.meta.url), "utf8");
  const api = readFileSync(new URL("../app/api/reports/route.ts", import.meta.url), "utf8");
  const pnlExport = readFileSync(new URL("../lib/pnl-export.ts", import.meta.url), "utf8");
  const sharedExport = readFileSync(new URL("../lib/report-export.ts", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const definitions = [...app.matchAll(/\["[^"]+",\s*"[^"]+",\s*"Profit & Loss",\s*"([^"]+)"\]/g)].map((match) => match[1]);
  assert.equal(definitions.length, 13);
  assert.equal(new Set(definitions).size, 13);
  assert.match(app, /const profitLossReportKeys = new Set\(\[[^\]]+"item-profitability"\]\)/);
  assert.match(app, /const stampReport = [^;]+isProfitLossReport/);
  assert.match(app, /sourceTransactionId > 0[\s\S]*onOpenSource\(sourceTransactionId\)/);
  assert.match(app, /onProfitLossArea/);
  assert.match(pnlView, /report\.key === "profit-loss-item"[\s\S]*onOpenItem/);
  assert.match(pnlView, /"profit-loss-rep", "profit-loss-job", "profit-loss-class"[\s\S]*onOpenArea/);
  assert.match(api, /sourceReferenceTransactionId: value\.sourceTransactionId/);
  assert.match(pnlExport, /orientation: PrintOrientation = "portrait"/);
  assert.match(pnlExport, /new jsPDF\(\{ orientation, format: "a4", unit: "mm" \}\)/);
  assert.match(pnlExport, /pdf\.addImage\(image\.data/);
  assert.match(sharedExport, /orientation: PrintOrientation = "portrait"/);
  assert.match(css, /@page pnl \{ size: A4 portrait; margin: 10mm; \}/);
});

test("all 15 Financial reports share professional A4 output, movable stamps, and document-area links", () => {
  const app = readFileSync(new URL("../app/enterprise-app.tsx", import.meta.url), "utf8");
  const financial = readFileSync(new URL("../app/financial-report.tsx", import.meta.url), "utf8");
  const sharedExport = readFileSync(new URL("../lib/report-export.ts", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const definitions = [...app.matchAll(/\["[^"]+",\s*"[^"]+",\s*"Financial",\s*"([^"]+)"\]/g)].map((match) => match[1]);
  assert.equal(definitions.length, 15);
  assert.equal(new Set(definitions).size, 15);
  assert.match(app, /const financialReportKeys = new Set\(\[[^\]]+"cash-flow-forecast"\]\)/);
  assert.match(app, /const stampReport = [^;]+isFinancialReport/);
  assert.match(app, /financial-dialog.*financialLandscape/);
  assert.match(financial, /title="Open source document"[\s\S]*onOpen\(Number\(row\.transactionId\)\)/);
  assert.match(financial, /title="Open full account history"[\s\S]*setAccount/);
  assert.match(sharedExport, /orientation: PrintOrientation = "portrait"/);
  assert.match(css, /@page financial-portrait \{ size: A4 portrait; margin: 10mm; \}/);
  assert.match(css, /@page financial-landscape \{ size: A4 portrait; margin: 10mm; \}/);
});

test("all 3 Budget reports have summaries, one export control, A4 output, account links, and movable stamps", () => {
  const app = readFileSync(new URL("../app/enterprise-app.tsx", import.meta.url), "utf8");
  const budget = readFileSync(new URL("../lib/budget-report.ts", import.meta.url), "utf8");
  const sharedExport = readFileSync(new URL("../lib/report-export.ts", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const definitions = [...app.matchAll(/\["[^"]+",\s*"[^"]+",\s*"Budgets",\s*"([^"]+)"\]/g)].map((match) => match[1]);
  assert.deepEqual(definitions, ["budget-overview", "budget-actual", "budget-actual-graph"]);
  assert.match(app, /budgetOverview && <section className="budget-summary"/);
  assert.match(app, /isBudgetReport \|\| isSalesReport \|\| isCustomerReport \|\| isVendorReport \|\| isPurchaseReport \|\| isInventoryReport \|\| isBankingReport \|\| isAccountantReport \? <DropdownMenu>/);
  assert.match(app, /stampReport = [^;]+\|\| isBudgetReport/);
  assert.match(app, /accountId > 0[\s\S]*setLinkedAccount/);
  assert.match(budget, /Net favourable variance/);
  assert.match(sharedExport, /orientation: PrintOrientation = "portrait"/);
  assert.match(css, /@page budget-report \{ size: A4 portrait; margin: 10mm; \}/);
  assert.match(css, /\.report-dialog\.budget-report-dialog/);
  assert.match(css, /\[data-appearance="dark"\] \.report-dialog \.budget-summary/);
});

test("all 12 Sales reports have professional summaries, one export control, A4 output, linked documents, customer links, and movable stamps", () => {
  const app = readFileSync(new URL("../app/enterprise-app.tsx", import.meta.url), "utf8");
  const api = readFileSync(new URL("../app/api/reports/route.ts", import.meta.url), "utf8");
  const sales = readFileSync(new URL("../lib/sales-report.ts", import.meta.url), "utf8");
  const sharedExport = readFileSync(new URL("../lib/report-export.ts", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const definitions = [...app.matchAll(/\["[^"]+",\s*"[^"]+",\s*"Sales",\s*"([^"]+)"\]/g)].map((match) => match[1]);
  assert.equal(definitions.length, 12);
  assert.equal(new Set(definitions).size, 12);
  assert.match(app, /salesOverview && <section className="sales-summary"/);
  assert.match(app, /isBudgetReport \|\| isSalesReport \|\| isCustomerReport \|\| isVendorReport \|\| isPurchaseReport \|\| isInventoryReport \|\| isBankingReport \|\| isAccountantReport \? <DropdownMenu>/);
  assert.match(app, /stampReport = [^;]+\|\| isSalesReport/);
  assert.match(app, /\(isSalesReport \|\| isCustomerReport\) && \["customer", "name"\][\s\S]*onCustomer/);
  assert.match(api, /transactionId: row\.id, date: row\.transactionDate, number: row\.number/);
  assert.match(api, /sourceReferenceTransactionId: value\.sourceTransactionId/);
  assert.match(sales, /export const salesReportKeys = new Set/);
  assert.match(sharedExport, /orientation: PrintOrientation = "portrait"/);
  assert.match(css, /@page sales-report \{ size: A4 portrait; margin: 10mm; \}/);
  assert.match(css, /\.report-dialog\.sales-report-dialog/);
  assert.match(css, /\[data-appearance="dark"\] \.report-dialog \.sales-summary/);
});

test("all 17 Customer reports have professional summaries, one export control, A4 output, linked documents, customer links, and movable stamps", () => {
  const app = readFileSync(new URL("../app/enterprise-app.tsx", import.meta.url), "utf8");
  const openBalance = readFileSync(new URL("../app/customer-open-balance.tsx", import.meta.url), "utf8");
  const api = readFileSync(new URL("../app/api/reports/route.ts", import.meta.url), "utf8");
  const customer = readFileSync(new URL("../lib/customer-report.ts", import.meta.url), "utf8");
  const sharedExport = readFileSync(new URL("../lib/report-export.ts", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const definitions = [...app.matchAll(/\["[^"]+",\s*"[^"]+",\s*"Customers",\s*"([^"]+)"\]/g)].map((match) => match[1]);
  assert.equal(definitions.length, 17);
  assert.equal(new Set(definitions).size, 17);
  assert.match(app, /customerOverview && <section className="customer-summary"/);
  assert.match(app, /isBudgetReport \|\| isSalesReport \|\| isCustomerReport \|\| isVendorReport \|\| isPurchaseReport \|\| isInventoryReport \|\| isBankingReport \|\| isAccountantReport \? <DropdownMenu>/);
  assert.match(app, /stampReport = [^;]+\|\| isCustomerReport/);
  assert.match(app, /\(isSalesReport \|\| isCustomerReport\) && \["customer", "name"\][\s\S]*onCustomer/);
  assert.match(api, /invoiceTransactionId: invoice\.id/);
  assert.match(api, /transactionId: row\.id, customer: row\.party/);
  assert.doesNotMatch(openBalance, /Export CSV/);
  assert.match(openBalance, /onCustomer\(name, currency, Boolean\(data\.overdueOnly\)\)/);
  assert.match(customer, /export const customerReportKeys = new Set/);
  assert.match(sharedExport, /orientation: PrintOrientation = "portrait"/);
  assert.match(css, /@page customer-report \{ size: A4 portrait; margin: 10mm; \}/);
  assert.match(css, /\.report-dialog\.customer-report-dialog/);
  assert.match(css, /\[data-appearance="dark"\] \.report-dialog \.customer-summary/);
});

test("all 10 Vendor reports have professional summaries, one export control, A4 output, linked documents, supplier links, and movable stamps", () => {
  const app = readFileSync(new URL("../app/enterprise-app.tsx", import.meta.url), "utf8");
  const api = readFileSync(new URL("../app/api/reports/route.ts", import.meta.url), "utf8");
  const vendor = readFileSync(new URL("../lib/vendor-report.ts", import.meta.url), "utf8");
  const sharedExport = readFileSync(new URL("../lib/report-export.ts", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const definitions = [...app.matchAll(/\["[^"]+",\s*"[^"]+",\s*"Vendors",\s*"([^"]+)"\]/g)].map((match) => match[1]);
  assert.equal(definitions.length, 10);
  assert.equal(new Set(definitions).size, 10);
  assert.match(app, /vendorOverview && <section className="vendor-summary"/);
  assert.match(app, /isBudgetReport \|\| isSalesReport \|\| isCustomerReport \|\| isVendorReport \|\| isPurchaseReport \|\| isInventoryReport \|\| isBankingReport \|\| isAccountantReport \? <DropdownMenu>/);
  assert.match(app, /const stampReport = isVendorReport/);
  assert.match(app, /const vendorLink = isVendorReport[\s\S]*isPurchaseReport[\s\S]*purchases-by-vendor[\s\S]*onVendor/);
  assert.match(app, /onVendor=\{\(supplier\) => \{ setReport\(null\); setSearch\(supplier\); setView\("vendors"\); \}\}/);
  assert.match(api, /transactionId: row\.id, supplier: row\.party/);
  assert.match(vendor, /export const vendorReportKeys = new Set/);
  assert.match(sharedExport, /orientation: PrintOrientation = "portrait"/);
  assert.match(sharedExport, /vendorSummary/);
  assert.match(css, /@page vendor-report \{ size: A4 portrait; margin: 10mm; \}/);
  assert.match(css, /\.report-dialog\.vendor-report-dialog/);
  assert.match(css, /\[data-appearance="dark"\] \.report-dialog \.vendor-summary/);
});

test("all 8 Purchase reports have professional summaries, one export control, A4 output, linked documents, supplier links, and movable stamps", () => {
  const app = readFileSync(new URL("../app/enterprise-app.tsx", import.meta.url), "utf8");
  const api = readFileSync(new URL("../app/api/reports/route.ts", import.meta.url), "utf8");
  const purchase = readFileSync(new URL("../lib/purchase-report.ts", import.meta.url), "utf8");
  const sharedExport = readFileSync(new URL("../lib/report-export.ts", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const definitions = [...app.matchAll(/\["[^"]+",\s*"[^"]+",\s*"Purchases",\s*"([^"]+)"\]/g)].map((match) => match[1]);
  assert.equal(definitions.length, 8);
  assert.equal(new Set(definitions).size, 8);
  assert.match(app, /purchaseOverview && <section className="purchase-summary"/);
  assert.match(app, /isBudgetReport \|\| isSalesReport \|\| isCustomerReport \|\| isVendorReport \|\| isPurchaseReport \|\| isInventoryReport \|\| isBankingReport \|\| isAccountantReport \? <DropdownMenu>/);
  assert.match(app, /const stampReport = isVendorReport \|\| isPurchaseReport/);
  assert.match(app, /const vendorLink = isVendorReport[\s\S]*isPurchaseReport[\s\S]*purchases-by-vendor[\s\S]*onVendor/);
  assert.match(api, /transactionId: row\.id, supplier: row\.party/);
  assert.match(api, /transactionId: line\.transactionId, supplier: line\.party/);
  assert.match(purchase, /export const purchaseReportKeys = new Set/);
  assert.match(sharedExport, /orientation: PrintOrientation = "portrait"/);
  assert.match(sharedExport, /purchaseSummary/);
  assert.match(css, /@page purchase-report \{ size: A4 portrait; margin: 10mm; \}/);
  assert.match(css, /\.report-dialog\.purchase-report-dialog/);
  assert.match(css, /\[data-appearance="dark"\] \.report-dialog \.purchase-summary/);
});

test("all 8 Inventory reports have professional summaries, one export control, A4 output, links, attachments, and movable stamps", () => {
  const app = readFileSync(new URL("../app/enterprise-app.tsx", import.meta.url), "utf8");
  const api = readFileSync(new URL("../app/api/reports/route.ts", import.meta.url), "utf8");
  const inventory = readFileSync(new URL("../lib/inventory-report.ts", import.meta.url), "utf8");
  const sharedExport = readFileSync(new URL("../lib/report-export.ts", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const definitions = [...app.matchAll(/\["[^"]+",\s*"[^"]+",\s*"Inventory",\s*"([^"]+)"\]/g)].map((match) => match[1]);
  assert.equal(definitions.length, 8);
  assert.equal(new Set(definitions).size, 8);
  assert.match(app, /inventoryOverview && <section className="inventory-summary"/);
  assert.match(app, /isBudgetReport \|\| isSalesReport \|\| isCustomerReport \|\| isVendorReport \|\| isPurchaseReport \|\| isInventoryReport \|\| isBankingReport \|\| isAccountantReport \? <DropdownMenu>/);
  assert.match(app, /stampReport = [^;]+isInventoryReport/);
  assert.match(app, /isInventoryReport && \["name", "sku", "itemNumber"\][\s\S]*onInventoryItem/);
  assert.match(app, /onInventoryItem=\{\(query\) => \{ setReport\(null\); setSearch\(query\); setView\("inventory"\); \}\}/);
  assert.match(app, /reportAttachmentId\(report\.key\)/);
  assert.match(app, /entityType="report" documentLabel="Report"/);
  assert.match(app, /relative flex flex-col items-center gap-3 text-center/);
  assert.match(api, /itemId: row\.id, account: inventoryAccountFor\(row\)/);
  assert.match(inventory, /export const inventoryReportKeys = new Set/);
  assert.match(sharedExport, /orientation: PrintOrientation = "portrait"/);
  assert.match(sharedExport, /inventorySummary/);
  assert.match(css, /@page inventory-report \{ size: A4 portrait; margin: 10mm; \}/);
  assert.match(css, /\.report-dialog\.inventory-report-dialog/);
  assert.match(css, /\[data-appearance="dark"\] \.report-dialog \.inventory-summary/);
});

test("Customization Details has a dedicated role, secure writes, centered summary, one export menu, item links, and a movable details dialog", () => {
  const app = readFileSync(new URL("../app/enterprise-app.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/item-customization-center.tsx", import.meta.url), "utf8");
  const api = readFileSync(new URL("../app/api/item-customization/route.ts", import.meta.url), "utf8");
  const auth = readFileSync(new URL("../lib/auth.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../drizzle/0067_item_customization_details.sql", import.meta.url), "utf8");
  assert.match(app, /"customization-details", label: "Customization Details"/);
  assert.match(app, /customization: \["dashboard", "inventory-overview", "customization-details"\]/);
  assert.match(auth, /customization: \["workspace:read", "inventory:read", "customization:manage"\]/);
  assert.match(api, /requireCompanyAccess\(request, companyId, "customization:manage", true\)/);
  assert.match(api, /skuWrite\("item-customization", handlePatch\)/);
  assert.match(page, />Summary</);
  assert.equal((page.match(/<DropdownMenu>/g) || []).length, 1);
  assert.match(page, /A4 portrait PDF/);
  assert.match(page, /onOpenInventory\(record\.sku\)/);
  assert.match(page, /Drag to move product details/);
  assert.match(page, /dark:bg-amber-950/);
  assert.match(migration, /customization_details/);
});

test("Inventory Overview exposes read-only customization popups and received age to every inventory reader", () => {
  const page = readFileSync(new URL("../app/inventory-overview.tsx", import.meta.url), "utf8");
  const api = readFileSync(new URL("../app/api/inventory-overview/route.ts", import.meta.url), "utf8");
  assert.match(page, /Product Customization Details/);
  assert.match(page, /View product customization details/);
  assert.match(page, /Received \$\{days\}/);
  assert.match(page, /Details for users/);
  assert.match(api, /requireApiUser\(request, "inventory:read"\)/);
  assert.match(api, /latestReceivedAt/);
  assert.match(api, /movement\.quantity > 0/);
});

test("all 2 Banking reports have professional summaries, one export control, A4 output, document and account links, and movable stamps", () => {
  const app = readFileSync(new URL("../app/enterprise-app.tsx", import.meta.url), "utf8");
  const api = readFileSync(new URL("../app/api/reports/route.ts", import.meta.url), "utf8");
  const banking = readFileSync(new URL("../lib/banking-report.ts", import.meta.url), "utf8");
  const sharedExport = readFileSync(new URL("../lib/report-export.ts", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const definitions = [...app.matchAll(/\["[^"]+",\s*"[^"]+",\s*"Banking",\s*"([^"]+)"\]/g)].map((match) => match[1]);
  assert.equal(definitions.length, 2);
  assert.equal(new Set(definitions).size, 2);
  assert.match(app, /bankingOverview && <section className="banking-summary"/);
  assert.match(app, /isBudgetReport \|\| isSalesReport \|\| isCustomerReport \|\| isVendorReport \|\| isPurchaseReport \|\| isInventoryReport \|\| isBankingReport \|\| isAccountantReport \? <DropdownMenu>/);
  assert.match(app, /stampReport = [^;]+isBankingReport/);
  assert.match(app, /accountId > 0[\s\S]*setLinkedAccount/);
  assert.match(api, /referenceTransactionId: row\.transactionId/);
  assert.match(api, /referenceTransactionId: transaction\.id/);
  assert.match(banking, /export const bankingReportKeys = new Set/);
  assert.match(sharedExport, /orientation: PrintOrientation = "portrait"/);
  assert.match(sharedExport, /bankingSummary/);
  assert.match(css, /@page banking-report \{ size: A4 portrait; margin: 10mm; \}/);
  assert.match(css, /\.report-dialog\.banking-report-dialog/);
  assert.match(css, /\[data-appearance="dark"\] \.report-dialog \.banking-summary/);
});

test("all 11 Accountant reports have professional summaries, one export control, A4 output, source and account links, and movable stamps", () => {
  const app = readFileSync(new URL("../app/enterprise-app.tsx", import.meta.url), "utf8");
  const api = readFileSync(new URL("../app/api/reports/route.ts", import.meta.url), "utf8");
  const accountant = readFileSync(new URL("../lib/accountant-report.ts", import.meta.url), "utf8");
  const sharedExport = readFileSync(new URL("../lib/report-export.ts", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const definitions = [...app.matchAll(/\["[^"]+",\s*"[^"]+",\s*"Accountant",\s*"([^"]+)"\]/g)].map((match) => match[1]);
  assert.equal(definitions.length, 11);
  assert.equal(new Set(definitions).size, 11);
  assert.match(app, /accountantOverview && <section className="accountant-summary"/);
  assert.match(app, /isBudgetReport \|\| isSalesReport \|\| isCustomerReport \|\| isVendorReport \|\| isPurchaseReport \|\| isInventoryReport \|\| isBankingReport \|\| isAccountantReport \? <DropdownMenu>/);
  assert.match(app, /stampReport = [^;]+isAccountantReport/);
  assert.match(app, /accountId > 0[\s\S]*setLinkedAccount/);
  assert.match(api, /referenceTransactionId: entry\.transactionId/);
  assert.match(api, /numberTransactionId: row\.id/);
  assert.match(api, /referenceTransactionId: source\.id/);
  assert.match(accountant, /export const accountantReportKeys = new Set/);
  assert.match(sharedExport, /orientation: PrintOrientation = "portrait"/);
  assert.match(sharedExport, /accountantSummary/);
  assert.match(css, /@page accountant-report \{ size: A4 portrait; margin: 10mm; \}/);
  assert.match(css, /\.report-dialog\.accountant-report-dialog/);
  assert.match(css, /\[data-appearance="dark"\] \.report-dialog \.accountant-summary/);
});

test("all 15 Lists reports have professional summaries, one export control, A4 output, correct area links, and movable stamps", () => {
  const app = readFileSync(new URL("../app/enterprise-app.tsx", import.meta.url), "utf8");
  const api = readFileSync(new URL("../app/api/reports/route.ts", import.meta.url), "utf8");
  const lists = readFileSync(new URL("../lib/list-report.ts", import.meta.url), "utf8");
  const sharedExport = readFileSync(new URL("../lib/report-export.ts", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const definitions = [...app.matchAll(/\["[^"]+",\s*"[^"]+",\s*"Lists",\s*"([^"]+)"\]/g)].map((match) => match[1]);
  assert.equal(definitions.length, 15);
  assert.equal(new Set(definitions).size, 15);
  assert.match(app, /listOverview && <section className="list-summary"/);
  assert.match(app, /isListReport \|\| isBudgetReport[\s\S]*?isAccountantReport \? <DropdownMenu>/);
  assert.match(app, /stampReport = [^;]+isListReport/);
  assert.match(app, /isListReport && \["itemNumber", "sku", "item"\][\s\S]*onInventoryItem/);
  assert.match(app, /onCustomerCenter=.*setView\("customers"\)/);
  assert.match(app, /onEmployee=.*setView\("employees"\)/);
  assert.match(api, /itemId: (?:row|item)\.id/);
  assert.match(api, /numberTransactionId: row\.id/);
  assert.match(lists, /export const listReportKeys = new Set/);
  assert.match(sharedExport, /orientation: PrintOrientation = "portrait"/);
  assert.match(sharedExport, /listSummary/);
  assert.match(css, /@page list-report \{ size: A4 portrait; margin: 10mm; \}/);
  assert.match(css, /\.report-dialog\.list-report-dialog/);
  assert.match(css, /\[data-appearance="dark"\] \.report-dialog \.list-summary/);
});

test("report dialogs fit the screen and attachments appear only in their named record areas", () => {
  const app = readFileSync(new URL("../app/enterprise-app.tsx", import.meta.url), "utf8");
  const attachments = readFileSync(new URL("../app/attachment-capture.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.report-dialog \{[\s\S]*?position: fixed !important;[\s\S]*?inset: 50% auto auto 50% !important;[\s\S]*?translate: -50% -50% !important;[\s\S]*?transform: none !important;[\s\S]*?width: min\(1600px, calc\(100vw - 2rem\)\) !important;/);
  assert.match(css, /\[data-appearance="dark"\] \.report-dialog/);
  assert.doesNotMatch(app, /report-dialog report-print-surface relative/);
  assert.match(app, /data-attachments-context=\{activeEditorKind === "transactions"/);
  for (const type of ["invoice", "bill", "customer payment", "bill payment", "vendor payment", "cheque", "employee"]) assert.match(app, new RegExp(`"${type}"`));
  assert.match(attachments, /\[role="dialog"\]\[data-attachments-context\]/);
  assert.doesNotMatch(attachments, /document\.body\.innerText|text\.includes\("invoice"\)|page\.includes\("employees & hr"\)/);
});

test("application windows are wide and A4 output offers portrait or landscape with packing lists defaulting to landscape", () => {
  const dialog = readFileSync(new URL("../components/ui/dialog.tsx", import.meta.url), "utf8");
  const selector = readFileSync(new URL("../components/print-orientation-select.tsx", import.meta.url), "utf8");
  const app = readFileSync(new URL("../app/enterprise-app.tsx", import.meta.url), "utf8");
  const documents = readFileSync(new URL("../app/sales-document-template.tsx", import.meta.url), "utf8");
  const packing = readFileSync(new URL("../app/invoice-packing-list.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(dialog, /sm:max-w-4xl/);
  assert.match(dialog, /aria-label=\{windowState === "minimized" \? "Restore window" : "Minimize window"\}/);
  assert.match(dialog, /aria-label=\{windowState === "maximized" \? "Restore window" : "Maximize window"\}/);
  assert.match(dialog, /data-window-state=\{windowState\}/);
  assert.match(dialog, /windowState === "normal" && "top-\[50%\] left-\[50%\] translate-x-\[-50%\] translate-y-\[-50%\]"/);
  assert.match(css, /data-record-kind="transactions"/);
  assert.match(css, /data-window-state="maximized"/);
  assert.match(css, /data-window-state="maximized"\][\s\S]*?top: \.5rem !important;[\s\S]*?right: \.5rem !important;[\s\S]*?bottom: \.5rem !important;[\s\S]*?left: \.5rem !important;[\s\S]*?--tw-translate-x: 0px !important;[\s\S]*?--tw-translate-y: 0px !important;/);
  assert.match(css, /data-window-state="minimized"/);
  assert.match(selector, /<SelectItem value="portrait">Portrait<\/SelectItem>/);
  assert.match(selector, /<SelectItem value="landscape">Landscape<\/SelectItem>/);
  assert.match(app, /useState<PrintOrientation>\("portrait"\)/);
  assert.match(app, /report-print-\$\{printOrientation\}/);
  assert.match(documents, /useState<PrintOrientation>\("portrait"\)/);
  assert.match(packing, /useState<PrintOrientation>\("landscape"\)/);
  assert.match(packing, /@page\{size:A4 \$\{packingOrientation\}/);
  assert.match(css, /@page \{ size: A4 portrait; margin: 10mm; \}/);
});

test("supplier bills have direct attachments and A4 template output with a movable stamp", () => {
  const app = readFileSync(new URL("../app/enterprise-app.tsx", import.meta.url), "utf8");
  const template = readFileSync(new URL("../app/sales-document-template.tsx", import.meta.url), "utf8");
  const attachmentApi = readFileSync(new URL("../app/api/attachments/route.ts", import.meta.url), "utf8");
  assert.match(app, /\["bill", "Bills"\]/);
  assert.match(app, /title="View"[\s\S]{0,500}title="Bill attachments"/);
  assert.match(app, /documentLabel="Bill"/);
  assert.match(app, /"bill", "purchase order"/);
  assert.match(template, /bill: "Supplier Bill"/);
  assert.match(template, /case "bill": return "bill"/);
  assert.match(template, /activeMode === "bill" \|\| activeMode === "purchase-order"/);
  assert.match(template, /createA4PdfBlob/);
  assert.match(attachmentApi, /transactionType === "bill" && hasPermission\(authorization, "purchases:write"\)/);
});

test("complete business final report links executive measures to detailed report areas", () => {
  const app = readFileSync(new URL("../app/enterprise-app.tsx", import.meta.url), "utf8");
  const api = readFileSync(new URL("../app/api/reports/route.ts", import.meta.url), "utf8");
  const view = readFileSync(new URL("../app/business-final-report.tsx", import.meta.url), "utf8");
  assert.match(app, /"Complete Business Final Report"[\s\S]*"Financial"[\s\S]*"business-final"/);
  for (const section of ["Trading", "Profitability", "VAT", "Working Capital", "Banking", "Inventory", "Operations", "Contacts"]) assert.match(api, new RegExp(`finalRow\\(\\"${section}\\"`));
  assert.match(api, /"Net income"[\s\S]*"profit-loss"/);
  assert.match(api, /"Net VAT position"[\s\S]*"vat-summary"/);
  assert.match(api, /"Customer receivables"[\s\S]*"ar-aging-summary"/);
  assert.match(api, /"Current stock value"[\s\S]*"inventory-valuation"/);
  assert.match(view, /onOpenReport\(String\(row\.reportKey\)\)/);
  assert.match(view, /Detailed report: \{row\.detailReport\}/);
});

test("UAE bank cheque is linked to Banking and prints only the A4 voucher", () => {
  const app = readFileSync("app/enterprise-app.tsx", "utf8");
  const cheque = readFileSync("app/uae-bank-cheque.tsx", "utf8");
  const layouts = readFileSync("lib/uae-cheque-layouts.ts", "utf8");
  assert.match(app, /Write UAE Bank Cheque/);
  assert.match(app, /data-action="save-print"/);
  assert.match(app, /A\/C Payee Only \(recommended\)/);
  assert.match(app, /Cheque bank layout \*/);
  assert.match(app, /<UaeBankCheque record=\{record\}/);
  assert.doesNotMatch(cheque, /Print on bank cheque/);
  assert.match(cheque, /Print A4 voucher/);
  assert.match(cheque, /Edit cheque number/);
  assert.match(cheque, /editMode: "cheque-number"/);
  assert.match(cheque, /printIsolatedDocument/);
  const css = readFileSync("app/globals.css", "utf8");
  assert.doesNotMatch(css, /uae-cheque-print-layer/);
  assert.doesNotMatch(css, /data-cheque-print-mode/);
  assert.doesNotMatch(css, /@page cheque-stock/);
  assert.match(css, /\[data-slot="dialog-content"\]:has\(\.document-print-surface\)/);
  assert.doesNotMatch(cheque, /Save layout & alignment/);
  assert.doesNotMatch(cheque, /Cheque bank layout for this print/);
  assert.doesNotMatch(cheque, /Bank cheque alignment preview/);
  assert.match(cheque, /Amount in words/);
  assert.match(cheque, /printWindow\.print\(\)/);
  for (const bank of ["Emirates NBD", "First Abu Dhabi Bank", "ADCB", "Dubai Islamic Bank", "Mashreq", "RAKBANK", "Habib Bank AG Zurich", "Wio Business"]) assert.match(layouts, new RegExp(bank));
  assert.match(layouts, /UAE_CHEQUE_WIDTH_MM = 190\.5/);
  assert.match(layouts, /UAE_CHEQUE_HEIGHT_MM = 88\.9/);
  assert.match(layouts, /HABIB_CHEQUE_WIDTH_MM = 187/);
  assert.match(layouts, /HABIB_CHEQUE_HEIGHT_MM = 90/);
  assert.equal((layouts.match(/widthMm: UAE_CHEQUE_WIDTH_MM, heightMm: UAE_CHEQUE_HEIGHT_MM/g) || []).length, 4);
  assert.match(layouts, /habib:[\s\S]*widthMm: HABIB_CHEQUE_WIDTH_MM, heightMm: HABIB_CHEQUE_HEIGHT_MM/);
  assert.match(layouts, /habib:[\s\S]*date: \{ left: 110, top: 14\.5, width: 40 \}/);
  assert.match(layouts, /habib:[\s\S]*amount: \{ left: 136, top: 55, width: 47 \}/);
  assert.match(layouts, /"habib-bank-ag-zurich", "Habib Bank AG Zurich", "habib"/);
});

test("Escape and close controls protect editable dialogs with save, discard, and cancel choices", () => {
  const closer = readFileSync(new URL("../app/escape-window-closer.tsx", import.meta.url), "utf8");
  assert.match(closer, /document\.addEventListener\("keydown", onKeyDown, true\)/);
  assert.match(closer, /document\.addEventListener\("click", onClick, true\)/);
  assert.match(closer, /Save before closing\?/);
  assert.match(closer, /Keep editing/);
  assert.match(closer, /Discard &amp; close/);
  assert.match(closer, /Save changes/);
  assert.match(closer, /form\.requestSubmit\(target\.saveControl\)/);
  assert.match(closer, /hasOpenTransientLayer\(\)/);
});

test("dashboard totals use linked ledger accounts without counting payments as income or expense", () => {
  assert.deepEqual(dashboardMetrics([
    { active: true, type: "Bank", systemRole: "BANK", balance: 10, baseBalance: 150 },
    { active: true, type: "Accounts Receivable", systemRole: "AR", baseBalance: 200 },
    { active: true, type: "Accounts Payable", systemRole: "AP", baseBalance: 300 },
    { active: true, type: "Other Current Asset", systemRole: "INVENTORY", baseBalance: 400 },
    { active: true, type: "Income", systemRole: "SALES", baseBalance: 500 },
    { active: true, type: "Other Income", baseBalance: 25 },
    { active: true, type: "Cost of Goods Sold", systemRole: "COGS", baseBalance: 175 },
    { active: true, type: "Expense", systemRole: "EXPENSE", baseBalance: 50 },
    { active: false, type: "Bank", baseBalance: 999 },
  ]), { cash: 150, receivable: 200, payable: 300, inventory: 400, sales: 525, expenses: 225 });
});

test("Chart of Accounts loads even when a company has no active inventory location", () => {
  const app = readFileSync(new URL("../app/enterprise-app.tsx", import.meta.url), "utf8");
  assert.match(app, /useEffect\(\(\) => \{ if \(activeCompanyId\) loadData\(\); \}, \[activeCompanyId, activeLocationId, loadData\]\)/);
  assert.doesNotMatch(app, /if \(activeCompanyId && activeLocationId\) loadData\(\)/);
});

test("inventory report QOH option hides only zero rows", () => {
  const rows = [{ sku: "ZERO", quantity: 0 }, { sku: "POSITIVE", quantity: 2 }, { sku: "NEGATIVE", quantity: -1 }];
  assert.equal(hasInventoryQohFilter("inventory-valuation-detail"), true);
  assert.equal(hasInventoryQohFilter("profit-loss"), false);
  assert.deepEqual(filterZeroQohRows("inventory-valuation-detail", rows, true).map((row) => row.sku), ["POSITIVE", "NEGATIVE"]);
  assert.equal(filterZeroQohRows("inventory-valuation-detail", rows, false).length, 3);
  assert.equal(filterZeroQohRows("profit-loss", rows, true).length, 3);
  assert.deepEqual(filterZeroQohRows("pending-builds", [{ sku: "ZERO", onHand: 0 }, { sku: "ONE", onHand: 1 }], true).map((row) => row.sku), ["ONE"]);
});

test("shared transaction lists filter inclusive dates and export professional columns", () => {
  const records = [
    { transactionDate: "2026-09-01", type: "invoice", number: "INV-1", party: "Customer", status: "open", currency: "AED", total: 100 },
    { transactionDate: "2026-09-15", type: "cheque", number: "CHQ-1", party: "Supplier", status: "paid", currency: "AED", total: 200 },
    { transactionDate: "2026-10-01", type: "bill", number: "BIL-1", party: "Vendor", status: "open", currency: "AED", total: 300 },
  ];
  const filtered = filterRecordListByDate(records, "transactions", "2026-09-01", "2026-09-30");
  assert.deepEqual(filtered.map((record) => record.number), ["INV-1", "CHQ-1"]);
  assert.equal(filterRecordListByDate(records, "contacts", "2026-09-01", "2026-09-30").length, 3);
  const report = recordListReport("write-cheque", "transactions", filtered, "AED", "2026-09-01", "2026-09-30", "2026-09-20T00:00:00.000Z");
  assert.equal(report.title, "Cheque Register");
  assert.equal(report.period.label, "2026-09-01 to 2026-09-30");
  assert.deepEqual(report.columns.map((column) => column.label), ["Date", "Type", "Reference", "Name", "Status", "Currency", "Amount"]);
  assert.equal(report.rows[1].amount, 200);
});

test("report account links use codes or currency and never guess duplicate names", () => {
  const accounts = [
    { id: 1, code: "1000", name: "Business Bank", currency: "AED" },
    { id: 2, code: "1001", name: "Business Bank", currency: "USD" },
    { id: 3, code: "1200", name: "Inventory Asset", currency: "AED" },
  ];
  const result = linkReportAccounts([
    { account: "Business Bank", currency: "USD" },
    { account: "1000 · Business Bank" },
    { account: "Business Bank" },
    { account: "Inventory Asset" },
  ], [{ key: "account", label: "Account" }], accounts);
  assert.equal(result.rows[0].accountAccountId, 2);
  assert.equal(result.rows[1].accountAccountId, 1);
  assert.equal(result.rows[2].accountAccountId, undefined);
  assert.equal(result.rows[3].accountAccountId, 3);
  assert.equal(result.issues.length, 1);
});

const {defaultDocumentDesign,defaultElementProperties,validateDocumentDesign} = await sourceModule('../lib/document-design.ts');
test('template properties and saved copies validate without breaking older settings', () => {
 const {properties,savedTemplates,...legacy}=structuredClone(defaultDocumentDesign);void properties;void savedTemplates;
 assert.deepEqual(validateDocumentDesign(JSON.stringify(legacy)),defaultDocumentDesign);
 const design={...structuredClone(defaultDocumentDesign),properties:{title:{...defaultElementProperties,align:'right',vertical:'middle',fill:true,background:'#ffeedd',bottom:true,pattern:'dashed',radius:24}}};
 const {savedTemplates:ignored,...snapshot}=structuredClone(design);void ignored;
 design.savedTemplates=[{id:'copy-1',design:snapshot}];
 assert.deepEqual(validateDocumentDesign(JSON.stringify(design)),design);
 for(const patch of [{align:'bad'},{background:'red;display:none'},{radius:999},{thickness:99},{size:Infinity}])assert.throws(()=>validateDocumentDesign(JSON.stringify({...design,properties:{title:{...defaultElementProperties,...patch}}})));
 assert.throws(()=>validateDocumentDesign(JSON.stringify({...design,properties:{unknown:defaultElementProperties}})));
 assert.throws(()=>validateDocumentDesign(JSON.stringify({...design,savedTemplates:[...design.savedTemplates,...design.savedTemplates]})));
 assert.throws(()=>validateDocumentDesign(JSON.stringify({...design,savedTemplates:[{id:'nested',design}]})));
 assert.throws(()=>validateDocumentDesign(JSON.stringify({...design,savedTemplates:Array.from({length:21},(_,i)=>({id:`copy-${i}`,design:snapshot}))})));
});
