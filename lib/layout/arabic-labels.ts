// Arabic labels shown beside the English ones on bilingual (UAE) documents.

const fieldLabels: Record<string, string> = {
  billTo: "فاتورة إلى", shipTo: "الشحن إلى",
  number: "رقم الفاتورة", date: "التاريخ", dueDate: "تاريخ الاستحقاق", terms: "شروط الدفع",
  salesman: "مندوب المبيعات", trn: "الرقم الضريبي", reference: "المرجع", source: "المستند المصدر", status: "الحالة",
  subtotal: "المجموع الفرعي", vat: "ضريبة القيمة المضافة", total: "الإجمالي", paid: "المدفوع", balance: "الرصيد المستحق",
};

const titles: Record<string, string> = {
  "tax invoice": "فاتورة ضريبية", "invoice": "فاتورة", "commercial invoice": "فاتورة تجارية",
  "quotation": "عرض سعر", "estimate": "تقدير سعر", "proforma invoice": "فاتورة مبدئية", "sales order": "أمر بيع",
  "sales receipt": "إيصال مبيعات", "credit note": "إشعار دائن", "refund": "إيصال استرداد", "delivery note": "إشعار تسليم",
  "packing list": "قائمة التعبئة", "purchase order": "أمر شراء", "bill": "فاتورة مورد", "purchase return": "مرتجع مشتريات",
  "statement of account": "كشف حساب",
};

/** Arabic for a document field, party box or total row key; empty when there is no translation. */
export const arabicLabel = (key: string) => fieldLabels[key] ?? "";

/** Arabic for a document title such as "Tax Invoice"; empty when the title is custom. */
export const arabicTitle = (title: string) => titles[title.trim().toLocaleLowerCase("en")] ?? "";
