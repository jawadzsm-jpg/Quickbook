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
  const source = readFileSync(new URL("../app/purchase-return-source.tsx", import.meta.url), "utf8");
  const api = readFileSync(new URL("../app/api/records/route.ts", import.meta.url), "utf8");
  const template = readFileSync(new URL("../app/sales-document-template.tsx", import.meta.url), "utf8");
  assert.match(app, /label: "Return Purchases"/);
  assert.match(app, /function VendorCenter[\s\S]*label: "Return Purchases"/);
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

test("memorised reports live in Report Center categories with A4 print and PDF actions", () => {
  const app = readFileSync(new URL("../app/enterprise-app.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(app, /\["All", "Memorised Reports", \.\.\.reportCategoryOrder\]/);
  assert.match(app, /onOpenMemorised\(savedReport\)/);
  assert.match(app, /definition\?\.\[1\] \|\| `Linked to \$\{category\} reports`/);
  assert.match(app, /<Printer className="size-4" \/>Print · A4/);
  assert.match(app, /kind === "pdf" \? "PDF · A4"/);
  assert.match(css, /@page report \{ size: A4 landscape; margin: 10mm; \}/);
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

test("UAE bank cheque is linked to Banking and supports save and print", () => {
  const app = readFileSync("app/enterprise-app.tsx", "utf8");
  const cheque = readFileSync("app/uae-bank-cheque.tsx", "utf8");
  const layouts = readFileSync("lib/uae-cheque-layouts.ts", "utf8");
  assert.match(app, /Write UAE Bank Cheque/);
  assert.match(app, /data-action="save-print"/);
  assert.match(app, /A\/C Payee Only \(recommended\)/);
  assert.match(app, /Cheque bank layout \*/);
  assert.match(app, /<UaeBankCheque record=\{record\}/);
  assert.match(cheque, /Print on bank cheque/);
  assert.match(cheque, /Print A4 voucher/);
  assert.match(cheque, /Edit cheque number/);
  assert.match(cheque, /editMode: "cheque-number"/);
  assert.match(cheque, /printIsolatedDocument/);
  assert.match(cheque, /@page\{size:\$\{selectedLayout\.widthMm\}mm \$\{selectedLayout\.heightMm\}mm;margin:0\}/);
  const css = readFileSync("app/globals.css", "utf8");
  assert.match(css, /uae-cheque-document > :not\(\.uae-cheque-print-layer\)/);
  assert.doesNotMatch(css, /document-print-surface > :not\(\.uae-cheque-print-layer\)/);
  assert.match(css, /\[data-slot="dialog-content"\]:has\(\.document-print-surface\)/);
  assert.match(css, /data-cheque-print-mode="voucher"\][\s\S]*\.document-print-surface \{ position: static/);
  assert.match(cheque, /Horizontal offset \(mm\)/);
  assert.match(cheque, /MAX_ALIGNMENT_OFFSET_MM = 20/);
  assert.match(cheque, /Alignment reset to 0 mm/);
  assert.match(cheque, /Amount in words/);
  assert.match(cheque, /printWindow\.print\(\)/);
  for (const bank of ["Emirates NBD", "First Abu Dhabi Bank", "ADCB", "Dubai Islamic Bank", "Mashreq", "RAKBANK", "Habib Bank AG Zurich", "Wio Business"]) assert.match(layouts, new RegExp(bank));
  assert.match(layouts, /UAE_CHEQUE_WIDTH_MM = 190\.5/);
  assert.match(layouts, /UAE_CHEQUE_HEIGHT_MM = 88\.9/);
  assert.equal((layouts.match(/widthMm: UAE_CHEQUE_WIDTH_MM, heightMm: UAE_CHEQUE_HEIGHT_MM/g) || []).length, 5);
  assert.match(layouts, /habib:[\s\S]*widthMm: UAE_CHEQUE_WIDTH_MM, heightMm: UAE_CHEQUE_HEIGHT_MM/);
  assert.match(layouts, /habib:[\s\S]*date: \{ left: 105, top: 14\.5, width: 50 \}/);
  assert.match(layouts, /habib:[\s\S]*amount: \{ left: 136, top: 55, width: 50 \}/);
  assert.match(layouts, /"habib-bank-ag-zurich", "Habib Bank AG Zurich", "habib"/);
  assert.match(cheque, /\.amount\{[^}]*white-space:nowrap/);
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
