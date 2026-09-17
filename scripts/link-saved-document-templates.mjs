import { readFileSync, writeFileSync } from "node:fs";

const path = "app/enterprise-app.tsx";
let source = readFileSync(path, "utf8");

function replaceOnce(label, before, after) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${label}: expected source was not found`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`${label}: expected source was found more than once`);
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

replaceOnce(
  "sales template import",
  'import { SalesDocumentTemplate } from "./sales-document-template";',
  'import { SalesDocumentTemplate, salesDocumentModeForTransaction } from "./sales-document-template";',
);

replaceOnce(
  "credit/refund presentation state",
  '  const [showDimensions] = useState(false);\n  const [selectedBank] = useState(detail?.record.type === "invoice" ? "" : setup.bankName || "Emirates NBD Bank");',
  '  const [showDimensions] = useState(false);\n  const [creditPresentation, setCreditPresentation] = useState<"credit-note" | "refund">("credit-note");\n  const [selectedBank] = useState(detail?.record.type === "invoice" ? "" : setup.bankName || "Emirates NBD Bank");',
);

replaceOnce(
  "transaction template resolver",
  '  const purchaseOrder = record.type === "purchase order";\n  const convertible = ((purchaseOrder && record.status !== "received") || record.type === "quotation") && record.status !== "converted" && !record.convertedInvoiceId;',
  '  const purchaseOrder = record.type === "purchase order";\n  const savedTemplateMode = record.type === "credit memo" ? creditPresentation : salesDocumentModeForTransaction(String(record.type));\n  const usesSavedTemplate = savedTemplateMode !== null && ["invoice", "estimate", "proforma invoice", "sales order", "purchase order", "credit memo", "sales receipt"].includes(String(record.type));\n  const convertible = ((purchaseOrder && record.status !== "received") || record.type === "quotation") && record.status !== "converted" && !record.convertedInvoiceId;',
);

replaceOnce(
  "saved template document branch",
  '{documentMode === "tax-invoice" && record.type === "invoice" ? <><DialogTitle className="sr-only">Tax Invoice {String(record.number)}</DialogTitle><DialogDescription className="sr-only">Invoice preview for {String(record.party)}</DialogDescription><SalesDocumentTemplate mode="tax-invoice" record={record} lines={detail.lines} contact={contact} setup={{ ...setup, name: brandedName }} showBillingName={showBillingName} showShipping={showShipping} showHsCode={showHsCode} showDimensions={showDimensions} /></> : <>',
  `{usesSavedTemplate && savedTemplateMode ? <>
    <DialogTitle className="sr-only">{String(record.type)} {String(record.number)}</DialogTitle><DialogDescription className="sr-only">Document preview for {String(record.party)}</DialogDescription>
    {record.type === "credit memo" ? <div className="document-internal-only flex flex-wrap items-center gap-2 rounded-lg border bg-slate-50 p-3 text-sm"><span className="mr-1 font-semibold text-slate-700">Document layout</span><Button type="button" size="sm" variant={creditPresentation === "credit-note" ? "default" : "outline"} onClick={() => setCreditPresentation("credit-note")}>Credit Note</Button><Button type="button" size="sm" variant={creditPresentation === "refund" ? "default" : "outline"} onClick={() => setCreditPresentation("refund")}>Refund</Button></div> : null}
    <SalesDocumentTemplate mode={savedTemplateMode} record={record} lines={detail.lines} contact={contact} setup={{ ...setup, name: brandedName }} showBillingName={showBillingName} showShipping={showShipping} showHsCode={showHsCode} showDimensions={showDimensions} />
    {["estimate", "sales order", "proforma invoice"].includes(String(record.type)) && ["invoiced", "converted"].includes(String(record.status)) && <div className="document-internal-only my-4 w-fit rounded-lg border-4 border-emerald-600 px-5 py-2 text-xl font-extrabold uppercase tracking-wider text-emerald-700">Fully Invoiced</div>}
    {purchaseOrder && record.status === "received" && <div className="document-internal-only my-4 w-fit rounded-lg border-4 border-emerald-600 px-5 py-2 text-xl font-extrabold uppercase tracking-wider text-emerald-700">Fully Received</div>}
    {purchaseOrder && canConvert && !record.convertedInvoiceId && record.status !== "converted" && <div className="document-internal-only"><PurchaseOrderReceiving orderId={Number(record.id)} companyId={Number(record.companyId)} onSaved={onReceiptSaved} /></div>}
    {["estimate", "proforma invoice", "sales order"].includes(String(record.type)) && canConvert && !record.convertedInvoiceId && record.status !== "converted" && <div className="document-internal-only"><SalesSourceInvoicing sourceId={Number(record.id)} companyId={Number(record.companyId)} onSaved={onReceiptSaved} onViewInvoice={onOpenInvoice} /></div>}
    {record.convertedDocumentNumber && ["estimate", "proforma invoice", "sales order", "purchase order"].includes(String(record.type)) ? <div className="document-internal-only rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">Converted to {String(record.convertedDocumentType)} {String(record.convertedDocumentNumber)}</div> : null}
    {record.sourceDocumentNumber && ["estimate", "proforma invoice", "sales order", "purchase order"].includes(String(record.type)) ? <div className="document-internal-only rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm font-medium text-sky-800">Created from {String(record.sourceDocumentType)} {String(record.sourceDocumentNumber)}</div> : null}
    </> : <>`,
);

writeFileSync(path, source);
console.log("Linked saved Invoice, Estimate, Proforma Invoice, Sales Order, Purchase Order, Credit Note and Refund layouts in DocumentDialog.");
