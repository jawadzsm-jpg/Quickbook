"use client";
import { useState } from 'react';
import { AccountHistory } from './account-history';
import { Button } from '@/components/ui/button';
import type { FinancialReportData } from '@/lib/financial-reports';

export function FinancialReport({report,onOpen}:{report:FinancialReportData;onOpen:(id:number)=>void}) {
 const [account,setAccount]=useState<{id:number;name:string}|null>(null);
 const format=(n:number)=>new Intl.NumberFormat('en-AE',{style:'currency',currency:report.currency}).format(n);
 const table=(rows:FinancialReportData['rows'],columns:FinancialReportData['columns'])=><div data-report-columns={columns.length} className={`report-table overflow-auto rounded-xl border ${columns.length === 2 ? "report-table--compact" : columns.length > 6 ? "report-table--wide" : ""}`}><table className="w-full text-sm"><thead><tr>{columns.map(c=><th key={c.key} className={`p-3 ${c.type==='money'?'text-right':'text-left'}`}>{c.label}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i} className="border-t">{columns.map(c=><td key={c.key} className={`p-3 ${c.type==='money'?'text-right tabular-nums':'text-left'}`}>{c.type==='money'&&typeof r[c.key]==='number'?format(Number(r[c.key])):(c.key==='account'||c.key==='name'&&r.name===r.account)&&Number(r.accountId)>0&&report.financial.canViewAccounts?<button type="button" className="text-left underline" onClick={()=>setAccount({id:Number(r.accountId),name:String(r.account||r.name)})}>{r[c.key]}</button>:c.key==='reference'&&Number(r.transactionId)>0?<button type="button" className="underline" onClick={()=>onOpen(Number(r.transactionId))}>{r[c.key]}</button>:String(r[c.key]??'—')}</td>)}</tr>)}{!rows.length&&<tr><td colSpan={columns.length} className="p-6 text-center">No posted data in this period.</td></tr>}</tbody></table></div>;
 return <section className="space-y-4">
  {report.financial.note&&<p className="text-sm text-muted-foreground">{report.financial.note}</p>}
  {report.financial.issues.length>0&&<div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"><p className="font-semibold">Some accounts could not be linked safely</p><ul className="mt-2 list-disc space-y-1 pl-5">{report.financial.issues.map(issue=><li key={issue}>{issue}</li>)}</ul></div>}
  {table(report.rows,report.columns)}
  <details className="rounded-xl border p-4 print:hidden"><summary className="cursor-pointer font-semibold">Account details · {report.financial.details.length} entries</summary>{table(report.financial.details,[{key:'date',label:'Date'},{key:'reference',label:'Reference'},{key:'account',label:'Account'},{key:'amount',label:'Amount',type:'money'}])}</details>
  {account&&<div className="rounded-xl border p-4 print:hidden"><div className="mb-3 flex justify-between"><h3 className="font-bold">{account.name} · full account history</h3><Button variant="outline" onClick={()=>setAccount(null)}>Close account</Button></div><AccountHistory accountId={account.id} companyId={report.companyId} onOpen={onOpen}/></div>}
 </section>;
}
