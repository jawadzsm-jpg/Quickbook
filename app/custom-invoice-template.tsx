import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import Image from 'next/image';
import { PaidInvoiceStamp } from './paid-invoice-stamp';
import { defaultElementProperties, type DocumentDesign } from '@/lib/document-design';
type Data = Record<string, string | number | boolean>;
const templateToday = new Date().toISOString().slice(0,10);
export type TemplateBranding = {name:string;logoData:string;rightLogoData?:string;phone:string;email?:string;trn:string;addressLine1:string;addressLine2:string;city:string;country:string};
export function CustomInvoiceTemplate({design,record,lines,setup,contact,target='screen',editable=false,onMoveElement,onResizeElement,onMoveCustomBox,onResizeCustomBox}:{design:DocumentDesign;record:Data;lines:Data[];setup:TemplateBranding;contact?:Data|null;target?:'screen'|'print';editable?:boolean;onMoveElement?:(key:string,x:number,y:number)=>void;onResizeElement?:(key:string,width:number,height:number)=>void;onMoveCustomBox?:(id:string,left:number,down:number)=>void;onResizeCustomBox?:(id:string,width:number,height:number)=>void}) {
 const movable=()=>true;
 const properties=(key:string):CSSProperties=>{
  const p=design.properties?.[key];
  if(!p)return editable&&movable(key)?{cursor:'move',touchAction:'none',position:'relative',zIndex:1}:{};
  if(p.hidden)return {display:'none'};
  const border=`${p.thickness}pt ${p.pattern} ${p.borderColor}`;
  const printSafe=target==='print';
  return {textAlign:p.align,verticalAlign:p.vertical,alignContent:p.vertical==='middle'?'center':p.vertical==='bottom'?'end':'start',fontFamily:p.font,fontSize:p.size,fontWeight:p.bold?700:400,fontStyle:p.italic?'italic':'normal',textDecoration:p.underline?'underline':'none',color:p.color,borderTop:p.top?border:'none',borderRight:p.right?border:'none',borderBottom:p.bottom?border:'none',borderLeft:p.left?border:'none',borderRadius:p.radius,backgroundColor:p.fill?p.background:'transparent',minHeight:printSafe?undefined:p.minHeight||undefined,height:printSafe?undefined:p.boxHeight||((key.startsWith('columns.'))?p.minHeight||undefined:undefined),width:printSafe?undefined:p.boxWidth||undefined,padding:7,transform:printSafe?undefined:(p.offsetX||p.offsetY)?`translate(${p.offsetX}px, ${p.offsetY}px)`:undefined,cursor:editable&&movable(key)?'move':undefined,touchAction:editable&&movable(key)?'none':undefined,position:editable&&movable(key)?'relative':undefined,zIndex:editable&&movable(key)?1:undefined};
 };
 const startInteraction=(key:string,event:ReactPointerEvent<HTMLElement>)=>{
  if(!editable||!movable(key)||event.button!==0)return;
  const node=event.currentTarget;
  const rect=node.getBoundingClientRect();
  const resizeHandle=18;
  const resizing=Boolean(onResizeElement)&&event.clientX>=rect.right-resizeHandle&&event.clientY>=rect.bottom-resizeHandle;
  if(!resizing&&!onMoveElement)return;
  event.preventDefault();
  event.stopPropagation();
  const base=design.properties?.[key]||defaultElementProperties;
  const startX=event.clientX;
  const startY=event.clientY;
  const startWidth=base.boxWidth||Math.round(rect.width);
  const startHeight=base.boxHeight||Math.round(rect.height);
  const move=(next:PointerEvent)=>{
   if(resizing){
    onResizeElement?.(key,Math.max(40,Math.min(1200,Math.round(startWidth+next.clientX-startX))),Math.max(20,Math.min(800,Math.round(startHeight+next.clientY-startY))));
    return;
   }
   onMoveElement?.(key,Math.max(-1200,Math.min(1200,Math.round(base.offsetX+next.clientX-startX))),Math.max(-1600,Math.min(1600,Math.round(base.offsetY+next.clientY-startY))));
  };
  const stop=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',stop);window.removeEventListener('pointercancel',stop);};
  window.addEventListener('pointermove',move);
  window.addEventListener('pointerup',stop,{once:true});
  window.addEventListener('pointercancel',stop,{once:true});
 };
 const startCustomBoxInteraction=(box:DocumentDesign['customBoxes'][number],event:ReactPointerEvent<HTMLDivElement>)=>{
  if(!editable||event.button!==0)return;
  const node=event.currentTarget;
  const rect=node.getBoundingClientRect();
  const canvas=node.closest('.custom-invoice')?.getBoundingClientRect();
  const scaleX=Math.max(0.2,(canvas?.width||760)/760);
  const resizeHandle=18;
  const resizing=Boolean(onResizeCustomBox)&&event.clientX>=rect.right-resizeHandle&&event.clientY>=rect.bottom-resizeHandle;
  if(!resizing&&!onMoveCustomBox)return;
  event.preventDefault();
  event.stopPropagation();
  const startX=event.clientX;
  const startY=event.clientY;
  const move=(next:PointerEvent)=>{
   if(resizing){
    const width=Math.max(40,Math.min(760-box.left,Math.round(box.width+(next.clientX-startX)/scaleX)));
    const height=Math.max(20,Math.min(800,Math.round(box.height+next.clientY-startY)));
    onResizeCustomBox?.(box.id,width,height);
    return;
   }
   const left=Math.max(0,Math.min(720,Math.round(box.left+(next.clientX-startX)/scaleX)));
   const down=Math.max(0,Math.min(1050,Math.round(box.down+next.clientY-startY)));
   onMoveCustomBox?.(box.id,left,down);
  };
  const stop=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',stop);window.removeEventListener('pointercancel',stop);};
  window.addEventListener('pointermove',move);
  window.addEventListener('pointerup',stop,{once:true});
  window.addEventListener('pointercancel',stop,{once:true});
 };
 const editableClass=(key:string,base='')=>`${base}${editable&&movable(key)?`${base?' ':''}ci-editable`:''}`;
 const printTarget=target==='print';
 const headers=design.headers.filter(f=>f[target]);
 const columns=design.columns.filter(f=>f[target]||(printTarget&&f.key==='description'));
 const footer=design.footer.filter(f=>f[target]);
 const money=(v:unknown)=>Number(v||0).toLocaleString('en-US',{minimumFractionDigits:design.printTrailingZeros?design.decimals:0,maximumFractionDigits:design.decimals});
 const values:Record<string,unknown>={number:record.number,date:record.transactionDate,billTo:contact?.billingName||contact?.company||record.party,shipTo:record.deliveryAddress||contact?.shippingAddress||contact?.country||'',terms:record.terms||contact?.paymentTerms||'',dueDate:record.dueDate,salesman:record.salesman,trn:setup.trn,source:record.sourceDocumentNumber||'',subtotal:record.subtotal,vatAmount:record.vatAmount,total:record.total,balance:record.balance??(record.status==='paid'?0:record.total),message:design.message,disclaimer:design.disclaimer};
 const textFooter=footer.filter(f=>['message','disclaimer'].includes(f.key)||f.key.startsWith('custom-footer-'));
 const dueDateText=String(record.dueDate||'').slice(0,10);
 const showPastDue=Boolean(design.pastDueStamp&&record.status!=='paid'&&/^\d{4}-\d{2}-\d{2}$/.test(dueDateText)&&dueDateText<templateToday);
 const companyAddress=[setup.addressLine1,setup.addressLine2,setup.city,setup.country].filter(Boolean).join(', ');
 const lineValue=(line:Data,key:string)=>key==='description'?(line.description||line.itemDescription||line.name||''):line[key];
 return <article className="custom-invoice" style={{fontFamily:design.font,fontSize:design.fontSize,color:'#111',background:'#fff',padding:20,position:'relative',minWidth:0,maxWidth:'100%'}}>
  <style>{`.custom-invoice{line-height:1.45;print-color-adjust:exact;-webkit-print-color-adjust:exact}.custom-invoice *{box-sizing:border-box}.custom-invoice table{width:100%;border-collapse:collapse;table-layout:fixed}.custom-invoice td,.custom-invoice th{border:1px solid #bbb;padding:7px;vertical-align:top;overflow-wrap:anywhere;white-space:pre-wrap}.custom-invoice th{background:#f3f4f6;text-align:left}.custom-invoice p{margin:3px 0;white-space:pre-wrap;overflow-wrap:anywhere}.custom-invoice .ci-head{display:grid;grid-template-columns:1fr 2fr 1fr;gap:12px;align-items:start}.custom-invoice .ci-meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:24px 0}.custom-invoice .ci-bottom{display:grid;grid-template-columns:3fr 2fr;gap:24px;margin-top:20px}.custom-invoice .ci-total{display:flex;justify-content:space-between;border-bottom:1px solid #ccc;padding:8px 0;gap:15px}.custom-invoice .ci-stamps{display:flex;justify-content:flex-end;align-items:flex-start;gap:12px;margin-top:6px}.custom-invoice .ci-past-due{display:inline-block;border:3px double #b91c1c;border-radius:4px;color:#b91c1c;font:700 18px Arial,sans-serif;letter-spacing:1.5px;padding:4px 10px;transform:rotate(-4deg)}.custom-invoice .ci-editable{outline:1px dashed #94a3b8;outline-offset:2px}.custom-invoice .ci-editable:hover{outline:2px solid #2563eb}.custom-invoice .ci-editable::after{content:'';position:absolute;right:-6px;bottom:-6px;width:12px;height:12px;border:2px solid #fff;border-radius:2px;background:#2563eb;box-shadow:0 0 0 1px #2563eb;cursor:nwse-resize;z-index:20}@media print{.custom-invoice{padding:0!important}.custom-invoice thead{display:table-header-group}.custom-invoice tr{break-inside:avoid-page}.ci-head,.ci-meta,.ci-total,.ci-stamps,.ci-bottom{break-inside:avoid-page}.custom-invoice .ci-editable{outline:none!important}.custom-invoice .ci-editable::after{display:none!important}}`}</style>
  <div className="ci-head"><div className={editableClass('leftLogo')} style={properties('leftLogo')} onPointerDown={e=>startInteraction('leftLogo',e)}>{design.leftLogo&&setup.logoData&&<Image src={setup.logoData} alt="Left company logo" width={design.logoWidth} height={design.logoHeight} unoptimized style={{width:design.logoWidth,maxWidth:'100%',height:design.logoHeight,objectFit:'contain'}}/>}</div><div style={{textAlign:'center'}}>{(design.showCompany||printTarget)&&setup.name&&<p className={editableClass('company')} onPointerDown={e=>startInteraction('company',e)} style={{fontSize:design.companySize,fontWeight:700,color:design.color,...properties('company')}}>{setup.name}</p>}{(design.showAddress||printTarget)&&companyAddress&&<p>{companyAddress}</p>}{(design.showPhone||printTarget)&&setup.phone&&<p>{setup.phone}</p>}{(design.showEmail||printTarget)&&setup.email&&<p>{setup.email}</p>}{printTarget&&setup.trn&&!headers.some(f=>f.key==='trn')&&<p>TRN: {setup.trn}</p>}<h2 className={editableClass('title')} onPointerDown={e=>startInteraction('title',e)} style={{fontSize:design.titleSize,color:design.color,margin:'12px 0',...properties('title')}}>{design.title}</h2></div><div className={editableClass('rightLogo')} style={{textAlign:'right',...properties('rightLogo')}} onPointerDown={e=>startInteraction('rightLogo',e)}>{design.rightLogo&&setup.rightLogoData&&<Image src={setup.rightLogoData} alt="Right company logo" width={design.logoWidth} height={design.logoHeight} unoptimized style={{width:design.logoWidth,maxWidth:'100%',height:design.logoHeight,objectFit:'contain'}}/>}</div></div>
  {(showPastDue||design.statusStamp)&&<div className="ci-stamps">{showPastDue&&<span className="ci-past-due">PAST DUE</span>}{design.statusStamp&&<div className={editableClass('status')} style={properties('status')} onPointerDown={e=>startInteraction('status',e)}>{record.status === 'paid' ? <PaidInvoiceStamp status="paid" paidAt={record.paidAt ? String(record.paidAt) : null} /> : <p style={{textAlign:'right',fontWeight:700,textTransform:'uppercase'}}>{String(record.status||'')}</p>}</div>}</div>}
  <div className="ci-meta">{headers.map(f=><div key={f.key} className={editableClass(`headers.${f.key}`)} onPointerDown={e=>startInteraction(`headers.${f.key}`,e)} style={properties(`headers.${f.key}`)}>{f.key.startsWith('custom-header-')?<p>{f.label}</p>:<><strong>{f.label}</strong><p>{String(values[f.key]||'—')}</p></>}</div>)}</div>
  <table className={editableClass('itemsTable')} onPointerDown={e=>startInteraction('itemsTable',e)} style={{...(Object.values(design.properties||{}).some(p=>p.radius>0)?{borderCollapse:'separate',borderSpacing:0}:{}),...properties('itemsTable')}}><colgroup>{columns.map(c=>{const boxWidth=design.properties?.[`columns.${c.key}`]?.boxWidth;return <col key={c.key} style={{width:boxWidth?boxWidth:`${c.width/columns.reduce((s,c)=>s+c.width,0)*100}%`}}/>})}</colgroup><thead><tr>{columns.map(c=><th key={c.key} className={editableClass(`columns.${c.key}`)} onPointerDown={e=>startInteraction(`columns.${c.key}`,e)} style={properties(`columns.${c.key}`)}>{c.label}</th>)}</tr></thead><tbody>{lines.map((line,i)=><tr key={String(line.id||i)}>{columns.map(c=><td key={c.key} style={properties(`columns.${c.key}`)}>{['unitPrice','subtotal','vatAmount','total'].includes(c.key)?money(lineValue(line,c.key)):String(lineValue(line,c.key)??'')}</td>)}</tr>)}</tbody></table>
  <div className="ci-bottom"><div className={editableClass('footerText')} style={properties('footerText')} onPointerDown={e=>startInteraction('footerText',e)}>{textFooter.map(f=><div key={f.key} className={editableClass(`footer.${f.key}`)} onPointerDown={e=>startInteraction(`footer.${f.key}`,e)} style={properties(`footer.${f.key}`)}>{f.key.startsWith('custom-footer-')?<p>{f.label}</p>:<><strong>{f.label}</strong><p>{String(values[f.key]||'')}</p></>}</div>)}</div><div className={editableClass('totals')} style={properties('totals')} onPointerDown={e=>startInteraction('totals',e)}>{footer.filter(f=>!['message','disclaimer'].includes(f.key)&&!f.key.startsWith('custom-footer-')).map(f=><div key={f.key} className={editableClass(`footer.${f.key}`,'ci-total')} onPointerDown={e=>startInteraction(`footer.${f.key}`,e)} style={properties(`footer.${f.key}`)}><strong>{f.label} ({String(record.currency||'AED')})</strong><span>{money(values[f.key])}</span></div>)}</div></div>
  {design.customBoxes.filter(box=>box[target]).map(box=><div key={box.id} className={editable?`ci-custom-box ci-editable`:'ci-custom-box'} onPointerDown={e=>startCustomBoxInteraction(box,e)} style={{position:'absolute',left:`${box.left/7.6}%`,top:box.down,width:`${box.width/7.6}%`,height:box.height,maxWidth:`${Math.max(0,(760-box.left)/7.6)}%`,padding:6,overflow:'hidden',whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontSize:box.fontSize,fontWeight:box.bold?700:400,border:box.border?'1px solid #94a3b8':'none',background:'#fff',zIndex:5,cursor:editable?'move':undefined,touchAction:editable?'none':undefined}}>{box.text}</div>)}
 </article>;
}