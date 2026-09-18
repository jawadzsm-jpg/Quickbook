"use client";
import { useMemo, useState } from 'react';
import { templateDocumentTypes, type DocumentDesign, type TemplateDocumentType, validateDocumentDesign } from '@/lib/document-design';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export function TemplateManager({design,onChange,onEdit,editingId}:{design:DocumentDesign;onChange:(patch:Partial<DocumentDesign>)=>void;onEdit:(id:string)=>void;editingId:string}) {
 const templates=design.savedTemplates;
 const [includeInactive,setIncludeInactive]=useState(false);
 const [selectedId,setSelectedId]=useState(editingId||templates.find(t=>t.active!==false)?.id||templates[0]?.id||'');
 const [newType,setNewType]=useState<TemplateDocumentType>('Invoice');
 const visibleTemplates=useMemo(()=>templates.filter(t=>includeInactive||t.active!==false),[templates,includeInactive]);
 const preferredId=editingId&&templates.some(t=>t.id===editingId)?editingId:selectedId;
 const effectiveSelectedId=visibleTemplates.some(t=>t.id===preferredId)?preferredId:(visibleTemplates[0]?.id||'');
 const selected=templates.find(t=>t.id===effectiveSelectedId);
 const selectedActive=selected ? selected.active!==false : false;
 const selectedForAll=Boolean(selected?.appliesToAll);

 const snapshot=()=>{const {savedTemplates,...value}=validateDocumentDesign(JSON.stringify(design));void savedTemplates;return value;};
 const uniqueName=(baseName:string)=>{
  const base=baseName.replace(/ copy(?: \d+)?$/,'').slice(0,65);
  let name=`${base} copy`;let count=2;
  while(templates.some(t=>t.design.name===name))name=`${base} copy ${count++}`;
  return name;
 };
 const activateOnly=(id:string,type:TemplateDocumentType)=>templates.map(t=>t.id===id?{...t,type,active:true}:t.type===type&&t.active!==false?{...t,active:false}:t);
 const copyCurrent=()=>{
  try {
   if(templates.length>=20)throw new Error('Keep at most 20 saved templates.');
   const value=snapshot();
   const id=crypto.randomUUID();
   const name=uniqueName(value.name);
   const next=activateOnly(id,newType);
   onChange({savedTemplates:[...next,{id,type:newType,active:true,design:{...value,name}}]});
   setSelectedId(id);
   toast.success(`Saved customization enabled for ${newType}. Save Company Setup to keep these changes.`);
  }catch(error){toast.error(error instanceof Error?error.message:'Check the template settings.');}
 };
 const duplicateSelected=()=>{
  if(!selected)return;
  if(templates.length>=20)return toast.error('Keep at most 20 saved templates.');
  const id=crypto.randomUUID();
  const type=selected.type||'Invoice';
  const name=uniqueName(selected.design.name);
  const next=activateOnly(id,type);
  onChange({savedTemplates:[...next,{...selected,id,type,active:true,design:{...selected.design,name}}]});
  setSelectedId(id);
  toast.success(`Copied template and enabled it for ${type}. Save Company Setup to keep this change.`);
 };
 const setActiveForAll=(enabled:boolean)=>{
  if(!selected)return;
  onChange({savedTemplates:templates.map(t=>t.id===selected.id?{...t,active:true,appliesToAll:enabled}:{...t,appliesToAll:false})});
  toast.success(enabled?'This template is now active for all document types.':'This template is no longer the all-document default.');
 };
 const setUseSavedCustomization=(enabled:boolean)=>{
  if(!selected)return;
  const type=selected.type||'Invoice';
  if(enabled){
   onChange({savedTemplates:activateOnly(selected.id,type)});
   toast.success(`Saved customization enabled for ${type}.`);
  } else {
   onChange({savedTemplates:templates.map(t=>t.id===selected.id?{...t,active:false}:t)});
   toast.success(`Saved customization disabled for ${type}.`);
   if(!includeInactive)setSelectedId(visibleTemplates.find(t=>t.id!==selected.id)?.id||'');
  }
 };
 const removeSelected=()=>{
  if(!selected)return;
  onChange({savedTemplates:templates.filter(t=>t.id!==selected.id)});
  setSelectedId(visibleTemplates.find(t=>t.id!==selected.id)?.id||'');
  toast.success('Template deleted. Save Company Setup to keep this change.');
 };
 const changeType=(type:TemplateDocumentType)=>{
  if(!selected)return;
  if(selectedActive){
   onChange({savedTemplates:templates.map(t=>t.id===selected.id?{...t,type,active:true}:t.type===type&&t.active!==false?{...t,active:false}:t)});
  }else{
   onChange({savedTemplates:templates.map(t=>t.id===selected.id?{...t,type}:t)});
  }
 };
 const renameSelected=(name:string)=>{
  if(!selected)return;
  onChange({savedTemplates:templates.map(t=>t.id===selected.id?{...t,design:{...t.design,name:name.slice(0,80)}}:t)});
 };
 const downloadSelected=()=>{
  try{
   const value=selected?.design||snapshot();
   const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'});
   const url=URL.createObjectURL(blob);
   const link=document.createElement('a');
   link.href=url;
   link.download=`${(selected?.design.name||'document-template').replace(/[^a-z0-9-_]+/gi,'-').toLowerCase()}.json`;
   link.click();
   setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch{toast.error('Check the template settings before downloading.');}
 };
 const downloadAll=()=>{
  try{
   const blob=new Blob([JSON.stringify(templates,null,2)],{type:'application/json'});
   const url=URL.createObjectURL(blob);
   const link=document.createElement('a');
   link.href=url;
   link.download='company-document-templates.json';
   link.click();
   setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch{toast.error('Unable to download templates.');}
 };
 const openSelected=()=>{
  if(!selected)return toast.error('Select a template first.');
  onEdit(selected.id);
 };

 return <div className="overflow-hidden rounded-md border border-[#6f9700] bg-white shadow-sm dark:bg-background">
  <div className="flex items-center justify-center bg-[#79a500] px-4 py-2 text-lg font-semibold text-white">Manage Templates</div>
  <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(260px,.9fr)]">
   <section className="min-w-0 rounded-sm border bg-white dark:bg-background">
    <div className="border-b px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">Select Template</div>
    <div className="min-h-[360px] border-b p-3">
     <div className="overflow-hidden border border-slate-400 bg-white text-sm dark:bg-background">
      {visibleTemplates.length===0?<button type="button" className="block w-full px-3 py-8 text-center text-muted-foreground" onClick={copyCurrent}>No templates yet — create one from the current design</button>:visibleTemplates.map(t=>{
       const activeRow=t.id===effectiveSelectedId;
       const isActive=t.active!==false;
       return <button type="button" key={t.id} onClick={()=>setSelectedId(t.id)} onDoubleClick={()=>onEdit(t.id)} className={`block w-full border-b px-3 py-2 text-left transition-colors last:border-b-0 ${activeRow?'bg-[#49a313] text-white':'hover:bg-slate-100 dark:hover:bg-slate-800'} ${!isActive?'opacity-55':''}`} aria-pressed={activeRow}>
        <span className="font-medium">{t.design.name}</span>{!isActive&&<span className={`ml-2 text-xs ${activeRow?'text-white/80':'text-muted-foreground'}`}>(inactive)</span>}
       </button>;
      })}
     </div>
    </div>
    <div className="grid grid-cols-2 gap-3 p-3"><Button type="button" variant="outline" disabled={!selected} onClick={duplicateSelected}>Copy</Button><Button type="button" variant="outline" disabled={!selected} onClick={removeSelected}>Delete</Button></div>
   </section>

   <section className="min-w-0 rounded-sm border bg-white p-4 dark:bg-background">
    <div className="mb-4 text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">Template Details</div>
    <label className="grid gap-1 text-sm"><span className="font-medium">Template Name</span><input className="h-10 rounded-md border bg-background px-3" maxLength={80} value={selected?.design.name||design.name} disabled={!selected} onChange={e=>renameSelected(e.target.value)}/></label>
    <div className="mt-4 grid gap-3">
     <label className="grid gap-1 text-sm"><span className="font-medium">Template Type</span><select className="h-10 rounded-md border bg-background px-3" value={selected?.type||'Invoice'} disabled={!selected} onChange={e=>changeType(e.target.value as TemplateDocumentType)}>{templateDocumentTypes.map(type=><option key={type} value={type}>{type}</option>)}</select></label>
     <label className="rounded-md border border-[#79a500] bg-[#f7faef] p-3 text-sm dark:bg-background"><span className="flex items-center gap-2 font-medium"><input type="checkbox" checked={selectedActive} disabled={!selected} onChange={e=>setUseSavedCustomization(e.target.checked)}/>Use my saved customization for {selected?.type||'this document type'}</span><span className="mt-1 block pl-6 text-xs text-muted-foreground">When enabled, this saved template is used for the selected document type.</span></label>
     <label className="rounded-md border border-[#2563eb] bg-[#eff6ff] p-3 text-sm dark:bg-background"><span className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={selectedForAll} disabled={!selected} onChange={e=>setActiveForAll(e.target.checked)}/>Make this template active for ALL document types</span><span className="mt-1 block pl-6 text-xs text-muted-foreground">Applies this same layout to Invoice, Credit Note, Refund, Sales Receipt, Purchase Order, Statement, Estimate, Sales Order, Delivery Note, Packing List, and Proforma Invoice. The document title still changes to the correct type.</span></label>
     <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeInactive} onChange={e=>setIncludeInactive(e.target.checked)}/>Include inactive templates</label>
     <label className="grid gap-1 text-sm"><span className="font-medium">New template type</span><select className="h-10 rounded-md border bg-background px-3" value={newType} onChange={e=>setNewType(e.target.value as TemplateDocumentType)}>{templateDocumentTypes.map(type=><option key={type} value={type}>{type}</option>)}</select></label>
     <Button type="button" variant="outline" onClick={copyCurrent}>New From Current</Button>
     <Button type="button" variant="outline" disabled={!selected} onClick={downloadSelected}>Download Selected Template</Button>
    </div>
    <div className="mt-5 rounded-md border border-[#79a500] bg-[#f7faef] p-3 dark:bg-background"><p className="font-semibold">A4 print / PDF ready</p><p className="mt-1 text-xs text-muted-foreground">The live preview on the right uses the selected company layout. Use <strong>Print / Save PDF — A4</strong> beside the preview for 210 × 297 mm output.</p></div>
   </section>
  </div>
  <div className="flex flex-wrap items-center gap-2 border-t bg-slate-50 p-3 dark:bg-background">
   <Button type="button" variant="outline" onClick={()=>toast.info('Select a template and use Make this template active for ALL document types to connect the same layout everywhere. Save Company Setup to permanently keep template changes.')}>Help</Button>
   <Button type="button" variant="outline" className="ml-auto" onClick={downloadAll}>Download Templates...</Button>
   <Button type="button" className="min-w-28 brand-primary-button" disabled={!selected} onClick={openSelected}>OK</Button>
   <Button type="button" variant="outline" className="min-w-28" onClick={()=>toast.info('Template changes are not permanent until Company Setup is saved.')}>Cancel</Button>
  </div>
 </div>;
}
