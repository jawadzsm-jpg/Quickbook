"use client";

import Image from "next/image";

type Data = Record<string, string | number | boolean>;
type Branding = {
  name: string;
  logoData: string;
  rightLogoData?: string;
  phone: string;
  email?: string;
  trn: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  country: string;
};

const fmtDate = (value: unknown) => {
  const raw = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return String(value || "—");
  const [year, month, day] = raw.split("-");
  return `${day}/${month}/${year}`;
};

const qty = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function DeliveryNoteTemplate({
  record,
  lines,
  contact,
  setup,
}: {
  record: Data;
  lines: Data[];
  contact?: Data | null;
  setup: Branding;
}) {
  const customerName = String(contact?.billingName || contact?.company || record.party || "Customer");
  const customerCountry = String(contact?.country || "");
  const deliveryAddress = String(record.deliveryAddress || contact?.shippingAddress || contact?.country || "—");
  const salesRep = String(record.salesman || "—");
  const totalQty = lines.reduce((sum, line) => sum + qty(line.quantity), 0);
  const address = [setup.addressLine1, setup.addressLine2, setup.city, setup.country].filter(Boolean).join(", ");

  return <article className="custom-invoice delivery-note-page bg-white text-black" style={{ fontFamily: "Arial, sans-serif", padding: 28, minWidth: 0, maxWidth: "100%" }}>
    <style>{`
      .delivery-note-page,.delivery-note-page *{box-sizing:border-box;color:#111!important}
      .delivery-note-page{background:#fff!important;line-height:1.35}
      .delivery-note-page .dn-header{display:grid;grid-template-columns:1fr 1.15fr 1fr;gap:24px;align-items:start}
      .delivery-note-page .dn-logo{min-height:92px;display:flex;align-items:flex-start}
      .delivery-note-page .dn-logo.right{justify-content:flex-end}
      .delivery-note-page .dn-title{text-align:center}
      .delivery-note-page .dn-title .arabic{font-size:20px;font-weight:700;color:#9ca3af!important}
      .delivery-note-page .dn-title h1{font-size:34px;line-height:1;margin:4px 0;color:#9ca3af!important}
      .delivery-note-page .dn-contact-grid{display:grid;grid-template-columns:1fr 1fr;gap:80px;margin:44px 0 46px}
      .delivery-note-page .dn-contact h3{font-size:20px;font-style:italic;text-decoration:underline;margin:0 0 8px}
      .delivery-note-page .dn-contact p{font-size:18px;margin:3px 0}
      .delivery-note-page .dn-meta{display:grid;grid-template-columns:1fr 1.05fr 1fr .75fr;border:1px solid #bbb;border-radius:12px 12px 0 0;overflow:hidden}
      .delivery-note-page .dn-meta>div{padding:12px 10px;text-align:center;border-right:1px solid #bbb;min-height:74px}
      .delivery-note-page .dn-meta>div:last-child{border-right:0}
      .delivery-note-page .dn-meta strong{display:block;font-size:14px}
      .delivery-note-page .dn-meta span{display:block;margin-top:4px;font-size:14px}
      .delivery-note-page table{width:100%;border-collapse:collapse;table-layout:fixed}
      .delivery-note-page th,.delivery-note-page td{border:1px solid #bbb;padding:10px 8px;vertical-align:top;font-size:14px}
      .delivery-note-page th{background:#fff!important;text-align:center;font-size:15px}
      .delivery-note-page .desc{width:76%}
      .delivery-note-page .qcol{width:7%;text-align:center}
      .delivery-note-page .cond{width:17%;text-align:left}
      .delivery-note-page .total-row{display:grid;grid-template-columns:1fr 41%;margin-left:auto;width:41%;border-left:1px solid #bbb;border-right:1px solid #bbb;border-bottom:1px solid #bbb}
      .delivery-note-page .total-row>div{padding:12px 16px;font-weight:800;font-size:16px}
      .delivery-note-page .total-row>div:last-child{text-align:right}
      .delivery-note-page .dn-footer{margin-top:28px;border-top:1px solid #bbb;padding-top:14px;text-align:center;font-size:13px}
      .delivery-note-page .dn-footer strong{font-size:14px}
      @media print{
        .delivery-note-page{padding:0!important}
        .delivery-note-page thead{display:table-header-group}
        .delivery-note-page tr{break-inside:avoid-page}
        .delivery-note-page .dn-header,.delivery-note-page .dn-contact-grid,.delivery-note-page .dn-meta,.delivery-note-page .dn-footer{break-inside:avoid-page}
      }
    `}</style>

    <div className="dn-header">
      <div className="dn-logo">
        {setup.logoData ? <Image src={setup.logoData} alt="Company logo" width={340} height={110} unoptimized style={{ width: 300, maxWidth: "100%", height: 95, objectFit: "contain", objectPosition: "left top" }} /> : <strong className="text-xl">{setup.name}</strong>}
      </div>
      <div className="dn-title">
        <div className="arabic">مذكرة التسليم</div>
        <h1>Delivery Note</h1>
      </div>
      <div className="dn-logo right">
        {setup.rightLogoData ? <Image src={setup.rightLogoData} alt="Right company logo" width={300} height={110} unoptimized style={{ width: 280, maxWidth: "100%", height: 95, objectFit: "contain", objectPosition: "right top" }} /> : null}
      </div>
    </div>

    <div className="dn-contact-grid">
      <div className="dn-contact">
        <h3>Customer: العميل</h3>
        <p>{customerName}</p>
        {customerCountry ? <p>{customerCountry}</p> : null}
      </div>
      <div className="dn-contact">
        <h3>Delivery Address: عنوان التسليم</h3>
        <p>{deliveryAddress}</p>
      </div>
    </div>

    <div className="dn-meta">
      <div><strong>Invoice# / رقم الفاتورة</strong><span>{String(record.number || "—")}</span></div>
      <div><strong>Date / التاريخ</strong><span>{fmtDate(record.transactionDate)}</span></div>
      <div><strong>Sales Rep. / رجل المبيعات</strong><span>{salesRep}</span></div>
      <div><strong>TRN / الرقم الضريبي</strong><span>{setup.trn || "—"}</span></div>
    </div>

    <table>
      <thead><tr><th className="desc">Description</th><th className="qcol">Qty</th><th className="cond">Condition</th></tr></thead>
      <tbody>
        {lines.map((line, index) => <tr key={String(line.id || index)}>
          <td className="desc">{String(line.description || line.itemDescription || line.name || "")}</td>
          <td className="qcol">{qty(line.quantity).toLocaleString("en-AE", { maximumFractionDigits: 2 })}</td>
          <td className="cond">Good</td>
        </tr>)}
      </tbody>
    </table>

    <div className="total-row"><div>Total QTY</div><div>{totalQty.toLocaleString("en-AE", { maximumFractionDigits: 2 })}</div></div>

    <div className="dn-footer">
      {address ? <div>{address}</div> : null}
      <strong>{[setup.phone, setup.email].filter(Boolean).join(" · ")}</strong>
    </div>
  </article>;
}
