import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import Image from 'next/image';
import { PaidInvoiceStamp } from './paid-invoice-stamp';
import { defaultElementProperties, type DocumentDesign } from '@/lib/document-design';
type Data = Record<string, string | number | boolean>;
const templateToday = new Date().toISOString().slice(0,10);
export type TemplateBranding = {name:string;logoData:string;rightLogoData?:string;phone:string;email?:string;trn:string;addressLine1:string;addressLine2:string;city:string;country:string};
export function CustomInvoiceTemplate({design,record,lines,setup,contact,target='screen',editable=false,selectedElement,onSelectElement,onOpenElementProperties,onMoveElement,onResizeElement,onMoveCustomBox,onResizeCustomBox}:{design:DocumentDesign;record:Data;lines:Data[];setup:TemplateBranding;contact?:Data|null;target?:'screen'|'print';editable?:boolean;selectedElement?:string;onSelectElement?:(key:string)=>void;onOpenElementProperties?:(key:string)=>void;onMoveElement?:(key:string,x:number,y:number)=>void;onResizeElement?:(key:string,width:number,height:number,x?:number,y?:number)=>void;onMoveCustomBox?:(id:string,left:number,down:number)=>void;onResizeCustomBox?:(id:string,width:number,height:number,left?:number,down?:number)=>void}) {
 const movable=(key:string)=>Boolean(key);
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
  onSelectElement?.(key);
  const node=event.currentTarget;
  const rect=node.getBoundingClientRect();
  const resizeHandle=18;
  const resizeRight=event.clientX>=rect.right-resizeHandle;
  const resizeBottom=event.clientY>=rect.bottom-resizeHandle;
  const resizing=Boolean(onResizeElement)&&resizeRight&&resizeBottom;
  if(!resizing&&!onMoveElement)return;
  event.preventDefault();
  event.stopPropagation();
  const base=design.properties?.[key]||defaultElementProperties;
  const startX=event.clientX;
  const startY=event.clientY;
  const startWidth=base.boxWidth||Math.round(rect.width);
  const startHeight=base.boxHeight||Math.round(rect.height);
  const move=(next:PointerEvent)=>{
   const dx=Math.round(next.clientX-startX);
   const dy=Math.round(next.clientY-startY);
   if(resizing){
    const width=Math.max(40,Math.min(1200,startWidth+dx));
    const height=Math.max(20,Math.min(800,startHeight+dy));
    onResizeElement?.(key,width,height,base.offsetX,base.offsetY);
    return;
   }
   const canvas=node.closest('.custom-invoice')?.getBoundingClientRect();
   const minDx=canvas?Math.ceil(canvas.left-rect.left):-1200;
   const maxDx=canvas?Math.floor(canvas.right-rect.right):1200;
   const minDy=canvas?Math.ceil(canvas.top-rect.top):-1600;
   const maxDy=canvas?Math.floor(canvas.bottom-rect.bottom):1600;
   const safeDx=Math.max(minDx,Math.min(maxDx,dx));
   const safeDy=Math.max(minDy,Math.min(maxDy,dy));
   onMoveElement?.(key,Math.max(-1200,Math.min(1200,Math.round(base.offsetX+safeDx))),Math.max(-1600,Math.min(1600,Math.round(base.offsetY+safeDy))));
  };
  const stop=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',stop);window.removeEventListener('pointercancel',stop);};
  window.addEventListener('pointermove',move);
  window.addEventListener('pointerup',stop,{once:true});
  window.addEventListener('pointercancel',stop,{once:true});
 };
 const startCustomBoxInteraction=(box:DocumentDesign['customBoxes'][number],event:ReactPointerEvent<HTMLDivElement>)=>{
  if(!editable||event.button!==0)return;
  const key=`customBoxes.${box.id}`;
  onSelectElement?.(key);
  const node=event.currentTarget;
  const rect=node.getBoundingClientRect();
  const canvas=node.closest('.custom-invoice')?.getBoundingClientRect();
  const scaleX=Math.max(0.2,(canvas?.width||760)/760);
  const resizeHandle=18;
  const resizeRight=event.clientX>=rect.right-resizeHandle;
  const resizeBottom=event.clientY>=rect.bottom-resizeHandle;
  const resizing=Boolean(onResizeCustomBox)&&resizeRight&&resizeBottom;
  if(!resizing&&!onMoveCustomBox)return;
  event.preventDefault();
  event.stopPropagation();
  const startX=event.clientX;
  const startY=event.clientY;
  const move=(next:PointerEvent)=>{
   const dx=Math.round((next.clientX-startX)/scaleX);
   const dy=Math.round(next.clientY-startY);
   if(resizing){
    const left=box.left;
    const down=box.down;
    const width=Math.max(40,Math.min(760-left,box.width+dx));
    const height=Math.max(20,Math.min(800,box.height+dy));
    onResizeCustomBox?.(box.id,width,height,left,down);
    return;
   }
   const left=Math.max(0,Math.min(720,Math.round(box.left+dx)));
   const down=Math.max(0,Math.min(1050,Math.round(box.down+dy)));
   onMoveCustomBox?.(box.id,left,down);
  };
  const stop=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',stop);window.removeEventListener('pointercancel',stop);};
  window.addEventListener('pointermove',move);
  window.addEventListener('pointerup',stop,{once:true});
  window.addEventListener('pointercancel',stop,{once:true});
 };
 const editableClass=(key:string,base='')=>`${base}${editable&&movable(key)?`${base?' ':''}ci-editable`:''}${editable&&selectedElement===key?' ci-selected':''}`;
 const openProperties=(key:string,event:{preventDefault:()=>void;stopPropagation:()=>void})=>{if(!editable)return;event.preventDefault();event.stopPropagation();onSelectElement?.(key);onOpenElementProperties?.(key);};
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
  <style>{`.custom-invoice{line-height:1.45;print-color-adjust:exact;-webkit-print-color-adjust:exact}.custom-invoice *{box-sizing:border-box}.custom-invoice table{width:100%;border-collapse:collapse;table-layout:fixed}.custom-invoice td,.custom-invoice th{border:1px solid #bbb;padding:7px;vertical-align:top;overflow-wrap:anywhere;white-space:pre-wrap}.custom-invoice th{background:#f3f4f6;text-align:left}.custom-invoice p{margin:3px 0;white-space:pre-wrap;overflow-wrap:anywhere}.custom-invoice .ci-head{display:grid;grid-template-columns:1fr 2fr 1fr;gap:12px;align-items:start}.custom-invoice .ci-meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:24px 0}.custom-invoice .ci-bottom{display:grid;grid-template-columns:3fr 2fr;gap:24px;margin-top:20px}.custom-invoice .ci-total{display:flex;justify-content:space-between;border-bottom:1px solid #ccc;padding:8px 0;gap:15px}.custom-invoice .ci-stamps{display:flex;justify-content:flex-end;align-items:flex-start;gap:12px;margin-top:6px}.custom-invoice .ci-past-due{display:inline-block;border:3px double #b91c1c;border-radius:4px;color:#b91c1c;font:700 18px Arial,sans-serif;letter-spacing:1.5px;padding:4px 10px;transform:rotate(-4deg)}.custom-invoice .ci-editable{outline:1px dashed #94a3b8;outline-offset:2px}.custom-invoice .ci-editable:hover{outline:2px solid #2563eb}.custom-invoice .ci-selected{outline:2px solid #2563eb!important;box-shadow:0 0 0 1px #fff,0 0 0 2px #2563eb}.custom-invoice .ci-editable::after{content:'';position:absolute;right:-6px;bottom:-6px;width:12px;height:12px;border:2px solid #fff;border-radius:2px;background:#2563eb;box-shadow:0 0 0 1px #2563eb;cursor:nwse-resize;z-index:20}@media print{.custom-invoice{padding:0!important}.custom-invoice thead{display:table-header-group}.custom-invoice tr{break-inside:avoid-page}.ci-head,.ci-meta,.ci-total,.ci-stamps,.ci-bottom{break-inside:avoid-page}.custom-invoice .ci-editable{outline:none!important}.custom-invoice .ci-editable::after{display:none!important}}`}</style>
  <div className="ci-head"><div className={editableClass('leftLogo')} style={properties('leftLogo')} onPointerDown={e=>startInteraction('leftLogo',e)} onDoubleClick={e=>openProperties('leftLogo',e)} onContextMenu={e=>openProperties('leftLogo',e)}>{design.leftLogo&&setup.logoData&&<Image src={setup.logoData} alt="Left company logo" width={design.logoWidth} height={design.logoHeight} unoptimized style={{width:design.logoWidth,maxWidth:'100%',height:design.logoHeight,objectFit:'contain'}}/>}</div><div style={{textAlign:'center'}}>{(design.showCompany||printTarget)&&setup.name&&<p className={editableClass('company')} onPointerDown={e=>startInteraction('company',e)} onDoubleClick={e=>openProperties('company',e)} onContextMenu={e=>openProperties('company',e)} style={{fontSize:design.companySize,fontWeight:700,color:design.color,...properties('company')}}>{setup.name}</p>}{(design.showAddress||printTarget)&&companyAddress&&<p>{companyAddress}</p>}{(design.showPhone||printTarget)&&setup.phone&&<p>{setup.phone}</p>}{(design.showEmail||printTarget)&&setup.email&&<p>{setup.email}</p>}{printTarget&&setup.trn&&!headers.some(f=>f.key==='trn')&&<p>TRN: {setup.trn}</p>}<h2 className={editableClass('title')} onPointerDown={e=>startInteraction('title',e)} onDoubleClick={e=>openProperties('title',e)} onContextMenu={e=>openProperties('title',e)} style={{fontSize:design.titleSize,color:design.color,margin:'12px 0',...properties('title')}}>{design.title}</h2></div><div className={editableClass('rightLogo')} style={{textAlign:'right',...properties('rightLogo')}} onPointerDown={e=>startInteraction('rightLogo',e)} onDoubleClick={e=>openProperties('rightLogo',e)} onContextMenu={e=>openProperties('rightLogo',e)}>{design.rightLogo&&setup.rightLogoData&&<Image src={setup.rightLogoData} alt="Right company logo" width={design.logoWidth} height={design.logoHeight} unoptimized style={{width:design.logoWidth,maxWidth:'100%',height:design.logoHeight,objectFit:'contain'}}/>}</div></div>
  {(showPastDue||design.statusStamp)&&<div className="ci-stamps">{showPastDue&&<span className="ci-past-due">PAST DUE</span>}{design.statusStamp&&<div className={editableClass('status')} style={properties('status')} onPointerDown={e=>startInteraction('status',e)} onDoubleClick={e=>openProperties('status',e)} onContextMenu={e=>openProperties('status',e)}>{record.status === 'paid' ? <PaidInvoiceStamp status="paid" paidAt={record.paidAt ? String(record.paidAt) : null} /> : <p style={{textAlign:'right',fontWeight:700,textTransform:'uppercase'}}>{String(record.status||'')}</p>}</div>}</div>}
  <div className="ci-meta">{headers.map(f=><div key={f.key} className={editableClass(`headers.${f.key}`)} onPointerDown={e=>startInteraction(`headers.${f.key}`,e)} onDoubleClick={e=>openProperties(`headers.${f.key}`,e)} onContextMenu={e=>openProperties(`headers.${f.key}`,e)} style={properties(`headers.${f.key}`)}>{f.key.startsWith('custom-header-')?<p>{f.label}</p>:<><strong>{f.label}</strong><p>{String(values[f.key]||'—')}</p></>}</div>)}</div>
  <table className={editableClass('itemsTable')} onPointerDown={e=>startInteraction('itemsTable',e)} onDoubleClick={e=>openProperties('itemsTable',e)} onContextMenu={e=>openProperties('itemsTable',e)} style={{...(Object.values(design.properties||{}).some(p=>p.radius>0)?{borderCollapse:'separate',borderSpacing:0}:{}),...properties('itemsTable')}}><colgroup>{columns.map(c=>{const boxWidth=design.properties?.[`columns.${c.key}`]?.boxWidth;return <col key={c.key} style={{width:boxWidth?boxWidth:`${c.width/columns.reduce((s,c)=>s+c.width,0)*100}%`}}/>})}</colgroup><thead><tr>{columns.map(c=><th key={c.key} className={editableClass(`columns.${c.key}`)} onPointerDown={e=>startInteraction(`columns.${c.key}`,e)} onDoubleClick={e=>openProperties(`columns.${c.key}`,e)} onContextMenu={e=>openProperties(`columns.${c.key}`,e)} style={properties(`columns.${c.key}`)}>{c.label}</th>)}</tr></thead><tbody>{lines.map((line,i)=><tr key={String(line.id||i)}>{columns.map(c=><td key={c.key} style={properties(`columns.${c.key}`)}>{['unitPrice','subtotal','vatAmount','total'].includes(c.key)?money(lineValue(line,c.key)):String(lineValue(line,c.key)??'')}</td>)}</tr>)}</tbody></table>
  <div className="ci-bottom"><div className={editableClass('footerText')} style={properties('footerText')} onPointerDown={e=>startInteraction('footerText',e)} onDoubleClick={e=>openProperties('footerText',e)} onContextMenu={e=>openProperties('footerText',e)}>{textFooter.map(f=><div key={f.key} className={editableClass(`footer.${f.key}`)} onPointerDown={e=>startInteraction(`footer.${f.key}`,e)} onDoubleClick={e=>openProperties(`footer.${f.key}`,e)} onContextMenu={e=>openProperties(`footer.${f.key}`,e)} style={properties(`footer.${f.key}`)}>{f.key.startsWith('custom-footer-')?<p>{f.label}</p>:<><strong>{f.label}</strong><p>{String(values[f.key]||'')}</p></>}</div>)}</div><div className={editableClass('totals')} style={properties('totals')} onPointerDown={e=>startInteraction('totals',e)} onDoubleClick={e=>openProperties('totals',e)} onContextMenu={e=>openProperties('totals',e)}>{footer.filter(f=>!['message','disclaimer'].includes(f.key)&&!f.key.startsWith('custom-footer-')).map(f=><div key={f.key} className={editableClass(`footer.${f.key}`,'ci-total')} onPointerDown={e=>startInteraction(`footer.${f.key}`,e)} onDoubleClick={e=>openProperties(`footer.${f.key}`,e)} onContextMenu={e=>openProperties(`footer.${f.key}`,e)} style={properties(`footer.${f.key}`)}><strong>{f.label} ({String(record.currency||'AED')})</strong><span>{money(values[f.key])}</span></div>)}</div></div>
  {design.customBoxes.filter(box=>box[target]).map(box=>{const key=`customBoxes.${box.id}`;return <div key={box.id} className={editableClass(key,'ci-custom-box')} onPointerDown={e=>startCustomBoxInteraction(box,e)} onDoubleClick={e=>openProperties(key,e)} onContextMenu={e=>openProperties(key,e)} style={{...properties(key),position:'absolute',left:`${box.left/7.6}%`,top:box.down,width:`${box.width/7.6}%`,height:box.height,maxWidth:`${Math.max(0,(760-box.left)/7.6)}%`,padding:6,overflow:'hidden',whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontSize:design.properties?.[key]?.size||box.fontSize,fontWeight:design.properties?.[key]?.bold?700:box.bold?700:400,border:design.properties?.[key]?(undefined):box.border?'1px solid #94a3b8':'none',background:design.properties?.[key]?.fill?design.properties[key].background:'#fff',zIndex:5,cursor:editable?'move':undefined,touchAction:editable?'none':undefined,transform:'none'}}>{box.text}</div>})}
 </article>;
}