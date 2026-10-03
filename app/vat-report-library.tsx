"use client";

import { ArrowUpRight } from "lucide-react";
import { vatReportGroups } from "@/lib/vat-report";


export function VatReportLibrary({ reports, loading, onOpen }: { reports: Array<{ key: string; name: string; description: string }>; loading: boolean; onOpen: (key: string) => void }) {
  const uniqueReports = [...new Map(reports.map((report) => [report.key, report])).values()];
  return <div className="vat-library">
    <div className="vat-library-intro"><div><p className="vat-eyebrow">VAT intelligence</p><h4>Clear tax codes. Trace every amount.</h4><p>Company-wide VAT activity, review exceptions and the code register, linked to original documents and VAT accounts.</p></div><div className="vat-library-formats"><span>A4 print / PDF</span><span>Excel / CSV</span><span>Company-wide</span></div></div>
    {vatReportGroups.map((group) => {
      const entries = uniqueReports.filter((report) => group.keys.includes(report.key));
      if (!entries.length) return null;
      return <section key={group.title} className="vat-library-group"><div className="vat-library-group-heading"><h4>{group.title}</h4><p>{group.description}</p></div><div className="vat-library-cards">{entries.map((report) => <button type="button" key={report.key} disabled={loading} onClick={() => onOpen(report.key)} className="vat-library-card"><span className="vat-library-card-copy"><strong>{report.name}</strong><span>{report.description}</span><small>{report.key === "vat-code-list" ? "Current VAT codes" : "Company-wide VAT"}</small></span><ArrowUpRight aria-hidden="true" className="size-5 shrink-0" /></button>)}</div></section>;
    })}
  </div>;
}
