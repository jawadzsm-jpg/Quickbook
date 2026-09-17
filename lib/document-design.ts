export type DesignField = { key: string; label: string; screen: boolean; print: boolean; width: number };
export const templateDocumentTypes = ['Invoice','Credit Note','Refund','Sales Receipt','Purchase Order','Statement','Estimate','Sales Order','Delivery Note','Packing List','Proforma Invoice'] as const;
export type TemplateDocumentType = typeof templateDocumentTypes[number];
export type DocumentDesign = { properties: Record<string, ElementProperties>; savedTemplates: SavedTemplate[]; enabled: boolean; name: string; title: string; font: 'Arial' | 'Georgia' | 'Verdana'; fontSize: number; titleSize: number; companySize: number; color: string; leftLogo: boolean; rightLogo: boolean; logoWidth: number; logoHeight: number; showCompany: boolean; showAddress: boolean; showPhone: boolean; showEmail: boolean; statusStamp: boolean; pastDueStamp: boolean; headers: DesignField[]; columns: DesignField[]; footer: DesignField[]; message: string; disclaimer: string; printerMode: 'default' | 'specified'; copies: number; paper: 'A4' | 'A3' | 'Letter' | 'Legal' | 'Tabloid' | 'Custom'; customPaperWidth: number; customPaperHeight: number; orientation: 'portrait' | 'landscape'; margin: number; printPageNumbers: boolean; printTrailingZeros: boolean; decimals: number };
const field = (key: string, label: string, width = 1, visible = true): DesignField => ({ key, label, width, screen: visible, print: visible });
export const defaultDocumentDesign: DocumentDesign = {
 properties: {}, savedTemplates: [], enabled: false, name: 'Company invoice', title: 'Tax Invoice', font: 'Arial', fontSize: 11, titleSize: 26, companySize: 21, color: '#164e63', leftLogo: true, rightLogo: true, logoWidth: 150, logoHeight: 70, showCompany: true, showAddress: true, showPhone: true, showEmail: true, statusStamp: true, pastDueStamp: false,
 headers: [field('number','Invoice #'),field('date','Date'),field('billTo','Bill To'),field('shipTo','Ship To'),field('terms','Terms'),field('dueDate','Due Date'),field('salesman','Sales Rep'),field('trn','TRN'),field('source','Source Document',1,false)],
 columns: [field('sku','Item',12),field('description','Description',38),field('quantity','Qty',7),field('unitPrice','Rate',10),field('serialNumber','Serial Number',18),field('subtotal','Subtotal',10),field('vatAmount','VAT',8),field('total','Amount',10),field('comments','Comments',20,false)],
 footer: [field('subtotal','Subtotal'),field('vatAmount','VAT'),field('total','Total'),field('balance','Balance Due'),field('message','Customer Message'),field('disclaimer','Terms & Conditions')],
 message: '', disclaimer: '', printerMode: 'specified', copies: 1, paper: 'A4', customPaperWidth: 210, customPaperHeight: 297, orientation: 'portrait', margin: 10, printPageNumbers: false, printTrailingZeros: true, decimals: 2,
};
export function readDocumentDesign(value?: string): DocumentDesign {
 try { return validateDocumentDesign(value || ''); } catch { return structuredClone(defaultDocumentDesign); }
}
export function resolveDocumentDesign(value: string | undefined, type?: TemplateDocumentType) {
 const root = readDocumentDesign(value);
 const savedTemplate = type ? [...root.savedTemplates].reverse().find((template) => template.type === type && template.active !== false) ?? null : null;
 if (savedTemplate) {
  return { design: { ...structuredClone(savedTemplate.design), savedTemplates: root.savedTemplates } as DocumentDesign, savedTemplate };
 }
 return { design: root.enabled ? root : structuredClone(defaultDocumentDesign), savedTemplate: null as SavedTemplate | null };
}
export function validateDocumentDesign(value: string): DocumentDesign {
 if (!value) return structuredClone(defaultDocumentDesign);
 if (value.length > 1000000) throw new Error('Template settings are too large.');
 const input = JSON.parse(value);
 if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid template settings.');
 const result = structuredClone(defaultDocumentDesign);
 for (const key of Object.keys(result) as (keyof DocumentDesign)[]) {
  if (input[key] === undefined) continue;
  if (key === 'properties') { result.properties = validateProperties(input[key]); continue; }
  if (key === 'savedTemplates') {
   if (!Array.isArray(input[key]) || input[key].length > 20) throw new Error('Keep at most 20 saved templates.');
   const ids = new Set<string>();
   result.savedTemplates = input[key].map((entry: SavedTemplate) => {
    if (!entry || typeof entry.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(entry.id) || ids.has(entry.id) || !entry.design || typeof entry.design !== 'object' || 'savedTemplates' in entry.design) throw new Error('Invalid saved template.');
    ids.add(entry.id);
    if (entry.type !== undefined && !templateDocumentTypes.includes(entry.type as TemplateDocumentType)) throw new Error('Invalid saved template metadata.');
    if (entry.active !== undefined && typeof entry.active !== 'boolean') throw new Error('Invalid saved template metadata.');
    const validated = validateDocumentDesign(JSON.stringify(entry.design));
    const { savedTemplates: omitted, ...snapshot } = validated;
    void omitted;
    return {
     id: entry.id,
     ...(entry.type === undefined ? {} : { type: entry.type as TemplateDocumentType }),
     ...(entry.active === undefined ? {} : { active: entry.active }),
     design: snapshot,
    };
   });
   continue;
  }
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
 if (!['Arial','Georgia','Verdana'].includes(result.font) || !['default','specified'].includes(result.printerMode) || !['A4','A3','Letter','Legal','Tabloid','Custom'].includes(result.paper) || !['portrait','landscape'].includes(result.orientation) || !/^#[0-9a-f]{6}$/i.test(result.color)) throw new Error('Choose valid font, color and paper settings.');
 for (const [key,min,max] of [['fontSize',8,18],['titleSize',14,40],['companySize',12,36],['logoWidth',40,240],['logoHeight',30,150],['copies',1,99],['customPaperWidth',50,500],['customPaperHeight',50,500],['margin',5,25],['decimals',0,4]] as const) if (!Number.isInteger(result[key]) || result[key]<min || result[key]>max) throw new Error(`Invalid ${key}.`);
 if (result.name.length>80 || result.title.length>80 || !result.name.trim() || !result.title.trim() || result.message.length>5000 || result.disclaimer.length>15000) throw new Error('Check the template name, title and footer text lengths.');
 if (!result.columns.some(c=>c.screen) || !result.columns.some(c=>c.print)) throw new Error('Select at least one column for screen and print.');
 return result;
}

export type SavedTemplate = { id: string; type?: TemplateDocumentType; active?: boolean; design: Omit<DocumentDesign, 'savedTemplates'> };
export type ElementProperties = {
 align: 'left' | 'center' | 'right'; vertical: 'top' | 'middle' | 'bottom';
 font: 'Arial' | 'Georgia' | 'Verdana'; size: number; bold: boolean; italic: boolean; underline: boolean; color: string;
 top: boolean; right: boolean; bottom: boolean; left: boolean;
 pattern: 'solid' | 'dotted' | 'dashed' | 'double'; thickness: number; radius: number; borderColor: string;
 fill: boolean; background: string; minHeight: number;
 offsetX: number; offsetY: number; boxWidth: number; boxHeight: number;
};
export const defaultElementProperties: ElementProperties = {
 align:'left', vertical:'top', font:'Arial', size:11, bold:false, italic:false, underline:false, color:'#111111',
 top:false, right:false, bottom:false, left:false, pattern:'solid', thickness:1, radius:0, borderColor:'#bbbbbb',
 fill:false, background:'#ffffff', minHeight:0,
 offsetX:0, offsetY:0, boxWidth:0, boxHeight:0,
};
export function propertyTargets(design: DocumentDesign) {
 return [
  {key:'leftLogo',label:'Left logo'}, {key:'company',label:'Company name'}, {key:'title',label:'Invoice title'}, {key:'rightLogo',label:'Right logo'},
  {key:'status',label:'Document status'}, {key:'itemsTable',label:'Items table'}, {key:'footerText',label:'Footer text block'}, {key:'totals',label:'Totals block'},
  ...(['headers','columns','footer'] as const).flatMap(group=>design[group].map(f=>({key:`${group}.${f.key}`,label:`${group === 'headers' ? 'Header' : group === 'columns' ? 'Column' : 'Footer'}: ${f.label}`})))
 ];
}
function validateProperties(value: unknown): Record<string, ElementProperties> {
 if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid element properties.');
 const result: Record<string, ElementProperties> = {};
 const allowed = new Set(propertyTargets(defaultDocumentDesign).map(t=>t.key));
 for (const [key, raw] of Object.entries(value)) {
  if (!allowed.has(key) || !raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid property target.');
  const p = {...defaultElementProperties};
  for (const field of Object.keys(p) as (keyof ElementProperties)[]) {
   if (raw[field] === undefined) continue;
   if (typeof raw[field] !== typeof p[field]) throw new Error('Invalid element setting.');
   Object.assign(p,{[field]:raw[field]});
  }
  if (!['left','center','right'].includes(p.align) || !['top','middle','bottom'].includes(p.vertical) || !['Arial','Georgia','Verdana'].includes(p.font) || !['solid','dotted','dashed','double'].includes(p.pattern)) throw new Error('Invalid element formatting.');
  for (const color of [p.color,p.borderColor,p.background]) if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Invalid element color.');
  if (!Number.isInteger(p.size) || p.size<8 || p.size>40 || ![0.5,1,2,3].includes(p.thickness) || ![0,12,24,48].includes(p.radius) || !Number.isInteger(p.minHeight) || p.minHeight<0 || p.minHeight>300) throw new Error('Invalid element dimensions.');
  if (!Number.isInteger(p.offsetX) || p.offsetX < -1200 || p.offsetX > 1200 || !Number.isInteger(p.offsetY) || p.offsetY < -1600 || p.offsetY > 1600 || !Number.isInteger(p.boxWidth) || p.boxWidth < 0 || p.boxWidth > 1200 || !Number.isInteger(p.boxHeight) || p.boxHeight < 0 || p.boxHeight > 800) throw new Error('Invalid element position.');
  result[key]=p;
 }
 return result;
}