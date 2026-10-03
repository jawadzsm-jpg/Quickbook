"use client";
import { ArrowUpRight } from "lucide-react";
import { vendorReportGroups } from "@/lib/vendor-report";
export function VendorReportLibrary({ reports, loading, hasVendor, onOpen }: { reports: Array<{ key: string; name: string; description: string }>; loading: boolean; hasVendor: boolean; onOpen: (key: string) => void }) {
  const unique = [...new Map(reports.map(report => [report.key, report])).values()];
  return <div className="vendor-library"><div className="vendor-library-intro"><div><p className="vendor-eyebrow">Supplier intelligence</p><h4>Understand balances. Trace every document.</h4><p>Clear supplier activity, aging and statements with source documents and verified account links.</p></div><div className="vendor-library-formats"><span>A4 print / PDF</span><span>Excel / CSV</span><span>Selected currency</span></div></div>{vendorReportGroups.map(group => {
    const entries = unique.filter(report => group.keys.includes(report.key));
    return entries.length ? <section key={group.title} className="vendor-library-group"><div className="vendor-library-group-heading"><h4>{group.title}</h4><p>{group.description}</p></div><div className="vendor-library-cards">{entries.map(report => {
      const selected = ["supplier-quickreport", "supplier-open-balance"].includes(report.key);
      return <button key={report.key} type="button" disabled={loading || selected && !hasVendor} onClick={() => onOpen(report.key)} className="vendor-library-card"><span className="vendor-library-card-copy"><strong>{report.name}</strong><span>{report.description}</span><small>{selected ? hasVendor ? "Selected supplier" : "Choose a supplier above" : "Company supplier reporting"}</small></span><ArrowUpRight aria-hidden="true" className="size-5 shrink-0" /></button>;
    })}</div></section> : null;
  })}</div>;
}
