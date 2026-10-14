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
const { partNumberInLine, generatedItemDescription, inventoryItemCondition, inventoryItemDetails, inventoryItemLine, inventoryItemTitle, inventoryShareDescription, inventorySocialShareText, invoiceItemDescription, itemSpecificationDescription, itemTitleWithSku } = await sourceModule("../lib/item-description.ts");
const { isInvoiceItemSelectable } = await sourceModule("../lib/invoice-item-filter.ts");
const { applyInlineFormat, applyLineFormat, inlineFormatsFor, telegramHtml, applyLink } = await sourceModule("../lib/share-format.ts");
const { companyEInvoiceIssues, customerEInvoiceStatus, invoiceEInvoiceStatus, isUaeTrn } = await sourceModule("../lib/einvoice-readiness.ts");
const { calculatorResult } = await sourceModule("../lib/calculator.ts");
const { contactAddressLines } = await sourceModule("../lib/contact-address.ts");
const { API_TOKEN_PREFIX, apiTokenDigest, apiTokenFromHeaders, generateApiToken } = await sourceModule("../lib/api-keys.ts");
const { decodeCursor, encodeCursor, parseProductQuery } = await sourceModule("../lib/public-api-query.ts");
const { friendlyEmailError } = await sourceModule("../lib/email-errors.ts");
const { autoCategoryColor, categoryColor, categoryColorKey, categoryPalette, isCategoryColor } = await sourceModule("../lib/category-colors.ts");
const { OFFER_MAX_DAYS, canManageOffers, offerEndsText, offerRemaining, offerShareText, offerState, offerTime, validateOffer } = await sourceModule("../lib/item-offers.ts");

test("header calculator provides safe everyday arithmetic", () => {
  assert.equal(calculatorResult(0.1, 0.2, "+"), 0.3);
  assert.equal(calculatorResult(20, 5, "÷"), 4);
  assert.equal(calculatorResult(8, 3, "−"), 5);
  assert.equal(calculatorResult(7, 6, "×"), 42);
  assert.equal(calculatorResult(10, 0, "÷"), null);
  const app = readFileSync(new URL("../app/enterprise-app.tsx", import.meta.url), "utf8");
  const calculator = readFileSync(new URL("../app/workspace-calculator.tsx", import.meta.url), "utf8");
  assert.match(app, /<WorkspaceShortcuts[\s\S]*<WorkspaceCalculator \/>[\s\S]*<WorkspaceOnlineUsers \/>[\s\S]*aria-label="Appearance"/);
  assert.match(calculator, /aria-label="Calculator"/);
});

test("online-user presence tracks the active session, shows last-seen date/time and IPs to administrators only", () => {
  const schema = readFileSync(new URL("../db/schema.ts", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/online-users/route.ts", import.meta.url), "utf8");
  const widget = readFileSync(new URL("../app/workspace-online-users.tsx", import.meta.url), "utf8");
  assert.match(schema, /ipAddress: text\("ip_address"\)/);
  assert.match(schema, /lastSeenAt: timestamp\("last_seen_at"/);
  assert.match(route, /ONLINE_WINDOW_MS = 2 \* 60 \* 1000/);
  assert.match(route, /touchRequestSession\(request\)/);
  assert.match(widget, /Active in the last 2 minutes/);
  assert.match(route, /showIp = isAdministrator\(currentUser\)/);
  assert.match(widget, /user\.ipAddress \?/);
  assert.match(widget, /lastSeenLabel\(user\.lastSeenAt\)/);
});

test("invoice item choices hide out-of-stock tracked items", () => {
  assert.equal(isInvoiceItemSelectable({ itemType: "stock-part", quantity: 2, status: "active" }), true);
  assert.equal(isInvoiceItemSelectable({ itemType: "stock-part", quantity: 0, status: "active" }), false);
  assert.equal(isInvoiceItemSelectable({ itemType: "stock-part", quantity: -1, status: "active" }), false);
  assert.equal(isInvoiceItemSelectable({ itemType: "service", quantity: 0, status: "active" }), true);
  assert.equal(isInvoiceItemSelectable({ itemType: "non-stock-part", quantity: 0, status: "active" }), true);
  assert.equal(isInvoiceItemSelectable({ itemType: "stock-part", quantity: 4, status: "inactive" }), false);
  assert.equal(isInvoiceItemSelectable({ itemType: "subtotal", quantity: 4, status: "active" }), false);
});

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
  // Inventory Overview finds the part number written in a product line so it can be copied.
  assert.equal(partNumberInLine("ASUS VIVOBOOK X1407QA-BS56 C7404D | BRAND NEW | SNAPDRAGON X X126100 | 16GB RAM | 512GB SSD | WUXGA 1920X1200 | WIN 11 HOME | SILVER COLOR | 90NB1603-M002S0 | MANUFACTURE WARRANTY ONLY #13115"), "90NB1603-M002S0");
  assert.equal(partNumberInLine("LENOVO YOGA 7 3AA0F7 | BRAND NEW | ULTRA 7-256V | 16GB RAM | LUNA GREY | 83JT0047US | MANUFACTURE WARRANTY ONLY"), "83JT0047US");
  assert.equal(partNumberInLine("MSI VECTOR 16 HX AI FC8C51 | BRAND NEW | 1TB SSD | COSMO GRAY | 9S7-15M352-436 | MANUFACTURE WARRANTY ONLY #13113"), "9S7-15M352-436");
  assert.equal(partNumberInLine("DELL ALIENWARE 16 73B1DA | BLUE | 69YX2C4 #13040"), "69YX2C4");
  assert.equal(partNumberInLine("HP ELITEBOOK | RENEWED PAINT AND TESTED | 11TH GEN I7-1185G7 | 32GB | 512GB SSD | 2560X1600 | DOS | ONE MONTHS WARRANTY"), "");
  // Inventory Overview's Condition filter reads the condition from the description, in any position or case.
  assert.equal(inventoryItemCondition("Dell Alienware 16", "73B1DA", "BRAND NEW | CORE 7-240H | 16GB RAM", "13040"), "BRAND NEW");
  assert.equal(inventoryItemCondition("HP EliteBook", "AB12CD", "Core i7 | open box | 16GB RAM"), "OPEN BOX");
  assert.equal(inventoryItemCondition("HP EliteBook", "AB12CD", "Core i7 | 16GB RAM"), "");
  assert.equal(inventoryItemLine("Dell Alienware 16 Aurora AC16250 73B1DA", "73B1DA", "BRAND NEW", "13040"), "DELL ALIENWARE 16 AURORA AC16250 73B1DA | BRAND NEW | #13040");
  assert.equal(inventoryItemDetails("CORE 7-240H | 16GB RAM | MANUFACTURE WARRANTY ONLY", "10754"), "CORE 7-240H | 16GB RAM | MANUFACTURE WARRANTY ONLY #10754");
  assert.equal(inventoryItemDetails("CORE 7-240H | MANUFACTURE WARRANTY ONLY #10754", "10754"), "CORE 7-240H | MANUFACTURE WARRANTY ONLY #10754");
  assert.equal(inventoryItemDetails("CORE 7-240H | ITEM NO. #10754", "10754"), "CORE 7-240H #10754");
  assert.equal(inventoryShareDescription("BRAND NEW | NO | DOS | NO #13041", "13041"), "BRAND NEW | DOS");
  assert.equal(inventoryShareDescription("BRAND NEW | 16GB RAM | ITEM NO. #13041", "13041"), "BRAND NEW | 16GB RAM");
  // WhatsApp, Telegram and Email copies leave out the "#Item No.".
  assert.equal(inventoryItemLine("Dell XPS", "ABC123", "BRAND NEW | 16GB RAM | ITEM NO. #13040", "13040", false), "DELL XPS ABC123 | BRAND NEW | 16GB RAM");
  assert.equal(inventoryItemLine("Dell Alienware 16 Aurora AC16250", "73B1DA", "BRAND NEW | CORE 7-240H | NO | 16GB RAM"), "DELL ALIENWARE 16 AURORA AC16250 73B1DA | BRAND NEW | CORE 7-240H | 16GB RAM");
  assert.equal(inventorySocialShareText("Dell Alienware 16 Aurora AC16250", "73B1DA", "BRAND NEW | CORE 7-240H | NO | 16GB RAM", "whatsapp", "13040"), "🔺 *DELL ALIENWARE 16 AURORA AC16250 73B1DA* 🔺 | ⚡ *BRAND NEW* ⚡ |\n*CORE 7-240H | 16GB RAM*");
  // Share emoji styles: a chosen style replaces the title and condition marks; "No emoji" (or an administrator's off switch) leaves plain text.
  assert.equal(inventorySocialShareText("Dell XPS", "ABC123", "BRAND NEW | 16GB RAM", "whatsapp", "13040", { title: "🔥", condition: "✨" }), "🔥 *DELL XPS ABC123* 🔥 | ✨ *BRAND NEW* ✨ |\n*16GB RAM*");
  assert.equal(inventorySocialShareText("Dell XPS", "ABC123", "BRAND NEW | 16GB RAM", "telegram", "13040", { title: "", condition: "" }), "**DELL XPS ABC123** | **BRAND NEW** |\n**16GB RAM**");
  for (const condition of ["BRAND NEW", "OPEN BOX", "REFURBISHED", "USED"]) assert.match(inventorySocialShareText("Test model", "ABC123", `${condition} | NO | 16GB RAM`, "telegram"), new RegExp(`🔺 \\*\\*TEST MODEL ABC123\\*\\* 🔺 \\| ⚡ \\*\\*${condition}\\*\\* ⚡ \\|\\n\\*\\*16GB RAM\\*\\*`));
  assert.equal(itemSpecificationDescription("DELL ALIENWARE | 16 AURORA AC16250 | SKU: 73B1DA | BRAND NEW | ITEM NO. #13040", "DELL ALIENWARE 16 AURORA AC16250", "73B1DA", "13040"), "BRAND NEW");
  assert.equal(invoiceItemDescription("BRAND NEW | ITEM NO. #13040", "13040"), "BRAND NEW | ITEM NO. #13040");
  const app = readFileSync(new URL("../app/enterprise-app.tsx", import.meta.url), "utf8");
  const overview = readFileSync(new URL("../app/inventory-overview.tsx", import.meta.url), "utf8");
  const records = readFileSync(new URL("../app/api/records/route.ts", import.meta.url), "utf8");
  assert.match(app, /Duplicate draft .* is not saved\. Press Save record to create it, or Cancel to discard it/);
  assert.doesNotMatch(app, /duplicateItemId: id/);
  assert.match(app, /duplicateOfItemId/);
  assert.match(app, /Generated SKU/);
  assert.match(records, /previewIdentity/);
  assert.match(records, /generatedItemDescription\(specifications, name, sku, itemNumber\)/);
  assert.match(overview, /inventorySocialShareText\(record\.name, record\.sku, description, channel, record\.itemNumber, emoji\)/);
  // Shared copies leave out Product Customization Details (no "Screen:" line).
  assert.doesNotMatch(overview, /`Screen: \$\{/);
  assert.match(overview, /const description = shareSpecificationText\(record\);/);
  assert.match(overview, /\{ value: shareSpecificationText\(record\) \}/);
  assert.doesNotMatch(overview, /"Screen Details"\]/);
  assert.match(app, /const documentItemLineDescription = .*inventoryItemLine\(item\.name, item\.sku, inventoryShareDescription\(itemDisplayDescription\(item\), item\.itemNumber\)\)/);
  assert.match(overview, /w-full max-w-full whitespace-normal break-words.*\[overflow-wrap:anywhere\]/);
  const salesTemplate = readFileSync(new URL("../app/sales-document-template.tsx", import.meta.url), "utf8");
  assert.match(salesTemplate, /label: "CUSTOMER COPY", ref: customerPreview/);
  assert.match(salesTemplate, /label: "INVENTORY TEAM COPY", ref: inventoryPreview/);
  assert.match(salesTemplate, /showItemNumberAtEnd=\{inventoryCopy\}/);
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

test("Warranty slips: customer slips hide the supplier, supplier receipts hide the customer, files carry the customer name", () => {
  const warranty = readFileSync(new URL("../app/warranty-center.tsx", import.meta.url), "utf8");
  const rows = warranty.match(/const documentRows = supplierReceipt\s*\/\/[^\n]*\n\s*\? (\[\[.*?\]\])\n\s*: (\[\[.*?\]\]);/s);
  assert.ok(rows, "document rows");
  const [, supplierRows, customerRows] = rows;
  const labels = (list) => [...list.matchAll(/\["([^"]+)",/g)].map((match) => match[1]);
  assert.deepEqual(labels(customerRows), ["Brand", "Specifications", "Serial #", "Problem", "Remarks", "Returned for repair", "Received back from repair", "Status"], "no supplier name or bill on the customer slip");
  assert.doesNotMatch(customerRows, /supplierName|purchaseNumber|purchaseDate/);
  assert.doesNotMatch(supplierRows, /customer|contact/i, "no customer on the supplier receipt");
  assert.doesNotMatch(customerRows + supplierRows, /Model|Included items|customerReference/);
  assert.doesNotMatch(warranty, /Customer ID/);
  assert.doesNotMatch(warranty, /Included items \/ accessories/);
  assert.match(warranty, /<label className=\{fieldClass\}>Problem <span className="text-red-600">\*<\/span>/);
  assert.match(warranty, /documentPdfFileName\(partyName/);
  assert.match(warranty, /<title>\$\{fileTitle/);
});

test("supplier bills and Warranty RMA slips are connected in both directions", () => {
  const app = readFileSync(new URL("../app/enterprise-app.tsx", import.meta.url), "utf8");
  const warranty = readFileSync(new URL("../app/warranty-center.tsx", import.meta.url), "utf8");
  const api = readFileSync(new URL("../app/api/warranty-slips/route.ts", import.meta.url), "utf8");
  assert.match(app, /Warranty \/ RMA connection/);
  assert.match(app, /warranty-bill-open/);
  assert.match(app, /comnet-warranty-source-bill/);
  assert.match(app, /setWarrantySourceBillId\(billId\)/);
  assert.match(app, /initialPurchaseBillId=\{warrantySourceBillId\}/);
  assert.match(warranty, /sourcePurchaseBillId/);
  assert.match(warranty, /purchaseBillId=\$\{sourcePurchaseBillId\}/);
  assert.match(warranty, /purchaseBillId: bill\.id, purchaseNumber: bill\.number, purchaseDate: bill\.transactionDate/);
  assert.match(warranty, /Supplier bill/);
  assert.match(warranty, /Linked purchase bill/);
  assert.match(warranty, /Open purchase bill/);
  assert.match(warranty, /Delete warranty receipt/);
  assert.match(api, /export async function DELETE/);
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
  assert.match(pnl, /pnl-table-desktop report-table/);
  assert.match(css, /\[data-appearance="dark"\] \.pnl-table-desktop tr:nth-child\(even\) \{ background: #14241f;/);
  assert.match(css, /\[data-appearance="dark"\] \.pnl-table-desktop tr\[data-kind="total"\][^{]*\{ background: #123c2e; color: #d1fae5;/);
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
  const table = readFileSync(new URL("../components/ui/table.tsx", import.meta.url), "utf8");
  const overview = readFileSync(new URL("../app/inventory-overview.tsx", import.meta.url), "utf8");
  const pricing = readFileSync(new URL("../app/stock-pricing.tsx", import.meta.url), "utf8");
  const revaluation = readFileSync(new URL("../app/stock-revaluation.tsx", import.meta.url), "utf8");
  const catalogue = readFileSync(new URL("../app/shared-item-catalogue.tsx", import.meta.url), "utf8");
  assert.match(css, /Shared responsive contract for every application workspace and modal/);
  assert.match(css, /@media screen and \(max-width: 767px\)/);
  assert.match(css, /@media screen and \(min-width: 768px\) and \(max-width: 1180px\)/);
  assert.match(css, /\[data-slot="dialog-content"\][\s\S]*width: calc\(100vw - \.75rem\) !important/);
  assert.match(css, /\[data-slot="table-container"\][\s\S]*-webkit-overflow-scrolling: touch/);
  assert.match(table, /type ResponsiveColumn = "quantity" \| "price" \| "amount"/);
  assert.match(table, /data-responsive-column=\{responsiveColumn\}/);
  assert.match(css, /\[data-responsive-column="quantity"\][\s\S]*clamp\(4\.5rem, 10cqi, 7rem\)/);
  assert.match(css, /\[data-responsive-column="price"\],[\s\S]*\[data-responsive-column="amount"\][\s\S]*clamp\(6\.5rem, 16cqi, 10rem\)/);
  assert.match(css, /@container \(min-width: 520px\)[\s\S]*\.transaction-line/);
  assert.match(css, /@container \(min-width: 520px\)[\s\S]*\.bill-item-row/);
  assert.match(overview, /responsiveColumn="quantity"[\s\S]*responsiveColumn="price"/);
  assert.match(app, /responsiveColumn="quantity">On hand[\s\S]*responsiveColumn="price">Sales price/);
  assert.match(pricing, /responsiveColumn="quantity">QTY[\s\S]*responsiveColumn="price">SELLING PRICE/);
  assert.match(revaluation, /responsiveColumn="quantity">QTY[\s\S]*responsiveColumn="price">PRICE/);
  assert.match(catalogue, /label==='Qty'\?'quantity'/);
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

test("invoice and bill edits keep compact line comments once and invoice offers add line at the bottom", () => {
  const editor = readFileSync(new URL("../app/enterprise-app.tsx", import.meta.url), "utf8");
  const extraFields = readFileSync(new URL("../app/document-extra-fields.tsx", import.meta.url), "utf8");
  assert.match(editor, /lineExtraTypes\.includes\(form\.type\).*<DocumentExtraFields/);
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
  assert.match(center, /A4 \{orientation\}/);
  assert.match(center, /<PrintOrientationSelect value=\{orientation\}/);
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
  const poReceiving = readFileSync(new URL("../app/purchase-order-receiving.tsx", import.meta.url), "utf8");
  const template = readFileSync(new URL("../app/custom-invoice-template.tsx", import.meta.url), "utf8");
  const defaults = readFileSync(new URL("../lib/standard-vat-codes.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../drizzle/0068_uae_import_goods_documents.sql", import.meta.url), "utf8");
  assert.match(defaults, /IMPORT_GOODS[\s\S]*Goods imported into the UAE/);
  assert.match(api, /usesImportGoodsVat[\s\S]*"bill", "purchase order"/);
  assert.match(api, /Bill of Entry No\. and Airway Bill No\./);
  assert.match(app, /name="billOfEntryNumber"/);
  assert.match(app, /name="airwayBillNumber"/);
  assert.match(app, /Search Bill of Entry No\./);
  assert.match(app, /kind=bill-of-entry-search/);
  assert.match(api, /kind === "bill-of-entry-search"/);
  assert.match(api, /eq\(transactions\.companyId, companyId\)[\s\S]*eq\(transactions\.type, "bill"\)[\s\S]*billOfEntryNumber/);
  assert.match(app, /usesImportGoodsVat[\s\S]*documentLabel=\{form\.type === "bill" \? "Bill" : "Invoice"\}/);
  assert.match(poReceiving, /hasImportGoodsVat[\s\S]*lineVat\(line\)\.code === "IMPORT_GOODS"[\s\S]*line\.remaining > 0/);
  assert.match(poReceiving, /\{hasImportGoodsVat && <section[\s\S]*Bill of Entry No\.[\s\S]*Airway Bill No\./);
  assert.match(poReceiving, /required=\{usesImportGoodsVat\}/);
  assert.match(template, /Bill of Entry No\./);
  assert.match(template, /Airway Bill No\./);
  assert.match(migration, /bill_of_entry_number/);
  assert.match(migration, /airway_bill_number/);
});

test("memorised reports live in Report Center categories with selectable A4 print and PDF actions", () => {
  const app = readFileSync(new URL("../app/enterprise-app.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(app, /\["All", "Memorised Reports", \.\.\.availableCategories\]/);
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

test("all 15 Profit & Loss reports share professional A4 output, movable stamps, and source-document links", () => {
  const app = readFileSync(new URL("../app/enterprise-app.tsx", import.meta.url), "utf8");
  const pnlView = readFileSync(new URL("../app/profit-loss-report.tsx", import.meta.url), "utf8");
  const api = readFileSync(new URL("../app/api/reports/route.ts", import.meta.url), "utf8");
  const pnlExport = readFileSync(new URL("../lib/pnl-export.ts", import.meta.url), "utf8");
  const sharedExport = readFileSync(new URL("../lib/report-export.ts", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const definitions = [...app.matchAll(/\["[^"]+",\s*"[^"]+",\s*"Profit & Loss",\s*"([^"]+)"\]/g)].map((match) => match[1]);
  assert.equal(definitions.length, 15);
  assert.equal(new Set(definitions).size, 15);
  assert.match(app, /const profitLossReportKeys = new Set\(\[[^\]]+"item-profitability"\]\)/);
  assert.match(app, /const stampReport = [^;]+isProfitLossReport/);
  assert.match(app, /sourceTransactionId > 0[\s\S]*onOpenSource\(sourceTransactionId\)/);
  assert.match(app, /onProfitLossArea/);
  assert.match(pnlView, /report\.key === "profit-loss-item"[\s\S]*onOpenItem/);
  assert.match(pnlView, /"profit-loss-rep", "profit-loss-customer", "profit-loss-rep-grn", "profit-loss-customer-grn", "profit-loss-job", "profit-loss-class"[\s\S]*onOpenArea/);
  assert.match(api, /sourceReferenceTransactionId: value\.sourceTransactionId/);
  assert.match(pnlExport, /orientation: PrintOrientation = "portrait"/);
  assert.match(pnlExport, /new jsPDF\(\{ orientation, format: "a4", unit: "mm" \}\)/);
  assert.match(pnlExport, /pdf\.addImage\(image\.data/);
  assert.match(sharedExport, /orientation: PrintOrientation = "portrait"/);
  assert.match(css, /@page pnl \{ size: A4 portrait; margin: 10mm; \}/);
});

test("all 16 Financial reports share professional A4 output, movable stamps, and document-area links", () => {
  const app = readFileSync(new URL("../app/enterprise-app.tsx", import.meta.url), "utf8");
  const financial = readFileSync(new URL("../app/financial-report.tsx", import.meta.url), "utf8");
  const sharedExport = readFileSync(new URL("../lib/report-export.ts", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const definitions = [...app.matchAll(/\["[^"]+",\s*"[^"]+",\s*"Financial",\s*"([^"]+)"\]/g)].map((match) => match[1]);
  assert.equal(definitions.length, 16);
  assert.equal(new Set(definitions).size, 16);
  assert.match(app, /const financialReportKeys = new Set\(\[[^\]]+"cash-flow-forecast"\]\)/);
  assert.match(app, /const stampReport = [^;]+isFinancialReport/);
  assert.match(app, /financial-dialog.*financialLandscape/);
  assert.match(financial, /title="Open source document"[\s\S]*onOpen\(Number\(row\.transactionId\)\)/);
  assert.match(financial, /title="Open full account history"[\s\S]*setAccount/);
  assert.match(sharedExport, /orientation: PrintOrientation = "portrait"/);
  assert.match(css, /@page financial-portrait \{ size: A4 portrait; margin: 10mm; \}/);
  assert.match(css, /@page financial-landscape \{ size: A4 portrait; margin: 10mm; \}/);
});

test("all 4 Budget reports have summaries, one export control, A4 output, account links, and movable stamps", () => {
  const app = readFileSync(new URL("../app/enterprise-app.tsx", import.meta.url), "utf8");
  const budget = readFileSync(new URL("../lib/budget-report.ts", import.meta.url), "utf8");
  const sharedExport = readFileSync(new URL("../lib/report-export.ts", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const definitions = [...app.matchAll(/\["[^"]+",\s*"[^"]+",\s*"Budgets",\s*"([^"]+)"\]/g)].map((match) => match[1]);
  assert.deepEqual(definitions, ["budget-overview", "budget-actual", "budget-profit-loss", "budget-actual-graph"]);
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
  assert.match(app, /\(isSalesReport \|\| isCustomerReport\) && \["customer", "name", "party"\][\s\S]*onCustomer/);
  assert.match(api, /transactionId: row\.id, date: row\.transactionDate, number: row\.number/);
  assert.match(api, /sourceReferenceTransactionId: value\.sourceTransactionId/);
  assert.match(sales, /export const salesReportKeys = new Set/);
  assert.match(sharedExport, /orientation: PrintOrientation = "portrait"/);
  assert.match(css, /@page sales-report \{ size: A4 portrait; margin: 10mm; \}/);
  assert.match(css, /\.report-dialog\.sales-report-dialog/);
  assert.match(css, /\[data-appearance="dark"\] \.report-dialog \.sales-summary/);
});

test("all 16 Customer reports have professional summaries, one export control, A4 output, linked documents, customer links, and movable stamps", () => {
  const app = readFileSync(new URL("../app/enterprise-app.tsx", import.meta.url), "utf8");
  const openBalance = readFileSync(new URL("../app/customer-open-balance.tsx", import.meta.url), "utf8");
  const api = readFileSync(new URL("../app/api/reports/route.ts", import.meta.url), "utf8");
  const customer = readFileSync(new URL("../lib/customer-report.ts", import.meta.url), "utf8");
  const sharedExport = readFileSync(new URL("../lib/report-export.ts", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const definitions = [...app.matchAll(/\["[^"]+",\s*"[^"]+",\s*"Customers",\s*"([^"]+)"\]/g)].map((match) => match[1]);
  assert.equal(definitions.length, 16);
  assert.equal(new Set(definitions).size, 16);
  assert.match(app, /customerOverview && <section className="customer-summary"/);
  assert.match(app, /isBudgetReport \|\| isSalesReport \|\| isCustomerReport \|\| isVendorReport \|\| isPurchaseReport \|\| isInventoryReport \|\| isBankingReport \|\| isAccountantReport \? <DropdownMenu>/);
  assert.match(app, /stampReport = [^;]+\|\| isCustomerReport/);
  assert.match(app, /\(isSalesReport \|\| isCustomerReport\) && \["customer", "name", "party"\][\s\S]*onCustomer/);
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

test("all 10 Purchase reports have professional summaries, one export control, A4 output, linked documents, supplier links, and movable stamps", () => {
  const app = readFileSync(new URL("../app/enterprise-app.tsx", import.meta.url), "utf8");
  const api = readFileSync(new URL("../app/api/reports/route.ts", import.meta.url), "utf8");
  const purchase = readFileSync(new URL("../lib/purchase-report.ts", import.meta.url), "utf8");
  const sharedExport = readFileSync(new URL("../lib/report-export.ts", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const definitions = [...app.matchAll(/\["[^"]+",\s*"[^"]+",\s*"Purchases",\s*"([^"]+)"\]/g)].map((match) => match[1]);
  assert.equal(definitions.length, 10);
  assert.equal(new Set(definitions).size, 10);
  assert.match(app, /purchaseOverview && <section className="purchase-summary"/);
  assert.match(app, /isBudgetReport \|\| isSalesReport \|\| isCustomerReport \|\| isVendorReport \|\| isPurchaseReport \|\| isInventoryReport \|\| isBankingReport \|\| isAccountantReport \? <DropdownMenu>/);
  assert.match(app, /const stampReport = isVendorReport \|\| isPurchaseReport/);
  assert.match(app, /const vendorLink = isVendorReport[\s\S]*isPurchaseReport[\s\S]*purchases-by-vendor[\s\S]*onVendor/);
  assert.match(api, /transactionId: row\.id, supplier: row\.party/);
  assert.match(api, /transactionId: line\.transactionId, \.\.\.purchaseAccountFor\(line\.transactionId\), supplier: line\.party/);
  assert.match(purchase, /export const purchaseReportKeys = new Set/);
  assert.match(sharedExport, /orientation: PrintOrientation = "portrait"/);
  assert.match(sharedExport, /purchaseSummary/);
  assert.match(css, /@page purchase-report \{ size: A4 portrait; margin: 10mm; \}/);
  assert.match(css, /\.report-dialog\.purchase-report-dialog/);
  assert.match(css, /\[data-appearance="dark"\] \.report-dialog \.purchase-summary/);
});

test("all 10 Inventory reports have professional summaries, one export control, A4 output, links, attachments, and movable stamps", () => {
  const app = readFileSync(new URL("../app/enterprise-app.tsx", import.meta.url), "utf8");
  const api = readFileSync(new URL("../app/api/reports/route.ts", import.meta.url), "utf8");
  const inventory = readFileSync(new URL("../lib/inventory-report.ts", import.meta.url), "utf8");
  const sharedExport = readFileSync(new URL("../lib/report-export.ts", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const definitions = [...app.matchAll(/\["[^"]+",\s*"[^"]+",\s*"Inventory",\s*"([^"]+)"\]/g)].map((match) => match[1]);
  assert.equal(definitions.length, 10);
  assert.equal(new Set(definitions).size, 10);
  assert.match(app, /inventoryOverview && <section className="inventory-summary"/);
  assert.match(app, /isBudgetReport \|\| isSalesReport \|\| isCustomerReport \|\| isVendorReport \|\| isPurchaseReport \|\| isInventoryReport \|\| isBankingReport \|\| isAccountantReport \? <DropdownMenu>/);
  assert.match(app, /stampReport = [^;]+isInventoryReport/);
  assert.match(app, /isInventoryReport && \["name", "sku", "itemNumber"\][\s\S]*onInventoryItem/);
  assert.match(app, /onInventoryItem=\{\(query\) => \{ setReport\(null\); setSearch\(query\); setView\("inventory"\); \}\}/);
  assert.match(app, /reportAttachmentId\(report\.key\)/);
  assert.match(app, /entityType="report" documentLabel="Report"/);
  assert.match(app, /relative flex flex-col items-center gap-3 text-center/);
  assert.match(api, /inventoryAccountLinkFor/);
  assert.match(api, /inventoryAssetAccountLink\(item, allAccounts, currency\)/);
  assert.match(inventory, /accountAccountId: account\?\.id \?\? 0/);
  assert.match(api, /itemId: row\.id, \.\.\.inventoryAccountLinkFor\(row\)/);
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
  assert.match(app, /customization: \["customization-details"\]/);
  assert.match(auth, /customization: \["workspace:read", "inventory:read", "customization:manage"\]/);
  assert.match(api, /requireCompanyAccess\(request, companyId, "customization:manage", true\)/);
  assert.match(api, /skuWrite\("item-customization", handlePatch\)/);
  assert.match(page, />Summary</);
  assert.equal((page.match(/<DropdownMenu>/g) || []).length, 1);
  assert.match(page, /A4 \{orientation\} PDF/);
  assert.match(page, /onOpenInventory\(record\.sku\)/);
  assert.match(page, /Drag to move product details/);
  assert.match(page, /dark:bg-amber-950/);
  assert.match(migration, /customization_details/);
});

test("Inventory Overview exposes read-only customization popups and received age to every inventory reader", () => {
  const app = readFileSync(new URL("../app/enterprise-app.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/inventory-overview.tsx", import.meta.url), "utf8");
  const api = readFileSync(new URL("../app/api/inventory-overview/route.ts", import.meta.url), "utf8");
  assert.match(app, /sales: \["announcements", "my-notes", "cargos", "dashboard", "sales", "customers", "inventory-overview"\]/);
  assert.match(app, /view === "inventory-overview" \? <InventoryOverview(?: [^>]*)? \/>/);
  assert.doesNotMatch(app, /view === "inventory-overview" \? currentUser\.role === "sales"/);
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
  assert.match(api, /referenceTransactionId: transaction\?\.id \?\? 0/);
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

test("all 14 Lists reports have professional summaries, one export control, A4 output, correct area links, and movable stamps", () => {
  const app = readFileSync(new URL("../app/enterprise-app.tsx", import.meta.url), "utf8");
  const api = readFileSync(new URL("../app/api/reports/route.ts", import.meta.url), "utf8");
  const lists = readFileSync(new URL("../lib/list-report.ts", import.meta.url), "utf8");
  const sharedExport = readFileSync(new URL("../lib/report-export.ts", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const definitions = [...app.matchAll(/\["[^"]+",\s*"[^"]+",\s*"Lists",\s*"([^"]+)"\]/g)].map((match) => match[1]);
  assert.equal(definitions.length, 14);
  assert.equal(new Set(definitions).size, 14);
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

test("customer payments use non-VAT payment details and a linked A4 receipt", () => {
  const app = readFileSync(new URL("../app/enterprise-app.tsx", import.meta.url), "utf8");
  const receipt = readFileSync(new URL("../app/customer-payment-receipt.tsx", import.meta.url), "utf8");
  const api = readFileSync(new URL("../app/api/records/route.ts", import.meta.url), "utf8");
  const schema = readFileSync(new URL("../db/schema.ts", import.meta.url), "utf8");
  assert.match(app, /receivePayment && <div className="space-y-2"><Label>Payment method \*<\/Label>/);
  assert.match(app, /receivePayment && <Field label="Reference No\." name="referenceNo"/);
  assert.match(app, /!receivePayment && <><div className="space-y-2"><Label htmlFor="cash-vat-code">VAT code<\/Label>/);
  assert.match(receipt, /Customer Payment Receipt · A4 \{orientation\}/);
  assert.match(receipt, /@page\{size:A4 \$\{orientation\}/);
  assert.match(receipt, /createA4LetterheadPdfBlob/);
  assert.match(receipt, /LetterheadStamp/);
  assert.match(receipt, /documentLabel="Customer Payment"/);
  assert.match(receipt, /new ResizeObserver\(fitPreview\)/);
  assert.match(receipt, /transform: `scale\(\$\{preview\.scale\}\)`/);
  assert.match(receipt, /withoutPreviewScale\(page\)/);
  assert.match(receipt, /transform:none!important/);
  assert.match(receipt, /withUnscaledPage\(pageRef\.current/);
  assert.match(app, /customer payment.*style=\{\{ width: "calc\(100vw - 1rem\)", maxWidth: "1180px" \}\}.*overflow-x-hidden overflow-y-auto px-3/s);
  assert.match(api, /Customer payments must use zero VAT/);
  assert.match(api, /paymentMethod, referenceNo/);
  assert.match(schema, /paymentMethod: text\("payment_method"\)/);
  assert.match(schema, /referenceNo: text\("reference_no"\)/);
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
  assert.match(dialog, /modal=\{windowState === "minimized" \? false : modal\}/);
  assert.match(dialog, /window\?\.windowState === "minimized"\) return null/);
  assert.match(dialog, /if \(windowState === "minimized"\) event\.preventDefault\(\)/);
  assert.match(dialog, /data-window-dock-index=\{window\?\.dockIndex \?\? 0\}/);
  assert.match(dialog, /else if \(onMinimize\) onMinimize\(\)/);
  assert.match(app, /useState<MinimizedEditorWindow\[]>\(\[\]\)/);
  assert.match(app, /setMinimizedEditors\(\(current\) => \[\.\.\.current, draft\]\)/);
  assert.match(app, /aria-label="Minimized application windows"/);
  assert.match(app, /onMinimize=\{minimizeEditor\}/);
  assert.match(css, /data-record-kind="transactions"/);
  assert.match(css, /data-window-state="maximized"/);
  assert.match(css, /data-window-state="maximized"\][\s\S]*?top: \.5rem !important;[\s\S]*?right: \.5rem !important;[\s\S]*?bottom: \.5rem !important;[\s\S]*?left: \.5rem !important;[\s\S]*?--tw-translate-x: 0px !important;[\s\S]*?--tw-translate-y: 0px !important;/);
  assert.match(css, /data-window-state="minimized"/);
  assert.match(css, /var\(--dialog-dock-bottom, 1rem\)/);
  assert.match(selector, /<SelectItem value="portrait">Portrait<\/SelectItem>/);
  assert.match(selector, /<SelectItem value="landscape">Landscape<\/SelectItem>/);
  assert.match(app, /useState<PrintOrientation>\("portrait"\)/);
  assert.match(app, /report-print-\$\{printOrientation\}/);
  assert.match(documents, /orientationChoice\[activeMode\] \?\? \(activeMode === "packing-list" \? "landscape" : "portrait"\)/);
  assert.match(packing, /useState<PrintOrientation>\("landscape"\)/);
  assert.match(packing, /@page\{size:A4 \$\{packingOrientation\}/);
  // PDF output draws each element's own text at its position: labels and values are separate elements, and the
  // totals avoid "→", which the standard PDF font cannot encode.
  assert.match(packing, /<strong>Customer Name:<\/strong> <span>\$\{escapeHtml\(data\.invoice\.party\)\}<\/span>/);
  // The printed packing list leaves out the item number (no "#13115" line under the description).
  assert.match(packing, /<td class="description"><span>\$\{escapeHtml\(line\.description\)\}<\/span><\/td>/);
  assert.doesNotMatch(packing, /→/);
  assert.match(documents, /activeMode === "delivery-note" \|\| activeMode === "packing-list" \? withoutPrices\(layout\) : layout/);
  assert.match(css, /@page \{ size: A4 portrait; margin: 10mm; \}/);
});

test("supplier bills have direct attachments and A4 template output with a movable stamp", () => {
  const app = readFileSync(new URL("../app/enterprise-app.tsx", import.meta.url), "utf8");
  const template = readFileSync(new URL("../app/sales-document-template.tsx", import.meta.url), "utf8");
  const attachmentApi = readFileSync(new URL("../app/api/attachments/route.ts", import.meta.url), "utf8");
  assert.match(app, /\["bill", "Bills"\]/);
  assert.match(app, /title="View"[\s\S]{0,900}documentTypeLabel\(r\.type\)\} attachments/);
  assert.match(app, /documentLabel=\{documentTypeLabel\(attachmentRecord\.type\)\}/);
  assert.match(app, /"bill", "purchase order"/);
  assert.match(template, /bill: "Supplier Bill"/);
  assert.match(template, /case "bill": return "bill"/);
  assert.match(template, /const movableStamp = true/);
  assert.match(template, /createA4PdfBlob/);
  assert.match(attachmentApi, /purchaseAttachmentTypes\.has\(type\)\) return hasPermission\(user, "purchases:write"\)/);
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
  // Windows with nothing to save (Workspace shortcuts: "Receive Payment" is a link) close without asking.
  assert.match(closer, /container\.closest\("\[data-no-save-prompt\]"\)/);
  assert.match(readFileSync(new URL("../app/workspace-shortcuts.tsx", import.meta.url), "utf8"), /<DialogContent [^>]*data-no-save-prompt/);
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

test("sales register exports preserve currency and the recorded account without treating drafts as revenue", () => {
  const rows = [
    { transactionDate: "2026-10-01", type: "estimate", number: "EST-1", party: "Customer", status: "open", currency: "AED", total: 100, account: "Customer AED Receivable" },
    { transactionDate: "2026-10-02", type: "invoice", number: "INV-2", party: "Customer", status: "open", currency: "USD", total: 200, account: "Customer USD Receivable" },
  ];
  const report=recordListReport("sales","transactions",rows,"AED","2026-10-01","2026-10-02");
  assert.equal(report.key,"sales-document-register");
  assert.match(report.description,/Non-posting documents are not revenue/);
  assert.deepEqual(report.rows.map(row=>[row.currency,row.amount,row.postingAccount]),[["AED",100,"Customer AED Receivable"],["USD",200,"Customer USD Receivable"]]);
  assert.ok(report.columns.some(column=>column.key==="postingAccount"));
});


test("purchase register exports retain supplier accounts and separate currencies and stages", () => {
  const rows = [
    { transactionDate: "2026-10-01", type: "purchase order", number: "PO-1", party: "Supplier", status: "open", currency: "AED", total: 100, account: "Supplier AED Payable" },
    { transactionDate: "2026-10-02", type: "bill", number: "BILL-2", party: "Supplier", status: "open", currency: "USD", total: 200, account: "Supplier USD Payable" },
  ];
  const report = recordListReport("purchases", "transactions", rows, "AED", "2026-10-01", "2026-10-02");
  assert.equal(report.key, "purchase-document-register");
  assert.match(report.description, /Orders are non-posting commitments/);
  assert.deepEqual(report.rows.map(row => [row.currency, row.amount, row.postingAccount]), [["AED", 100, "Supplier AED Payable"], ["USD", 200, "Supplier USD Payable"]]);
  assert.ok(report.columns.some(column => column.key === "postingAccount"));
});


test("report stamp clears the final table and moves to a new page when space runs out", async () => {
  const { reportStampAfterTable } = await sourceModule("../lib/report-stamp.ts");
  assert.deepEqual(reportStampAfterTable(297, 150, 50, 23), { newPage: false, top: 158 });
  assert.deepEqual(reportStampAfterTable(297, 120, 230, 23), { newPage: false, top: 230 });
  assert.deepEqual(reportStampAfterTable(297, 275, 230, 23), { newPage: true, top: 230 });
  assert.deepEqual(reportStampAfterTable(210, 180, 260, 23), { newPage: true, top: 169 });
});

test('contact hierarchy rejects cross-owner links and leaves opening balances outside organization updates', async () => {
  const { contactOrganization } = await sourceModule('../lib/contact-hierarchy.ts');
  const current = {id:3,companyId:1,type:'customer',status:'active',parentContactId:null,salesOwnerId:10};
  const rows = [{...current,id:1,salesOwnerId:20},{...current,id:2,salesOwnerId:10}];
  assert.throws(()=>contactOrganization({parentContactId:1},current,rows,10),/accessible parent/);
  assert.deepEqual(contactOrganization({parentContactId:2,status:'inactive',balance:999},current,rows,10),{parentContactId:2,status:'inactive'});
  assert.throws(()=>contactOrganization({status:'invalid'},current,rows),/Active or Inactive/);
  const report = recordListReport('customers','contacts',[{name:'Branch',parentContactName:'Parent',status:'inactive',balance:45,currency:'AED'}],'AED','','');
  assert.equal(report.rows[0].parent,'Parent');assert.equal(report.rows[0].status,'inactive');assert.equal(report.rows[0].balance,45);
});

test("share editor formatting bar wraps words and prefixes lines like WhatsApp", () => {
  // Bold on WhatsApp uses *…*, on Telegram **…**; formatting again removes it. An empty selection inserts a placeholder.
  assert.deepEqual(applyInlineFormat("Price 2500", 6, 10, "bold", "whatsapp"), { text: "Price *2500*", start: 7, end: 11 });
  assert.deepEqual(applyInlineFormat("Price *2500*", 7, 11, "bold", "whatsapp"), { text: "Price 2500", start: 6, end: 10 });
  assert.equal(applyInlineFormat("Hot deal", 0, 3, "strike", "telegram").text, "~~Hot~~ deal");
  assert.deepEqual(applyInlineFormat("Note: ", 6, 6, "italic", "whatsapp"), { text: "Note: _text_", start: 7, end: 11 });
  // Lists and quotes prefix every selected line and toggle off when all lines already have the prefix.
  const lines = "Laptop A\nLaptop B\nCall us";
  assert.equal(applyLineFormat(lines, 0, 17, "numbered").text, "1. Laptop A\n2. Laptop B\nCall us");
  assert.equal(applyLineFormat("- A\n- B", 0, 7, "bulleted").text, "A\nB");
  assert.equal(applyLineFormat(lines, 20, 20, "quote").text, "Laptop A\nLaptop B\n> Call us");
  assert.deepEqual(inlineFormatsFor("email"), []);
});

test("UAE e-invoicing readiness lists what the company, customer and invoice still need", () => {
  const company = { trn: "100123456700003", addressLine1: "Office 1", city: "Dubai", country: "United Arab Emirates", peppolParticipantId: "0235:100123456700003", einvoiceAsp: "Example ASP" };
  assert.equal(isUaeTrn("100-1234-5670-0003"), true);
  assert.deepEqual(companyEInvoiceIssues(company), []);
  assert.deepEqual(companyEInvoiceIssues({ ...company, trn: "123", peppolParticipantId: "", einvoiceAsp: "" }), ["Company TRN (15 digits)", "Peppol participant ID", "Accredited Service Provider"]);
  // A customer without a TRN is B2C; a UAE customer with a wrong TRN or no country needs completing.
  assert.equal(customerEInvoiceStatus({ name: "Walk-in", country: "United Arab Emirates" }).status, "b2c");
  assert.deepEqual(customerEInvoiceStatus({ name: "Techno", country: "United Arab Emirates", trn: "12345", addressLine1: "Office 5", city: "Dubai" }), { status: "issues", issues: ["Customer TRN must have 15 digits"] });
  // A business customer (with a TRN) also needs a street address and city.
  assert.deepEqual(customerEInvoiceStatus({ name: "Techno", country: "United Arab Emirates", trn: "100123456700003" }), { status: "issues", issues: ["Customer address and city"] });
  assert.deepEqual(customerEInvoiceStatus({ name: "Techno", country: "" , trn: "100123456700003", addressLine1: "Office 5", city: "Dubai" }), { status: "issues", issues: ["Customer country"] });
  const buyer = { name: "Techno", country: "United Arab Emirates", trn: "100987654300003", addressLine1: "Office 5, Al Barsha", city: "Dubai" };
  assert.deepEqual(invoiceEInvoiceStatus({ number: "INV-1", transactionDate: "2026-10-10", currency: "AED" }, buyer, company), { status: "ready", issues: [] });
  assert.deepEqual(invoiceEInvoiceStatus({ number: "INV-1", transactionDate: "2026-10-10", currency: "USD", exchangeRate: 0 }, undefined, { ...company, einvoiceAsp: "" }).issues, ["Company e-invoicing setup incomplete", "Exchange rate to AED", "Customer not found in Customer Center"]);
});

test("forgot password sends single-use, expiring, hashed reset links without revealing accounts", () => {
  const route = readFileSync(new URL("../app/api/auth/password-reset/route.ts", import.meta.url), "utf8");
  const schema = readFileSync(new URL("../db/schema.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../drizzle/0103_password_reset_tokens.sql", import.meta.url), "utf8");
  const login = readFileSync(new URL("../app/login-screen.tsx", import.meta.url), "utf8");
  assert.match(schema, /passwordResetTokens = pgTable\("password_reset_tokens"[\s\S]*tokenHash[\s\S]*usedAt/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "password_reset_tokens"[\s\S]*ON DELETE cascade/);
  assert.equal((route.match(/if \(!sameOrigin\(request\)\)/g) ?? []).length, 2);
  assert.match(route, /randomBytes\(32\)\.toString\("base64url"\)/);
  assert.match(route, /tokenHash: tokenDigest\(token\)/);
  assert.match(route, /MAX_LINKS_PER_HOUR = 3/);
  // Reset links use the configured public address (lib/app-url.ts), never the request's Host header.
  assert.match(route, /appBaseUrl\(request\)/);
  assert.match(readFileSync(new URL("../lib/app-url.ts", import.meta.url), "utf8"), /NEXT_PUBLIC_APP_URL/);
  // Same answer for known and unknown emails, and the token is claimed atomically before the password changes.
  assert.match(route, /return Response\.json\(\{ ok: true, message: sentMessage \}/);
  assert.match(route, /isNull\(passwordResetTokens\.usedAt\), gt\(passwordResetTokens\.expiresAt, now\)/);
  assert.match(route, /newPassword\.length < 12 \|\| newPassword\.length > 128/);
  assert.match(route, /lockedUntil: null[\s\S]*delete\(authSessions\)\.where\(eq\(authSessions\.userId, user\.id\)\)/);
  assert.match(login, /Forgot password\?/);
  assert.match(login, /searchParams\.get\("reset"\)[\s\S]*searchParams\.delete\("reset"\)/);
});

test("invoices print the customer's postal address under Bill To", () => {
  assert.deepEqual(contactAddressLines({ addressLine1: " Office 12, Bay Tower ", addressLine2: "", city: "Dubai", region: "Dubai", postalCode: "", country: "United Arab Emirates" }), ["Office 12, Bay Tower", "Dubai", "United Arab Emirates"]);
  assert.deepEqual(contactAddressLines({ addressLine1: "1 Main St", addressLine2: "Suite 4", city: "Austin", region: "TX", postalCode: "78701", country: "United States" }, false), ["1 Main St", "Suite 4", "Austin, TX 78701"]);
  assert.deepEqual(contactAddressLines(null), []);
  const invoice = readFileSync(new URL("../app/custom-invoice-template.tsx", import.meta.url), "utf8");
  const deliveryNote = readFileSync(new URL("../app/delivery-note-template.tsx", import.meta.url), "utf8");
  assert.match(invoice, /billTo:\[contact\?\.billingName\|\|contact\?\.company\|\|record\.party,\.\.\.contactAddressLines\(contact\),String\(contact\?\.trn\?\?''\)\.trim\(\)\?`TRN \$\{/);
  assert.match(deliveryNote, /customerTrn \? <p className="dn-customer-trn"><strong>Customer TRN \/ الرقم الضريبي للعميل:<\/strong> \{customerTrn\}<\/p>/);
  assert.match(invoice, /\.ci-meta p\{white-space:pre-line\}/);
  assert.match(deliveryNote, /customerAddress\.map/);
});

test("customer payment receipts show the customer's address and TRN under Received from", () => {
  const receipt = readFileSync(new URL("../app/customer-payment-receipt.tsx", import.meta.url), "utf8");
  const app = readFileSync(new URL("../app/enterprise-app.tsx", import.meta.url), "utf8");
  assert.match(receipt, /const customerAddress = contactAddressLines\(contact\)/);
  assert.match(receipt, /Received from<\/p>[\s\S]*customerAddress\.map[\s\S]*Customer TRN: \{customerTrn\}/);
  assert.match(app, /<CustomerPaymentReceipt [^>]*contact=\{detail\.partyContact\}/);
});

test("statements for one customer or vendor print their address and TRN under Statement for", () => {
  const api = readFileSync(new URL("../app/api/reports/route.ts", import.meta.url), "utf8");
  const layout = readFileSync(new URL("../app/statement-layout.tsx", import.meta.url), "utf8");
  assert.match(api, /const statementParty = customer \? customers\.find\(/);
  assert.match(api, /statementParty \? \{ partyAddress: contactAddressLines\(statementParty\), partyTrn: String\(statementParty\.trn \?\? ""\)\.trim\(\) \}/);
  assert.match(api, /vendor && statementParty \? \{ partyBank: vendorBankLines\(statementParty\) \}/);
  assert.match(layout, /Statement for<\/span>[\s\S]*statement\.partyAddress[\s\S]*TRN \{statement\.partyTrn\}/);
});

test("Today Offer: validated offer price and start/end, managed by administrators and inventory managers", () => {
  const now = Date.parse("2026-10-11T08:00:00Z");
  const ok = validateOffer({ offerPrice: "1499.999", startsAt: "2026-10-11T08:00:00Z", endsAt: "2026-10-11T19:59:00Z", note: " While stock lasts " }, now);
  assert.deepEqual(ok, { value: { offerPrice: 1500, offerQuantity: null, startsAt: "2026-10-11T08:00:00.000Z", endsAt: "2026-10-11T19:59:00.000Z", note: "While stock lasts" } });
  // Offer quantity: optional, above zero.
  const limited = { offerPrice: 10, startsAt: "2026-10-11T08:00:00Z", endsAt: "2026-10-11T20:00:00Z", note: "" };
  assert.equal(validateOffer({ ...limited, offerQuantity: " 12 " }, now).value.offerQuantity, 12);
  assert.equal(validateOffer({ ...limited, offerQuantity: "" }, now).value.offerQuantity, null);
  for (const bad of ["0", "-3", "abc", "2000000"]) assert.match(validateOffer({ ...limited, offerQuantity: bad }, now).error, /offer quantity above zero/);
  assert.equal(offerRemaining({ offerQuantity: 10, soldQuantity: 3 }), 7);
  assert.equal(offerRemaining({ offerQuantity: 10, soldQuantity: 12 }), 0);
  assert.equal(offerRemaining({ offerQuantity: null, soldQuantity: 5 }), null);
  assert.match(validateOffer({ offerPrice: 0, startsAt: "2026-10-11T08:00:00Z", endsAt: "2026-10-11T20:00:00Z", note: "" }, now).error, /above zero/);
  assert.match(validateOffer({ offerPrice: 10, startsAt: "2026-10-11T20:00:00Z", endsAt: "2026-10-11T08:00:00Z", note: "" }, now).error, /end after it starts/);
  assert.match(validateOffer({ offerPrice: 10, startsAt: "2026-10-10T08:00:00Z", endsAt: "2026-10-11T07:00:00Z", note: "" }, now).error, /in the future/);
  assert.match(validateOffer({ offerPrice: 10, startsAt: "2026-10-11T08:00:00Z", endsAt: new Date(now + (OFFER_MAX_DAYS + 1) * 86_400_000).toISOString(), note: "" }, now).error, /up to 31 days/);
  assert.equal(offerState({ startsAt: "2026-10-11T07:00:00Z", endsAt: "2026-10-11T09:00:00Z" }, now), "active");
  assert.equal(offerState({ startsAt: "2026-10-11T09:00:00Z", endsAt: "2026-10-11T10:00:00Z" }, now), "scheduled");
  assert.equal(offerState({ startsAt: "2026-10-11T06:00:00Z", endsAt: "2026-10-11T08:00:00Z" }, now), "ended");
  assert.equal(offerTime("2026-10-11 13:44:28+04"), Date.parse("2026-10-11T09:44:28Z"));
  assert.equal(offerState({ startsAt: "2026-10-11 11:00:00+04", endsAt: "2026-10-11 13:00:00+04" }, now), "active");
  assert.deepEqual(["all_admin", "admin", "inventory", "accountant", "sales", "viewer"].map((role) => canManageOffers({ role })), [true, true, true, false, false, false]);
  const route = readFileSync(new URL("../app/api/item-offers/route.ts", import.meta.url), "utf8");
  const overview = readFileSync(new URL("../app/api/inventory-overview/route.ts", import.meta.url), "utf8");
  const ui = readFileSync(new URL("../app/inventory-overview.tsx", import.meta.url), "utf8");
  assert.equal((route.match(/requireCompanyAccess\(request, companyId, false, true\)/g) ?? []).length, 2);
  assert.equal((route.match(/if \(!canManageOffers\(user\)\)/g) ?? []).length, 2);
  assert.match(route, /eq\(items\.id, itemId\), eq\(items\.companyId, companyId\)/);
  assert.match(overview, /offers: offers\.map\(\(offer\) => \(\{ \.\.\.offer, createdByName: "" \}\)\)/);
  assert.match(ui, /label: "Today Offer", Icon: Tag, count: runningOffers\(offers, loadedAt\)\.length/);
});

test("WhatsApp, Telegram and email shares show a running Today Offer", () => {
  const base = { currency: "AED", normalPrice: 1800, offerPrice: 1599, endsAt: "2026-10-11 19:44:00+04", vatLabel: " (VAT excluded)" };
  // AM/PM casing depends on the runtime's locale data.
  const whatsapp = offerShareText({ ...base, channel: "whatsapp", mark: "🔥" });
  assert.equal(whatsapp.price, "~AED 1,800~ *AED 1,599* (VAT excluded)");
  assert.match(whatsapp.offerLine, /^🔥 \*TODAY OFFER\* until 11 Oct, 07:44 pm$/i);
  const telegram = offerShareText({ ...base, channel: "telegram" });
  assert.equal(telegram.price, "~~AED 1,800~~ **AED 1,599** (VAT excluded)");
  assert.match(telegram.offerLine, /^\*\*TODAY OFFER\*\* until 11 Oct, 07:44 pm$/i);
  assert.match(offerShareText({ ...base, channel: "whatsapp", remaining: 4 }).offerLine, /^\*TODAY OFFER\* until 11 Oct, 07:44 pm · only 4 left$/i, "limited offers say how many are left");
  assert.equal(offerShareText({ ...base, channel: "email" }).price, "AED 1,599 (was AED 1,800, VAT excluded)");
  assert.equal(offerShareText({ ...base, channel: "email", vatLabel: "" }).price, "AED 1,599 (was AED 1,800)");
  const ui = readFileSync(new URL("../app/inventory-overview.tsx", import.meta.url), "utf8");
  assert.match(ui, /const offerByItem = new Map\(runningOffers\(offers\)\.map/);
  assert.match(ui, /if \(offerText\) lines\.push\(offerText\.offerLine\)/);
});

test("Telegram copies paste already formatted: markdown becomes rich text", () => {
  assert.equal(telegramHtml("🔥 **ASUS VIVOBOOK** 🔥 | ✨ **BRAND NEW** ✨ |\n📦 Qty: 99 | 💵 ~~AED 8,800~~ **AED 8,400** (VAT included)"),
    "🔥 <b>ASUS VIVOBOOK</b> 🔥 | ✨ <b>BRAND NEW</b> ✨ |<br>📦 Qty: 99 | 💵 <s>AED 8,800</s> <b>AED 8,400</b> (VAT included)");
  assert.equal(telegramHtml("> __Today only__\n> `90NB1603-M002S0`\nAfter"), "<blockquote><i>Today only</i><br><code>90NB1603-M002S0</code></blockquote>After");
  assert.equal(telegramHtml("`**not bold**` <b>&"), "<code>**not bold**</code> &lt;b&gt;&amp;");
  const ui = readFileSync(new URL("../app/inventory-overview.tsx", import.meta.url), "utf8");
  assert.match(ui, /channel === "telegram" && typeof ClipboardItem !== "undefined"[\s\S]*"text\/html": new Blob\(\[telegramHtml\(text\)\]/);
});

test("Telegram share toolbar matches Telegram: underline, spoiler, monospace, quote and link", () => {
  assert.deepEqual(inlineFormatsFor("telegram"), ["bold", "italic", "underline", "strike", "code", "spoiler"]);
  assert.deepEqual(inlineFormatsFor("whatsapp"), ["bold", "italic", "strike", "code"]);
  assert.deepEqual(applyInlineFormat("WTS now", 0, 3, "underline", "telegram"), { text: "++WTS++ now", start: 2, end: 5 });
  assert.deepEqual(applyInlineFormat("WTS now", 0, 3, "spoiler", "telegram"), { text: "||WTS|| now", start: 2, end: 5 });
  assert.deepEqual(applyInlineFormat("WTS", 0, 3, "underline", "whatsapp"), { text: "WTS", start: 0, end: 3 });
  assert.deepEqual(applyLink("See shop", 4, 8, " https://comnet.ae/shop "), { text: "See [shop](https://comnet.ae/shop)", start: 5, end: 9 });
  assert.equal(applyLink("See shop", 4, 8, "javascript:alert(1)"), null);
  assert.equal(telegramHtml("++WTS++ ||secret|| [shop](https://comnet.ae/a?b=1&c=2)"), '<u>WTS</u> <tg-spoiler>secret</tg-spoiler> <a href="https://comnet.ae/a?b=1&amp;c=2">shop</a>');
  const ui = readFileSync(new URL("../app/inventory-overview.tsx", import.meta.url), "utf8");
  assert.match(ui, /editor\.channel === "telegram" \? \["quote"\] as LineFormat\[\]/);
  assert.match(ui, /aria-label="Link" className=\{toolButton\}/);
});

test("category colours: fixed light/dark palette, automatic colour per name, saved choice wins", () => {
  assert.equal(categoryPalette.length, 12);
  for (const color of categoryPalette) assert.match(color.row, /^bg-\w+-\d+ border-l-\w+-\d+ dark:bg-\w+-\d+\/\d+$/);
  assert.equal(categoryColorKey(" laptop "), "LAPTOP");
  assert.equal(categoryColorKey(""), "GENERAL");
  assert.equal(autoCategoryColor("laptop").id, autoCategoryColor("LAPTOP").id);
  assert.ok(new Set(["LAPTOP", "DESKTOP", "MONITOR", "PRINTER", "NETWORKING", "STORAGE", "ACCESSORY"].map((name) => autoCategoryColor(name).id)).size >= 4);
  assert.equal(categoryColor("Laptop", { LAPTOP: "rose" }).id, "rose");
  assert.equal(categoryColor("Laptop", { LAPTOP: "not-a-colour" }).id, autoCategoryColor("LAPTOP").id);
  assert.equal(isCategoryColor("teal"), true);
  assert.equal(isCategoryColor("#ff0000"), false);
  const route = readFileSync(new URL("../app/api/category-colors/route.ts", import.meta.url), "utf8");
  const specs = readFileSync(new URL("../app/api/spec-options/route.ts", import.meta.url), "utf8");
  const overview = readFileSync(new URL("../app/inventory-overview.tsx", import.meta.url), "utf8");
  assert.match(route, /requireApiUser\(request, false, true\)/);
  assert.match(route, /payload\.color === "auto"[\s\S]*isCategoryColor\(payload\.color\)/);
  assert.match(specs, /A renamed category keeps its colour/);
  assert.match(overview, /categoryColor\(category, categoryColors\)\.row/);
  assert.match(overview, /canManageCategories \? <span[^>]*><CategoryColorPicker compact/);
});

test("Excel export adds Today offer price and Offer ends columns only when an exported product has a running offer", () => {
  assert.match(offerEndsText("2026-10-11 19:44:00+04"), /^11 Oct, 07:44 pm$/i);
  const ui = readFileSync(new URL("../app/inventory-overview.tsx", import.meta.url), "utf8");
  assert.match(ui, /const offerColumns = showPrice && exportRecords\.some\(\(record\) => offerFor\(record\)\)/);
  assert.match(ui, /headers\.push\(`Today offer price\$\{mode === "include" \? " including 5% VAT" : mode === "zero" \? " \(0% VAT\)" : ""\}`, "Offer ends \(UAE time\)", "Offer quantity left"\)/);
  assert.match(ui, /priceFor\(\{ salesPrice: offer\.offerPrice \}, mode\)/);
});

test("Inventory Overview copy buttons and Excel export follow the Warehouse filter", () => {
  const ui = readFileSync(new URL("../app/inventory-overview.tsx", import.meta.url), "utf8");
  assert.match(ui, /const shareRecords = selectedRecords\.flatMap\(\(record\) => \{\s*const inventories = inWarehouse\(record\.inventories, warehouseFilter\);/);
  assert.match(ui, /const items = shareRecords\.map\(\(record\) => \{/);
  assert.match(ui, /format copied for \$\{shareRecords\.length\}/);
  assert.match(ui, /const exportRecords = shareRecords;/);
  assert.match(ui, /\.\.\.\(warehouseFilter \? \["Warehouse"\] : \[\]\)/);
  assert.match(ui, /const bodyRows = exportRecords\.map/);
  assert.match(ui, /with no stock there left out/);
});

test("Inventory Overview prints an A4 stock list that follows the Warehouse filter", () => {
  const ui = readFileSync(new URL("../app/inventory-overview.tsx", import.meta.url), "utf8");
  assert.match(ui, /const list = selectedRecords\.length \? shareRecords : filtered;/);
  assert.match(ui, /\.\.\.\(warehouseFilter \? \["Warehouse"\] : \[\]\), \.\.\.\(showQuantity \? \["Qty"\] : \[\]\)/);
  assert.match(ui, /warehouseLabel \|\| "All warehouses"/);
  assert.match(ui, /@page\{size:A4 \$\{printOrientation\};margin:12mm\}/);
  assert.match(ui, /aria-label="Print stock list"/);
});

test("email failures are explained in plain language and the login email can be sent again", () => {
  assert.equal(friendlyEmailError({ message: "Data command failed: 566 SMTP limit exceeded", responseCode: 566 }, undefined, { loginDetails: true }), "Your email provider's sending limit is reached. Copy the login details and send them yourself, or send the email again later. (Data command failed: 566 SMTP limit exceeded)");
  assert.match(friendlyEmailError({ message: "550 5.4.5 Daily user sending quota exceeded." }), /^Your email provider's sending limit is reached/);
  // Document and notification emails do not mention login details.
  const documentLimit = friendlyEmailError({ message: "Data command failed: 566 SMTP limit exceeded", responseCode: 566 });
  assert.match(documentLimit, /^Your email provider's sending limit is reached \(for turboSMTP, check your plan's quota in the turboSMTP dashboard\)/);
  assert.doesNotMatch(documentLimit, /login details/);
  assert.match(friendlyEmailError({ message: "Invalid login: 535 Authentication failed", code: "EAUTH", responseCode: 535 }), /^The email server rejected the SMTP username or password/);
  // turboSMTP: TLS on a STARTTLS port (or the reverse) and oversized attachments get plain advice.
  assert.match(friendlyEmailError({ message: "C0B6F1E401000000:error:0A00010B:SSL routines:ssl3_get_record:wrong version number", code: "ESOCKET" }), /^The security setting does not match the port\. Use port 465 with TLS, or port 587 or 2525 with STARTTLS/);
  assert.match(friendlyEmailError({ message: "552 5.3.4 Message size exceeds fixed limit", responseCode: 552 }), /^The email is larger than the email server accepts/);
  assert.match(friendlyEmailError({ message: "Connection timeout", code: "ETIMEDOUT" }), /^Could not reach the email server/);
  assert.match(friendlyEmailError({ message: "553 Sender address not allowed", responseCode: 553 }), /^The email server would not send from the sender address/);
  assert.equal(friendlyEmailError(new Error("Complete the SMTP settings first.")), "Complete the SMTP settings first.");
  assert.equal(friendlyEmailError(null, "The email could not be sent."), "The email could not be sent.");
  const route = readFileSync(new URL("../app/api/admin-users/route.ts", import.meta.url), "utf8");
  const resend = readFileSync(new URL("../app/api/admin-users/resend-invitation/route.ts", import.meta.url), "utf8");
  const ui = readFileSync(new URL("../app/user-role-center.tsx", import.meta.url), "utf8");
  // Resend has its own endpoint: same-origin user manager, administrator scope, only the unchanged temporary password, no update.
  assert.match(resend, /requireUserManager\(request, true\)/);
  assert.match(resend, /if \(isCompanyAdmin\(administrator\) && !canManage\(administrator, targetRole, await companyIdsForUser\(id\)\)\) return outOfScope\(\);/);
  assert.match(resend, /!target\.active \|\| !target\.mustChangePassword \|\| !\(await verifyPassword\(password, target\.passwordHash\)\)/);
  assert.doesNotMatch(resend, /\.update\(|\.insert\(|\.delete\(/);
  assert.doesNotMatch(route, /resendInvitation/);
  assert.equal((route.match(/friendlyEmailError\(error/g) ?? []).length, 2);
  assert.match(ui, /fetch\("\/api\/admin-users\/resend-invitation", \{ method: "POST"[\s\S]*password: createdCredentials\.password/);
  assert.match(ui, /createdCredentials\?\.emailWarning \? <div role="alert"[\s\S]*Send email again/);
});

test("Send test email sends a real message only to the signed-in All-Admin", () => {
  const route = readFileSync(new URL("../app/api/email-settings/test-email/route.ts", import.meta.url), "utf8");
  const ui = readFileSync(new URL("../app/smtp-settings.tsx", import.meta.url), "utf8");
  assert.match(ui, /id="smtp-username" type="text"/, "turboSMTP API consumer keys are not email addresses");
  assert.match(route, /requireApiUser\(request, true, true\)/);
  assert.match(route, /user\.role !== "all_admin"/);
  // Recipient is always the signed-in user's own address; the second argument is their own signature.
  assert.match(route, /await sendTestEmail\(user\.email, signature\)/);
  assert.match(route, /latestEmailSignature\(user\.id, request\)/);
  assert.doesNotMatch(route, /request\.json\(\)/);
  assert.match(route, /friendlyEmailError\(error, "The test email could not be sent\."\)/);
  assert.match(ui, /fetch\("\/api\/email-settings\/test-email", \{ method: "POST" \}\)/);
  assert.match(ui, /Send test email/);
});

test("item list shows each category as a pill in its Inventory Overview colour", () => {
  const app = readFileSync(new URL("../app/enterprise-app.tsx", import.meta.url), "utf8");
  const itemTable = app.slice(app.indexOf("function ItemTable("), app.indexOf("function ItemTable(") + 6000);
  assert.match(itemTable, /fetch\("\/api\/spec-options"\)[\s\S]*setSavedCategoryColors\(data\.categoryColors\)/);
  assert.match(itemTable, /categoryColor\(r\.category, savedCategoryColors\)\.row/);
});

test("Excel export colours each Category cell with its Inventory Overview colour", () => {
  for (const color of categoryPalette) {
    assert.match(color.fill, /^#[0-9A-F]{6}$/);
    assert.match(color.ink, /^#[0-9A-F]{6}$/);
  }
  assert.equal(categoryPalette.find((color) => color.id === "sky").fill, "#E0F2FE");
  const ui = readFileSync(new URL("../app/inventory-overview.tsx", import.meta.url), "utf8");
  assert.match(ui, /\{ value: record\.category, style: `Category-\$\{categoryColor\(record\.category, categoryColors\)\.id\}` \}/);
  assert.match(ui, /<Style ss:ID="Category-\$\{color\.id\}"><Interior ss:Color="\$\{color\.fill\}" ss:Pattern="Solid"\/><Font ss:Bold="1" ss:Color="\$\{color\.ink\}"\/><\/Style>/);
  assert.match(ui, /\$\{categoryStyles\}<\/Styles>/);
});

test("Integration API keys: random, stored only as a SHA-256 digest, read from Bearer or X-API-Key", () => {
  const { token, tokenPrefix, tokenDigest } = generateApiToken();
  assert.match(token, /^ebk_live_[A-Za-z0-9_-]{43}$/);
  assert.equal(tokenPrefix, token.slice(0, API_TOKEN_PREFIX.length + 6));
  assert.equal(tokenDigest, apiTokenDigest(token));
  assert.notEqual(generateApiToken().token, token);
  assert.equal(apiTokenFromHeaders(new Headers({ authorization: `Bearer ${token}` })), token);
  assert.equal(apiTokenFromHeaders(new Headers({ "x-api-key": token })), token);
  assert.equal(apiTokenFromHeaders(new Headers({ authorization: "Bearer not-a-key" })), null);
  assert.equal(apiTokenFromHeaders(new Headers({ authorization: `Basic ${token}` })), null);
});

test("Integration API v1: validated query, opaque cursor, no cost or supplier data, admin-only key management", () => {
  const url = (query) => new URL(`https://app.example/api/v1/products${query}`);
  assert.deepEqual(parseProductQuery(url("")), { limit: 50, cursor: "", updatedSince: null, category: "", inventory: "", includeInactive: false });
  const parsed = parseProductQuery(url(`?limit=10&cursor=${encodeCursor("12A304")}&updated_since=2026-10-11T08:00:00Z&category=laptop&inventory=MAIN&status=all`));
  assert.deepEqual(parsed, { limit: 10, cursor: "12A304", updatedSince: "2026-10-11T08:00:00.000Z", category: "laptop", inventory: "MAIN", includeInactive: true });
  assert.equal(decodeCursor(encodeCursor("SKU/é 1")), "SKU/é 1");
  assert.match(parseProductQuery(url("?limit=0")), /limit/);
  assert.match(parseProductQuery(url("?limit=201")), /limit/);
  assert.match(parseProductQuery(url("?updated_since=yesterday")), /updated_since/);
  assert.match(parseProductQuery(url("?status=deleted")), /status/);
  const api = readFileSync(new URL("../lib/public-api.ts", import.meta.url), "utf8");
  const product = api.slice(api.indexOf("function productJson("));
  for (const secret of ["cost", "grn_price", "last_purchase_price", "preferred_supplier", "account_id"]) assert.doesNotMatch(product, new RegExp(secret));
  assert.match(api, /isNull\(apiKeys\.revokedAt\), eq\(companies\.active, true\)/);
  assert.match(api, /consumeRateLimit\(`api:key:\$\{row\.id\}`, API_RATE_LIMIT, 60\)/);
  assert.match(api, /i\.company_id = \$\{client\.companyId\}/);
  const keys = readFileSync(new URL("../app/api/api-keys/route.ts", import.meta.url), "utf8");
  assert.equal((keys.match(/requireCompanyAccess\(request, companyId, true, true\)/g) ?? []).length, 2);
  assert.match(keys, /requireCompanyAccess\(request, companyId, true\)/);
  assert.doesNotMatch(keys.slice(keys.indexOf("const publicKey"), keys.indexOf("export async function GET")), /keyHash/);
  const migration = readFileSync(new URL("../drizzle/0106_public_api.sql", import.meta.url), "utf8");
  assert.match(migration, /CREATE TRIGGER trg_items_updated_at BEFORE UPDATE ON "items"/);
});

test("share bar: brand icons, No VAT / Inc VAT / 0% VAT, one Excel menu, kept on one line", () => {
  const ui = readFileSync(new URL("../app/inventory-overview.tsx", import.meta.url), "utf8");
  assert.match(ui, /const vatLabels: Record<VatMode, string> = \{ exclude: " \(VAT excluded\)", include: " \(VAT included\)", zero: " \(0% VAT\)" \}/);
  assert.match(ui, /mode === "include" \? 1\.05 : 1/);
  assert.match(ui, /\["exclude", "No VAT", [^\]]*\], \["include", "Inc VAT", [^\]]*\], \["zero", "0% VAT", [^\]]*\]/);
  // The VAT format is a dropdown (No VAT by default).
  assert.match(ui, /<select aria-label="Shared price VAT format".*value=\{vatMode\} onChange=\{\(event\) => setVatMode/);
  assert.match(ui, /useState<VatMode>\("exclude"\)/);
  assert.match(ui, /<WhatsAppIcon \/>/);
  assert.match(ui, /<TelegramIcon \/>/);
  assert.match(ui, /Hide qty<\/label>/);
  assert.match(ui, /exportExcel\("exclude"\)[\s\S]*exportExcel\("include"\)[\s\S]*exportExcel\("zero"\)/);
  assert.match(ui, /@container flex flex-wrap items-center gap-2 border-b px-4 py-2 whitespace-nowrap/);
  assert.match(ui, /@max-\[90rem\]:hidden/);
  assert.doesNotMatch(ui, /Excel no VAT|Excel \+ VAT<|Including VAT|Hide quantity/);
});

test("performance: balances summed in SQL, one grouped receipt query, indexed price changes, progressive tables", () => {
  const records = readFileSync(new URL("../app/api/records/route.ts", import.meta.url), "utf8");
  const overviewApi = readFileSync(new URL("../app/api/inventory-overview/route.ts", import.meta.url), "utf8");
  const overview = readFileSync(new URL("../app/inventory-overview.tsx", import.meta.url), "utf8");
  const app = readFileSync(new URL("../app/enterprise-app.tsx", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../drizzle/0107_performance_indexes.sql", import.meta.url), "utf8");
  // Account balances: grouped per account name and entry currency, not one row per journal line.
  assert.match(records, /\.groupBy\(journalLines\.accountName, sql`upper\(coalesce\(\$\{journalEntries\.currency\}, ''\)\)`\)/);
  assert.match(records, /entryCurrency === accountCurrency \? Number\(line\.nativeDebit\)/);
  // Inventory Overview: latest receipt per item from one GROUP BY, not a per-item subquery.
  assert.match(overviewApi, /GROUP BY movement\.item_id/);
  assert.doesNotMatch(overviewApi, /WHERE movement\.item_id = \$\{items\.id\}/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS "idx_audit_log_entity_created" ON "audit_log" \("entity_type", "created_at"\)/);
  // Large tables draw 150 rows at a time and load more on scroll or "Show more".
  assert.match(overview, /const OVERVIEW_PAGE_ROWS = 150;/);
  assert.match(overview, /visibleCategories\.flatMap\(\(\[category, items, total\]\)/);
  assert.match(overview, /new IntersectionObserver/);
  assert.match(app, /shownRecords\.map\(\(r\) =>/);
});
