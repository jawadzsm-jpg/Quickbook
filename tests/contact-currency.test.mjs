import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../lib/contact-currency.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { applyContactCurrency, customerReceivableAccount, vendorPayableAccount } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

const contacts = [
  { name: "Local Customer", type: "customer", currency: "AED" },
  { name: "Overseas Customer", type: "customer", currency: "USD" },
  { name: "Overseas Supplier", type: "vendor", currency: "EUR" },
];
const rates = [
  { currencyCode: "USD", rate: 3.67 },
  { currencyCode: "EUR", rate: 4.31 },
];

test("selecting a customer automatically applies its currency and saved rate", () => {
  const result = applyContactCurrency({ currency: "AED", exchangeRate: "1" }, contacts, "Overseas Customer", "customer", rates, "AED");
  assert.deepEqual(result, { party: "Overseas Customer", currency: "USD", exchangeRate: "3.67" });
});

test("selecting a supplier automatically applies its currency and saved rate", () => {
  const result = applyContactCurrency({ currency: "AED", exchangeRate: "1" }, contacts, "Overseas Supplier", "vendor", rates, "AED");
  assert.deepEqual(result, { party: "Overseas Supplier", currency: "EUR", exchangeRate: "4.31" });
});

test("base currency uses rate one and a missing foreign rate remains editable", () => {
  assert.equal(applyContactCurrency({}, contacts, "Local Customer", "customer", rates, "AED").exchangeRate, "1");
  assert.equal(applyContactCurrency({}, [{ name: "GBP Supplier", type: "vendor", currency: "GBP" }], "GBP Supplier", "vendor", rates, "AED").exchangeRate, "");
});

test("purchase order vendor selects its linked payable account in the document currency", () => {
  const vendors = [{ name: "Supplier A", type: "vendor", currency: "USD", ledgerAccountId: 12 }];
  const accounts = [
    { id: 11, name: "Default USD Payable", systemRole: "AP", currency: "USD", active: true },
    { id: 12, name: "Supplier USD Payable", systemRole: "AP", currency: "USD", active: true },
    { id: 13, name: "AED Payable", systemRole: "AP", currency: "AED", active: true },
  ];
  assert.equal(vendorPayableAccount(vendors, accounts, "Supplier A", "USD"), "Supplier USD Payable");
  assert.equal(vendorPayableAccount(vendors, accounts, "Supplier A", "AED"), "AED Payable");
  assert.equal(vendorPayableAccount(vendors, accounts, "Supplier A", "EUR"), "");
});


test("customer sales documents select the linked receivable account in the document currency", () => {
  const customers = [{ name: "Customer A", type: "customer", currency: "USD", ledgerAccountId: 22 }];
  const accounts = [
    { id: 21, name: "Default USD Receivable", systemRole: "AR", currency: "USD", active: true },
    { id: 22, name: "Customer USD Receivable", systemRole: "AR", currency: "USD", active: true },
    { id: 23, name: "AED Receivable", systemRole: "AR", currency: "AED", active: true },
  ];
  assert.equal(customerReceivableAccount(customers, accounts, "Customer A", "USD"), "Customer USD Receivable");
  assert.equal(customerReceivableAccount(customers, accounts, "Customer A", "AED"), "AED Receivable");
  assert.equal(customerReceivableAccount(customers, accounts, "Customer A", "EUR"), "");
});
