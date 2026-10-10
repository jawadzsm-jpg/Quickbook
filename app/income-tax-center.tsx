"use client";
import { useCompanyDocumentOutput } from "./company-document-output";
import { useEffect, useState } from 'react';
import { Download, Lock, LockOpen, Printer, Save, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { PrintOrientationSelect, type PrintOrientation } from '@/components/print-orientation-select';
import { defaultTaxConfig, taxBasis, taxExpenseTypes, taxPayableTypes, taxSource, type TaxAccount, type TaxConfig, type TaxResult } from '@/lib/income-tax';
import { reportDownloadDate } from '@/lib/report-export';
import { SalesReportStamp } from './sales-report-stamp';
import { AccountHistory } from './account-history';

type Paper={id:number;revision:number;periodStart:string;periodEnd:string;config:TaxConfig;updatedAt:string;filedAt?:string|null};
type Setup={currency:string;accounts:TaxAccount[];papers:Paper[];canManage:boolean};
const selectClass='h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm';
export function IncomeTaxCenter({companyId,companyName,stampData,onClose,onSource,onAccounts}:{companyId:number;companyName:string;stampData:string;onClose:()=>void;onSource:(id:number)=>void;onAccounts:()=>void}) {
  const documentOutput=useCompanyDocumentOutput();
  const [setup,setSetup]=useState<Setup|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  const [config,setConfig]=useState<TaxConfig>(defaultTaxConfig(reportDownloadDate().slice(0,4)));
  const [selected,setSelected]=useState<Paper|null>(null),[result,setResult]=useState<TaxResult|null>(null),[resultKey,setResultKey]=useState('');
  const [busy,setBusy]=useState(false),[stampOpen,setStampOpen]=useState(false),[orientation,setOrientation]=useState<PrintOrientation>('portrait');
  const [stamp,setStamp]=useState({show:false,left:145,top:230}),[account,setAccount]=useState<TaxAccount|null>(null);
  useEffect(()=>{
    const controller=new AbortController();
    void fetch(`/api/income-tax?companyId=${companyId}`,{cache:'no-store',signal:controller.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);if(!controller.signal.aborted){setSetup(d);setError('');if(d.currency!=='AED')setConfig(c=>({...c,threshold:0,upperRate:0}));}}).catch(e=>{if(!controller.signal.aborted)setError(e.message||'Could not load income tax settings.');});
    return ()=>controller.abort();
  },[companyId,retry]);
  const defaultConfig={...defaultTaxConfig(reportDownloadDate().slice(0,4)),threshold:setup?.currency==='AED'?375000:0,upperRate:setup?.currency==='AED'?9:0};
  const dirty=Boolean(setup?.canManage&&JSON.stringify(config)!==JSON.stringify(selected?.config||defaultConfig));
  const current=Boolean(result&&resultKey===JSON.stringify(config));
  const money=(n:number)=>new Intl.NumberFormat('en-AE',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
  const change=(patch:Partial<TaxConfig>)=>setConfig(c=>({...c,...patch}));
  async function run(action:'preview'|'save'|'create-accounts') {
    if(busy||!setup)return;setBusy(true);
    try {
      const response=await fetch('/api/income-tax',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,companyId,config,id:selected?.id,revision:selected?.revision})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not prepare tax report.');
      if(action==='create-accounts'){change(data.accountIds);const r=await fetch(`/api/income-tax?companyId=${companyId}`,{cache:'no-store'});if(!r.ok)throw new Error('Accounts created. Reload to refresh the account list.');setSetup(await r.json());toast.success('Tax accounts linked.');}
      else {setResult(data.result);setResultKey(JSON.stringify(config));if(data.paper){setSelected(data.paper);setSetup(s=>s?{...s,papers:[data.paper,...s.papers.filter(p=>p.id!==data.paper.id)]}:s);toast.success('Tax working paper saved.');}}
    }catch(e){toast.error(e instanceof Error?e.message:'Could not prepare tax report.');}finally{setBusy(false);}
  }
  // Filing locks the period for every dated change; reopening asks for the Admin PIN (prompted app-wide).
  async function setFiled(action:'file'|'reopen') {
    if(busy||!selected)return;
    if(action==='file'&&!window.confirm(`Mark corporate tax ${selected.periodStart} to ${selected.periodEnd} as filed? Transactions and journals dated in this period will need the Admin PIN to change.`))return;
    setBusy(true);
    try {
      const response=await fetch('/api/income-tax',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,companyId,id:selected.id})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not update the filing.');
      setSelected(data.paper);setSetup(s=>s?{...s,papers:s.papers.map(p=>p.id===data.paper.id?data.paper:p)}:s);
      toast.success(action==='file'?'Corporate tax period filed and locked.':'Corporate tax period reopened.');
    }catch(e){toast.error(e instanceof Error?e.message:'Could not update the filing.');}finally{setBusy(false);}
  }
  async function download(format:'print'|'pdf'|'csv'|'xlsx') {
    if(!current||!result||busy)return;
    const popup=format==='print'?window.open('','_blank'):null;
    if(format==='print'&&!popup)return toast.error('Allow pop-ups to open the A4 print preview.');
    if(popup){popup.opener=null;popup.document.body.textContent='Preparing A4 print preview…';}
    setBusy(true);
    try {
      const {reportCsv,reportWorkbook,reportFilename}=await import('@/lib/report-export');
      const report=result.report;
      const content=format==='csv'?reportCsv(report,companyName,'Company-wide · all inventories'):format==='xlsx'?await reportWorkbook(report,companyName,'Company-wide · all inventories',report.rows,orientation):await documentOutput.reportPdf(report,companyName,'Company-wide · all inventories',report.rows,stamp.show&&stampData?{data:stampData,left:stamp.left,top:stamp.top}:undefined,orientation);
      const url=URL.createObjectURL(new Blob([content as BlobPart],{type:format==='csv'?'text/csv;charset=utf-8':format==='xlsx'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'application/pdf'}));
      if(popup)popup.location.href=url;else{const a=document.createElement('a');a.href=url;a.download=reportFilename({...report,title:`${companyName} Income Tax ${config.from} ${config.to}`},format==='print'?'pdf':format);a.click();}
      setTimeout(()=>URL.revokeObjectURL(url),300000);
    }catch(e){popup?.close();toast.error(e instanceof Error?e.message:'Export failed.');}finally{setBusy(false);}
  }
  const accountSelect=(key:'expenseAccountId'|'payableAccountId',title:string,types:string[])=><label className="grid min-w-0 gap-1.5 text-sm">{title}<select className={selectClass} value={config[key]} onChange={e=>change({[key]:Number(e.target.value)})}><option value={0}>Select account</option>{setup?.accounts.filter(a=>types.includes(a.type)&&a.currency===setup.currency).map(a=><option key={a.id} value={a.id}>{a.code} · {a.name}{a.active?'':' (inactive)'}</option>)}</select>{config[key]>0&&setup?.canManage&&<button type="button" className="text-left text-xs underline" onClick={()=>setAccount(setup.accounts.find(a=>a.id===config[key])||null)}>View account history</button>}</label>;
  return <><Dialog open onOpenChange={open=>{if(!open&&!busy&&(!dirty||window.confirm('Close without saving these tax settings?')))onClose();}}><DialogContent onInteractOutside={event=>event.preventDefault()} className="max-h-[94dvh] overflow-y-auto sm:max-w-6xl"><DialogHeader><DialogTitle>Income tax reporting</DialogTitle><DialogDescription>{companyName} · Company-wide · {setup?.currency||'Home currency'} · Management working paper</DialogDescription></DialogHeader>
    {error?<div role="alert" className="space-y-2 text-destructive"><p>{error}</p><Button variant="outline" onClick={()=>setRetry(v=>v+1)}>Retry</Button></div>:!setup?<p role="status">Loading tax settings…</p>:<div className="min-w-0 space-y-5">
      <div className="rounded-xl border bg-muted/30 p-4 text-sm"><p>Start from posted accounts, review tax adjustments, and calculate your estimated income tax. Saved periods reopen with current ledger figures.</p><p className="mt-2 text-xs text-muted-foreground">UAE standard: 0% up to AED 375,000 and 9% above it. For other regimes, choose your own rates and threshold. <a className="underline" href={taxSource} target="_blank" rel="noreferrer">Official rate reference</a></p></div>
      <fieldset disabled={busy} className="min-w-0 space-y-4 disabled:opacity-70">
        <div className="flex flex-wrap items-end gap-3"><label className="grid min-w-0 flex-1 gap-1.5 text-sm">Saved working papers<select className={selectClass} value={selected?.id||0} onChange={e=>{const p=setup.papers.find(p=>p.id===Number(e.target.value))||null;setSelected(p);setResult(null);if(p)setConfig(p.config);}}><option value={0}>New / unsaved working paper</option>{setup.papers.map(p=><option key={p.id} value={p.id}>{p.periodStart} to {p.periodEnd} · revision {p.revision}</option>)}</select></label><Button variant="outline" onClick={()=>{setSelected(null);setResult(null);setConfig({...defaultTaxConfig(reportDownloadDate().slice(0,4)),threshold:setup.currency==='AED'?375000:0,upperRate:setup.currency==='AED'?9:0});}}>New working paper</Button></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="grid gap-1.5 text-sm">Tax period from<Input type="date" value={config.from} onChange={e=>change({from:e.target.value})}/></label><label className="grid gap-1.5 text-sm">Tax period to<Input type="date" value={config.to} onChange={e=>change({to:e.target.value})}/></label><div className="flex flex-wrap items-end gap-2 sm:col-span-2"><Button variant="outline" disabled={setup.currency!=='AED'} onClick={()=>change({lowerRate:0,upperRate:9,threshold:375000})}>UAE standard rates</Button><Button variant="outline" onClick={()=>change({threshold:0,lowerRate:0})}>Flat rate</Button></div></div>
        <div className="grid gap-3 sm:grid-cols-3">{([['threshold',`Threshold (${setup.currency})`],['lowerRate','Rate within threshold (%)'],['upperRate','Rate above threshold / flat (%)']] as const).map(([key,label])=><label key={key} className="grid min-w-0 gap-1.5 text-sm">{label}<Input type="number" min="0" max={key==='threshold'?1e12:100} step="0.01" value={config[key]} onChange={e=>change({[key]:e.target.value===''?0:Number(e.target.value)})}/></label>)}</div>
        <p className="text-xs text-muted-foreground">The threshold applies once to the full selected tax period; it is not prorated. Flat rate uses a zero threshold. Non-AED figures require your own tax rules and conversion review.</p>
        <div className="grid gap-3 sm:grid-cols-2">{accountSelect('expenseAccountId','Corporate income tax expense',taxExpenseTypes)}{accountSelect('payableAccountId','Corporate income tax payable',taxPayableTypes)}</div>
        {setup.canManage&&<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>void run('create-accounts')}>Create / link standard tax accounts</Button><Button variant="ghost" onClick={onAccounts}>Chart of Accounts</Button></div>}
        <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1.5 text-sm">Other additions ({setup.currency})<Input type="number" min="0" step="0.01" value={config.additions} onChange={e=>change({additions:Number(e.target.value)})}/></label><label className="grid gap-1.5 text-sm">Tax deductions ({setup.currency})<Input type="number" min="0" step="0.01" value={config.deductions} onChange={e=>change({deductions:Number(e.target.value)})}/></label></div>
        <label className="grid gap-1.5 text-sm">Adjustment explanation<textarea className="min-h-20 w-full rounded-md border bg-background p-3" maxLength={1000} value={config.adjustmentNote} placeholder="Describe non-deductible expenses, exempt income or other reviewed adjustments. Do not repeat the selected tax expense add-back." onChange={e=>change({adjustmentNote:e.target.value})}/></label>
        <div className="flex flex-wrap gap-2"><Button className="brand-primary-button" onClick={()=>void run('preview')}><RefreshCw className="size-4"/>Calculate / refresh</Button>{setup.canManage&&!selected?.filedAt&&<Button variant="outline" onClick={()=>void run('save')}><Save className="size-4"/>Save working paper</Button>}{setup.canManage&&selected&&!dirty&&(selected.filedAt?<Button variant="outline" disabled={busy} onClick={()=>void setFiled('reopen')}><LockOpen className="size-4"/>Reopen (Admin PIN)</Button>:<Button variant="outline" disabled={busy} onClick={()=>void setFiled('file')}><Lock className="size-4"/>Mark as filed</Button>)}<span className="self-center text-xs text-muted-foreground">{selected?.filedAt?`Filed ${new Date(selected.filedAt).toLocaleDateString('en-GB')} · period locked`:selected?`Saved revision ${selected.revision}`:'Not saved'} · Saving does not post tax.</span></div>
      </fieldset>
      {!current?<p role="status" className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{busy?'Preparing working paper…':'Calculate to view current figures. Recalculate after changing any setting.'}</p>:result&&<>
        <div className="grid gap-3 sm:grid-cols-3">{[['Profit before tax',result.preTaxProfit],['Estimated taxable income',result.taxableIncome],['Estimated income tax',result.estimatedTax]].map(([label,value])=><div key={label} className="min-w-0 rounded-xl border bg-muted/30 p-4"><p className="text-xs text-muted-foreground">{label} · {result.currency}</p><p className="mt-2 break-words text-2xl font-semibold tabular-nums">{money(Number(value))}</p></div>)}</div>
        {result.issues.length>0&&<div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"><strong>Review required</strong><ul className="ml-5 mt-2 list-disc space-y-1">{result.issues.map(issue=><li key={issue}>{issue}</li>)}</ul></div>}
        <div className="flex flex-wrap items-center gap-2"><PrintOrientationSelect value={orientation} onValueChange={v=>{setOrientation(v);setStamp(s=>({...s,left:v==='portrait'?145:227,top:v==='portrait'?230:145}));}}/><Button variant="outline" onClick={()=>setStampOpen(v=>!v)} aria-expanded={stampOpen}>Stamp</Button><Button disabled={busy} variant="outline" onClick={()=>void download('print')}><Printer className="size-4"/>Print A4</Button><details className="relative"><summary className="flex cursor-pointer list-none items-center gap-2 rounded-md border px-3 py-2 text-sm"><Download className="size-4"/>Export</summary><div className="absolute right-0 z-20 mt-1 grid w-36 rounded-lg border bg-popover p-2 shadow-lg">{(['pdf','csv','xlsx'] as const).map(f=><Button key={f} variant="ghost" disabled={busy} onClick={()=>void download(f)}>{f==='xlsx'?'Excel':f.toUpperCase()}</Button>)}</div></details></div>
        {stampOpen&&<SalesReportStamp stampData={stampData} orientation={orientation} value={stamp} onChange={setStamp}/>}
        <div className="overflow-hidden rounded-xl border"><div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,3fr)_minmax(0,1fr)] gap-4 bg-muted p-3 text-xs font-semibold sm:grid"><span>Calculation / account</span><span>Basis / notes</span><span className="text-right">Amount ({result.currency})</span></div>{result.report.rows.map((row,i)=><div key={i} className="grid min-w-0 gap-2 border-t p-3 even:bg-muted/20 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_minmax(0,1fr)] sm:gap-4"><div className="min-w-0 break-words text-sm font-medium">{row.accountId&&setup.canManage?<button className="text-left underline decoration-dotted underline-offset-4" onClick={()=>setAccount(setup.accounts.find(a=>a.id===row.accountId)||null)}>{row.name}</button>:row.name}</div><p className="min-w-0 break-words text-xs text-muted-foreground">{row.description}</p><p className="min-w-0 break-words text-right text-sm font-semibold tabular-nums">{row.amount===null?'':money(Number(row.amount))}</p></div>)}</div>
      </>}
      <p className="text-xs text-muted-foreground">{taxBasis}</p>
    </div>}
  </DialogContent></Dialog><Dialog open={Boolean(account)} onOpenChange={open=>{if(!open)setAccount(null);}}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-5xl"><DialogHeader><DialogTitle>{account?.code} · {account?.name}</DialogTitle><DialogDescription>Full company account history</DialogDescription></DialogHeader>{account&&<AccountHistory key={account.id} companyId={companyId} accountId={account.id} onOpen={onSource}/>}</DialogContent></Dialog></>;
}
