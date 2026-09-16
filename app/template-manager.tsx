"use client";
import { useEffect, useMemo, useState } from 'react';
import { templateDocumentTypes, type DocumentDesign, type TemplateDocumentType, validateDocumentDesign } from '@/lib/document-design';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export function TemplateManager({design,onChange,onEdit,editingId}:{design:DocumentDesign;onChange:(patch:Partial<DocumentDesign>)=>void;onEdit:(id:string)=>void;editingId:string}) {
 const templates=design.savedTemplates;
 const [includeInactive,setIncludeInactive]=useState(false);
 const [selectedId,setSelectedId]=useState(editingId||templates.find(t=>t.active)?.id||templates[0]?.id||'');
 const [newType,setNewType]=useState<TemplateDocumentType>('Invoice');
 const visibleTemplates=useMemo(()=>templates.filter(t=>includeInactive||t.active),[templates,includeInactive]);
 const selected=templates.find(t=>t.id===selectedId);

 useEffect(()=>{
  if(editingId && templates.some(t=>t.id===editingId)){setSelectedId(editingId);return;}
  if(!visibleTemplates.some(t=>t.id===selectedId))setSelectedId(visibleTemplates[0]?.id||'');
 },[editingId,selectedId,templates,visibleTemplates]);

 const snapshot=()=>{const {savedTemplates,...value}=validateDocumentDesign(JSON.stringify(design));void savedTemplates;return value;};
 const uniqueName=(baseName:string)=>{
  const base=baseName.replace(/ copy(?: \d+)?$/,'').slice(0,65);
  let name=`${base} copy`;let count=2;
  while(templates.some(t=>t.design.name===name))name=`${base} copy ${count++}`;
  return name;
 };
 const copyCurrent=()=>{
  try {
   if(templates.length>=20)throw new Error('Keep at most 20 saved templates.');
   const value=snapshot();
   const id=crypto.randomUUID();
   const name=uniqueName(value.name);
   onChange({savedTemplates:[...templates,{id,type:newType,active:true,design:{...value,name}}]});
   setSelectedId(id);
   toast.success('Template created. Save Company Setup to keep these changes.');
  }catch(error){toast.error(error instanceof Error?error.message:'Check the template settings.');}
 };
 const duplicateSelected=()=>{
  if(!selected)return;
  if(templates.length>=20)return toast.error('Keep at most 20 saved templates.');
  const id=crypto.randomUUID();
  const name=uniqueName(selected.design.name);
  onChange({savedTemplates:[...templates,{...selected,id,active:true,design:{...selected.design,name}}]});
  setSelectedId(id);
  toast.success('Template duplicated.');
 };
 const toggleActive=()=>{
  if(!selected)return;
  onChange({savedTemplates:templates.map(t=>t.id===selected.id?{...t,active:!t.active}:t)});
  if(selected.active&&!includeInactive)setSelectedId(visibleTemplates.find(t=>t.id!==selected.id)?.id||'');
 };
 const removeSelected=()=>{
  if(!selected)return;
  onChange({savedTemplates:templates.filter(t=>t.id!==selected.id)});
  setSelectedId(visibleTemplates.find(t=>t.id!==selected.id)?.id||'');
  toast.success('Template deleted. Save Company Setup to keep this change.');
 };
 const changeType=(type:TemplateDocumentType)=>{
  if(!selected)return;
  onChange({savedTemplates:templates.map(t=>t.id===selected.id?{...t,type}:t)});
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
 const runAction=(action:string)=>{
  if(action==='new')copyCurrent();
  if(action==='duplicate')duplicateSelected();
  if(action==='toggle')toggleActive();
  if(action==='delete')removeSelected();
  if(action==='download')downloadSelected();
 };

 return <div className="overflow-hidden rounded-md border border-[#6f9700] bg-background shadow-sm">
  <div className="flex items-center justify-center bg-[#79a500] px-4 py-2 text-lg font-medium text-white">Templates</div>
  <div className="min-h-[390px] overflow-auto bg-white dark:bg-background">
   <table className="w-full border-collapse text-left text-sm">
    <thead className="sticky top-0 z-10 bg-white dark:bg-background"><tr className="border-b"><th className="w-[58%] px-3 py-2 font-medium uppercase tracking-wide text-muted-foreground">Name</th><th className="px-3 py-2 font-medium uppercase tracking-wide text-muted-foreground">Type</th></tr></thead>
    <tbody>
     {visibleTemplates.length===0?<tr><td colSpan={2} className="px-4 py-12 text-center text-muted-foreground">No templates yet. Choose a type below, then use Templates → New from current.</td></tr>:visibleTemplates.map((t,index)=>{
      const activeRow=t.id===selectedId;
      return <tr key={t.id} onClick={()=>setSelectedId(t.id)} onDoubleClick={()=>onEdit(t.id)} className={`cursor-pointer border-b transition-colors ${activeRow?'bg-[#49a313] text-white':'hover:bg-slate-100 dark:hover:bg-slate-800'} ${!t.active?'opacity-55':''}`} aria-selected={activeRow}>
       <td className="px-3 py-2.5"><span className="font-medium">{t.design.name}</span>{editingId===t.id&&<span className={`ml-2 text-xs ${activeRow?'text-white/80':'text-muted-foreground'}`}>(editing)</span>}{!t.active&&<span className={`ml-2 text-xs ${activeRow?'text-white/80':'text-muted-foreground'}`}>(inactive)</span>}</td>
       <td className="px-3 py-2.5">{t.type}</td>
      </tr>;
     })}
    </tbody>
   </table>
  </div>
  <div className="flex flex-wrap items-center gap-2 border-t bg-white p-3 dark:bg-background">
   <select aria-label="Template actions" className="h-10 min-w-40 rounded-md border bg-background px-3 font-medium" defaultValue="" onChange={e=>{const action=e.target.value;e.currentTarget.value='';runAction(action);}}>
    <option value="" disabled>Templates</option>
    <option value="new">New from current</option>
    <option value="duplicate" disabled={!selected}>Duplicate selected</option>
    <option value="toggle" disabled={!selected}>{selected?.active?'Make inactive':'Make active'}</option>
    <option value="download">Download template</option>
    <option value="delete" disabled={!selected}>Delete selected</option>
   </select>
   <Button type="button" variant="outline" disabled={!selected} onClick={()=>selected&&onEdit(selected.id)}>Open Form</Button>
   <label className="ml-1 flex items-center gap-2 whitespace-nowrap text-sm"><input type="checkbox" checked={includeInactive} onChange={e=>setIncludeInactive(e.target.checked)}/>Include inactive</label>
   <div className="ml-auto flex flex-wrap items-center gap-2">
    <label className="text-xs text-muted-foreground">New template type</label>
    <select className="h-9 rounded-md border bg-background px-2 text-sm" value={newType} onChange={e=>setNewType(e.target.value as TemplateDocumentType)}>{templateDocumentTypes.map(type=><option key={type} value={type}>{type}</option>)}</select>
    {selected&&<><label className="text-xs text-muted-foreground">Selected type</label><select className="h-9 rounded-md border bg-background px-2 text-sm" value={selected.type} onChange={e=>changeType(e.target.value as TemplateDocumentType)}>{templateDocumentTypes.map(type=><option key={type} value={type}>{type}</option>)}</select></>}
   </div>
  </div>
  <p className="border-t bg-muted/30 px-3 py-2 text-xs text-muted-foreground">Select a row and choose Open Form to edit it. Double-clicking a row also opens it. Save Company Setup to keep template, type, active/inactive, edit, or delete changes.</p>
 </div>;
}
