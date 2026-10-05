"use client";

import { useState } from 'react';
import { ArrowRight, FileText, Maximize2, Minus, ReceiptText, ShoppingCart, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Action = { type:string; label:string; detail:string; icon:LucideIcon; stage:string };
export function SalesWorkflowPanel({ salesOnly, canPending, onCreate, onAccounts }: { salesOnly:boolean; canPending:boolean; onCreate:(type:string)=>void; onAccounts?:()=>void }) {
  const [minimized,setMinimized]=useState(false);
  const actions:Action[]=[
    {type:salesOnly?'quotation':'estimate',label:'Quotation / estimate',detail:'Prepare products, prices, VAT and payment terms.',icon:FileText,stage:'Prepare'},
    {type:'proforma invoice',label:'Proforma invoice',detail:salesOnly?'Save for accounting to review, stamp and issue.':'Prepare the customer’s preliminary invoice.',icon:FileText,stage:'Confirm'},
    {type:'sales order',label:'Sales order',detail:'Confirm quantities and track partial invoicing.',icon:ShoppingCart,stage:'Fulfil'},
    ...(!salesOnly?[{type:'invoice',label:'Invoice',detail:'Post receivables, revenue, VAT and stock movements.',icon:ReceiptText,stage:'Post'}]:[]),
  ];
  return <section className="min-w-0 overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm" aria-label="Sales document workflow">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b bg-muted/30 p-4 sm:p-6"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-widest text-primary">Sales workspace</p><h2 className="mt-1 text-xl font-semibold">Sales document workflow</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{salesOnly?'Prepare documents for your own customers. Accounting handles saved proformas and final invoices.':'Prepare a quote or order, invoice available quantities, then track the remaining delivery and customer payment.'}</p></div><Button type="button" variant="ghost" size="icon" aria-label={minimized?'Restore sales workflow':'Minimize sales workflow'} title={minimized?'Restore':'Minimize'} onClick={()=>setMinimized(v=>!v)}>{minimized?<Maximize2 className="size-4"/>:<Minus className="size-4"/>}</Button></header>
    {!minimized&&<><div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-6 xl:grid-cols-4">{actions.map((action,index)=><button type="button" key={action.type} onClick={()=>onCreate(action.type)} className="group min-w-0 rounded-xl border bg-background p-4 text-left transition hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary"><div className="flex items-center justify-between gap-2"><span className="rounded-lg bg-primary/10 p-2 text-primary"><action.icon className="size-5"/></span><span className="text-xs font-medium text-muted-foreground">{index+1} · {action.stage}</span></div><h3 className="mt-4 font-semibold">{action.label}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{action.detail}</p><span className="mt-4 flex items-center gap-2 text-sm font-medium text-primary">Create <ArrowRight className="size-4"/></span></button>)}</div><footer className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 p-4 text-xs leading-5 text-muted-foreground"><p className="max-w-3xl">Quotes, estimates, proformas, orders and pending invoices do not post to the ledger. Final invoices use the customer’s receivable account and the configured sales, VAT, inventory and cost accounts.</p><div className="flex flex-wrap gap-2">{canPending&&<Button type="button" size="sm" variant="outline" onClick={()=>onCreate('pending invoice')}>Create pending invoice</Button>}{onAccounts&&<Button type="button" size="sm" variant="outline" onClick={onAccounts}>Chart of Accounts</Button>}</div></footer></>}
  </section>;
}

export function SalesRegisterSummary({ records,loading }: { records:Record<string,string|number|boolean>[];loading:boolean }) {
  const counts=[['Documents',records.length],['Customers',new Set(records.map(r=>r.party).filter(Boolean)).size],['Invoices',records.filter(r=>r.type==='invoice').length],['Currencies',new Set(records.map(r=>r.currency).filter(Boolean)).size]];
  return <div className="border-b p-4 sm:p-5"><h3 className="font-semibold">Sales document register</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Summary and exports follow the active filters within the loaded register (up to 500 recent transactions). Document amounts are not revenue or outstanding balances; currencies and workflow stages are not added together.</p><div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">{counts.map(([label,value])=><div key={label} className="min-w-0 rounded-xl border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{loading?'—':value}</p></div>)}</div></div>;
}
