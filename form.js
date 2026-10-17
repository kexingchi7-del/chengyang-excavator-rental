// 激活后填写 FormSubmit 匿名编号；不得填写邮箱地址。
const FORM_ID = '260f76ff1763c27fe991c568edc89a0d';
const RENTAL_COMPANY = '青岛佳和盛达工程劳务有限公司';
const form = document.getElementById('quoteForm');
let submitting=false;
let prepared=null;
const preview=document.getElementById('enquiryPreview');
const summaryText=document.getElementById('enquirySummary');
form.elements['预计开工日期'].min=RentalEnquiry.today();
function calculate() {
  const values = new FormData(form);
  const result = Rental.quote({machine:values.get('机型'),days:values.get('预计使用天数'),hours:values.get('每天工时'),count:values.get('需求台数')});
  return Object.freeze({...result,hours:result.totalHours,known:result.amount!==null});
}
form.addEventListener('input', () => {
  prepared=null;
  preview.hidden=true;
  form.querySelector('button[type=submit]').textContent='生成询价摘要';
  try {
    const result = calculate();
    document.getElementById('estimate').textContent = (result.known ? `预计总台时${result.hours}小时，机械费约${result.amount.toLocaleString('zh-CN')}元。` : '机型待确认。') + result.capacityNote + '。需求估算，不含其他费用。';
  } catch(error) { document.getElementById('estimate').textContent='填写有效工期和台数后自动估价。'; }
});
form.addEventListener('submit', (event) => {
  event.preventDefault();
  if(submitting) return;
  if (!form.reportValidity()) return;
  if (!/^[a-zA-Z0-9-]{16,}$/.test(FORM_ID)) {
    document.getElementById('quoteHint').textContent = '邮件收单尚未启用，信息尚未发送，请稍后再试。';
    return;
  }
  let result;
  try {
    result = calculate();
    RentalEnquiry.validate(Object.fromEntries(new FormData(form)));
  } catch(error) { document.getElementById('quoteHint').textContent=error.message; return; }
  const data = Object.freeze({_subject:RENTAL_COMPANY+'｜新客户询价', _template:'table', _next:'https://kexingchi7-del.github.io/chengyang-excavator-rental/thanks.html', '询价服务公司':RENTAL_COMPANY, '预计总台时':String(result.hours), '预计机械费':result.known ? result.amount+'元' : '待确认', '估算依据':'小时价 × 天数 × 每天工时 × 台数；客户自报，待核实，不含其他费用', '提交时间':new Date().toISOString()});
  form.querySelectorAll('[data-generated]').forEach(el=>el.remove());
  const values=new FormData(form);
  const rate=Rental.machines[values.get('机型')]?.rate;
  let proposal;
  try {proposal=rate?RentalPolicy.advance({rate,days:values.get('预计使用天数'),hours:values.get('每天工时'),count:values.get('需求台数'),cycle:values.get('结算周期')||7,buffer:values.get('缓冲天数')||2}):null;}
  catch(error){document.getElementById('quoteHint').textContent=error.message;return;}
  let ref;
  try {ref=prepared?.ref||RentalEnquiry.reference(window.crypto);}
  catch(error){document.getElementById('quoteHint').textContent=error.message;return;}
  const summary={...data,'询价编号':ref,'报价版本':RentalEnquiry.version,'公司来源':RENTAL_COMPANY+'｜公司官网在线询价','设备名称':Rental.machines[form.elements['机型'].value]?.name||'待确认','需求金额区间':result.scale,'数量提示':result.capacityNote,'柴油承担':'客户提供柴油；小时租金不含柴油费','报价条款':RentalEnquiry.terms,'首期预付建议':proposal?`${proposal.advance}元（${proposal.percent}%，按${proposal.cycle}天结算+${proposal.buffer}天缓冲测算；仅为可编辑协商建议，不代表公司已接受或承诺）`:'机型待确认','评估边界':'客户自报需求，不代表实际订单或支付能力'};
  if(!prepared){
    summaryText.value=RentalEnquiry.summary({...Object.fromEntries(values),...Object.fromEntries(Object.entries(summary).filter(([key])=>!key.startsWith('_')))});
    prepared=Object.freeze({ref});
    preview.hidden=false;
    form.querySelector('button[type=submit]').textContent='继续前往安全验证并提交';
    document.getElementById('quoteHint').textContent='询价摘要已生成，尚未发送。可复制或下载保存，再继续安全验证。';
    return;
  }
  form.append(...Object.entries(summary).map(([name,value]) => {
    const input = document.createElement('input');
    input.type='hidden'; input.name=name; input.value=value; input.dataset.generated='true';
    return input;
  }));
  form.action='https://formsubmit.co/'+FORM_ID;
  form.method='POST';
  try {window.sessionStorage.setItem('rentalEnquiryRef',ref);} catch(error) { /* Storage unavailable: submission can continue without local reference. */ }
  submitting=true;
  form.querySelector('button[type=submit]').disabled=true;
  document.getElementById('quoteHint').textContent='正在前往安全验证；完成后才会提交。';
  HTMLFormElement.prototype.submit.call(form);
});
document.getElementById('copyEnquiry').addEventListener('click',async()=>{
  try {await window.navigator.clipboard.writeText(summaryText.value);document.getElementById('quoteHint').textContent='摘要已复制，尚不能据此确认邮件送达。';}
  catch(error){summaryText.focus();summaryText.select();document.getElementById('quoteHint').textContent='自动复制不可用，请手动复制已选中的摘要。';}
});
document.getElementById('downloadEnquiry').addEventListener('click',()=>{
  if(!prepared)return;
  const url=URL.createObjectURL(new Blob([summaryText.value],{type:'text/plain;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='询价-'+prepared.ref+'.txt';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});
window.addEventListener('pageshow',()=>{submitting=false;form.elements['预计开工日期'].min=RentalEnquiry.today();form.querySelector('button[type=submit]').disabled=false;document.getElementById('quoteHint').textContent='生成摘要后继续提交；邮件送达需另行确认。';});
