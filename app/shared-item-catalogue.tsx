"use client";
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type SharedItem = { id:number; itemNumber:string; sku:string; name:string; description:string; specifications:string; category:string; company:string; inventory:string };
const PAGE_SIZE = 25;

export function SharedItemCatalogue({search,refresh,companyId,locationId,canUse,onUsed}:{search:string;refresh:number;companyId?:number;locationId?:number;canUse:boolean;onUsed:()=>void}) {
 const [state,setState]=useState<{records:SharedItem[];loading:boolean;error:string}>({records:[],loading:true,error:''});
 const [localSearch,setLocalSearch]=useState('');
 const [page,setPage]=useState(1);
 useEffect(()=>{
  const controller=new AbortController();
  fetch('/api/shared-items',{cache:'no-store',signal:controller.signal}).then(async response=>{
   const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not load items.');
   if(!controller.signal.aborted)setState({records:data.records,loading:false,error:''});
  }).catch(error=>{if(!controller.signal.aborted)setState({records:[],loading:false,error:error instanceof Error?error.message:'Could not load items.'});});
  return ()=>controller.abort();
 },[refresh]);
 const [busy,setBusy]=useState<number|null>(null);
 const addItem=async(sourceId:number)=>{
  setBusy(sourceId);
  try{const response=await fetch('/api/shared-items',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sourceId,companyId,locationId})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not add item.');toast.success(data.existing?'This item already exists in the selected inventory.':'Item added with the same Item No. and SKU, and zero stock and prices.');onUsed();}catch(error){toast.error(error instanceof Error?error.message:'Could not add item.');}finally{setBusy(null);}
 };
 const rows=useMemo(()=>state.records.filter(row=>[search,localSearch].every(term=>!term.trim()||Object.values(row).some(value=>String(value).toLowerCase().includes(term.trim().toLowerCase())))),[state.records,search,localSearch]);
 const totalPages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));
 const currentPage=Math.min(page,totalPages);
 const pagedRows=rows.slice((currentPage-1)*PAGE_SIZE,currentPage*PAGE_SIZE);
 const description=(row:SharedItem)=>{try{const specs=JSON.parse(row.specifications) as {value:string}[];return specs.map(s=>s.value).filter(v=>v&&v.trim().toLowerCase()!=='no').join(' | ')||row.description;}catch{return row.description;}};
 const exportCsv=()=>{
  const quote=(value:unknown)=>`"${String(value??'').replaceAll('"','""')}"`;
  const csv=[['Company','Inventory','Item No.','SKU','Item','Category','Description','Qty','Price','Selling price','GRN'],...rows.map(r=>[r.company,r.inventory,r.itemNumber||13000+r.id,r.sku,r.name,r.category,description(r),0,0,0,0])].map(row=>row.map(quote).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob(['\uFEFF',csv],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='shared-items-all-companies.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 return <div><div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><h3 className="font-semibold">All items · All companies</h3><p className="text-sm text-muted-foreground">{state.loading?'Loading…':`${rows.length} items`} · Quantity and prices shown as zero</p></div><div className="flex flex-wrap items-center gap-2"><Input value={localSearch} onChange={e=>{setLocalSearch(e.target.value);setPage(1);}} placeholder="Search portal items…" className="w-64"/><Button variant="outline" onClick={exportCsv} disabled={!rows.length}>Export CSV</Button></div></div>{state.error?<p role="alert" className="p-4 text-red-600">{state.error}</p>:<><Table><TableHeader><TableRow>{['Company','Inventory','Item No.','SKU','Item & description','Category','Qty','Price','Selling price','GRN',...(canUse?['Actions']:[])].map(label=><TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>{pagedRows.length?pagedRows.map(row=><TableRow key={row.id}><TableCell>{row.company}</TableCell><TableCell>{row.inventory}</TableCell><TableCell>{row.itemNumber||13000+row.id}</TableCell><TableCell>{row.sku}</TableCell><TableCell><p className="font-semibold">{row.name}</p><p className="max-w-xl whitespace-normal break-words text-xs text-muted-foreground">{description(row)}</p></TableCell><TableCell>{row.category}</TableCell><TableCell>0</TableCell><TableCell>0.00</TableCell><TableCell>0.00</TableCell><TableCell>0.00</TableCell>{canUse&&<TableCell><Button type="button" variant="outline" disabled={busy!==null||!companyId||!locationId} onClick={()=>void addItem(row.id)}>{busy===row.id?"Adding…":"Use in selected inventory"}</Button></TableCell>}</TableRow>):<TableRow><TableCell colSpan={canUse?11:10} className="p-8 text-center">{state.loading?'Loading items…':'No shared items found.'}</TableCell></TableRow>}</TableBody></Table><div className="flex items-center justify-between border-t p-3"><p className="text-sm text-muted-foreground">Page {currentPage} of {totalPages}</p><div className="flex gap-2"><Button type="button" variant="outline" disabled={currentPage<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>Previous</Button><Button type="button" variant="outline" disabled={currentPage>=totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))}>Next page</Button></div></div></>}</div>;
}
