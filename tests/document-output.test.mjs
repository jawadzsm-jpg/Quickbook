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
