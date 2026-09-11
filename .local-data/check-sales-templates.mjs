import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const vite = await createServer({configFile:false,root:process.cwd(),server:{middlewareMode:true,hmr:false,ws:false}});
const browser = await chromium.launch({headless:true});
try {
const {SalesDocumentTemplate,salesDocumentTitles} = await vite.ssrLoadModule('/app/sales-document-template.tsx');
const page = await browser.newPage({viewport:{width:1100,height:1000}});
const props = {record:{type:'invoice',number:'10208',party:'CASH',transactionDate:'2026-09-10',dueDate:'2026-09-10',salesman:'Mojtaba Sayed',subtotal:4,vatAmount:0,total:4,currency:'AED',status:'open'},lines:[{id:1,description:'LAPTOP SERVICE CHARGES',quantity:1,unitPrice:4,subtotal:4,vatAmount:0,total:4,vatRate:0}],setup:{name:'Comnet International LLC',phone:'+971 50 910 3838 / +971 56 257 7000',trn:'100349940500003',logoData:'',addressLine1:'',addressLine2:'',city:'',country:''},showBillingName:true,showShipping:true,showHsCode:false,showDimensions:false};
for(const mode of Object.keys(salesDocumentTitles)) {
const html='<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body style="margin:0">'+renderToStaticMarkup(React.createElement(SalesDocumentTemplate,{...props,mode}))+'</body></html>';
await writeFile(`.local-data/${mode}-preview.html`,html);
await page.setContent(html);
await page.screenshot({path:`.local-data/${mode}-preview.png`,fullPage:true});
const pdf=await page.pdf({path:`.local-data/${mode}-preview.pdf`,preferCSSPageSize:true,printBackground:true});
const pages=(pdf.toString('latin1').match(/\/Type \/Page\b/g)||[]).length;
assert.equal(pages,1,`${mode} should fit A4`);
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
console.log(`${mode}: A4 one page, no horizontal overflow`);
}
await page.setViewportSize({width:390,height:844});
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Mobile overflow');
await page.screenshot({path:'.local-data/sales-template-mobile.png',fullPage:true});
const html=renderToStaticMarkup(React.createElement(SalesDocumentTemplate,{...props,mode:'tax-invoice',lines:Array.from({length:60},(_,i)=>({...props.lines[0],id:i+1,description:`Item ${i+1} — extended product description`}))}));
await page.setContent(html);
const pdf=await page.pdf({path:'.local-data/sales-template-multipage.pdf',preferCSSPageSize:true});
assert.ok((pdf.toString('latin1').match(/\/Type \/Page\b/g)||[]).length>1);
console.log('Mobile and 60-line multipage checks passed');
} finally {await browser.close();await vite.close();}
