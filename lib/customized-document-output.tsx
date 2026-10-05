import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { CustomInvoiceTemplate, type TemplateBranding } from '@/app/custom-invoice-template';
import type { OutputOptions } from '@/app/company-document-output';
import { resolveDocumentDesign } from './document-design';
import { createA4PdfBlob } from './document-output';
import type { ReportExportData, ReportExportRow } from './report-export';

// Native bodies keep their own document fields and financial columns. The saved
// customization supplies the surrounding brand, typography, boxes and footer.
function nativeBody(element:HTMLElement) {
  const clone=element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('script,style,.sr-only,[aria-hidden="true"],.print\\:hidden,.document-internal-only,.letterhead-brand,.letterhead-stamp,.letterhead-drag-handle,img[alt="Company stamp"]').forEach(n=>n.remove());
  clone.querySelectorAll('button,[role="button"]').forEach(node=>{const span=document.createElement('span');span.textContent=node.textContent;node.replaceWith(span);});
  clone.querySelectorAll('h1,header h2').forEach(node=>node.remove());
  clone.removeAttribute('style');clone.removeAttribute('class');
  for(const node of [clone,...clone.querySelectorAll<HTMLElement>('*')]) {
    node.removeAttribute('id');node.removeAttribute('class');
    for(const property of ['position','inset','top','bottom','left','right','transform','height','min-height','max-height','width','min-width','max-width','overflow','font-family','font-size','color','background','background-color'])node.style.removeProperty(property);
    if(node.tagName==='IMG'){node.style.maxWidth='100%';node.style.maxHeight='90px';}
    if(node.tagName==='TABLE'){node.style.width='100%';node.style.tableLayout='fixed';node.style.borderCollapse='collapse';}
    if(['TH','TD'].includes(node.tagName)){node.style.padding='7px';node.style.border='1px solid #cbd5e1';node.style.overflowWrap='anywhere';}
    if(['INPUT','TEXTAREA','SELECT'].includes(node.tagName)){const text=document.createElement('span');text.textContent=(node as HTMLInputElement).value;node.replaceWith(text);}
  }
  return clone.outerHTML;
}
export async function customizedDocumentPdf(element:HTMLElement,company:TemplateBranding&{documentDesign?:string},options:OutputOptions) {
  const stampNode=element.querySelector<HTMLElement>('.letterhead-stamp, img[alt="Company stamp"]');
  const stampImage=stampNode?.tagName==='IMG'?stampNode as HTMLImageElement:stampNode?.querySelector('img');
  if(!options.stamp&&stampNode&&stampImage)options={...options,stamp:{data:stampImage.src,left:Number.isFinite(parseFloat(stampNode.style.left))?parseFloat(stampNode.style.left):145,top:Number.isFinite(parseFloat(stampNode.style.top))?parseFloat(stampNode.style.top):230}};
  const {design,savedTemplate}=resolveDocumentDesign(company.documentDesign,options.type);
  const record=options.record||{};
  const resolved={...design,title:savedTemplate?.type===options.type&&!savedTemplate.appliesToAll?design.title:options.title,paper:'A4' as const,orientation:options.orientation||design.orientation,
    headers:design.headers.filter(f=>f.key.startsWith('custom-header-')||({number:record.number,date:record.transactionDate,billTo:record.party,trn:company.trn} as Record<string,unknown>)[f.key]!==undefined),
    footer:design.footer.filter(f=>['message','disclaimer'].includes(f.key)||f.key.startsWith('custom-footer-'))};
  const host=document.createElement('div');host.dataset.outputRender="true";host.style.cssText=`position:fixed;left:-20000px;top:0;width:${resolved.orientation==='landscape'?297-resolved.margin*2:210-resolved.margin*2}mm;background:white;z-index:-1`;
  document.body.appendChild(host);const root=createRoot(host);
  try {
    flushSync(()=>root.render(createElement(CustomInvoiceTemplate,{design:resolved,record,lines:[],setup:{...company,stampData:options.stamp?.data||company.stampData},target:'print',stampPlacement:'footer',stampOverride:options.stamp?{show:true,left:options.stamp.left,top:options.stamp.top}:undefined,content:createElement('div',{className:'customized-native-content',dangerouslySetInnerHTML:{__html:nativeBody(element)}})})));
    await document.fonts.ready;
    await Promise.all([...host.querySelectorAll('img')].map(image=>image.complete?Promise.resolve():new Promise<void>(resolve=>{const timer=setTimeout(resolve,10000);image.onload=()=>{clearTimeout(timer);resolve();};image.onerror=()=>{clearTimeout(timer);resolve();};})));
    const page=host.querySelector<HTMLElement>('.custom-invoice');if(!page)throw new Error('Could not prepare the customized document.');
    return await createA4PdfBlob(page,{orientation:resolved.orientation,marginMm:resolved.margin,title:options.title,paginate:true,pageNumbers:resolved.printPageNumbers});
  }finally{root.unmount();host.remove();}
}
export function reportDocumentElement(report:ReportExportData,inventory:string,rows:ReportExportRow[],overview:{cards:Array<{label:string;value:string|number;format:string}>;note:string}|null,issues:string[]) {
  const element=document.createElement('section');
  const paragraph=(text:string)=>{const p=document.createElement('p');p.textContent=text;element.appendChild(p);};
  paragraph(`${inventory} · ${report.period?.label||'Current report'} · ${report.currency}`);
  if(overview){for(const card of overview.cards)paragraph(`${card.label}: ${typeof card.value==='number'?card.value.toLocaleString('en-US',{maximumFractionDigits:2}):card.value}${card.format==='money'?` ${report.currency}`:''}`);}
  const table=document.createElement('table'),head=document.createElement('thead'),tr=document.createElement('tr');
  for(const column of report.columns){const th=document.createElement('th');th.textContent=column.label;tr.appendChild(th);}head.appendChild(tr);table.appendChild(head);
  const body=document.createElement('tbody');for(const row of rows){const line=document.createElement('tr');for(const column of report.columns){const td=document.createElement('td');const value=row[column.key];td.textContent=typeof value==='number'?value.toLocaleString('en-US',{minimumFractionDigits:column.type==='money'?2:0,maximumFractionDigits:column.type==='money'?2:6}):String(value??'');if(typeof value==='number')td.style.textAlign='right';line.appendChild(td);}body.appendChild(line);}table.appendChild(body);element.appendChild(table);
  if(overview)paragraph(overview.note);for(const issue of issues)paragraph(`Review: ${issue}`);
  return element;
}
