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
