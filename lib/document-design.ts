export type DesignField = { key: string; label: string; screen: boolean; print: boolean; width: number };
export type DocumentDesign = { enabled: boolean; name: string; title: string; font: 'Arial' | 'Georgia' | 'Verdana'; fontSize: number; titleSize: number; companySize: number; color: string; leftLogo: boolean; rightLogo: boolean; logoWidth: number; logoHeight: number; showCompany: boolean; showAddress: boolean; showPhone: boolean; showEmail: boolean; statusStamp: boolean; headers: DesignField[]; columns: DesignField[]; footer: DesignField[]; message: string; disclaimer: string; paper: 'A4' | 'Letter'; orientation: 'portrait' | 'landscape'; margin: number; decimals: number };
const field = (key: string, label: string, width = 1, visible = true): DesignField => ({ key, label, width, screen: visible, print: visible });
export const defaultDocumentDesign: DocumentDesign = {
 enabled: false, name: 'Company invoice', title: 'Tax Invoice', font: 'Arial', fontSize: 11, titleSize: 26, companySize: 21, color: '#164e63', leftLogo: true, rightLogo: true, logoWidth: 150, logoHeight: 70, showCompany: true, showAddress: true, showPhone: true, showEmail: true, statusStamp: true,
 headers: [field('number','Invoice #'),field('date','Date'),field('billTo','Bill To'),field('shipTo','Ship To'),field('terms','Terms'),field('dueDate','Due Date'),field('salesman','Sales Rep'),field('trn','TRN'),field('source','Source Document',1,false)],
 columns: [field('sku','Item',12),field('description','Description',38),field('quantity','Qty',7),field('unitPrice','Rate',10),field('serialNumber','Serial Number',18),field('subtotal','Subtotal',10),field('vatAmount','VAT',8),field('total','Amount',10),field('comments','Comments',20,false)],
 footer: [field('subtotal','Subtotal'),field('vatAmount','VAT'),field('total','Total'),field('balance','Balance Due'),field('message','Customer Message'),field('disclaimer','Terms & Conditions')],
 message: '', disclaimer: '', paper: 'A4', orientation: 'portrait', margin: 10, decimals: 2,
};
export function readDocumentDesign(value?: string): DocumentDesign {
 try { return validateDocumentDesign(value || ''); } catch { return structuredClone(defaultDocumentDesign); }
}
export function validateDocumentDesign(value: string): DocumentDesign {
 if (!value) return structuredClone(defaultDocumentDesign);
 if (value.length > 50000) throw new Error('Template settings are too large.');
 const input = JSON.parse(value);
 if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid template settings.');
 const result = structuredClone(defaultDocumentDesign);
 for (const key of Object.keys(result) as (keyof DocumentDesign)[]) {
  if (input[key] === undefined) continue;
  const original = result[key];
  if (Array.isArray(original)) {
   const rows = input[key];
   if (!Array.isArray(rows) || rows.length !== original.length || new Set(rows.map(r=>r?.key)).size !== original.length) throw new Error('Keep each template field exactly once.');
   input[key] = rows.map(row => {
    if (!original.some(f=>f.key===row?.key) || typeof row.label !== 'string' || row.label.length > 80 || !row.label.trim() || typeof row.screen !== 'boolean' || typeof row.print !== 'boolean' || !Number.isFinite(row.width) || row.width < 1 || row.width > 100) throw new Error('Invalid template field.');
    return {key:row.key,label:row.label,screen:row.screen,print:row.print,width:row.width};
   });
  } else if (typeof input[key] !== typeof original) throw new Error('Invalid template setting.');
  Object.assign(result, {[key]:input[key]});
 }
 if (!['Arial','Georgia','Verdana'].includes(result.font) || !['A4','Letter'].includes(result.paper) || !['portrait','landscape'].includes(result.orientation) || !/^#[0-9a-f]{6}$/i.test(result.color)) throw new Error('Choose valid font, color and paper settings.');
 for (const [key,min,max] of [['fontSize',8,18],['titleSize',14,40],['companySize',12,36],['logoWidth',40,240],['logoHeight',30,150],['margin',5,25],['decimals',0,4]] as const) if (!Number.isInteger(result[key]) || result[key]<min || result[key]>max) throw new Error(`Invalid ${key}.`);
 if (result.name.length>80 || result.title.length>80 || !result.name.trim() || !result.title.trim() || result.message.length>5000 || result.disclaimer.length>15000) throw new Error('Check the template name, title and footer text lengths.');
 if (!result.columns.some(c=>c.screen) || !result.columns.some(c=>c.print)) throw new Error('Select at least one column for screen and print.');
 return result;
}
