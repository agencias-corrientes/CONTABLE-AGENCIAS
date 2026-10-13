import type { TicketClosureData, TicketReceiptMetric } from "@/lib/agency-ticket-closure";
type Props = { data: TicketClosureData; compact?: boolean; editable?: boolean; onChange?: (next: TicketClosureData) => void };
function peso(value: number | null) { return value === null ? "—" : new Intl.NumberFormat("es-AR", {style:"currency",currency:"ARS"}).format(value); }
function MetricRow({label,metric,editable=false,onChange}:{label:string;metric:TicketReceiptMetric;editable?:boolean;onChange?:(v:TicketReceiptMetric)=>void}) {
 if(!editable||!onChange)return <div className="ticket-closure-line"><span>{label}</span><strong>{(metric.count===null?"—":String(metric.count))+" · "+peso(metric.amount)}</strong></div>;
 return <div className="ticket-closure-edit-line"><strong>{label}</strong>
 <label><span>Cantidad</span><input aria-label={label+" cantidad"} type="number" min="0" step="1" value={metric.count??""} placeholder="0" onChange={e=>onChange({...metric,count:e.target.value===""?null:Math.max(0,Math.trunc(Number(e.target.value)))})}/></label>
 <label><span>Importe ($)</span><input aria-label={label+" importe"} type="number" min="0" step="0.01" inputMode="decimal" value={metric.amount??""} placeholder="0,00" onChange={e=>onChange({...metric,amount:e.target.value===""?null:Math.max(0,Number(e.target.value))})}/></label>
 <button type="button" className="ticket-clear-row" title={"Limpiar "+label} onClick={()=>onChange({count:0,amount:0})}>Limpiar</button></div>;
}
function TextField({label,value,editable,onChange}:{label:string;value:string|null;editable:boolean;onChange:(v:string)=>void}) {
 return <label className="ticket-meta-field"><span>{label}</span>{editable?<input aria-label={label} value={value??""} onChange={e=>onChange(e.target.value)}/>:<strong>{value||"—"}</strong>}</label>;
}
function dtText(v:{date:string|null;time:string|null;raw:string|null}) { return v.raw??([v.date,v.time].filter(Boolean).join(" ")||null); }
function dtParse(raw:string) { return {date:raw.match(/\d{2}[/-]\d{2}[/-]\d{2,4}/)?.[0]??null,time:raw.match(/\d{2}:\d{2}:\d{2}/)?.[0]??null,raw:raw.trim()||null}; }
export function TicketClosureReceipt({data,compact=false,editable=false,onChange}:Props) {
 const update=(next:TicketClosureData)=>onChange?.(next);
 const metric=(section:"quiniela"|"quinielaAlToque"|"digital"|"totalOtherGames"|"otherGamesPrizes"|"totalPrizes"|"generalTotal",key:string,value:TicketReceiptMetric)=>{
  if(section==="quiniela")update({...data,quiniela:{...data.quiniela,[key]:value}});
  else if(section==="quinielaAlToque")update({...data,quinielaAlToque:{...data.quinielaAlToque,[key]:value}});
  else if(section==="digital")update({...data,digital:{...data.digital,[key]:value}});
  else update({...data,[section]:value} as TicketClosureData);
 };
 const time=(key:"printedAt"|"openedAt"|"closedAt",value:string)=>update({...data,[key]:dtParse(value)});
 const sales=[data.quiniela.valids.amount,data.quinielaAlToque.valids.amount,...data.otherGames.map(g=>g.amount)];
 const salesOk=data.generalTotal.amount!==null&&sales.every(v=>v!==null)?Math.round(sales.reduce<number>((s,v)=>s+(v??0),0)*100)===Math.round(data.generalTotal.amount*100):false;
 const prizes=[data.quiniela.prizesPaid.amount,data.quinielaAlToque.prizesPaid.amount,data.otherGamesPrizes.amount];
 const prizesOk=data.totalPrizes.amount!==null&&prizes.every(v=>v!==null)?Math.round(prizes.reduce<number>((s,v)=>s+(v??0),0)*100)===Math.round(data.totalPrizes.amount*100):false;
 return <section className={"ticket-closure-receipt"+(compact?" is-compact":"")+(editable?" is-editable":"")} aria-label="Detalle completo del ticket de fin de jornada">
  <header className="ticket-closure-title"><span>{editable?"DATOS EDITABLES LEÍDOS DE LA FOTO":"COMPROBANTE OFICIAL · LECTURA AUTOMÁTICA"}</span><h3>{data.header||"FIN DE JORNADA"}</h3>{editable&&<p>Editá cualquier cantidad o importe. Solo los renglones Válidos se suman a las ventas; premios y totales quedan separados.</p>}</header>
  <div className="ticket-closure-identifiers">
   <TextField label="AG" value={data.agencyCode} editable={editable} onChange={v=>update({...data,agencyCode:v||null})}/>
   <TextField label="SUBAG" value={data.subagentCode} editable={editable} onChange={v=>update({...data,subagentCode:v||null})}/>
   <TextField label="MAQ" value={data.machineCode} editable={editable} onChange={v=>update({...data,machineCode:v||null})}/>
   <TextField label="Domicilio" value={data.address} editable={editable} onChange={v=>update({...data,address:v||null})}/>
   <TextField label="Terminal" value={data.terminalId} editable={editable} onChange={v=>update({...data,terminalId:v||null})}/>
  </div>
  <div className="ticket-closure-section ticket-closure-draws"><h4>Sorteos abiertos</h4>
   {(data.openDraws??[]).map((draw,i)=><div className="ticket-closure-line ticket-draw-row" key={draw.name+i}>{editable?<><input aria-label={"Sorteo "+(i+1)} value={draw.name} onChange={e=>update({...data,openDraws:data.openDraws.map((v,j)=>i===j?{...v,name:e.target.value}:v)})}/><input aria-label={"Estado "+(i+1)} value={draw.status} onChange={e=>update({...data,openDraws:data.openDraws.map((v,j)=>i===j?{...v,status:e.target.value}:v)})}/><button type="button" className="ticket-clear-row" onClick={()=>update({...data,openDraws:data.openDraws.filter((_,j)=>j!==i)})}>Quitar</button></>:<><span>{draw.name}</span><strong>{draw.status}</strong></>}</div>)}
   {editable&&<button type="button" className="button ghost ticket-add-draw" onClick={()=>update({...data,openDraws:[...data.openDraws,{name:"",status:"ON-OFF"}]})}>Agregar sorteo</button>}
  </div>
  <div className="ticket-closure-grid">
   <div className="ticket-closure-section"><h4>Quiniela</h4>
    <MetricRow label="Válidos" metric={data.quiniela.valids} editable={editable} onChange={v=>metric("quiniela","valids",v)}/>
    <MetricRow label="Anulados Esp." metric={data.quiniela.cancelledSpecial} editable={editable} onChange={v=>metric("quiniela","cancelledSpecial",v)}/>
    <MetricRow label="Premios pagados" metric={data.quiniela.prizesPaid} editable={editable} onChange={v=>metric("quiniela","prizesPaid",v)}/>
   </div>
   <div className="ticket-closure-section"><h4>Quiniela al Toque</h4>
    <MetricRow label="Válidos" metric={data.quinielaAlToque.valids} editable={editable} onChange={v=>metric("quinielaAlToque","valids",v)}/>
    <MetricRow label="Premios pagados" metric={data.quinielaAlToque.prizesPaid} editable={editable} onChange={v=>metric("quinielaAlToque","prizesPaid",v)}/>
   </div>
   <div className="ticket-closure-section"><h4>Otros juegos</h4>
    {data.otherGames.map((g,i)=><MetricRow key={g.name+i} label={g.name} metric={{count:g.count,amount:g.amount}} editable={editable} onChange={v=>update({...data,otherGames:data.otherGames.map((row,j)=>i===j?{...row,count:v.count,amount:v.amount}:row)})}/>)}
    <MetricRow label="Total otros juegos" metric={data.totalOtherGames} editable={editable} onChange={v=>metric("totalOtherGames","",v)}/>
    <MetricRow label="Premios pagados (otros)" metric={data.otherGamesPrizes} editable={editable} onChange={v=>metric("otherGamesPrizes","",v)}/>
   </div>
   <div className="ticket-closure-section"><h4>Totales del ticket</h4>
    <MetricRow label="Premios pagados total" metric={data.totalPrizes} editable={editable} onChange={v=>metric("totalPrizes","",v)}/>
    <MetricRow label="Total general" metric={data.generalTotal} editable={editable} onChange={v=>metric("generalTotal","",v)}/>
   </div>
   <div className="ticket-closure-section"><h4>Medios digitales</h4>
    <MetricRow label="Cobros" metric={data.digital.cobros} editable={editable} onChange={v=>metric("digital","cobros",v)}/>
    <MetricRow label="Devoluciones" metric={data.digital.devoluciones} editable={editable} onChange={v=>metric("digital","devoluciones",v)}/>
   </div>
  </div>
  <div className="ticket-closure-footer">
   <TextField label="Período N.º" value={data.periodNumber} editable={editable} onChange={v=>update({...data,periodNumber:v||null})}/>
   <TextField label="Impreso el" value={dtText(data.printedAt)} editable={editable} onChange={v=>time("printedAt",v)}/>
   <TextField label="Abierto el" value={dtText(data.openedAt)} editable={editable} onChange={v=>time("openedAt",v)}/>
   <TextField label="Cerrado el" value={dtText(data.closedAt)} editable={editable} onChange={v=>time("closedAt",v)}/>
   <TextField label="Descarga" value={data.downloadStatus} editable={editable} onChange={v=>update({...data,downloadStatus:v||null})}/>
  </div>
  <p className={"ticket-closure-validation"+(salesOk&&prizesOk?" is-valid":" is-review")}>{salesOk&&prizesOk?"Control automático: ventas y premios coinciden con sus renglones.":"Compará cada dato con la foto. Los campos sin lectura quedan editables y no se inventan importes."}</p>
 </section>;
}
