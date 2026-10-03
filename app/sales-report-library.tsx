"use client";

import { ArrowUpRight } from "lucide-react";
import { salesReportGroups, uniqueSalesReports } from "@/lib/sales-report";

export function SalesReportLibrary({ reports, loading, onOpen }: { reports: Array<{ key: string; name: string; description: string }>; loading: boolean; onOpen: (key: string) => void }) {
  const uniqueReports = uniqueSalesReports(reports);
  return <div className="sales-library">
    <div className="sales-library-intro"><div><p className="sales-eyebrow">Sales intelligence</p><h4>Understand revenue. Follow every sale.</h4><p>Daily activity, customer spending and product performance, linked to original sales documents and posted accounts.</p></div><div className="sales-library-formats"><span>A4 print / PDF</span><span>Excel / CSV</span><span>Home currency</span></div></div>
    {salesReportGroups.map((group) => {
      const entries = uniqueReports.filter((report) => group.keys.includes(report.key));
      if (!entries.length) return null;
      return <section key={group.title} className="sales-library-group"><div className="sales-library-group-heading"><h4>{group.title}</h4><p>{group.description}</p></div><div className="sales-library-cards">{entries.map((report) => <button type="button" key={report.key} disabled={loading} onClick={() => onOpen(report.key)} className="sales-library-card"><span className="sales-library-card-copy"><strong>{report.name}</strong><span>{report.description}</span><small>{["pending-sales", "sales-orders"].includes(report.key) ? "Pipeline & fulfilment" : "Sales & performance"}</small></span><ArrowUpRight aria-hidden="true" className="size-5 shrink-0" /></button>)}</div></section>;
    })}
  </div>;
}
