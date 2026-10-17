const MACHINES=Object.freeze(['972','965','6500']);
const COMPANY='青岛佳和盛达工程劳务有限公司';
export function emptyState(){return {schema:1,leads:[],orders:[],entries:[],bookings:[],audit:[]};}
function text(v,name,max=200,required=true){if(typeof v!=='string'||v.length>max||required&&!v.trim())throw Error(name+'无效');return v.trim();}
function num(v,name,min,max){if(v===''||v==null)throw Error(name+'未填写');if(!['string','number'].includes(typeof v))throw Error(name+'无效');const n=Number(v);if(!Number.isFinite(n)||n<min||n>max)throw Error(name+'无效');return n;}
function historicalTime(v,now){const time=text(v,'历史时间',40);const parsed=new Date(time);if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(time)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==time.slice(0,10)||parsed.getTime()>new Date(now).getTime())throw Error('历史时间无效');return time;}
function date(v,required=true){if(!required&&v==='')return '';if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)throw Error('日期无效');return v;}
function unique(rows,id){if(rows.some(r=>r.id===id))throw Error('编号已存在，请勿重复提交');}
function find(rows,id){const r=rows.find(r=>r.id===id);if(!r)throw Error('记录不存在');return r;}
function today(now){return new Date(new Date(now).getTime()+8*3600000).toISOString().slice(0,10);}
function cents(v){const n=num(v,'金额',0.01,100000000);if(Math.abs(n*100-Math.round(n*100))>0.000001)throw Error('金额最多两位小数');return Math.round(n*100);}
export function totals(s,id){
 const entries=s.entries.filter(e=>e.orderId===id);
 const paid=entries.filter(e=>e.kind==='payment').reduce((n,e)=>n+e.amountCents,0)/100;
 const billed=entries.filter(e=>e.kind!=='payment').reduce((n,e)=>n+e.amountCents,0)/100;
 const hours=entries.filter(e=>e.kind==='hours').reduce((n,e)=>n+e.value,0);
 return {paid,billed,hours,balance:Math.round((paid-billed)*100)/100};
}
function addLead(s,a,ctx){
 const l=a.lead,id=text(l.id,'编号',100);unique(s.leads,id);
 const phone=text(l.phone,'电话',25);if(!/^[+\d\s()-]{7,25}$/.test(phone))throw Error('联系电话无效');
 const sourceRef=text(l.sourceRef||'','询价编号',100,false);if(sourceRef&&s.leads.some(r=>r.sourceRef===sourceRef))throw Error('该询价编号已经录入，请更新现有线索');
 const lead={id,name:text(l.name,'联系人',80),phone,company:text(l.company||'','公司',160,false),location:text(l.location||'','工地',300,false),notes:text(l.notes||'','备注',3000,false),sourceRef,status:'待联系',nextContact:'',createdAt:ctx.now};
 return {...s,leads:[...s.leads,lead]};
}
function updateLead(s,a){
 find(s.leads,a.id);if(!['待联系','已联系','已报价','已签约','暂缓'].includes(a.status))throw Error('跟进状态无效');
 const nextContact=date(a.nextContact||'',false),notes=text(a.notes||'','跟进备注',3000,false);
 return {...s,leads:s.leads.map(l=>l.id===a.id?{...l,status:a.status,nextContact,notes}:l)};
}
function addOrder(s,a,ctx){
 const o=a.order,id=text(o.id,'合同编号',100);unique(s.orders,id);if(!MACHINES.includes(o.machine))throw Error('机型无效');
 if(o.company!==COMPANY)throw Error('合同主体不匹配');
 const rate=num(o.rate,'小时价',0.01,100000);cents(rate);
 const order={id,customer:text(o.customer,'客户',160),machine:o.machine,rate,dailyHours:num(o.dailyHours,'每天工时',0.5,24),company:COMPANY,createdAt:ctx.now};
 return {...s,orders:[...s.orders,order]};
}
function addEntry(s,a,ctx){
 const e=a.entry,id=text(e.id,'流水编号',100);unique(s.entries,id);const order=find(s.orders,e.orderId);
 if(!['hours','payment','fee'].includes(e.kind))throw Error('流水类别无效');
 const day=date(e.date);if(day>today(ctx.now))throw Error('实际流水不能填写未来日期');
 const value=num(e.value,'工时或金额',0.01,e.kind==='hours'?24:100000000);
 if(e.kind==='hours'&&s.entries.filter(r=>s.orders.find(o=>o.id===r.orderId)?.machine===order.machine&&r.date===day&&r.kind==='hours'&&!r.reversedBy&&!r.reversalOf).reduce((n,r)=>n+r.value,0)+value>24)throw Error('同一设备同一天累计工时不能超过24小时');
 const amountCents=e.kind==='hours'?Math.round(value*order.rate*100):cents(value);
 const entry={id,orderId:order.id,kind:e.kind,date:day,value,amountCents,rateSnapshot:order.rate,reference:text(e.reference,'凭证/工时单编号',200),confirmedBy:text(e.confirmedBy,'确认人',80),note:text(e.note||'','说明',2000,false),createdAt:ctx.now,actor:ctx.actor};
 return {...s,entries:[...s.entries,entry]};
}
function reverseEntry(s,a,ctx){
 const original=find(s.entries,a.id);if(original.reversalOf||original.reversedBy)throw Error('冲正不能重复或再次冲正');
 const note=text(a.note,'冲正原因',2000),id='REV-'+original.id;unique(s.entries,id);
 const reversal={...original,id,value:-original.value,amountCents:-original.amountCents,date:today(ctx.now),note,reversalOf:original.id,createdAt:ctx.now,actor:ctx.actor};
 return {...s,entries:[...s.entries.map(e=>e.id===original.id?{...e,reversedBy:id}:e),reversal]};
}
function addBooking(s,a,ctx){
 const b=a.booking,id=text(b.id,'排期编号',100);unique(s.bookings,id);const order=find(s.orders,b.orderId);
 if(order.machine!==b.machine)throw Error('排期机型与订单不一致');
 const start=date(b.start),end=date(b.end);if(start>end)throw Error('结束日期早于开始日期');
 if(s.bookings.some(x=>!x.cancelledAt&&x.machine===b.machine&&x.start<=end&&start<=x.end))throw Error('同一设备档期冲突，含起止日期');
 return {...s,bookings:[...s.bookings,{id,orderId:order.id,machine:b.machine,start,end,createdAt:ctx.now}]};
}
function restore(s,a,ctx){
 if(s.leads.length||s.orders.length||s.entries.length||s.bookings.length)throw Error('仅空台账允许恢复，避免覆盖现有数据');
 const source=a.backup?.state||a.backup?.data?.state;
 if(!source||source.schema!==1||['leads','orders','entries','bookings','audit'].some(key=>!Array.isArray(source[key])||source[key].length>5000)||['leads','orders','entries','bookings','audit'].reduce((n,key)=>n+source[key].length,0)>5000)throw Error('备份格式或容量无效');
 let rebuilt=emptyState();
 const historical=record=>({now:historicalTime(record.createdAt,ctx.now),actor:record.actor?text(record.actor,'原始操作人',200):ctx.actor});
 for(const lead of source.leads){rebuilt=addLead(rebuilt,{lead},historical(lead));rebuilt=updateLead(rebuilt,{id:lead.id,status:lead.status,nextContact:lead.nextContact,notes:lead.notes});}
 for(const order of source.orders)rebuilt=addOrder(rebuilt,{order},historical(order));
 for(const entry of source.entries){
  if(entry.reversalOf)continue;
  rebuilt=addEntry(rebuilt,{entry},historical(entry));
  if(entry.amountCents!==find(rebuilt.entries,entry.id).amountCents)throw Error('备份流水金额不一致');
  if(entry.reversedBy){
   const reverse=find(source.entries,entry.reversedBy);
   if(reverse.reversalOf!==entry.id||reverse.amountCents!==-entry.amountCents||reverse.value!==-entry.value)throw Error('备份冲正关系无效');
   rebuilt=reverseEntry(rebuilt,{id:entry.id,note:reverse.note},historical(reverse));
   if(find(rebuilt.entries,reverse.id).date!==reverse.date)throw Error('冲正日期与历史时间不一致');
  }
 }
 if(rebuilt.entries.length!==source.entries.length)throw Error('备份存在孤立或重复冲正记录');
 for(const booking of source.bookings){rebuilt=addBooking(rebuilt,{booking},historical(booking));if(booking.cancelledAt)rebuilt={...rebuilt,bookings:rebuilt.bookings.map(b=>b.id===booking.id?{...b,cancelledAt:historicalTime(booking.cancelledAt,ctx.now),cancelReason:text(booking.cancelReason,'取消原因',1000)}:b)};}
 const audit=source.audit.map(row=>({type:text(row.type,'历史操作',80),recordId:text(row.recordId||'','历史编号',100,false),at:historicalTime(row.at,ctx.now),actor:text(row.actor,'历史操作人',200),fromBackup:true,restoredAt:ctx.now,...(row.details?{details:JSON.parse(text(JSON.stringify(row.details),'历史详情',5000))}:{})}));
 return {...rebuilt,audit:[...audit,{type:'backup.imported-history',recordId:'',at:ctx.now,actor:ctx.actor}]};
}
export function applyAction(s,a,ctx){
 if(!s||s.schema!==1||!a||typeof a!=='object')throw Error('数据格式错误');
 if([...s.leads,...s.orders,...s.entries,...s.bookings,...s.audit].length>=5000)throw Error('台账达到当前容量，请导出备份并联系维护');
 let next;
 switch(a.type){
  case 'lead.add':next=addLead(s,a,ctx);break;
  case 'lead.update':next=updateLead(s,a);break;
  case 'order.add':next=addOrder(s,a,ctx);break;
  case 'entry.add':next=addEntry(s,a,ctx);break;
  case 'entry.reverse':next=reverseEntry(s,a,ctx);break;
  case 'booking.add':next=addBooking(s,a,ctx);break;
  case 'booking.cancel':find(s.bookings,a.id);if(find(s.bookings,a.id).cancelledAt)throw Error('排期已取消');next={...s,bookings:s.bookings.map(b=>b.id===a.id?{...b,cancelledAt:ctx.now,cancelReason:text(a.note,'取消原因',1000)}:b)};break;
  case 'backup.restore':next=restore(s,a,ctx);break;
  default:throw Error('操作不支持');
 }
 const recordId=a.id||a.lead?.id||a.order?.id||a.entry?.id||a.booking?.id||'';
 const details=a.type==='lead.update'?{status:a.status,nextContact:a.nextContact,notes:a.notes}:a.type==='entry.reverse'||a.type==='booking.cancel'?{note:a.note}:undefined;
 return {...next,audit:[...next.audit,{type:a.type,recordId,at:ctx.now,actor:ctx.actor,...(details?{details}:{})}]};
}
