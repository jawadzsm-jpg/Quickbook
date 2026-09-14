"use client";
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SharedItemCatalogue } from '@/app/shared-item-catalogue';

type SharedItem = { id:number; itemNumber:string; sku:string; name:string; description:string; specifications:string; category:string };
export function SharedOutOfStock({search,refresh,companyId,locationId,canUse,onUsed}:{search:string;refresh:number;companyId?:number;locationId?:number;canUse:boolean;onUsed:()=>void}) {
 const [view,setView]=useState<'out'|'portal'>('out');
 const [state,setState]=useState<{records:SharedItem[];loading:boolean;error:string}>({records:[],loading:true,error:''});
 useEffect(()=>{
  const controller=new AbortController();
  const params=new URLSearchParams();
  if(companyId)params.set('companyId',String(companyId));
  if(locationId)params.set('locationId',String(locationId));
  const suffix=params.toString()?`?${params.toString()}`:'';
  fetch(`/api/out-of-stock${suffix}`,{cache:'no-store',signal:controller.signal}).then(async response=>{
   const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not load items.');
   if(!controller.signal.aborted)setState({records:data.records,loading:false,error:''});
  }).catch(error=>{if(!controller.signal.aborted)setState({records:[],loading:false,error:error instanceof Error?error.message:'Could not load items.'});});
  return ()=>controller.abort();
 },[refresh,companyId,locationId]);
 const [busy,setBusy]=useState<number|null>(null);
 const addItem=async(sourceId:number)=>{
  setBusy(sourceId);
  try{const response=await fetch('/api/shared-items',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sourceId,companyId,locationId})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not add item.');toast.success(data.existing?'This item already exists in the selected inventory.':'Item added with the same Item No. and SKU, and zero stock and prices.');onUsed();}catch(error){toast.error(error instanceof Error?error.message:'Could not add item.');}finally{setBusy(null);}
 };
 const filteredRows=state.records.filter(row=>Object.values(row).some(value=>String(value).toLowerCase().includes(search.trim().toLowerCase())));
 const rows=Array.from(new Map(filteredRows.map(row=>[(row.sku||`id-${row.id}`).trim().toLowerCase(),row])).values());
 const description=(row:SharedItem)=>{try{const specs=JSON.parse(row.specifications) as {value:string}[];return specs.map(s=>s.value).filter(v=>v&&v.trim().toLowerCase()!=='no').join(' | ')||row.description;}catch{return row.description;}};
 const exportCsv=()=>{
  const quote=(value:unknown)=>`"${String(value??'').replaceAll('"','""')}"`;
  const csv=[['Item No.','SKU','Item','Category','Description','Status'],...rows.map(r=>[r.itemNumber||13000+r.id,r.sku,r.name,r.category,description(r),'Out of stock'])].map(row=>row.map(quote).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob(['\uFEFF',csv],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='out-of-stock-all-companies.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 if(view==='portal')return <div><div className="flex flex-wrap items-center gap-2 border-b p-3"><Button type="button" variant="outline" onClick={()=>setView('out')}>Out of stock</Button><Button type="button" onClick={()=>setView('portal')}>ComNet Portal Items</Button></div><SharedItemCatalogue search={search} refresh={refresh} companyId={companyId} locationId={locationId} canUse={canUse} onUsed={onUsed}/></div>;
 return <div><div className="flex flex-wrap items-center gap-2 border-b p-3"><Button type="button" onClick={()=>setView('out')}>Out of stock</Button><Button type="button" variant="outline" onClick={()=>setView('portal')}>ComNet Portal Items</Button></div><div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><h3 className="font-semibold">Out of stock · All companies</h3><p className="text-sm text-muted-foreground">{state.loading?'Loading…':`${rows.length} items`} · {canUse?"Use items in your selected inventory":"Shared catalogue"}</p></div><Button variant="outline" onClick={exportCsv} disabled={!rows.length}>Export CSV</Button></div>{state.error?<p role="alert" className="p-4 text-red-600">{state.error}</p>:<Table><TableHeader><TableRow>{['Item No.','SKU','Item & description','Category','Status',...(canUse?['Actions']:[])].map(label=><TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.length?rows.map(row=><TableRow key={row.id}><TableCell>{row.itemNumber||13000+row.id}</TableCell><TableCell>{row.sku}</TableCell><TableCell><p className="font-semibold">{row.name}</p><p className="max-w-xl whitespace-normal break-words text-xs text-muted-foreground">{description(row)}</p></TableCell><TableCell>{row.category}</TableCell><TableCell className="text-rose-600">Out of stock</TableCell>{canUse&&<TableCell><Button type="button" variant="outline" disabled={busy!==null||!companyId||!locationId} onClick={()=>void addItem(row.id)}>{busy===row.id?"Adding…":"Use in selected inventory"}</Button></TableCell>}</TableRow>):<TableRow><TableCell colSpan={canUse?6:5} className="p-8 text-center">{state.loading?'Loading items…':'No shared items available for this inventory.'}</TableCell></TableRow>}</TableBody></Table>}</div>;
}
