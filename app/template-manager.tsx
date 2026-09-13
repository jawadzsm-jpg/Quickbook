"use client";
import { useState } from 'react';
import { type DocumentDesign, validateDocumentDesign } from '@/lib/document-design';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export function TemplateManager({design,onChange}:{design:DocumentDesign;onChange:(patch:Partial<DocumentDesign>)=>void}) {
 const [selected,setSelected]=useState('');
 const templates=design.savedTemplates;
 const chosen=templates.find(t=>t.id===selected);
 const snapshot=()=>{const {savedTemplates,...value}=validateDocumentDesign(JSON.stringify(design));void savedTemplates;return value;};
 const save=(copy:boolean)=>{
  try {
   if(copy&&templates.length>=20)throw new Error('Keep at most 20 saved templates.');
   const value=snapshot();
   if(copy){const id=crypto.randomUUID();onChange({savedTemplates:[...templates,{id,design:{...value,name:`${value.name.slice(0,70)} copy`}}]});setSelected(id);}
   else if(chosen)onChange({savedTemplates:templates.map(t=>t.id===selected?{...t,design:value}:t)});
   toast.success('Template updated. Save Company Setup to keep these changes.');
  }catch(error){toast.error(error instanceof Error?error.message:'Check the template settings.');}
 };
 const download=()=>{try{const blob=new Blob([JSON.stringify(snapshot(),null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='invoice-template.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch{toast.error('Check the template settings before downloading.');}};
 return <div className="space-y-4">
  <h3 className="font-semibold">Manage Templates</h3>
  <label className="grid gap-2 text-sm">Saved company templates<select className="rounded border bg-background p-2" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Select a saved template</option>{templates.map(t=><option key={t.id} value={t.id}>{t.design.name}</option>)}</select></label>
  <div className="flex flex-wrap gap-2"><Button type="button" onClick={()=>save(true)}>Copy current template</Button><Button type="button" disabled={!chosen} variant="outline" onClick={()=>{if(chosen)onChange({...chosen.design,enabled:true});}}>Use selected template</Button><Button type="button" disabled={!chosen} variant="outline" onClick={()=>save(false)}>Update selected from current</Button><Button type="button" disabled={!chosen} variant="destructive" onClick={()=>{onChange({savedTemplates:templates.filter(t=>t.id!==selected)});setSelected('');}}>Delete selected</Button><Button type="button" variant="outline" onClick={download}>Download current template</Button></div>
  <p className="text-sm text-muted-foreground">Use selected template replaces the current editor settings. Rename it in Basic, then update the selected template. Deleting a saved copy keeps the current invoice layout. Save Company Setup to apply your changes.</p>
 </div>;
}
