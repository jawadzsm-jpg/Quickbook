"use client";

import { ArrowUpRight } from "lucide-react";
import { inventoryReportGroups } from "@/lib/inventory-report";

export function InventoryReportLibrary({ reports, loading, onOpen }: { reports: Array<{ key: string; name: string; description: string }>; loading: boolean; onOpen: (key: string) => void }) {
  return <div className="inventory-library">
    <div className="inventory-library-intro"><div><p className="inventory-eyebrow">Inventory intelligence</p><h4>Know your stock. Plan your next move.</h4><p>Clear summaries, item detail and direct links to your Chart of Accounts.</p></div><div className="inventory-library-formats"><span>A4 print / PDF</span><span>Excel / CSV</span><span>Home currency</span></div></div>
    {inventoryReportGroups.map((group) => {
      const entries = reports.filter((report) => group.keys.includes(report.key));
      if (!entries.length) return null;
      return <section key={group.title} className="inventory-library-group"><div className="inventory-library-group-heading"><h4>{group.title}</h4><p>{group.description}</p></div><div className="inventory-library-cards">{entries.map((report) => <button type="button" key={report.key} disabled={loading} onClick={() => onOpen(report.key)} className="inventory-library-card"><span className="inventory-library-card-copy"><strong>{report.name}</strong><span>{report.description}</span><small>{report.key === "physical-inventory" ? "Count worksheet" : report.key === "negative-item-list" ? "Exception report" : "Current stock snapshot"}</small></span><ArrowUpRight aria-hidden="true" className="size-5 shrink-0" /></button>)}</div></section>;
    })}
  </div>;
}
