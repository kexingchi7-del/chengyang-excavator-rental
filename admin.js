'use strict';
const KEY='chengyang-rental-orders-v1';
const form=document.getElementById('orderForm'),status=document.getElementById('status');
let orders=[];
let storageLocked=false;
function announce(message){status.textContent=message;}
function load(){
 try{const raw=JSON.parse(localStorage.getItem(KEY)||'[]');if(!Array.isArray(raw)||raw.length>10000)throw Error('备份结构错误');orders=raw.map(Rental.validateOrder);}
 catch(error){storageLocked=true;announce('本地记录无法读取：'+error.message+'。已禁止保存和导入，避免覆盖旧数据；导出按钮可下载原始数据以便恢复。');form.querySelector('button').disabled=true;document.getElementById('import').disabled=true;}
}
function save(next){if(storageLocked)throw Error('原始数据损坏，禁止覆盖；请先导出原始数据');localStorage.setItem(KEY,JSON.stringify(next));orders=next;render();}
function element(tag,text){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;}
function render(){
 const totals=orders.reduce((a,o)=>{const b=Rental.balance(o);return {paid:a.paid+Number(o.paid),used:a.used+b.used,debt:a.debt+Math.max(0,-b.remaining),alerts:a.alerts+(b.status!=='余额充足'?1:0)};},{paid:0,used:0,debt:0,alerts:0});
 document.getElementById('metrics').replaceChildren(...[['实际到账',totals.paid+'元'],['确认应收',totals.used+'元'],['未覆盖应收',totals.debt+'元'],['待补款订单',totals.alerts+'笔']].map(([title,value])=>{const d=element('div',title);d.className='metric';d.append(element('strong',value));return d;}));
 const target=document.getElementById('orders');target.replaceChildren();
 if(!orders.length)target.append(element('p','暂无订单，请先录入真实合同与到账记录。'));
 orders.forEach(order=>{
   const b=Rental.balance(order),card=element('article');card.className='card';
   card.append(element('h3',order.id+' · '+order.customer+' · '+Rental.machines[order.machine].name));
   card.append(element('p',`${b.status}｜确认应收${b.used}元｜实际到账${order.paid}元｜剩余${b.remaining}元｜约可覆盖${b.days.toFixed(1)}天`));
   const edit=element('button','更新工时 / 到账');edit.type='button';edit.onclick=()=>{Object.entries(order).forEach(([k,v])=>{if(form.elements[k])form.elements[k].value=v;});form.scrollIntoView({behavior:'smooth'});};card.append(edit);
   const text=element('textarea');text.readOnly=true;text.setAttribute('aria-label','可复制的对账与补款文字');
   text.value=`您好，合同${order.id}当前已确认${order.actualHours}台时，单价${order.rate}元，其他费用${order.extras}元，合计应收${b.used}元；累计到账${order.paid}元，${b.remaining<0?'尚欠'+(-b.remaining):'剩余预付款'+b.remaining}元。按预计每天${order.dailyHours}台时，补足未来7天预计作业费还需${b.topup}元。请核对并按合同约定补款；费用以双方确认的对账单为准。`;
   card.append(text);target.append(card);
 });
}
form.elements.machine.addEventListener('change',()=>{form.elements.rate.value=Rental.machines[form.elements.machine.value].rate;});
form.addEventListener('submit',event=>{
 event.preventDefault();try{const o=Rental.validateOrder(Object.fromEntries(new FormData(form)));if(orders.some(x=>x.id===o.id)&&!confirm('更新合同'+o.id+'的累计记录？'))return;save([...orders.filter(x=>x.id!==o.id),o]);announce('已保存在当前浏览器，请及时导出备份。');}catch(error){announce('保存失败：'+error.message);}
});
document.getElementById('reset').onclick=()=>form.reset();
document.getElementById('export').onclick=()=>{
 const content=storageLocked?localStorage.getItem(KEY):JSON.stringify({version:1,exportedAt:new Date().toISOString(),orders},null,2);
 const a=document.createElement('a'),url=URL.createObjectURL(new Blob([content],{type:'application/json'}));a.href=url;a.download=(storageLocked?'损坏原始数据-':'租赁台账-')+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
document.getElementById('import').addEventListener('change',async event=>{
 try{const file=event.target.files[0];if(!file)return;if(file.size>5000000)throw Error('备份超过5MB');const data=JSON.parse(await file.text());if(data.version!==1||!Array.isArray(data.orders)||data.orders.length>10000)throw Error('备份格式错误');const incoming=data.orders.map(Rental.validateOrder);if(new Set(incoming.map(o=>o.id)).size!==incoming.length)throw Error('重复合同编号');const added=incoming.filter(o=>!orders.some(x=>x.id===o.id));save([...orders,...added]);announce('已合并'+added.length+'笔，本地已有合同未被覆盖。');}catch(error){announce('导入失败：'+error.message);}finally{event.target.value='';}
});
load();render();
