"use client";
import { createContext, useContext, type ReactNode } from 'react';
import { resolveDocumentDesign, type TemplateDocumentType } from '@/lib/document-design';
import type { TemplateBranding } from './custom-invoice-template';
import type { ReportExportData, ReportExportRow } from '@/lib/report-export';

type Company = TemplateBranding & {documentDesign?:string};
export type OutputOptions={type:TemplateDocumentType;title:string;orientation?:'portrait'|'landscape';record?:Record<string,string|number|boolean>;stamp?:{data:string;left:number;top:number}};
const CompanyDocumentContext=createContext<Company|null>(null);
export function CompanyDocumentProvider({company,children}:{company:Company;children:ReactNode}) {return <CompanyDocumentContext.Provider value={company}>{children}</CompanyDocumentContext.Provider>;}
export function useCompanyDocumentOutput() {
  const company=useContext(CompanyDocumentContext);
  const enabled=(type:TemplateDocumentType='Report')=>Boolean(company&&resolveDocumentDesign(company.documentDesign,type).design.enabled);
  async function pdf(element:HTMLElement,options:OutputOptions) {
    const {customizedDocumentPdf}=await import('@/lib/customized-document-output');
    if(!company)throw new Error('Select a company before printing.');
    return customizedDocumentPdf(element,company,options);
  }
  async function print(element:HTMLElement,options:OutputOptions) {
    const popup=window.open('','_blank');if(!popup)throw new Error('Allow pop-ups to open the A4 print preview.');popup.opener=null;popup.document.body.textContent='Preparing your saved template…';
    try {const blob=await pdf(element,options);const url=URL.createObjectURL(blob);popup.location.href=url;setTimeout(()=>URL.revokeObjectURL(url),300000);}catch(e){popup.close();throw e;}
  }
  async function reportPdf(report:ReportExportData,companyName:string,inventory:string,rows:ReportExportRow[]=report.rows,stamp?:OutputOptions['stamp'],orientation:'portrait'|'landscape'='portrait',templateType:TemplateDocumentType=report.key?.includes('statement')?'Statement':'Report') {
    const base=await import('@/lib/report-export');
    if(!enabled(templateType))return base.reportPdf(report,companyName,inventory,rows,stamp,orientation);
    const {reportDocumentElement}=await import('@/lib/customized-document-output');
    const element=reportDocumentElement(report,inventory,rows,base.reportOverview(report,rows),base.reportReviewIssues(report));
    const blob=await pdf(element,{type:templateType,title:report.title,orientation,record:{transactionDate:report.generatedAt.slice(0,10),currency:report.currency},stamp});
    return blob.arrayBuffer();
  }
  async function pdfHtml(output:{html:string;styles:string},options:OutputOptions) {
    const host=document.createElement('div');host.dataset.outputRender="true";host.style.cssText=`position:fixed;left:-20000px;top:0;width:${options.orientation==='landscape'?281:194}mm`;host.innerHTML=`<style>${output.styles}</style>${output.html}`;document.body.appendChild(host);
    try{return await pdf(host,options);}finally{host.remove();}
  }
  async function printHtml(output:{html:string;styles:string},options:OutputOptions) {
    const popup=window.open('','_blank');if(!popup)throw new Error('Allow pop-ups to print.');popup.opener=null;popup.document.body.textContent='Preparing your saved template…';
    try{const blob=await pdfHtml(output,options);const url=URL.createObjectURL(blob);popup.location.href=url;setTimeout(()=>URL.revokeObjectURL(url),300000);}catch(e){popup.close();throw e;}
  }
  async function printReport(...args:Parameters<typeof reportPdf>) {
    const popup=window.open('','_blank');if(!popup)throw new Error('Allow pop-ups to print.');popup.opener=null;popup.document.body.textContent='Preparing A4 print preview…';
    try{const data=await reportPdf(...args);const url=URL.createObjectURL(new Blob([data],{type:'application/pdf'}));popup.location.href=url;setTimeout(()=>URL.revokeObjectURL(url),300000);}catch(e){popup.close();throw e;}
  }
  return {enabled,pdf,print,reportPdf,printReport,pdfHtml,printHtml};
}
