"use client";
import { type DocumentDesign, validateDocumentDesign } from '@/lib/document-design';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export function TemplateManager({design,onChange,onEdit,editingId}:{design:DocumentDesign;onChange:(patch:Partial<DocumentDesign>)=>void;onEdit:(id:string)=>void;editingId:string}) {
 const templates=design.savedTemplates;
 const snapshot=()=>{const {savedTemplates,...value}=validateDocumentDesign(JSON.stringify(design));void savedTemplates;return value;};
 const copy=()=>{
  try {
   if(templates.length>=20)throw new Error('Keep at most 20 saved templates.');
   const value=snapshot();
   const id=crypto.randomUUID();
   const base=value.name.replace(/ copy(?: \d+)?$/,'').slice(0,65);
   let name=`${base} copy`;let count=2;
   while(templates.some(t=>t.design.name===name))name=`${base} copy ${count++}`;
   onChange({savedTemplates:[...templates,{id,design:{...value,name}}]});
   toast.success('Template updated. Save Company Setup to keep these changes.');
  }catch(error){toast.error(error instanceof Error?error.message:'Check the template settings.');}
 };
 const download=()=>{try{const blob=new Blob([JSON.stringify(snapshot(),null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='invoice-template.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch{toast.error('Check the template settings before downloading.');}};
 return <div className="space-y-4">
  <h3 className="font-semibold">Manage Templates</h3>
  {templates.length===0?<p className="text-sm text-muted-foreground">No saved templates yet. Copy the current template to get started.</p>:<ul className="space-y-2" aria-label="Saved company templates">{templates.map(t=><li key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><div className="min-w-0 flex-1"><p className="break-words font-medium">{t.design.name}</p>{editingId===t.id&&<p className="text-xs text-muted-foreground">Currently editing</p>}</div><div className="flex gap-2"><Button type="button" variant="outline" aria-label={`Edit ${t.design.name}`} onClick={()=>onEdit(t.id)}>Edit</Button><Button type="button" variant="destructive" aria-label={`Delete ${t.design.name}`} onClick={()=>onChange({savedTemplates:templates.filter(entry=>entry.id!==t.id)})}>Delete</Button></div></li>)}</ul>}
  <div className="flex flex-wrap gap-2"><Button type="button" onClick={copy}>Copy current template</Button><Button type="button" variant="outline" onClick={download}>Download current template</Button></div>
  <p className="text-sm text-muted-foreground">Edit opens the template settings. Save Company Setup to keep edits or deletions. Deleting a saved copy keeps the current invoice layout.</p>
 </div>;
}
