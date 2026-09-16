"use client";
import { useRef, useState } from 'react';
import { defaultDocumentDesign, defaultElementProperties, readDocumentDesign, type DocumentDesign, type DesignField } from '@/lib/document-design';
import { CustomInvoiceTemplate, type TemplateBranding } from './custom-invoice-template';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { TemplateProperties } from './template-properties';
import { TemplateManager } from './template-manager';
import { toast } from 'sonner';

export function CompanyTemplateDesigner({value,onChange,setup,disabled}:{value:string;onChange:(value:string)=>void;setup:TemplateBranding;disabled:boolean}) {
 let design=readDocumentDesign(value);
 try { if (value) design={...design,...JSON.parse(value)} as DocumentDesign; } catch { /* Use default design for invalid saved data. */ }
 const [editingId,setEditingId]=useState('');
 const [tab,setTab]=useState('Basic');
 const [target,setTarget]=useState<'screen'|'print'>('screen');
 const preview=useRef<HTMLDivElement>(null);
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
 const number=(key:'fontSize'|'titleSize'|'companySize'|'logoWidth'|'logoHeight'|'margin'|'decimals',label:string,min:number,max:number)=><label className="grid gap-1 text-sm">{label}<Input type="number" min={min} max={max} value={design[key]} onChange={e=>update({[key]:Math.min(max,Math.max(min,Number(e.target.value)))})}/></label>;
 const flag=(key:'leftLogo'|'rightLogo'|'showCompany'|'showAddress'|'showPhone'|'showEmail'|'statusStamp',label:string)=><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={design[key]} onChange={e=>update({[key]:e.target.checked})}/>{label}</label>;
 const fields=(key:'headers'|'columns'|'footer')=>{
  const rows=design[key];
  const edit=(index:number,patch:Partial<DesignField>)=>update({[key]:rows.map((r,i)=>i===index?{...r,...patch}:r)});
  const move=(i:number,step:number)=>{const next=[...rows];[next[i],next[i+step]]=[next[i+step],next[i]];update({[key]:next});};
  return <div className="overflow-auto"><table className="w-full text-left text-sm"><thead><tr>{['Field','Screen','Print','Title',...(key==='columns'?['Width']:[]),'Order'].map(t=><th key={t} className="p-2">{t}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={row.key} className="border-t"><td className="p-2">{defaultDocumentDesign[key].find(f=>f.key===row.key)?.label}</td>{(['screen','print'] as const).map(t=><td key={t} className="p-2"><input type="checkbox" aria-label={`${row.label} ${t}`} checked={row[t]} onChange={e=>edit(i,{[t]:e.target.checked})}/></td>)}<td className="p-2"><Input required aria-label={`${row.key} label`} maxLength={80} value={row.label} onChange={e=>edit(i,{label:e.target.value})}/></td>{key==='columns'&&<td className="p-2"><Input type="number" aria-label={`${row.label} relative width`} min={1} max={100} value={row.width} onChange={e=>edit(i,{width:Math.min(100,Math.max(1,Number(e.target.value)))})}/></td>}<td className="whitespace-nowrap p-2"><Button type="button" size="sm" variant="ghost" disabled={i===0} aria-label={`Move ${row.label} up`} onClick={()=>move(i,-1)}>↑</Button><Button type="button" size="sm" variant="ghost" disabled={i===rows.length-1} aria-label={`Move ${row.label} down`} onClick={()=>move(i,1)}>↓</Button></td></tr>)}</tbody></table></div>;
 };
 const moveElement=(key:string,x:number,y:number)=>{
  const inherited={...defaultElementProperties,font:design.font,size:key==='title'?design.titleSize:key==='company'?design.companySize:design.fontSize,color:key==='title'||key==='company'?design.color:'#111111',align:key==='title'||key==='company'?'center' as const:'left' as const};
  const current=design.properties[key]||inherited;
  update({properties:{...design.properties,[key]:{...current,offsetX:x,offsetY:y}}});
 };
 const print=()=>{const popup=window.open('','_blank');if(!popup)return toast.error('Allow pop-ups for Print Preview.');popup.opener=null;popup.document.write(`<!doctype html><html><head><title>Invoice template preview</title><style>@page{size:${design.paper} ${design.orientation};margin:${design.margin}mm}</style></head><body>${preview.current?.innerHTML||''}</body></html>`);popup.document.close();void Promise.all(Array.from(popup.document.images).map(img=>img.decode().catch(()=>{}))).then(()=>{popup.focus();popup.print();});};
 return <section className="col-span-full space-y-5 rounded-xl border bg-white p-5">
  <div><h2 className="text-lg font-bold">Invoice Template Customization</h2><p className="text-sm text-slate-500">Customize the invoice header, item columns, footer, and print layout. Upload left and right logos in Company identity above.</p></div>
  <fieldset disabled={disabled} className="space-y-5">
   <p className="text-sm text-muted-foreground">Invoices use the Company Setup layout. Turn on customization to apply your saved settings, or leave it off for the standard layout.</p><label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={design.enabled} onChange={e=>update({enabled:e.target.checked})}/>Use my saved invoice customization</label>
   {editingId&&design.savedTemplates.some(t=>t.id===editingId)&&<p className="text-sm font-medium" role="status">Editing saved template: {design.name}. Save Company Setup to keep your changes.</p>}
   <div className="flex flex-wrap gap-2" role="tablist" aria-label="Template settings">{['Basic','Header','Columns','Footer','Print','Layout','Properties','Templates'].map(t=><Button type="button" key={t} role="tab" aria-selected={tab===t} variant={tab===t?'default':'outline'} onClick={()=>setTab(t)}>{t}</Button>)}</div>
   <div className="grid gap-5 xl:grid-cols-2"><div className="min-w-0 space-y-4" role="tabpanel">
    {tab==='Properties'&&<TemplateProperties design={design} onChange={update}/>}{tab==='Templates'&&<TemplateManager design={design} onChange={update} onEdit={editTemplate} editingId={editingId}/>}
    {tab==='Basic'&&<><label className="grid gap-1 text-sm">Template name<Input required value={design.name} maxLength={80} onChange={e=>update({name:e.target.value})}/></label><label className="grid gap-1 text-sm">Invoice title<Input required value={design.title} maxLength={80} onChange={e=>update({title:e.target.value})}/></label><div className="grid grid-cols-2 gap-3">{flag('leftLogo','Use left logo')}{flag('rightLogo','Use right logo')}{flag('showCompany','Company name')}{flag('showAddress','Company address')}{flag('showPhone','Phone number')}{flag('showEmail','Email address')}{flag('statusStamp','Document status')}</div><label className="grid gap-1 text-sm">Font<select value={design.font} onChange={e=>update({font:e.target.value as DocumentDesign['font']})} className="rounded-md border bg-background p-2">{['Arial','Georgia','Verdana'].map(f=><option key={f}>{f}</option>)}</select></label><label className="flex items-center gap-3 text-sm">Color scheme<Input type="color" className="w-16" value={design.color} onChange={e=>update({color:e.target.value})}/></label><div className="grid grid-cols-3 gap-3">{number('fontSize','Data font size',8,18)}{number('titleSize','Title size',14,40)}{number('companySize','Company name size',12,36)}</div></>}
    {tab==='Header'&&fields('headers')}{tab==='Columns'&&<>{fields('columns')}<p className="text-xs text-slate-500">Width is relative to the other visible columns. Serial numbers can have their own column.</p></>}
    {tab==='Footer'&&<>{fields('footer')}<label className="grid gap-1 text-sm">Customer message<Textarea value={design.message} maxLength={5000} onChange={e=>update({message:e.target.value})}/></label><label className="grid gap-1 text-sm">Terms / disclaimer<Textarea rows={7} value={design.disclaimer} maxLength={15000} onChange={e=>update({disclaimer:e.target.value})}/></label></>}
    {tab==='Print'&&<><label className="grid gap-1 text-sm">Paper size<select className="rounded-md border bg-background p-2" value={design.paper} onChange={e=>update({paper:e.target.value as DocumentDesign['paper']})}><option>A4</option><option>Letter</option></select></label><label className="grid gap-1 text-sm">Orientation<select className="rounded-md border bg-background p-2" value={design.orientation} onChange={e=>update({orientation:e.target.value as DocumentDesign['orientation']})}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>{number('margin','Margins (mm)',5,25)}{number('decimals','Decimal places / trailing zeros',0,4)}<p className="text-sm text-slate-500">Totals appear after the item list. Choose your printer, copies, or Save as PDF in the browser print dialog.</p></>}
    {tab==='Layout'&&<><p className="text-sm">Drag the outlined boxes in the preview to move them like the layout designer in your video. The box border moves together with the element. Use Properties → Border for border sides, style, thickness and color, and Properties → Position for exact X/Y and box size.</p><div className="grid grid-cols-2 gap-3">{number('logoWidth','Logo width (px)',40,240)}{number('logoHeight','Logo height (px)',30,150)}</div><Button type="button" variant="outline" onClick={()=>{setEditingId('');update({...structuredClone(defaultDocumentDesign),savedTemplates:design.savedTemplates});}}>Restore default template</Button></>}
   </div><div className="min-w-0 space-y-3"><div className="flex gap-2"><Button type="button" variant={target==='screen'?'default':'outline'} onClick={()=>setTarget('screen')}>Screen preview</Button><Button type="button" variant={target==='print'?'default':'outline'} onClick={()=>setTarget('print')}>Print preview</Button></div><p className="text-xs text-slate-500">Drag any dashed box in the preview to reposition it. Table columns still use the Columns width controls.</p><div ref={preview} className="max-h-[650px] overflow-auto border bg-white"><CustomInvoiceTemplate design={design} target={target} setup={setup} editable onMoveElement={moveElement} record={{number:'INV-SAMPLE',transactionDate:'2026-09-13',dueDate:'2026-10-13',party:'Sample Customer',currency:'AED',status:'open',subtotal:1000,vatAmount:50,total:1050,balance:1050,salesman:'Sales Representative'}} lines={[{id:1,sku:'ITEM-001',description:'Sample product',quantity:2,unitPrice:500,serialNumber:'SN-001\nSN-002',subtotal:1000,vatAmount:50,total:1050,comments:'Sample item comments'}]}/></div>{target==='print'&&<Button type="button" variant="outline" onClick={print}>Print / Save PDF preview</Button>}</div></div>
   <Button type="submit" className="brand-primary-button">Save Company Setup &amp; Template</Button>
  </fieldset>
 </section>;
}
