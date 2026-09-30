"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Download, Printer, RotateCcw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createA4LetterheadPdfBlob, downloadPdfBlob } from "@/lib/document-output";

type Company = {
  name: string;
  logoData: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  trn: string;
};

type RcmForm = {
  declarationDate: string;
  supplyDate: string;
  validFrom: string;
  validUntil: string;
  recipientCompany: string;
  recipientLicense: string;
  recipientTrn: string;
  recipientAddress: string;
  authorizedSignatory: string;
  recipientContact: string;
  recipientTelephone: string;
  recipientEmail: string;
  footerAddress: string;
  supplierCompany: string;
  supplierLicense: string;
  supplierTrn: string;
  supplierAddress: string;
  supplierManager: string;
  supplierContact: string;
  acquisitionPurpose: "resale" | "manufacturing" | "both";
};

function todayInUae() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function oneYearLessOneDay(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const result = new Date(Date.UTC(year + 1, month - 1, day));
  result.setUTCDate(result.getUTCDate() - 1);
  return result.toISOString().slice(0, 10);
}

function readableDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "________________";
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
}

function initialForm(company: Company): RcmForm {
  const today = todayInUae();
  const setupAddress = [company.addressLine1, company.addressLine2, company.city, company.country].filter(Boolean).join(", ");
  return {
    declarationDate: today,
    supplyDate: today,
    validFrom: today,
    validUntil: oneYearLessOneDay(today),
    recipientCompany: company.name || "COMNET INTERNATIONAL LLC",
    recipientLicense: "560262",
    recipientTrn: company.trn || "100349940500003",
    recipientAddress: setupAddress || "SHOP # 13, 14 & 15, AL BAYAT CENTER, AL NAHDA STREET, BUR DUBAI, UAE",
    authorizedSignatory: "Ahsan Sayed",
    recipientContact: "+971 56 257 7000",
    recipientTelephone: company.phone || "+971 4 393 8050",
    recipientEmail: company.email || "dubai@comnet-cni.com",
    footerAddress: "Shop # 13 & 14, Bayat Center Building, Near Astoria Hotel, P.O. Box 49781, Khalid Bin Al Waleed Road, Bur Dubai, UAE",
    supplierCompany: "",
    supplierLicense: "",
    supplierTrn: "",
    supplierAddress: "",
    supplierManager: "",
    supplierContact: "",
    acquisitionPurpose: "resale",
  };
}

const fieldClass = "space-y-1.5";

export function RcmDeclarationGenerator({ company }: { company: Company }) {
  const defaults = useMemo(() => initialForm(company), [company]);
  const [form, setForm] = useState<RcmForm>(defaults);
  const [pdfBusy, setPdfBusy] = useState(false);
  const page = useRef<HTMLDivElement>(null);
  const set = <K extends keyof RcmForm>(key: K, value: RcmForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const supplierName = form.supplierCompany.trim() || "[SUPPLIER COMPANY NAME]";
  const recipientName = form.recipientCompany.trim() || "[RECIPIENT COMPANY NAME]";
  const purpose = form.acquisitionPurpose === "resale"
    ? "for resale"
    : form.acquisitionPurpose === "manufacturing"
      ? "for use in producing or manufacturing other specified Electronic Devices"
      : "for resale and/or for use in producing or manufacturing other specified Electronic Devices";

  const print = () => {
    if (!page.current) return;
    const popup = window.open("", "_blank");
    if (!popup) return toast.error("Allow pop-ups to print the RCM declaration.");
    popup.opener = null;
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>RCM Declaration</title><style>@page{size:A4 portrait;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:white;font-family:Arial,sans-serif}.rcm-page{width:210mm!important;min-height:297mm!important;margin:0!important;border:0!important;box-shadow:none!important;print-color-adjust:exact;-webkit-print-color-adjust:exact}.print-controls{padding:10px;background:#f1f5f9}@media print{.print-controls{display:none}}</style></head><body><div class="print-controls"><button onclick="window.print()">Print / Save PDF</button></div>${page.current.outerHTML}</body></html>`);
    popup.document.close();
    void Promise.all(Array.from(popup.document.images).map((image) => image.complete ? Promise.resolve() : image.decode().catch(() => undefined)))
      .then(() => window.setTimeout(() => { if (!popup.closed) popup.print(); }, 150));
  };

  const download = async () => {
    if (!page.current) return;
    setPdfBusy(true);
    try {
      const blob = await createA4LetterheadPdfBlob(page.current, `RCM Declaration - ${supplierName}`);
      const safeSupplier = form.supplierCompany.replace(/[^\p{L}\p{N}._-]+/gu, "_") || "Supplier";
      downloadPdfBlob(blob, `RCM-Declaration-${safeSupplier}.pdf`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the RCM declaration PDF.");
    } finally {
      setPdfBusy(false);
    }
  };

  return <div className="space-y-5">
    <section className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-3"><div className="brand-soft-icon grid size-11 shrink-0 place-items-center rounded-xl"><ShieldCheck className="size-5" /></div><div><h2 className="text-lg font-bold text-slate-900">UAE RCM Declaration Generator</h2><p className="mt-1 max-w-3xl text-sm text-slate-500">Prepare an A4 recipient declaration for electronic devices under Cabinet Decision No. 91 of 2023. Complete the supplier boxes, review the dates, then print or download the PDF.</p></div></div>
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setForm(defaults)}><RotateCcw className="size-4" />Reset</Button><Button type="button" variant="outline" onClick={print}><Printer className="size-4" />Print A4</Button><Button type="button" disabled={pdfBusy} onClick={() => void download()}><Download className="size-4" />{pdfBusy ? "Creating PDF…" : "Download PDF"}</Button></div>
      </div>
      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900"><strong>Compliance note:</strong> This is an editable business template, not legal or tax advice. Confirm that both parties and the goods qualify, and verify the wording and validity period before signing.</div>
    </section>

    <div className="grid min-w-0 gap-5 xl:grid-cols-[410px_minmax(0,1fr)]">
      <section className="space-y-5 rounded-xl border bg-white p-5 shadow-sm">
        <fieldset><legend className="mb-3 font-bold text-slate-900">Declaration details</legend><div className="grid grid-cols-2 gap-3">
          <div className={fieldClass}><Label htmlFor="rcm-declaration-date">Declaration date</Label><Input id="rcm-declaration-date" type="date" value={form.declarationDate} onChange={(event) => set("declarationDate", event.target.value)} /></div>
          <div className={fieldClass}><Label htmlFor="rcm-supply-date">Supply / reference date</Label><Input id="rcm-supply-date" type="date" value={form.supplyDate} onChange={(event) => set("supplyDate", event.target.value)} /></div>
          <div className={fieldClass}><Label htmlFor="rcm-valid-from">Valid from</Label><Input id="rcm-valid-from" type="date" value={form.validFrom} onChange={(event) => set("validFrom", event.target.value)} /></div>
          <div className={fieldClass}><Label htmlFor="rcm-valid-until">Valid until</Label><Input id="rcm-valid-until" type="date" value={form.validUntil} onChange={(event) => set("validUntil", event.target.value)} /></div>
          <div className="col-span-2 space-y-1.5"><Label htmlFor="rcm-purpose">Acquisition purpose</Label><select id="rcm-purpose" className="h-10 w-full rounded-md border bg-white px-3 text-sm" value={form.acquisitionPurpose} onChange={(event) => set("acquisitionPurpose", event.target.value as RcmForm["acquisitionPurpose"])}><option value="resale">Resale / reselling</option><option value="manufacturing">Producing or manufacturing specified devices</option><option value="both">Resale and/or manufacturing</option></select></div>
        </div></fieldset>

        <fieldset className="border-t pt-5"><legend className="mb-3 font-bold text-slate-900">Supplier details</legend><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          <RcmInput id="supplier-company" label="Company name" value={form.supplierCompany} onChange={(value) => set("supplierCompany", value)} required />
          <RcmInput id="supplier-license" label="License no." value={form.supplierLicense} onChange={(value) => set("supplierLicense", value)} />
          <RcmInput id="supplier-trn" label="Tax Registration Number" value={form.supplierTrn} onChange={(value) => set("supplierTrn", value.replace(/\D/g, "").slice(0, 15))} inputMode="numeric" />
          <RcmInput id="supplier-manager" label="Manager name" value={form.supplierManager} onChange={(value) => set("supplierManager", value)} />
          <RcmInput id="supplier-contact" label="Contact no." value={form.supplierContact} onChange={(value) => set("supplierContact", value)} />
          <div className="space-y-1.5 sm:col-span-2 xl:col-span-1 2xl:col-span-2"><Label htmlFor="supplier-address">Registered address</Label><Textarea id="supplier-address" rows={3} value={form.supplierAddress} onChange={(event) => set("supplierAddress", event.target.value)} placeholder="Street, area, P.O. Box, emirate, UAE" /></div>
        </div></fieldset>

        <fieldset className="border-t pt-5"><legend className="mb-3 font-bold text-slate-900">Recipient / our details</legend><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          <RcmInput id="recipient-company" label="Company name" value={form.recipientCompany} onChange={(value) => set("recipientCompany", value)} />
          <RcmInput id="recipient-license" label="License no." value={form.recipientLicense} onChange={(value) => set("recipientLicense", value)} />
          <RcmInput id="recipient-trn" label="Tax Registration Number" value={form.recipientTrn} onChange={(value) => set("recipientTrn", value.replace(/\D/g, "").slice(0, 15))} inputMode="numeric" />
          <RcmInput id="recipient-signatory" label="Authorized signatory" value={form.authorizedSignatory} onChange={(value) => set("authorizedSignatory", value)} />
          <RcmInput id="recipient-mobile" label="Mobile" value={form.recipientContact} onChange={(value) => set("recipientContact", value)} />
          <RcmInput id="recipient-phone" label="Telephone" value={form.recipientTelephone} onChange={(value) => set("recipientTelephone", value)} />
          <RcmInput id="recipient-email" label="Email" value={form.recipientEmail} onChange={(value) => set("recipientEmail", value)} type="email" />
          <div className="space-y-1.5 sm:col-span-2 xl:col-span-1 2xl:col-span-2"><Label htmlFor="recipient-address">Registered address</Label><Textarea id="recipient-address" rows={3} value={form.recipientAddress} onChange={(event) => set("recipientAddress", event.target.value)} /></div>
          <div className="space-y-1.5 sm:col-span-2 xl:col-span-1 2xl:col-span-2"><Label htmlFor="recipient-footer-address">Footer address</Label><Textarea id="recipient-footer-address" rows={3} value={form.footerAddress} onChange={(event) => set("footerAddress", event.target.value)} /></div>
        </div></fieldset>
      </section>

      <section className="min-w-0"><div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Live A4 preview</div><div className="overflow-auto rounded-xl border bg-slate-200 p-3"><div ref={page} className="rcm-page relative mx-auto min-h-[297mm] w-[210mm] bg-white px-[15mm] py-[12mm] font-sans text-[10.5pt] leading-[1.42] text-slate-950 shadow-lg">
        <header className="border-b-2 border-slate-900 pb-3 text-center">
          {company.logoData ? <Image src={company.logoData} alt="Company logo" width={260} height={75} unoptimized className="mx-auto mb-2 h-auto max-h-[16mm] w-auto max-w-[55mm] object-contain" /> : null}
          <h1 className="text-[13pt] font-black leading-tight">Declaration for Application of Reverse Charge Mechanism (RCM) on Electronic Devices among Registrants in the State for the Purposes of Value Added Tax</h1>
          <p className="mt-2 text-[11pt] font-bold">Declaration for the purposes of Cabinet Decision No. 91 of 2023</p>
        </header>

        <div className="mt-4 space-y-3">
          <div className="flex justify-between gap-8"><p><strong>Date:</strong> {readableDate(form.declarationDate)}</p><p><strong>Supply / reference date:</strong> {readableDate(form.supplyDate)}</p></div>
          <div><p className="font-bold">To:</p><p className="font-bold uppercase">M/s. {supplierName}</p><p className="whitespace-pre-line">{form.supplierAddress || "[SUPPLIER REGISTERED ADDRESS]"}</p><p><strong>TRN:</strong> {form.supplierTrn || "[SUPPLIER TRN]"}{form.supplierLicense ? <> &nbsp; | &nbsp; <strong>License No.:</strong> {form.supplierLicense}</> : null}</p>{form.supplierManager || form.supplierContact ? <p><strong>Attention:</strong> {[form.supplierManager, form.supplierContact].filter(Boolean).join(" · ")}</p> : null}</div>
          <p>In accordance with Cabinet Decision No. (91) of 2023 concerning the application of the Reverse Charge Mechanism on Electronic Devices among Registrants in the State for the purposes of Value Added Tax, I, <strong>{form.authorizedSignatory || "[AUTHORIZED SIGNATORY]"}</strong>, being the authorized signatory, hereby declare on behalf of <strong>{recipientName}</strong> that:</p>
          <p><strong>{recipientName}</strong> acquires the specified Electronic Devices from <strong>{supplierName}</strong> {purpose}. The Electronic Devices will not be used or consumed by us for any other purpose.</p>
          <p><strong>{recipientName}</strong> is registered with the UAE Federal Tax Authority for Value Added Tax purposes on the date of supply and confirms that it will undertake the applicable VAT compliance obligations.</p>
          <p>Our details, as stated in the relevant registration records, are:</p>
          <table className="w-full border-collapse text-[10pt]"><tbody>
            <DeclarationRow label="Legal name" value={recipientName} />
            <DeclarationRow label="Trade License No." value={form.recipientLicense || "—"} />
            <DeclarationRow label="Tax Registration Number" value={form.recipientTrn || "—"} />
            <DeclarationRow label="Registered address" value={form.recipientAddress || "—"} />
          </tbody></table>
          <p><strong>{recipientName}</strong> shall calculate and account for the tax due on the value of the qualifying goods supplied, in accordance with the applicable UAE VAT legislation.</p>
          <p className="font-bold">This declaration is valid for qualifying sales by {supplierName} to {recipientName} during the period from {readableDate(form.validFrom)} to {readableDate(form.validUntil)}.</p>
          <p>I, <strong>{form.authorizedSignatory || "[AUTHORIZED SIGNATORY]"}</strong>, declare that the information provided in this declaration is true, complete and accurate.</p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-10 text-[10pt]"><div><p><strong>Name of authorized signatory:</strong></p><p className="mt-1">{form.authorizedSignatory || "________________________"}</p><p className="mt-7 border-t border-slate-500 pt-1">Signature</p></div><div><p><strong>Name and stamp of registrant recipient:</strong></p><p className="mt-1 font-bold">{recipientName}</p><p className="mt-7 border-t border-slate-500 pt-1">Company stamp</p></div></div>
        <p className="mt-4 text-[10pt]"><strong>Date:</strong> {readableDate(form.declarationDate)}</p>

        <footer className="letterhead-footer-area absolute inset-x-[15mm] bottom-[9mm] border-t border-slate-400 pt-2 text-center text-[8.5pt] leading-4 text-slate-700"><p><strong>Tel:</strong> {form.recipientTelephone || "—"} &nbsp; <strong>Mobile:</strong> {form.recipientContact || "—"} &nbsp; <strong>Email:</strong> {form.recipientEmail || "—"}</p><p>{form.footerAddress || form.recipientAddress}</p></footer>
      </div></div></section>
    </div>
  </div>;
}

function RcmInput({ id, label, value, onChange, required = false, inputMode, type = "text" }: { id: string; label: string; value: string; onChange: (value: string) => void; required?: boolean; inputMode?: "numeric"; type?: string }) {
  return <div className={fieldClass}><Label htmlFor={id}>{label}{required ? " *" : ""}</Label><Input id={id} type={type} inputMode={inputMode} value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}

function DeclarationRow({ label, value }: { label: string; value: string }) {
  return <tr><th className="w-[37%] border border-slate-500 bg-slate-100 px-2 py-1.5 text-left align-top font-bold">{label}</th><td className="whitespace-pre-line border border-slate-500 px-2 py-1.5 font-semibold">{value}</td></tr>;
}
