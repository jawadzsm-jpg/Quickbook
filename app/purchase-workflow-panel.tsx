"use client";

import { useState } from 'react';
import { ArrowRight, ArrowRightLeft, FileText, Maximize2, Minus, PackageCheck, ReceiptText, WalletCards } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function PurchaseWorkflowPanel({ inventoryOnly, ready, onCreate, onAccounts }: { inventoryOnly:boolean; ready:boolean; onCreate:(type:string)=>void; onAccounts?:()=>void }) {
  const [minimized,setMinimized]=useState(false);
  const actions=[
    {type:'purchase order',label:'Purchase order',detail:'Confirm supplier prices, quantities and payment terms.',icon:FileText,stage:'Order'},
    {type:'item receipt',label:'Receive items',detail:'Receive a full or partial delivery before the supplier bill.',icon:PackageCheck,stage:'Receive'},
    {type:'bill',label:'Enter bill',detail:'Record the supplier invoice and linked payable account.',icon:ReceiptText,stage:'Bill'},
    ...(!inventoryOnly?[
      {type:'bill payment',label:'Pay bills',detail:'Allocate a payment against outstanding supplier bills.',icon:WalletCards,stage:'Pay'},
      {type:'vendor credit',label:'Return purchases',detail:'Link a return to the original bill and available quantities.',icon:ArrowRightLeft,stage:'Return'},
    ]:[]),
  ];
  return <section className="min-w-0 overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm" aria-label="Purchase order workflow"><header className="flex flex-wrap items-start justify-between gap-3 border-b bg-muted/30 p-4 sm:p-6"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-widest text-primary">Purchasing workspace</p><h2 className="mt-1 text-xl font-semibold">Purchase order workflow</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{inventoryOnly?'Create orders, receive stock and work on bills within your same-day permissions.':'Order from a supplier, receive delivered quantities, record the bill and settle the balance. Unreceived quantities remain on the original order.'}</p></div><Button type="button" variant="ghost" size="icon" aria-label={minimized?'Restore purchase workflow':'Minimize purchase workflow'} title={minimized?'Restore':'Minimize'} onClick={()=>setMinimized(v=>!v)}>{minimized?<Maximize2 className="size-4"/>:<Minus className="size-4"/>}</Button></header>
    {!minimized&&<><div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-6 xl:grid-cols-3">{actions.map((action,index)=><button key={action.type} type="button" disabled={!ready} onClick={()=>onCreate(action.type)} className="group min-w-0 rounded-xl border bg-background p-4 text-left transition hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"><div className="flex items-center justify-between gap-2"><span className="rounded-lg bg-primary/10 p-2 text-primary"><action.icon className="size-5"/></span><span className="text-xs text-muted-foreground">{index+1} · {action.stage}</span></div><h3 className="mt-4 font-semibold">{action.label}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{action.detail}</p><span className="mt-4 flex items-center gap-2 text-sm font-medium text-primary">Create <ArrowRight className="size-4"/></span></button>)}</div><footer className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 p-4 text-xs leading-5 text-muted-foreground"><p className="max-w-3xl">Purchase orders do not post to the ledger. Receipts use the configured stock and received-items clearing accounts; bills use the supplier’s payable account with applicable inventory, expense and VAT entries.</p>{onAccounts&&<Button type="button" size="sm" variant="outline" onClick={onAccounts}>Chart of Accounts</Button>}</footer></>}
  </section>;
}

export function PurchaseRegisterSummary({ records,loading }: { records:Record<string,string|number|boolean>[];loading:boolean }) {
  const counts=[['Documents',records.length],['Suppliers',new Set(records.map(r=>r.party).filter(Boolean)).size],['Purchase orders',records.filter(r=>r.type==='purchase order').length],['Bills',records.filter(r=>['bill','received item bill'].includes(String(r.type))).length]];
  return <div className="border-b p-4 sm:p-5"><h3 className="font-semibold">Purchase document register</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Summary and exports follow your filters within the loaded register (up to 500 recent transactions). Order, receipt, bill and payment amounts are not added together. Use the Purchase Order Summary report for broader order reporting.</p><div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">{counts.map(([label,value])=><div key={label} className="min-w-0 rounded-xl border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{loading?'—':value}</p></div>)}</div></div>;
}
