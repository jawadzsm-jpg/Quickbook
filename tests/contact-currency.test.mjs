import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../lib/contact-currency.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { applyContactCurrency } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

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
