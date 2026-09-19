"use client";
import { useRef, useState } from 'react';
import { defaultDocumentDesign, defaultElementProperties, readDocumentDesign, type DocumentDesign, type DesignField } from '@/lib/document-design';
import { CustomInvoiceTemplate, type TemplateBranding } from './custom-invoice-template';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TemplateProperties } from './template-properties';
import { TemplateManager } from './template-manager';
import { toast } from 'sonner';

export function CompanyTemplateDesigner({value,onChange,setup,disabled}:{value:string;onChange:(value:string)=>void;setup:TemplateBranding;disabled:boolean}) {
 let design=readDocumentDesign(value);
 try { if (value) design={...design,...JSON.parse(value)} as DocumentDesign; } catch { /* Use default design for invalid saved data. */ }
 const [editingId,setEditingId]=useState('');
 const [tab,setTab]=useState('Basic');
 const [target,setTarget]=useState<'screen'|'print'>('screen');
 const [selectedElement,setSelectedElement]=useState('title');
 const [propertiesOpen,setPropertiesOpen]=useState(false);
 const preview=useRef<HTMLDivElement>(null);
 const colorSchemes=[
  {value:'quickbooks-green',label:'QuickBooks Green',color:'#79a500'},
  {value:'classic-blue',label:'Classic Blue',color:'#164e63'},
  {value:'charcoal',label:'Charcoal',color:'#334155'},
  {value:'burgundy',label:'Burgundy',color:'#991b1b'},
 ] as const;
 const update=(patch:Partial<DocumentDesign>)=>{
  const next={...design,...patch};
  if(editingId && !next.savedTemplates.some(t=>t.id===editingId))setEditingId('');
  if(editingId && !patch.savedTemplates){
   const {savedTemplates,...snapshot}=next;
   next.savedTemplates=savedTemplates.map(t=>t.id===editingId?{...t,design:snapshot}:t);
  }
  onChange(JSON.stringify(next));
 };
 const editTemplate=(id:string)=>{const saved=design.savedTemplates.find(t=>t.id===id);if(!saved)return;setEditingId(id);onChange(JSON.stringify({...saved.design,enabled:true,savedTemplates:design.savedTemplates}));setTab('Basic');};
 const addBox=()=>{const id=crypto.randomUUID();update({customBoxes:[...design.customBoxes,{id,text:'New text box',screen:true,print:true,left:40,down:120,width:240,height:80,fontSize:11,bold:false,border:true}]});setTab('Boxes');};
 const addBoxInPreview=()=>{const id=crypto.randomUUID();update({customBoxes:[...design.customBoxes,{id,text:'New text box',screen:true,print:true,left:40,down:120,width:240,height:80,fontSize:11,bold:false,border:true}]});setSelectedElement(`customBoxes.${id}`);setTarget('screen');setPropertiesOpen(true);};
 const updateBox=(id:string,patch:Partial<DocumentDesign['customBoxes'][number]>)=>{const current=design.customBoxes.find(box=>box.id===id);if(!current)return;const next={...current,...patch};next.left=Math.max(0,Math.min(720,Math.round(next.left)));next.down=Math.max(0,Math.min(1050,Math.round(next.down)));next.width=Math.max(40,Math.min(760-next.left,Math.round(next.width)));next.height=Math.max(20,Math.min(800,Math.round(next.height)));next.fontSize=Math.max(8,Math.min(40,Math.round(next.fontSize)));update({customBoxes:design.customBoxes.map(box=>box.id===id?next:box)});};
 const removeBox=(id:string)=>update({customBoxes:design.customBoxes.filter(box=>box.id!==id)});
 const selectedField=()=>{
  const match=/^(headers|columns|footer)\.(.+)$/.exec(selectedElement);
  if(!match)return null;
  const group=match[1] as 'headers'|'columns'|'footer';
  const row=design[group].find(field=>field.key===match[2]);
  return row?{group,row}:null;
 };
 const selectedCustomBox=selectedElement.startsWith('customBoxes.')?design.customBoxes.find(box=>box.id===selectedElement.slice('customBoxes.'.length)):undefined;
 const selectedText=selectedField()?.row.label??selectedCustomBox?.text??'';
 const updateSelectedText=(text:string)=>{
  const field=selectedField();
  if(field){
   update({[field.group]:design[field.group].map(row=>row.key===field.row.key?{...row,label:text.slice(0,80)}:row)});
   return;
  }
  if(selectedCustomBox)updateBox(selectedCustomBox.id,{text:text.slice(0,2000)});
 };
 const openProperties=(key:string)=>{setSelectedElement(key);setPropertiesOpen(true);};
 const removeSelectedBox=()=>{
  if(selectedCustomBox){
   const id=selectedCustomBox.id;
   const nextProperties={...design.properties};
   delete nextProperties[`customBoxes.${id}`];
   update({customBoxes:design.customBoxes.filter(box=>box.id!==id),properties:nextProperties});
   setSelectedElement('title');
   return;
  }
  const field=selectedField();
  if(field){
   const nextProperties={...design.properties};
   delete nextProperties[`${field.group}.${field.row.key}`];
   update({[field.group]:design[field.group].filter(row=>row.key!==field.row.key),properties:nextProperties});
   setSelectedElement('title');
   return;
  }
  const current=elementProperties(selectedElement);
  update({properties:{...design.properties,[selectedElement]:{...current,hidden:true}}});
  setSelectedElement('title');
 };
 const canEditSelectedText=Boolean(selectedCustomBox||selectedField());
 const number=(key:'fontSize'|'titleSize'|'companySize'|'logoWidth'|'logoHeight'|'copies'|'customPaperWidth'|'customPaperHeight'|'margin'|'decimals',label:string,min:number,max:number)=><label className="grid gap-1 text-sm">{label}<Input type="number" min={min} max={max} value={design[key]} onChange={e=>update({[key]:Math.min(max,Math.max(min,Number(e.target.value)))})}/></label>;
 const flag=(key:'leftLogo'|'rightLogo'|'showCompany'|'showAddress'|'showPhone'|'showEmail'|'statusStamp'|'pastDueStamp',label:string)=><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={design[key]} onChange={e=>update({[key]:e.target.checked})}/>{label}</label>;
 const headerFlag=(key:string,label:string)=>{const row=design.headers.find(field=>field.key===key);const checked=Boolean(row?.screen||row?.print);return <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={checked} onChange={e=>update({headers:design.headers.map(field=>field.key===key?{...field,screen:e.target.checked,print:e.target.checked}:field)})}/>{label}</label>;};
 const fields=(key:'headers'|'columns'|'footer')=>{
  const rows=design[key];
  const sectionLabel=key==='headers'?'Header':key==='columns'?'Column':'Footer';
  const edit=(index:number,patch:Partial<DesignField>)=>update({[key]:rows.map((r,i)=>i===index?{...r,...patch}:r)});
  const move=(i:number,step:number)=>{const next=[...rows];[next[i],next[i+step]]=[next[i+step],next[i]];update({[key]:next});};
  const fieldProperty=(rowKey:string)=>{
   const propertyKey=`${key}.${rowKey}`;
   return design.properties[propertyKey]||{...defaultElementProperties,font:design.font,size:design.fontSize,color:'#111111',align:'left' as const};
  };
  const editPosition=(rowKey:string,property:'offsetX'|'offsetY'|'boxWidth'|'boxHeight',value:number)=>{
   const current=fieldProperty(rowKey);
   const limits=property==='offsetX'?[-1200,1200]:property==='offsetY'?[-1600,1600]:property==='boxWidth'?[0,1200]:[0,800];
   const next=Math.min(limits[1],Math.max(limits[0],Math.round(Number(value)||0)));
   update({properties:{...design.properties,[`${key}.${rowKey}`]:{...current,[property]:next}}});
  };
  const add=()=>{
   if(rows.length>=30)return toast.error(`Keep at most 30 ${sectionLabel.toLowerCase()} boxes.`);
   const id=crypto.randomUUID().replace(/-/g,'').slice(0,20);
   const row:DesignField={key:`custom-${key.slice(0,-1)}-${id}`,label:`New ${sectionLabel.toLowerCase()} box`,screen:true,print:true,width:key==='columns'?12:1};
   update({[key]:[...rows,row]});
  };
  const remove=(index:number)=>{
   const row=rows[index];
   const nextProperties={...design.properties};
   delete nextProperties[`${key}.${row.key}`];
   update({[key]:rows.filter((_,i)=>i!==index),properties:nextProperties});
  };
  return <div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-muted-foreground">Add/remove boxes, change text, and resize every {sectionLabel.toLowerCase()} box with L / H / W / D.</p><Button type="button" variant="outline" onClick={add}>Add {sectionLabel} Box</Button></div><div className="overflow-auto rounded-md border"><table className="w-full text-left text-sm"><thead><tr>{['Field','Screen','Print','Text','L','H','W','D',...(key==='columns'?['Column %']:[]),'Order','Action'].map(t=><th key={t} className="p-2">{t}</th>)}</tr></thead><tbody>{rows.map((row,i)=>{const pos=fieldProperty(row.key);return <tr key={row.key} className="border-t"><td className="p-2">{defaultDocumentDesign[key].find(f=>f.key===row.key)?.label||'Custom box'}</td>{(['screen','print'] as const).map(t=><td key={t} className="p-2"><input type="checkbox" aria-label={`${row.label} ${t}`} checked={row[t]} onChange={e=>edit(i,{[t]:e.target.checked})}/></td>)}<td className="min-w-52 p-2"><Input required aria-label={`${row.key} text`} maxLength={80} value={row.label} onChange={e=>edit(i,{label:e.target.value})}/></td><td className="min-w-24 p-2"><Input type="number" aria-label={`${row.label} L position`} min={-1200} max={1200} value={pos.offsetX} onChange={e=>editPosition(row.key,'offsetX',Number(e.target.value))}/></td><td className="min-w-24 p-2"><Input type="number" aria-label={`${row.label} H height`} min={0} max={800} value={pos.boxHeight} onChange={e=>editPosition(row.key,'boxHeight',Number(e.target.value))}/></td><td className="min-w-24 p-2"><Input type="number" aria-label={`${row.label} W width`} min={0} max={1200} value={pos.boxWidth} onChange={e=>editPosition(row.key,'boxWidth',Number(e.target.value))}/></td><td className="min-w-24 p-2"><Input type="number" aria-label={`${row.label} D position`} min={-1600} max={1600} value={pos.offsetY} onChange={e=>editPosition(row.key,'offsetY',Number(e.target.value))}/></td>{key==='columns'&&<td className="p-2"><Input type="number" aria-label={`${row.label} relative width`} min={1} max={100} value={row.width} onChange={e=>edit(i,{width:Math.min(100,Math.max(1,Number(e.target.value)))})}/></td>}<td className="whitespace-nowrap p-2"><Button type="button" size="sm" variant="ghost" disabled={i===0} aria-label={`Move ${row.label} up`} onClick={()=>move(i,-1)}>↑</Button><Button type="button" size="sm" variant="ghost" disabled={i===rows.length-1} aria-label={`Move ${row.label} down`} onClick={()=>move(i,1)}>↓</Button></td><td className="p-2"><Button type="button" size="sm" variant="outline" onClick={()=>remove(i)}>Remove</Button></td></tr>})}</tbody></table></div><p className="text-xs text-muted-foreground"><strong>L</strong> = left/right position · <strong>H</strong> = box height · <strong>W</strong> = box width · <strong>D</strong> = down/up position. Use 0 for automatic width/height.</p></div>;
 };
 const elementProperties=(key:string)=>{
  const inherited={...defaultElementProperties,font:design.font,size:key==='title'?design.titleSize:key==='company'?design.companySize:design.fontSize,color:key==='title'||key==='company'?design.color:'#111111',align:key==='title'||key==='company'?'center' as const:'left' as const};
  return design.properties[key]||inherited;
 };
 const moveElement=(key:string,x:number,y:number)=>{
  const current=elementProperties(key);
  update({properties:{...design.properties,[key]:{...current,offsetX:x,offsetY:y}}});
 };
 const resizeElement=(key:string,width:number,height:number,x?:number,y?:number)=>{
  const current=elementProperties(key);
  const next={...current,boxWidth:width,boxHeight:height,...(x===undefined?{}:{offsetX:x}),...(y===undefined?{}:{offsetY:y})};
  if(key.startsWith('columns.')){
   const rowKey=key.slice('columns.'.length);
   const previewWidth=Math.max(1,preview.current?.clientWidth||760);
   const relativeWidth=Math.max(1,Math.min(100,Math.round(width/previewWidth*100)));
   update({properties:{...design.properties,[key]:next},columns:design.columns.map(column=>column.key===rowKey?{...column,width:relativeWidth}:column)});
   return;
  }
  update({properties:{...design.properties,[key]:next}});
 };
 const printPageDimensionsMm=(forceA4=false):[number,number]=>{
  const sizes:Record<'A4'|'A3'|'Letter'|'Legal'|'Tabloid',[number,number]>={A4:[210,297],A3:[297,420],Letter:[215.9,279.4],Legal:[215.9,355.6],Tabloid:[279.4,431.8]};
  const base=forceA4?[210,297] as [number,number]:design.paper==='Custom'?[design.customPaperWidth,design.customPaperHeight] as [number,number]:sizes[design.paper];
  return design.orientation==='landscape'?[base[1],base[0]]:[base[0],base[1]];
 };
 const printPageSize=(forceA4=false)=>{
  const [width,height]=printPageDimensionsMm(forceA4);
  return `${width}mm ${height}mm`;
 };
 const print=(forceA4=false)=>{
  const popup=window.open('','_blank');if(!popup)return toast.error('Allow pop-ups for Print Preview.');popup.opener=null;
  const source=preview.current?.innerHTML||'';
  const invoice=preview.current?.querySelector<HTMLElement>('.custom-invoice');
  if(!source||!invoice){popup.close();return toast.error('Template preview is not ready yet.');}
  const rect=invoice.getBoundingClientRect();
  const sourceWidth=Math.max(1,Math.ceil(Math.max(rect.width,invoice.scrollWidth)));
  const sourceHeight=Math.max(1,Math.ceil(Math.max(rect.height,invoice.scrollHeight)));
  const [pageWidthMm,pageHeightMm]=printPageDimensionsMm(forceA4);
  const printableWidthPx=Math.max(1,(pageWidthMm-design.margin*2)*96/25.4);
  const printableHeightPx=Math.max(1,(pageHeightMm-design.margin*2)*96/25.4);
  const scale=Math.min(1,printableWidthPx/sourceWidth,printableHeightPx/sourceHeight);
  const scaledHeight=Math.max(1,Math.ceil(sourceHeight*scale));
  const copies=Array.from({length:design.copies},()=>`<section class="print-copy" style="width:${printableWidthPx}px;height:${scaledHeight}px"><div class="print-fit" style="width:${sourceWidth}px;transform:scale(${scale});transform-origin:top left">${source}</div></section>`).join('');
  const pageNumbers=design.printPageNumbers?'@bottom-center{content:"Page " counter(page) " of " counter(pages);font:10px Arial,sans-serif;color:#475569;}':'';
  const pageRule=`@page{size:${printPageSize(forceA4)};margin:${design.margin}mm;${pageNumbers}}`;
  popup.document.write(`<!doctype html><html><head><title>${forceA4?'A4 Invoice':'Invoice template preview'}</title><style>
    ${pageRule}
    html,body{margin:0;padding:0;background:#fff}
    .print-toolbar{position:sticky;top:0;z-index:9999;display:flex;justify-content:flex-end;gap:8px;padding:10px;background:#0f172a}
    .print-toolbar button{border:1px solid #64748b;border-radius:8px;background:#fff;color:#0f172a;padding:8px 14px;font:600 14px Arial,sans-serif;cursor:pointer}
    .print-copy{break-after:page;position:relative;overflow:visible}
    .print-copy:last-child{break-after:auto}
    .print-fit{position:relative}
    .custom-invoice{max-width:none!important}
    .custom-invoice .ci-editable{outline:none!important;box-shadow:none!important}
    .custom-invoice .ci-editable::after{display:none!important}
    @media print{
      .print-toolbar{display:none!important}
      html,body{width:auto;height:auto}
      .print-copy{break-inside:avoid-page}
      .custom-invoice{max-width:none!important;min-width:0!important}
      .custom-invoice table{table-layout:fixed!important}
    }
  </style></head><body>
    <div class="print-toolbar"><button type="button" onclick="window.print()">Print</button><button type="button" onclick="window.close()">Close</button></div>
    ${copies}
  </body></html>`);
  popup.document.close();
  const triggerPrint=()=>{
   if(popup.closed)return;
   popup.focus();
   try{popup.print();}catch{/* The visible Print button remains available as a fallback. */}
  };
  const images=Array.from(popup.document.images);
  void Promise.all(images.map(img=>img.complete?Promise.resolve():img.decode().catch(()=>undefined))).then(()=>window.setTimeout(triggerPrint,100));
 };
 const resetPrint=()=>update({printerMode:defaultDocumentDesign.printerMode,copies:defaultDocumentDesign.copies,paper:defaultDocumentDesign.paper,customPaperWidth:defaultDocumentDesign.customPaperWidth,customPaperHeight:defaultDocumentDesign.customPaperHeight,orientation:defaultDocumentDesign.orientation,margin:defaultDocumentDesign.margin,printPageNumbers:defaultDocumentDesign.printPageNumbers,printTrailingZeros:defaultDocumentDesign.printTrailingZeros,decimals:defaultDocumentDesign.decimals});
 const selectedScheme=colorSchemes.find(s=>s.color.toLowerCase()===design.color.toLowerCase())?.value||'custom';
 return <section className="col-span-full space-y-5 rounded-xl border bg-white p-5">
  <div><h2 className="text-lg font-bold">Invoice Template Customization</h2><p className="text-sm text-slate-500">QuickBooks-style basic customisation with live preview, saved templates, layout controls, and A4 print/PDF output.</p></div>
  <fieldset disabled={disabled} className="space-y-5">
   <p className="text-sm text-muted-foreground">Invoices use the Company Setup layout. Turn on customization to apply your saved settings, or leave it off for the standard layout.</p><label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={design.enabled} onChange={e=>update({enabled:e.target.checked})}/>Use my saved invoice customization</label>
   {editingId&&design.savedTemplates.some(t=>t.id===editingId)&&<p className="text-sm font-medium" role="status">Editing saved template: {design.name}. Save Company Setup to keep your changes.</p>}
   <div className="flex flex-wrap gap-2" role="tablist" aria-label="Template settings">{['Basic','Header','Columns','Footer','Boxes','Print','Layout','Properties','Templates'].map(t=><Button type="button" key={t} role="tab" aria-selected={tab===t} variant={tab===t?'default':'outline'} onClick={()=>setTab(t)}>{t==='Basic'?'Basic Customisation':t}</Button>)}</div>
   <div className="grid gap-5 xl:grid-cols-2"><div className="min-w-0 space-y-4" role="tabpanel">
    {tab==='Properties'&&<TemplateProperties design={design} onChange={update}/>}{tab==='Templates'&&<TemplateManager design={design} onChange={update} onEdit={editTemplate} editingId={editingId}/>}
    {tab==='Basic'&&<div className="overflow-hidden rounded-md border border-[#789b14] bg-white shadow-sm">
     <div className="bg-[#79a500] px-4 py-2 text-center text-lg font-semibold text-white">Basic Customisation</div>
     <div className="space-y-5 p-4">
      <section className="rounded-md border p-4"><p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-700">Selected Template</p><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">{design.name}</p><p className="text-xs text-muted-foreground">Current company invoice template</p></div><Button type="button" variant="outline" onClick={()=>setTab('Templates')}>Manage Templates...</Button></div><div className="mt-3 grid gap-1 text-sm"><label>Template name<Input required value={design.name} maxLength={80} onChange={e=>update({name:e.target.value})}/></label><label className="grid gap-1">Document title<select className="h-10 rounded-md border bg-background px-3" value={design.title} onChange={e=>update({title:e.target.value})}><option value="Tax Invoice">Tax Invoice</option><option value="Credit Note">Credit Note</option><option value="Refund">Refund</option><option value="Sales Receipt">Sales Receipt</option><option value="Purchase Order">Purchase Order</option><option value="Statement of Account">Statement</option><option value="Estimate">Estimate</option><option value="Sales Order">Sales Order</option><option value="Delivery Note">Delivery Note</option><option value="Packing List">Packing List</option><option value="Proforma Invoice">Proforma Invoice</option><option value="Quotation">Quotation</option></select></label></div></section>
      <section className="rounded-md border p-4"><p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-700">Logo &amp; Fonts</p><div className="grid gap-4 md:grid-cols-2"><div className="space-y-3"><div className="grid grid-cols-2 gap-3">{flag('leftLogo','Use left logo')}{flag('rightLogo','Use right logo')}</div><p className="text-xs text-muted-foreground">Upload or replace company logos in Company identity above.</p><label className="grid gap-1 text-sm">Select Colour Scheme<select className="rounded-md border bg-background p-2" value={selectedScheme} onChange={e=>{const scheme=colorSchemes.find(s=>s.value===e.target.value);if(scheme)update({color:scheme.color});}}><option value="custom">Custom / current</option>{colorSchemes.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}</select></label><label className="flex items-center gap-3 text-sm">Custom colour<Input type="color" className="w-16" value={design.color} onChange={e=>update({color:e.target.value})}/></label></div><div className="space-y-3"><label className="grid gap-1 text-sm">Font<select value={design.font} onChange={e=>update({font:e.target.value as DocumentDesign['font']})} className="rounded-md border bg-background p-2">{['Arial','Georgia','Verdana'].map(f=><option key={f}>{f}</option>)}</select></label><div className="grid gap-3 sm:grid-cols-3 md:grid-cols-1 lg:grid-cols-3">{number('titleSize','Title',14,40)}{number('companySize','Company name',12,36)}{number('fontSize','Labels / data',8,18)}</div></div></div></section>
      <section className="rounded-md border p-4"><p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-700">Company &amp; Transaction Information</p><div className="grid gap-3 sm:grid-cols-2">{flag('showCompany','Company Name')}{flag('showPhone','Phone Number')}{flag('showAddress','Company Address')}{flag('showEmail','E-mail Address')}{headerFlag('trn','Company VAT Registration Number (TRN)')}</div><p className="mt-3 text-xs text-muted-foreground">Company contact details are maintained in Company Setup and flow automatically into the printed invoice.</p></section>
      <section className="space-y-4 rounded-md border p-4"><div>{flag('pastDueStamp','Print Past Due Stamp')}<p className="ml-6 mt-1 text-xs text-muted-foreground">Shows a PAST DUE stamp automatically when the due date has passed and the invoice is not paid.</p></div><div>{flag('statusStamp','Print Status Stamp')}<p className="ml-6 mt-1 text-xs text-muted-foreground">Includes invoice status such as Paid, Open, Pending, Received, or Void.</p></div></section>
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={()=>setTab('Header')}>Additional Customisation...</Button><Button type="button" variant="outline" onClick={()=>setTab('Layout')}>Layout Designer...</Button><Button type="button" variant="outline" onClick={()=>setTarget('print')}>Print Preview...</Button></div>
     </div>
    </div>}
    {tab==='Header'&&fields('headers')}{tab==='Columns'&&<>{fields('columns')}<p className="text-xs text-slate-500">Width is relative to the other visible columns. Serial numbers can have their own column.</p></>}
    {tab==='Footer'&&<>{fields('footer')}<label className="grid gap-1 text-sm">Customer message<Textarea value={design.message} maxLength={5000} onChange={e=>update({message:e.target.value})}/></label><label className="grid gap-1 text-sm">Terms / disclaimer<Textarea rows={7} value={design.disclaimer} maxLength={15000} onChange={e=>update({disclaimer:e.target.value})}/></label></>}
    {tab==='Boxes'&&<div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold">Add / remove text boxes</p><p className="text-xs text-muted-foreground">These boxes are saved inside the current template and work on screen, A4 print, and PDF output.</p></div><Button type="button" onClick={addBox}>Add Box</Button></div>{design.customBoxes.length===0?<div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">No extra boxes. Click Add Box to create one.</div>:design.customBoxes.map((box,index)=><div key={box.id} className="space-y-3 rounded-md border p-3"><div className="flex items-center justify-between gap-2"><strong>Box {index+1}</strong><Button type="button" size="sm" variant="outline" onClick={()=>removeBox(box.id)}>Remove Box</Button></div><label className="grid gap-1 text-sm">Box text<Textarea rows={3} maxLength={2000} value={box.text} onChange={e=>updateBox(box.id,{text:e.target.value})}/></label><div className="flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={box.screen} onChange={e=>updateBox(box.id,{screen:e.target.checked})}/>Screen</label><label className="flex items-center gap-2"><input type="checkbox" checked={box.print} onChange={e=>updateBox(box.id,{print:e.target.checked})}/>Print / PDF</label><label className="flex items-center gap-2"><input type="checkbox" checked={box.bold} onChange={e=>updateBox(box.id,{bold:e.target.checked})}/>Bold</label><label className="flex items-center gap-2"><input type="checkbox" checked={box.border} onChange={e=>updateBox(box.id,{border:e.target.checked})}/>Border</label></div><div className="grid grid-cols-2 gap-3 md:grid-cols-5"><label className="grid gap-1 text-xs">L — Left<Input type="number" min={0} max={720} value={box.left} onChange={e=>updateBox(box.id,{left:Number(e.target.value)})}/></label><label className="grid gap-1 text-xs">H — Height<Input type="number" min={20} max={800} value={box.height} onChange={e=>updateBox(box.id,{height:Number(e.target.value)})}/></label><label className="grid gap-1 text-xs">W — Width<Input type="number" min={40} max={760-box.left} value={box.width} onChange={e=>updateBox(box.id,{width:Number(e.target.value)})}/></label><label className="grid gap-1 text-xs">D — Down<Input type="number" min={0} max={1050} value={box.down} onChange={e=>updateBox(box.id,{down:Number(e.target.value)})}/></label><label className="grid gap-1 text-xs">Text size<Input type="number" min={8} max={40} value={box.fontSize} onChange={e=>updateBox(box.id,{fontSize:Number(e.target.value)})}/></label></div></div>)}</div>}
    {tab==='Print'&&<div className="space-y-5 rounded-lg border p-4"><div className="rounded-md border border-[#79a500] bg-[#f7faef] p-3"><p className="font-semibold">A4 PDF ready</p><p className="text-xs text-muted-foreground">Default output is A4 (210 × 297 mm). Use the A4 button beside the preview, then choose your printer or Save as PDF in the browser print dialog.</p></div><div className="space-y-3"><label className="flex items-center gap-2 text-sm"><input type="radio" name="printerMode" checked={design.printerMode==='default'} onChange={()=>update({printerMode:'default'})}/>Use browser/default printer settings</label><label className="flex items-center gap-2 text-sm"><input type="radio" name="printerMode" checked={design.printerMode==='specified'} onChange={()=>update({printerMode:'specified'})}/>Use specified printer settings below for this invoice</label></div><fieldset disabled={design.printerMode!=='specified'} className="space-y-4 disabled:opacity-50"><div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><p className="text-sm font-medium">Orientation</p><label className="flex items-center gap-2 text-sm"><input type="radio" name="orientation" checked={design.orientation==='portrait'} onChange={()=>update({orientation:'portrait'})}/>Portrait</label><label className="flex items-center gap-2 text-sm"><input type="radio" name="orientation" checked={design.orientation==='landscape'} onChange={()=>update({orientation:'landscape'})}/>Landscape</label></div>{number('copies','Number of copies',1,99)}</div><label className="grid gap-1 text-sm">Paper size<select className="rounded-md border bg-background p-2" value={design.paper} onChange={e=>update({paper:e.target.value as DocumentDesign['paper']})}><option value="Letter">Letter (8 1/2 × 11 in)</option><option value="Legal">Legal (8 1/2 × 14 in)</option><option value="Tabloid">Tabloid (11 × 17 in)</option><option value="A3">A3 (297 × 420 mm)</option><option value="A4">A4 (210 × 297 mm)</option><option value="Custom">Custom</option></select></label>{design.paper==='Custom'&&<div className="grid grid-cols-2 gap-3">{number('customPaperWidth','Custom width (mm)',50,500)}{number('customPaperHeight','Custom height (mm)',50,500)}</div>}{number('margin','Margins (mm)',5,25)}<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={design.printPageNumbers} onChange={e=>update({printPageNumbers:e.target.checked})}/>Print page number on every PDF / printed page</label><div className="rounded-md border p-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={design.printTrailingZeros} onChange={e=>update({printTrailingZeros:e.target.checked})}/>Print trailing zeroes</label><div className="mt-3">{number('decimals','Minimum number of decimal places',0,4)}</div></div></fieldset><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={resetPrint}>Default</Button><Button type="button" variant="outline" onClick={()=>setTarget('print')}>Print Preview...</Button></div><p className="text-xs text-slate-500">Printer selection is controlled by the browser print dialog. Saved paper size, orientation, margins, copies, page-number preference, and trailing-zero settings are applied to the template preview and print output.</p></div>}
    {tab==='Layout'&&<><p className="text-sm">Click and drag an outlined box to place it anywhere inside the template. Drag only the blue bottom-right square to resize it, matching the reference video. The saved position and size apply to every document using this template. Use Properties → Position for exact L / H / W / D controls, or Boxes to add/remove custom text boxes.</p><Button type="button" variant="outline" onClick={addBox}>Add Text Box</Button><div className="grid grid-cols-2 gap-3">{number('logoWidth','Logo width (px)',40,240)}{number('logoHeight','Logo height (px)',30,150)}</div><Button type="button" variant="outline" onClick={()=>{setEditingId('');update({...structuredClone(defaultDocumentDesign),savedTemplates:design.savedTemplates});}}>Restore default template</Button></>}
   </div><div className="min-w-0 space-y-3"><div className="flex flex-wrap gap-2"><Button type="button" variant={target==='screen'?'default':'outline'} onClick={()=>setTarget('screen')}>Screen preview</Button><Button type="button" variant={target==='print'?'default':'outline'} onClick={()=>setTarget('print')}>Print preview</Button>{target==='print'&&<Button type="button" className="brand-primary-button" onClick={()=>print(true)}>Print / Save PDF — A4</Button>}</div><div className="flex flex-wrap items-center gap-2 rounded-md border bg-slate-50 p-2"><span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Template tools</span><Button type="button" size="sm" onClick={addBoxInPreview}>Add Box</Button><Button type="button" size="sm" variant="outline" disabled={!canEditSelectedText} onClick={()=>setPropertiesOpen(true)}>Add / Edit Text</Button><Button type="button" size="sm" variant="outline" onClick={()=>openProperties(selectedElement)}>Properties</Button><Button type="button" size="sm" variant="destructive" onClick={removeSelectedBox}>Remove Box</Button></div><p className="text-xs text-slate-500">Click a box to select it. Drag inside the box to move it. Drag the blue bottom-right square to resize it with the mouse. Use Add Box, Add / Edit Text, or Remove Box directly above the template.</p><div ref={preview} className="max-h-[650px] overflow-auto border bg-white"><CustomInvoiceTemplate design={design} target={target} setup={setup} editable selectedElement={selectedElement} onSelectElement={setSelectedElement} onOpenElementProperties={openProperties} onMoveElement={moveElement} onResizeElement={resizeElement} onMoveCustomBox={(id,left,down)=>updateBox(id,{left,down})} onResizeCustomBox={(id,width,height,left,down)=>updateBox(id,{width,height,...(left===undefined?{}:{left}),...(down===undefined?{}:{down})})} record={{number:'INV-SAMPLE',transactionDate:'2026-09-13',dueDate:'2025-01-31',party:'Sample Customer',currency:'AED',status:'open',subtotal:1000,vatAmount:50,total:1050,balance:1050,salesman:'Sales Representative'}} lines={[{id:1,sku:'ITEM-001',description:'Sample product',quantity:2,unitPrice:500,serialNumber:'SN-001\nSN-002',subtotal:1000,vatAmount:50,total:1050,comments:'Sample item comments'}]}/></div>{target==='print'&&<div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={()=>print(false)}>Print / Save PDF preview</Button><Button type="button" className="brand-primary-button" onClick={()=>print(true)}>Print / Save PDF — A4</Button></div>}</div></div>
   <Button type="submit" className="brand-primary-button">Save Company Setup &amp; Template</Button>
  </fieldset>
  <Dialog open={propertiesOpen} onOpenChange={setPropertiesOpen}>
   <DialogContent className="max-w-2xl">
    <DialogHeader><DialogTitle>Properties</DialogTitle></DialogHeader>
    <div className="space-y-4">
     <p className="text-xs text-muted-foreground">Double-click or right-click any box in the preview to open these properties, like the layout designer in your video.</p>
     {(selectedField()||selectedCustomBox)&&<label className="grid gap-1 text-sm font-medium">{selectedCustomBox?'Box text':'Label text'}<Textarea rows={selectedCustomBox?3:2} value={selectedText} onChange={e=>updateSelectedText(e.target.value)} /></label>}
     <TemplateProperties design={design} onChange={update} selectedKey={selectedElement} onSelectedKeyChange={setSelectedElement} showElementPicker={false} tabs={['Text','Border','Background']} />
    </div>
    <DialogFooter><Button type="button" onClick={()=>setPropertiesOpen(false)}>OK</Button></DialogFooter>
   </DialogContent>
  </Dialog>
 </section>;
}