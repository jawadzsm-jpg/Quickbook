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

test("email validation accepts ordinary addresses and rejects malformed or oversized input", () => {
  for (const email of ["name@example.com", "name+sales@example.co.uk"]) assert.equal(isValidEmail(email), true);
  for (const email of ["", "@example.com", "name@@example.com", "name@example", "name@.com", "name@example..com", "name @example.com", "!@".repeat(100_000), "!@!.".repeat(100_000)]) assert.equal(isValidEmail(email), false);
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
