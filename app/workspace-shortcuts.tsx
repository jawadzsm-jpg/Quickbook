"use client";

import { useEffect, useState, type ComponentType } from "react";
import { ArrowRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Shortcut = { id: string; label: string; icon: ComponentType<{className?:string}> };
export function WorkspaceShortcuts({ groups, currentView, onNavigate }: { groups: {label:string;items:Shortcut[]}[];currentView:string;onNavigate:(id:string)=>void }) {
  const [open,setOpen]=useState(false);
  const [query,setQuery]=useState("");
  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{
      if ((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="k" && !document.querySelector('[role="dialog"][data-state="open"]')) {
        event.preventDefault();setQuery("");setOpen(true);
      }
    };
    window.addEventListener("keydown",onKey);
    return ()=>window.removeEventListener("keydown",onKey);
  },[]);
  const seen=new Set<string>();
  const filtered=groups.map(group=>({...group,items:group.items.filter(item=>{
    if(seen.has(item.id))return false;seen.add(item.id);
    return `${item.label} ${group.label}`.toLowerCase().includes(query.trim().toLowerCase());
  })})).filter(group=>group.items.length);
  return <>
    <Button type="button" variant="outline" onClick={()=>{setQuery("");setOpen(true);}} title="Find a workspace · Ctrl/⌘ K"><Search className="size-4"/>Shortcuts<kbd className="hidden rounded border px-1 text-[10px] text-muted-foreground lg:inline">⌘ / Ctrl K</kbd></Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent showWindowControls={false} className="sm:max-w-2xl">
      <DialogHeader><DialogTitle>Workspace shortcuts</DialogTitle><DialogDescription>Find a page available to your role. Your selected company stays active.</DialogDescription></DialogHeader>
      <Input autoFocus aria-label="Search workspace shortcuts" placeholder="Search sales, inventory, reports…" value={query} onChange={e=>setQuery(e.target.value)}/>
      <div className="max-h-[55dvh] space-y-5 overflow-y-auto" aria-live="polite">
        {filtered.length ? filtered.map(group=><section key={group.label}><h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground">{group.label}</h3><div className="grid gap-2 sm:grid-cols-2">{group.items.map(item=><button key={item.id} type="button" aria-current={currentView===item.id?'page':undefined} onClick={()=>{setOpen(false);onNavigate(item.id);}} className="flex min-w-0 items-center gap-3 rounded-xl border bg-card p-3 text-left text-sm text-card-foreground transition hover:border-primary/50 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"><item.icon className="size-5 shrink-0 text-primary"/><span className="min-w-0 flex-1 break-words">{item.label}</span>{currentView===item.id?<span className="text-xs text-muted-foreground">Current</span>:<ArrowRight className="size-4 shrink-0 text-muted-foreground"/>}</button>)}</div></section>):<p className="py-6 text-center text-sm text-muted-foreground">No matching pages.</p>}
      </div>
    </DialogContent></Dialog>
  </>;
}
