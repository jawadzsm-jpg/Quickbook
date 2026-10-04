"use client";

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Eye, Maximize2, Minus, Pencil, Printer, RefreshCw, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PrintOrientationSelect, type PrintOrientation } from '@/components/print-orientation-select';
import { emptyJournalFilters, filterJournals, journalReport, journalTotals, type JournalEntry, type JournalFilters, type JournalLine } from '@/lib/journal-register';
import { reportDownloadDate } from '@/lib/report-export';
import { SalesReportStamp } from './sales-report-stamp';

const amount = (value: number) => new Intl.NumberFormat('en-AE',{minimumFractionDigits:2,maximumFractionDigits:2}).format(value);
const field = 'h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm text-foreground';

export function JournalAccountLines({ lines, currency, onAccount }: { lines: JournalLine[]; currency: string; onAccount: (line: JournalLine) => void }) {
  return <div className="space-y-2">{lines.map(line=><div key={line.id} className="grid min-w-0 gap-2 rounded-lg border bg-muted/30 p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
    <div className="min-w-0 break-words">{line.accountId ? <button type="button" className="text-left font-medium underline decoration-dotted underline-offset-4 hover:text-primary" onClick={()=>onAccount(line)}>{line.accountCode} · {line.accountName} <span className="text-xs text-muted-foreground">{line.accountCurrency}</span></button> : <><span className="font-medium">{line.accountName}</span><p className="text-xs text-amber-700 dark:text-amber-300">Account link needs review</p></>}</div>
    <div className="min-w-0 break-words sm:text-right"><span className="block text-xs text-muted-foreground">Debit ({currency})</span><span className="tabular-nums">{amount(line.debit)}</span></div>
    <div className="min-w-0 break-words sm:text-right"><span className="block text-xs text-muted-foreground">Credit ({currency})</span><span className="tabular-nums">{amount(line.credit)}</span></div>
  </div>)}</div>;
}

type Props = { companyId:number; companyName:string; locationId:number; locationName:string; currency:string; stampData:string; refreshKey:number; onView:(entry:JournalEntry)=>void; onEdit:(entry:JournalEntry)=>void; onDelete:(entry:JournalEntry)=>void; onOpenSource:(id:number)=>void; onAccount:(line:JournalLine)=>void };
export function PostedJournalList({ companyId, companyName, locationId, locationName, currency, stampData, refreshKey, onView, onEdit, onDelete, onOpenSource, onAccount }: Props) {
  const day=reportDownloadDate();
  const [dates,setDates]=useState({from:`${day.slice(0,7)}-01`,to:day});
  const [filters,setFilters]=useState<JournalFilters>(emptyJournalFilters);
  const [page,setPage]=useState(1);
  const [retry,setRetry]=useState(0);
  const [minimized,setMinimized]=useState(false);
  const [state,setState]=useState<{key:string;entries?:JournalEntry[];error?:string}>({key:''});
  const [orientation,setOrientation]=useState<PrintOrientation>('portrait');
  const [stamp,setStamp]=useState({show:false,left:145,top:230});
  const [stampOpen,setStampOpen]=useState(false);
  const [detailExport,setDetailExport]=useState(false);
  const [exporting,setExporting]=useState(false);
  const invalid=Boolean(dates.from && dates.to && dates.from>dates.to);
  const key=`${companyId}:${locationId}:${dates.from}:${dates.to}:${refreshKey}:${retry}`;
  useEffect(()=>{
    if(invalid || !companyId) return;
    const controller=new AbortController();
    const params=new URLSearchParams({companyId:String(companyId),locationId:String(locationId),dateFrom:dates.from,dateTo:dates.to});
    void fetch(`/api/journal-entries?${params}`,{cache:'no-store',signal:controller.signal}).then(async response=>{
      const data=await response.json();
      if(!response.ok) throw new Error(data.error || 'Could not load journal entries.');
      if(!controller.signal.aborted) setState({key,entries:data.entries});
    }).catch(error=>{if(!controller.signal.aborted) setState({key,error:error.message || 'Could not load journal entries.'});});
    return ()=>controller.abort();
  },[companyId,locationId,dates.from,dates.to,invalid,key]);
  const entries=useMemo(()=>state.key===key ? state.entries || [] : [],[state,key]);
  const error=state.key===key ? state.error : undefined;
  const ready=!invalid && state.key===key && Boolean(state.entries);
  const visible=useMemo(()=>filterJournals(entries,filters,currency),[entries,filters,currency]);
  const totals=journalTotals(visible);
  const pages=Math.max(1,Math.ceil(visible.length/50)), currentPage=Math.min(page,pages);
  const rows=visible.slice((currentPage-1)*50,currentPage*50);
  const accountOptions=[...new Map(entries.flatMap(entry=>entry.lines.filter(line=>line.accountId).map(line=>[line.accountId!,line] as const))).values()].sort((a,b)=>(a.accountCode||'').localeCompare(b.accountCode||'',undefined,{numeric:true}));
  const currencyOptions=[...new Set(entries.map(entry=>entry.currency||currency))].sort();
  const change=(update:Partial<JournalFilters>)=>{setFilters(current=>({...current,...update}));setPage(1);};
  const changeDates=(from:string,to:string)=>{setDates({from,to});setPage(1);};
  const reset=()=>{setFilters(emptyJournalFilters);changeDates('','');};
  const accountIssues=visible.flatMap(entry=>entry.lines).filter(line=>!line.accountId).length;
  const actions=(entry:JournalEntry)=><div className="flex flex-wrap items-center gap-1">
    <Button type="button" variant="ghost" size="icon" onClick={()=>onView(entry)} title="View journal" aria-label={`View journal ${entry.reference}`}><Eye className="size-4"/></Button>
    {entry.canManage && <><Button type="button" variant="ghost" size="icon" onClick={()=>onEdit(entry)} title="Edit journal" aria-label={`Edit journal ${entry.reference}`}><Pencil className="size-4"/></Button><Button type="button" variant="ghost" size="icon" className="text-rose-600 dark:text-rose-400" onClick={()=>onDelete(entry)} title="Delete journal" aria-label={`Delete journal ${entry.reference}`}><Trash2 className="size-4"/></Button></>}
    {entry.transactionId && <Button type="button" variant="ghost" size="sm" onClick={()=>onOpenSource(entry.transactionId!)}>Source</Button>}
  </div>;
  async function exportReport(format:'pdf'|'csv'|'xlsx'|'print') {
    if(!ready || !visible.length || exporting) return;
    const popup=format==='print' ? window.open('','_blank') : null;
    if(format==='print' && !popup) return toast.error('Allow pop-ups to open the A4 print preview.');
    if(popup) {popup.opener=null;popup.document.title='Preparing journal print preview';popup.document.body.textContent='Preparing A4 print preview…';}
    setExporting(true);
    try {
      const {reportCsv,reportWorkbook,reportPdf,reportFilename}=await import('@/lib/report-export');
      const report=journalReport(visible,currency,dates.from,dates.to,filters,detailExport);
      const content=format==='csv' ? reportCsv(report,companyName,locationName) : format==='xlsx' ? await reportWorkbook(report,companyName,locationName,report.rows,orientation) : await reportPdf(report,companyName,locationName,report.rows,stamp.show && stampData ? {data:stampData,left:stamp.left,top:stamp.top}:undefined,orientation);
      const blob=new Blob([content as BlobPart],{type:format==='csv'?'text/csv;charset=utf-8':format==='xlsx'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'application/pdf'});
      const url=URL.createObjectURL(blob);
      if(popup) {popup.location.href=url;setTimeout(()=>URL.revokeObjectURL(url),300000);}
      else {const link=document.createElement('a');link.href=url;link.download=reportFilename({...report,title:`${companyName} ${report.title} ${dates.from||'all'} ${dates.to||'dates'}`},format==='print'?'pdf':format);link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
    } catch(error) {popup?.close();toast.error(error instanceof Error?error.message:'Could not export journals.');}
    finally {setExporting(false);}
  }
  return <section className="min-w-0 overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm" aria-label="Posted journal entries">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4 sm:p-5"><div><h3 className="text-lg font-bold">Posted journal entries</h3><p className="text-sm text-muted-foreground">{companyName} · {locationName} · All totals in {currency}</p></div><div className="flex gap-1"><Button type="button" variant="ghost" size="icon" title="Refresh journals" aria-label="Refresh journals" onClick={()=>setRetry(v=>v+1)}><RefreshCw className="size-4"/></Button><Button type="button" variant="ghost" size="icon" title={minimized?'Restore':'Minimize'} aria-label={minimized?'Restore journal list':'Minimize journal list'} onClick={()=>setMinimized(v=>!v)}>{minimized?<Maximize2 className="size-4"/>:<Minus className="size-4"/>}</Button></div></div>
    {!minimized && <div className="space-y-5 p-3 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[['Entries',String(totals.count)],['Total debits',amount(totals.debit)],['Total credits',amount(totals.credit)],['Difference',amount(totals.debit-totals.credit)]].map(([label,value])=><div key={label} className="min-w-0 rounded-lg border bg-muted/30 p-4"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 break-words text-xl font-bold tabular-nums">{ready?value:'—'}</p></div>)}
      </div>
      <div className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="grid min-w-0 gap-1.5 text-sm sm:col-span-2">Search journals<div className="relative"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground"/><Input value={filters.query} onChange={e=>change({query:e.target.value})} placeholder="Reference, description, account name or code" className="pl-9"/></div></label>
        <label className="grid gap-1.5 text-sm">From date<Input type="date" value={dates.from} onChange={e=>changeDates(e.target.value,dates.to)}/></label>
        <label className="grid gap-1.5 text-sm">To date<Input type="date" value={dates.to} onChange={e=>changeDates(dates.from,e.target.value)}/></label>
        <label className="grid min-w-0 gap-1.5 text-sm">Source<select className={field} value={filters.source} onChange={e=>change({source:e.target.value})}><option value="">All sources</option>{['Manual','Transaction','Stock revaluation','Automatic'].map(source=><option key={source}>{source}</option>)}</select></label>
        <label className="grid min-w-0 gap-1.5 text-sm">Chart of Accounts<select className={field} value={filters.account} onChange={e=>change({account:e.target.value})}><option value="">All accounts</option>{filters.account&&!accountOptions.some(a=>String(a.accountId)===filters.account)&&<option value={filters.account}>Selected account (no entries in period)</option>}{accountOptions.map(account=><option key={account.accountId} value={account.accountId!}>{account.accountCode} · {account.accountName} · {account.accountCurrency}</option>)}</select></label>
        <label className="grid gap-1.5 text-sm">Entry currency<select className={field} value={filters.currency} onChange={e=>change({currency:e.target.value})}><option value="">All currencies</option>{[...new Set([...currencyOptions,...(filters.currency?[filters.currency]:[])])].map(code=><option key={code}>{code}</option>)}</select></label>
        <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={()=>changeDates(day,day)}>Today</Button><Button variant="outline" size="sm" onClick={()=>changeDates(`${day.slice(0,7)}-01`,day)}>This month</Button><Button variant="ghost" size="sm" onClick={reset}>Reset / all dates</Button></div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Exports include all {visible.length} matching journals, across every page.</p><div className="flex flex-wrap items-center gap-2"><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={detailExport} onChange={e=>setDetailExport(e.target.checked)}/>Include account lines</label><PrintOrientationSelect value={orientation} onValueChange={value=>{setOrientation(value);setStamp(current=>({...current,left:value==='portrait'?145:227,top:value==='portrait'?230:145}));}}/><Button variant="outline" size="sm" onClick={()=>setStampOpen(v=>!v)} aria-expanded={stampOpen}>Stamp</Button><Button variant="outline" size="sm" disabled={!ready||!visible.length||exporting} onClick={()=>void exportReport('print')}><Printer className="size-4"/>Print A4</Button><details className="relative"><summary className={`flex cursor-pointer list-none items-center gap-2 rounded-md border px-3 py-2 text-sm ${exporting?'opacity-50':''}`}><Download className="size-4"/>Export</summary><div className="absolute right-0 z-20 mt-1 grid w-36 gap-1 rounded-lg border bg-popover p-2 shadow-lg">{(['pdf','csv','xlsx'] as const).map(format=><Button key={format} variant="ghost" size="sm" disabled={!ready||!visible.length||exporting} onClick={()=>void exportReport(format)}>{format==='xlsx'?'Excel':format.toUpperCase()}</Button>)}</div></details></div></div>
      {stampOpen&&<SalesReportStamp stampData={stampData} orientation={orientation} value={stamp} onChange={setStamp}/>}
      {invalid?<p role="alert" className="text-sm text-destructive">From date must not be after To date.</p>:error?<p role="alert" className="text-sm text-destructive">{error} Use Refresh to retry.</p>:!ready?<p role="status" className="py-10 text-center text-muted-foreground">Loading posted journals…</p>:<>
        {(accountIssues>0||totals.unbalanced>0)&&<p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">{totals.unbalanced>0?`${totals.unbalanced} journal(s) need a debit/credit review. `:''}{accountIssues>0?`${accountIssues} posting line(s) have no unique Chart of Accounts link. Amounts remain included; open the journal to review.`:''}</p>}
        {filters.account&&<p className="text-xs text-muted-foreground">Showing complete journals containing the selected account, including their balancing accounts.</p>}
        {!rows.length?<div className="rounded-xl border border-dashed p-10 text-center"><p className="font-semibold">No matching posted journals</p><p className="mt-1 text-sm text-muted-foreground">Try another date range or clear your filters.</p><Button variant="outline" className="mt-3" onClick={reset}>Show all dates</Button></div>:<>
          <div className="hidden xl:block"><Table className="w-full table-fixed"><TableHeader><TableRow><TableHead className="w-[11%]">Date / reference</TableHead><TableHead>Description / accounts</TableHead><TableHead className="w-[12%]">Source</TableHead><TableHead className="w-[13%] text-right">Debit ({currency})</TableHead><TableHead className="w-[13%] text-right">Credit ({currency})</TableHead><TableHead className="w-[16%]">Actions</TableHead></TableRow></TableHeader><TableBody>{rows.map(entry=><TableRow key={entry.id} className="even:bg-muted/20"><TableCell className="align-top whitespace-normal"><p className="text-xs text-muted-foreground">{entry.entryDate}</p><button className="mt-1 break-all text-left font-semibold underline underline-offset-4" onClick={()=>onView(entry)}>{entry.reference}</button><p className="mt-1 text-xs text-muted-foreground">#{entry.id} · {entry.currency||currency}</p></TableCell><TableCell className="align-top whitespace-normal"><p className="break-words">{entry.description}</p><details className="mt-2"><summary className="cursor-pointer text-xs font-medium text-muted-foreground">{entry.lines.length} account postings</summary><div className="mt-2"><JournalAccountLines lines={entry.lines} currency={currency} onAccount={onAccount}/></div></details></TableCell><TableCell className="align-top whitespace-normal text-xs">{entry.source}</TableCell><TableCell className="break-words text-right align-top font-semibold whitespace-normal tabular-nums">{amount(entry.debit)}</TableCell><TableCell className="break-words text-right align-top font-semibold whitespace-normal tabular-nums">{amount(entry.credit)}</TableCell><TableCell className="align-top">{actions(entry)}</TableCell></TableRow>)}</TableBody></Table></div>
          <ul className="space-y-3 xl:hidden">{rows.map(entry=><li key={entry.id} className="min-w-0 rounded-xl border p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><button className="break-all text-left font-semibold underline underline-offset-4" onClick={()=>onView(entry)}>{entry.reference}</button><p className="text-xs text-muted-foreground">{entry.entryDate} · #{entry.id} · {entry.source} · {entry.currency||currency}</p></div>{actions(entry)}</div><p className="my-3 break-words text-sm">{entry.description}</p><div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-3"><div className="min-w-0"><span className="block text-xs text-muted-foreground">Debit ({currency})</span><strong className="break-words tabular-nums">{amount(entry.debit)}</strong></div><div className="min-w-0 text-right"><span className="block text-xs text-muted-foreground">Credit ({currency})</span><strong className="break-words tabular-nums">{amount(entry.credit)}</strong></div></div><details className="mt-3"><summary className="cursor-pointer text-sm font-medium">{entry.lines.length} account postings</summary><div className="mt-3"><JournalAccountLines lines={entry.lines} currency={currency} onAccount={onAccount}/></div></details></li>)}</ul>
        </>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm"><span className="text-muted-foreground">{visible.length?`${(currentPage-1)*50+1}–${Math.min(currentPage*50,visible.length)} of ${visible.length}`:'0 entries'} · Newest first</span><div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={currentPage<=1} onClick={()=>setPage(currentPage-1)}><ChevronLeft className="size-4"/>Previous</Button><span>{currentPage} / {pages}</span><Button variant="outline" size="sm" disabled={currentPage>=pages} onClick={()=>setPage(currentPage+1)}>Next<ChevronRight className="size-4"/></Button></div></div>
      </>}
    </div>}
  </section>;
}
