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
      lines:[{description:'CHARGED_VISIBLE',itemNumber:'13040',quantity:1,unitPrice:100,unitCost:0,subtotal:100,vatAmount:5,total:105},{description:'ZERO_INTERNAL',quantity:1,unitPrice:0,subtotal:0,total:0},{description:'RETURN_INTERNAL',quantity:-1,unitPrice:0,subtotal:0,total:0}],
      setup:{name:'Copy company',logoData:'',stampData:'',phone:'',trn:'',addressLine1:'',addressLine2:'',city:'',country:''},showBillingName:true,showShipping:true,showHsCode:false,showDimensions:false
    }));
    const customer=html.split('data-invoice-copy="customer"')[1].split('data-invoice-copy="inventory"')[0];
    const inventory=html.split('data-invoice-copy="inventory"')[1].split('class="invoice-print-only"')[0];
    const browserPrint=html.split('class="invoice-print-only"')[1];
    for(const output of [customer,browserPrint]) {
      assert.match(output,/CHARGED_VISIBLE/);
      assert.doesNotMatch(output,/ZERO_INTERNAL|RETURN_INTERNAL|STOCK RETURN/);
      assert.doesNotMatch(output,/ITEM NO\. #13040/);
      assert.match(output,/105\.00/);
    }
    assert.match(inventory,/CHARGED_VISIBLE/);assert.match(inventory,/ZERO_INTERNAL/);
    assert.match(inventory,/STOCK RETURN \(\+1 TO INVENTORY\)/);assert.match(inventory,/RETURN_INTERNAL/);
    assert.match(inventory,/Inventory Copy/);assert.match(inventory,/105\.00/);
    assert.match(inventory,/CHARGED_VISIBLE \| ITEM NO\. #13040/);
  } finally {await vite.close();}
});

test('saved customization resolves across document families and honors print-only fields', async () => {
  const {createServer}=await import('vite');
  const {fileURLToPath}=await import('node:url');
  const React=await import('react');
  const {renderToStaticMarkup}=await import('react-dom/server');
  const root=fileURLToPath(new URL('..',import.meta.url));
  const vite=await createServer({appType:'custom',configFile:false,root,resolve:{alias:{'@':root}},server:{middlewareMode:true,hmr:false,ws:false}});
  try {
    const {defaultDocumentDesign,resolveDocumentDesign,templateDocumentTypes}=await vite.ssrLoadModule('/lib/document-design.ts');
    const {CustomInvoiceTemplate}=await vite.ssrLoadModule('/app/custom-invoice-template.tsx');
    const design={...structuredClone(defaultDocumentDesign),name:'My approved company design',color:'#123456',message:'APPROVED FOOTER',properties:{},headers:[{key:'custom-header-print',label:'PRINT HEADER',screen:false,print:true,width:1},{key:'custom-header-screen',label:'SCREEN HEADER',screen:true,print:false,width:1}],columns:[{key:'description',label:'My item label',width:70,screen:true,print:true},{key:'quantity',label:'Screen quantity',width:30,screen:true,print:false}],customBoxes:[{id:'print-note',text:'APPROVED PRINT BOX',screen:false,print:true,left:0,down:600,width:200,height:40,fontSize:12,bold:false,border:true}]};
    const {savedTemplates:unused,...snapshot}=design;void unused;
    const settings=JSON.stringify({...defaultDocumentDesign,savedTemplates:[{id:'approved',name:'Approved',type:'Invoice',active:true,appliesToAll:true,design:snapshot}]});
    for(const type of templateDocumentTypes){const result=resolveDocumentDesign(settings,type);assert.equal(result.savedTemplate.id,'approved');assert.equal(result.design.enabled,true);assert.equal(result.design.color,'#123456');}
    const resolved=resolveDocumentDesign(settings,'Invoice').design;
    const props={design:resolved,record:{number:'INV-123',total:105},lines:[{description:'KEEP ITEM',quantity:2}],setup:{name:'Saved company',logoData:'',phone:'',trn:'',addressLine1:'',addressLine2:'',city:'',country:''}};
    const print=renderToStaticMarkup(React.createElement(CustomInvoiceTemplate,{...props,target:'print'}));
    assert.match(print,/PRINT HEADER/);assert.match(print,/APPROVED PRINT BOX/);assert.match(print,/APPROVED FOOTER/);assert.match(print,/KEEP ITEM/);assert.doesNotMatch(print,/SCREEN HEADER|Screen quantity/);
    const screen=renderToStaticMarkup(React.createElement(CustomInvoiceTemplate,{...props,target:'screen'}));
    assert.match(screen,/SCREEN HEADER/);assert.match(screen,/Screen quantity/);assert.doesNotMatch(screen,/PRINT HEADER|APPROVED PRINT BOX/);
    const specialized=renderToStaticMarkup(React.createElement(CustomInvoiceTemplate,{...props,target:'print',content:React.createElement('table',{},React.createElement('tbody',{},React.createElement('tr',{},React.createElement('td',{},'RECEIPT ALLOCATION 105.00'))))}));
    assert.match(specialized,/RECEIPT ALLOCATION 105.00/);assert.match(specialized,/APPROVED PRINT BOX/);assert.match(specialized,/Saved company/);assert.doesNotMatch(specialized,/KEEP ITEM/);
  } finally {await vite.close();}
});

test('long customized A4 PDF continues rows at readable scale without repeating off-page text', async () => {
  await import('jspdf');
  const source=readFileSync(new URL('../lib/document-output.ts',import.meta.url),'utf8');
  const transformed=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replaceAll('import("jspdf")',`import(${JSON.stringify(import.meta.resolve('jspdf'))})`);
  const {createA4PdfBlob}=await import(`data:text/javascript;base64,${Buffer.from(transformed).toString('base64')}`);
  const rect=(top,height)=>({left:0,right:794,top,bottom:top+height,width:794,height});
  const rows=Array.from({length:60},(_,i)=>({tagName:'TR',childNodes:[{nodeType:3,textContent:`UNIQUE_ROW_${String(i).padStart(2,'0')}`}],closest:()=>null,getBoundingClientRect:()=>rect(i*40,40),querySelectorAll:()=>[]}));
  const page={tagName:'ARTICLE',childNodes:[],closest:()=>null,getBoundingClientRect:()=>rect(0,2400),querySelectorAll:selector=>selector==='*'||selector==='tr, .ci-stamp-footer'?rows:[]};
  const originalWindow=globalThis.window,originalNode=globalThis.Node;
  globalThis.Node={TEXT_NODE:3};
  globalThis.window={getComputedStyle:()=>({display:'block',visibility:'visible',opacity:'1',backgroundColor:'#ffffff',color:'#111111',fontFamily:'Arial',fontWeight:'normal',fontStyle:'normal',fontSize:'12px',lineHeight:'16px',paddingLeft:'0',paddingRight:'0',paddingTop:'0',textAlign:'left'})};
  try {
    const blob=await createA4PdfBlob(page,{paginate:true,pageNumbers:true,marginMm:10});
    const bytes=Buffer.from(await blob.arrayBuffer());
    const raw=bytes.toString('latin1');
    const {inflateSync}=await import('node:zlib');
    const text=raw+Array.from(raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g),match=>{try{return inflateSync(Buffer.from(match[1],'latin1')).toString('latin1');}catch{return '';}}).join('\n');
    assert.equal((text.match(/\/Type \/Page\b/g)||[]).length,3);
    for(let i=0;i<60;i++)assert.equal((text.match(new RegExp(`UNIQUE_ROW_${String(i).padStart(2,'0')}`,'g'))||[]).length,1);
    assert.match(text,/Page 3 of 3/);
  } finally {globalThis.window=originalWindow;globalThis.Node=originalNode;}
});

test('document stamp is after totals and disappears completely when switched off', async () => {
  const {createServer}=await import('vite');
  const {fileURLToPath}=await import('node:url');
  const React=await import('react');
  const {renderToStaticMarkup}=await import('react-dom/server');
  const root=fileURLToPath(new URL('..',import.meta.url));
  const vite=await createServer({appType:'custom',configFile:false,root,ssr:{noExternal:['next']},plugins:[{name:'test-next-image',enforce:'pre',resolveId(id){if(id==='next/image')return '\0test-image';},load(id){if(id==='\0test-image')return `import {createElement} from 'react'; export default function Image({unoptimized,...props}) { return createElement('img',props); }`;}}],resolve:{alias:{'@':root}},server:{middlewareMode:true,hmr:false,ws:false}});
  try {
    const {defaultDocumentDesign}=await vite.ssrLoadModule('/lib/document-design.ts');
    const {CustomInvoiceTemplate}=await vite.ssrLoadModule('/app/custom-invoice-template.tsx');
    const props={design:defaultDocumentDesign,record:{total:105,currency:'AED'},lines:[{description:'ITEM ROW',quantity:1,unitPrice:100,total:105}],setup:{name:'Company',logoData:'',stampData:'data:image/png;base64,AA==',phone:'',trn:'',addressLine1:'',addressLine2:'',city:'',country:''},stampPlacement:'footer',target:'print'};
    const render=show=>renderToStaticMarkup(React.createElement(CustomInvoiceTemplate,{...props,stampOverride:{show,left:50,top:0}}));
    const on=render(true),off=render(false);
    assert.ok(on.indexOf('class="ci-stamp-footer"')>on.indexOf('class="ci-bottom"'));
    assert.match(on,/alt="Company stamp"/);
    assert.doesNotMatch(off,/class="ci-stamp-footer"|alt="Company stamp"/);
    assert.match(off,/ITEM ROW/);
  } finally {await vite.close();}
});
