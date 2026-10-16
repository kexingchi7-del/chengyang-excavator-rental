'use strict';
let officialPrice=null;
const budgetForm=document.getElementById('budgetForm');
const priceInput=document.getElementById('dieselPrice');
async function refreshDiesel(){
 const status=document.getElementById('dieselStatus');status.textContent='正在读取最新公开油价记录…';
 try{
   const url=new URL('data/diesel.json',location.protocol==='file:'?'https://kexingchi7-del.github.io/chengyang-excavator-rental/':location.href);
   url.searchParams.set('t',String(Date.now()));
   const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(12000)});if(!response.ok)throw Error('油价记录暂不可用');
   const d=await response.json();if(d.province!=='山东'||d.grade!=='0号柴油'||!Number.isFinite(d.price)||d.price<0.1||d.price>30)throw Error('油价数据校验失败');
   officialPrice=d.price;if(!priceInput.dataset.edited)priceInput.value=d.price;
   const last=d.checkedAt?new Date(d.checkedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}):'尚未完成自动检查';
   const stale=!d.checkedAt||Date.now()-Date.parse(d.checkedAt)>48*3600000||d.lastCheckStatus!=='ok';
   status.textContent=`山东0号柴油官方最高零售价 ${d.price}元/升；生效日期 ${d.effectiveDate}；最近检查 ${last}。${d.updateMode==='scheduled'?'按已安装任务更新。':'当前为手动检查记录，定时更新尚未启用。'}${stale?'更新检查异常或超过48小时，请核对官方公告与加油站实际报价。':'最近检查通过；价格未调时生效日期不变。'}`;
   const source=document.getElementById('dieselSource');const u=new URL(d.sourceUrl);if(u.protocol!=='https:'||u.hostname!=='fgw.weihai.gov.cn')throw Error('来源地址无效');source.href=u.href;source.textContent='查看山东官方价格公告';
   recalculate();
 }catch(error){status.textContent='自动油价暂不可用，请手动填写实际采购单价；'+error.message;}
}
function recalculate(){
 try{
   const v=Object.fromEntries(new FormData(budgetForm));const rate=Rental.machines[v.machine].rate;
   const p=RentalPolicy.advance({...v,rate});
   document.getElementById('advanceResult').textContent=`预计机械租赁费 ${p.total.toLocaleString('zh-CN')}元；建议首期预付 ${p.advance.toLocaleString('zh-CN')}元，占 ${p.percent}%，覆盖 ${p.coveredDays}天。原3万元约覆盖 ${p.current30000Days.toFixed(2)}天。方案：${p.cycle}天结算＋${p.buffer}天缓冲；合同确认后生效。`;
   if(!v.litresPerHour){document.getElementById('fuelResult').textContent='请填实测每小时油耗，未提供时不估算柴油费。';return;}
   const f=RentalPolicy.fuel({...v,price:priceInput.value});
   document.getElementById('fuelResult').textContent=`预计客户备油 ${f.litres.toLocaleString('zh-CN')}升，柴油预算 ${f.amount.toLocaleString('zh-CN')}元（${Number(priceInput.value)===officialPrice?'按官方参考价':'按手动输入价格'}）。由客户提供，不计入出租方租金收入、成本或预付款。`;
 }catch(error){document.getElementById('advanceResult').textContent=error.message;document.getElementById('fuelResult').textContent='请完善有效输入后计算。';}
}
budgetForm.addEventListener('input',recalculate);budgetForm.addEventListener('submit',e=>e.preventDefault());
priceInput.addEventListener('input',()=>{priceInput.dataset.edited='true';recalculate();});
document.getElementById('refreshDiesel').addEventListener('click',refreshDiesel);
document.getElementById('applyBudget').addEventListener('click',()=>{
 const values=Object.fromEntries(new FormData(budgetForm));
 const mapping={machine:'机型',days:'预计使用天数',hours:'每天工时',count:'需求台数',cycle:'结算周期',buffer:'缓冲天数'};
 const target=document.getElementById('quoteForm');
 Object.entries(mapping).forEach(([key,name])=>{target.elements[name].value=values[key];});
 target.dispatchEvent(new Event('input',{bubbles:true}));target.scrollIntoView({behavior:'smooth'});
});
refreshDiesel();recalculate();
