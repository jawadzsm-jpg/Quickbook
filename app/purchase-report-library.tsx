"use client";

import { ArrowUpRight } from "lucide-react";
import { purchaseReportGroups } from "@/lib/purchase-report";

export function PurchaseReportLibrary({ reports, loading, onOpen }: { reports: Array<{ key: string; name: string; description: string }>; loading: boolean; onOpen: (key: string) => void }) {
  return <div className="purchase-library">
    <div className="purchase-library-intro"><div><p className="purchase-eyebrow">Purchasing intelligence</p><h4>Track spending. Stay ahead of receiving.</h4><p>Supplier spending, item costs and outstanding orders, linked to their original documents and accounts.</p></div><div className="purchase-library-formats"><span>A4 print / PDF</span><span>Excel / CSV</span><span>Home currency</span></div></div>
    {purchaseReportGroups.map((group) => {
      const entries = reports.filter((report) => group.keys.includes(report.key));
      if (!entries.length) return null;
      return <section key={group.title} className="purchase-library-group"><div className="purchase-library-group-heading"><h4>{group.title}</h4><p>{group.description}</p></div><div className="purchase-library-cards">{entries.map((report) => <button type="button" key={report.key} disabled={loading} onClick={() => onOpen(report.key)} className="purchase-library-card"><span className="purchase-library-card-copy"><strong>{report.name}</strong><span>{report.description}</span><small>{report.key.includes("order") ? "Receiving & commitments" : "Bills & purchase expenses"}</small></span><ArrowUpRight aria-hidden="true" className="size-5 shrink-0" /></button>)}</div></section>;
    })}
  </div>;
}
