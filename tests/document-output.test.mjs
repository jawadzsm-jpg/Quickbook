import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

test("A4 PDF download falls back to a valid page when canvas capture fails", async () => {
  // Load jsPDF in its Node environment before providing the minimal page DOM.
  await import("jspdf");
  const source = readFileSync(new URL("../lib/document-output.ts", import.meta.url), "utf8");
  const transformed = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    .replaceAll('import("jspdf")', `import(${JSON.stringify(import.meta.resolve("jspdf"))})`)
    .replace('import("html2canvas")', 'Promise.reject(new Error("Canvas capture unavailable"))');
  const { createA4LetterheadPdfBlob } = await import(`data:text/javascript;base64,${Buffer.from(transformed).toString("base64")}`);
  const rectangle = { left: 0, top: 0, right: 794, bottom: 1122, width: 794, height: 1122 };
  const page = {
    tagName: "ARTICLE", childNodes: [{ nodeType: 3, textContent: "Warranty slip" }],
    closest: () => null, getBoundingClientRect: () => rectangle,
    querySelector: () => null, querySelectorAll: () => [],
  };
  const originalWindow = globalThis.window;
  const originalNode = globalThis.Node;
  globalThis.Node = { TEXT_NODE: 3 };
  globalThis.window = { getComputedStyle: () => ({ display: "block", visibility: "visible", opacity: "1", backgroundColor: "#ffffff", color: "#111111", fontFamily: "Arial", fontWeight: "normal", fontStyle: "normal", fontSize: "12px", lineHeight: "16px", paddingLeft: "0", paddingRight: "0", paddingTop: "0", textAlign: "left" }) };
  try {
    const pdf = await createA4LetterheadPdfBlob(page, "Warranty Slip Test");
    const bytes = Buffer.from(await pdf.arrayBuffer());
    assert.equal(pdf.type, "application/pdf");
    assert.ok(bytes.length > 500);
    assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
    const mediaBox = bytes.toString("latin1").match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
    assert.ok(mediaBox);
    assert.ok(Math.abs(Number(mediaBox[1]) - 595.28) < 0.01);
    assert.ok(Math.abs(Number(mediaBox[2]) - 841.89) < 0.01);
  } finally {
    globalThis.window = originalWindow;
    globalThis.Node = originalNode;
  }
});

test("invoice preview renders different customer and inventory content with unchanged totals", async () => {
  const { createServer } = await import('vite');
  const { fileURLToPath } = await import('node:url');
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const root=fileURLToPath(new URL('..',import.meta.url));
  const vite=await createServer({appType:'custom',configFile:false,root,resolve:{alias:{'@':root}},server:{middlewareMode:true,hmr:false,ws:false}});
  try {
    const {SalesDocumentTemplate}=await vite.ssrLoadModule('/app/sales-document-template.tsx');
    const html=renderToStaticMarkup(React.createElement(SalesDocumentTemplate,{
      mode:'tax-invoice',record:{id:1,companyId:1,type:'invoice',number:'COPY-TEST',party:'Copy customer',currency:'AED',subtotal:100,vatAmount:5,total:105},
      lines:[{description:'CHARGED_VISIBLE',quantity:1,unitPrice:100,unitCost:0,subtotal:100,vatAmount:5,total:105},{description:'ZERO_INTERNAL',quantity:1,unitPrice:0,subtotal:0,total:0},{description:'RETURN_INTERNAL',quantity:-1,unitPrice:0,subtotal:0,total:0}],
      setup:{name:'Copy company',logoData:'',stampData:'',phone:'',trn:'',addressLine1:'',addressLine2:'',city:'',country:''},showBillingName:true,showShipping:true,showHsCode:false,showDimensions:false
    }));
    const customer=html.split('data-invoice-copy="customer"')[1].split('data-invoice-copy="inventory"')[0];
    const inventory=html.split('data-invoice-copy="inventory"')[1].split('class="invoice-print-only"')[0];
    const browserPrint=html.split('class="invoice-print-only"')[1];
    for(const output of [customer,browserPrint]) {
      assert.match(output,/CHARGED_VISIBLE/);
      assert.doesNotMatch(output,/ZERO_INTERNAL|RETURN_INTERNAL|STOCK RETURN/);
      assert.match(output,/105\.00/);
    }
    assert.match(inventory,/CHARGED_VISIBLE/);assert.match(inventory,/ZERO_INTERNAL/);
    assert.match(inventory,/STOCK RETURN \(\+1 TO INVENTORY\)/);assert.match(inventory,/RETURN_INTERNAL/);
    assert.match(inventory,/Inventory Copy/);assert.match(inventory,/105\.00/);
  } finally {await vite.close();}
});
