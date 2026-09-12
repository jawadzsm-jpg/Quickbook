export function PaidInvoiceStamp({ status, paidAt }: { status: string; paidAt: string | null }) {
  if (status !== "paid" || !paidAt || !Number.isFinite(Date.parse(paidAt))) return null;
  const timestamp = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(paidAt));
  return <div aria-label="Invoice paid stamp" style={{ display: "flex", justifyContent: "flex-end", margin: "12px 0", breakInside: "avoid" }}><div style={{ border: "3px solid #047857", borderRadius: 8, color: "#047857", background: "#ecfdf5", padding: "10px 18px", textAlign: "center", printColorAdjust: "exact" }}><strong style={{ display: "block", fontSize: 26, letterSpacing: 4 }}>PAID</strong><span style={{ display: "block", fontSize: 12 }}>Paid in full · {timestamp} GST (UTC+4)</span></div></div>;
}
