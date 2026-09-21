"use client";
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { presetDates, reportDatePresets, reportToday, type ReportPeriod } from '@/lib/report-period';
export function ReportDateFilter({period,loading,onApply,children}:{period:ReportPeriod;loading:boolean;onApply:(from:string,to:string)=>Promise<void>;children?:ReactNode}) {
 const [preset,setPreset]=useState(period.from||period.to?'Custom':'All');
 const [from,setFrom]=useState(period.from),[to,setTo]=useState(period.to);
 const current=period.mode==='current';
 const january=reportToday().slice(5,7)==='01';
 return <form className="flex flex-wrap items-end gap-3 rounded-xl border bg-background p-4 print:hidden" onSubmit={e=>{e.preventDefault();void onApply(from,to);}}>
  <label className="grid gap-1 text-sm">Dates<select disabled={loading||current} value={preset} className="h-9 rounded-md border bg-background px-3" onChange={e=>{const value=e.target.value;setPreset(value);if(value!=='Custom'){const dates=presetDates(value);setFrom(dates.from);setTo(dates.to);}}}>{reportDatePresets.map(p=><option key={p} disabled={p==='This Fiscal Year-to-Last Month'&&january} value={p}>{p}</option>)}</select></label>
  <label className="grid gap-1 text-sm">From<Input type="date" disabled={loading||current||period.mode==='asof'} value={from} onChange={e=>{setPreset('Custom');setFrom(e.target.value);}} /></label>
  <label className="grid gap-1 text-sm">{period.mode==='asof'?'As of':'To'}<Input type="date" disabled={loading||current} min={period.mode==='range'?from||undefined:undefined} value={to} onChange={e=>{setPreset('Custom');setTo(e.target.value);}} /></label>
  {children}
  <Button disabled={loading||current}>{loading?'Loading…':'Apply dates'}</Button>
  <p className="w-full text-xs text-muted-foreground">{current?period.label:period.mode==='asof'?'Balances include all activity through the selected end date.':'Filters report activity by date.'} {!current&&'Weeks run Monday–Sunday. Fiscal presets use January–December.'}</p>
 </form>;
}
