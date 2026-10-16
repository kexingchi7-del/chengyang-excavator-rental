// 激活后填写 FormSubmit 匿名编号；不得填写邮箱地址。
const FORM_ID = '260f76ff1763c27fe991c568edc89a0d';
const form = document.getElementById('quoteForm');
function calculate() {
  const values = new FormData(form);
  const result = Rental.quote({machine:values.get('机型'),days:values.get('预计使用天数'),hours:values.get('每天工时'),count:values.get('需求台数')});
  return Object.freeze({...result,hours:result.totalHours,known:result.amount!==null});
}
form.addEventListener('input', () => {
  try {
    const result = calculate();
    document.getElementById('estimate').textContent = (result.known ? `预计总台时${result.hours}小时，机械费约${result.amount.toLocaleString('zh-CN')}元。` : '机型待确认。') + result.capacityNote + '。需求估算，不含其他费用。';
  } catch(error) { document.getElementById('estimate').textContent='填写有效工期和台数后自动估价。'; }
});
form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  if (!/^[a-zA-Z0-9-]{16,}$/.test(FORM_ID)) {
    document.getElementById('quoteHint').textContent = '邮件收单尚未启用，信息尚未发送，请稍后再试。';
    return;
  }
  let result;
  try {
    result = calculate();
    if (!/^[+\d\s()-]{7,25}$/.test(form.elements['联系电话'].value.trim())) throw Error('请填写有效联系电话');
  } catch(error) { document.getElementById('quoteHint').textContent=error.message; return; }
  const data = Object.freeze({_subject:'城阳挖掘机租赁｜新客户询价', _template:'table', _next:'https://kexingchi7-del.github.io/chengyang-excavator-rental/thanks.html', '预计总台时':String(result.hours), '预计机械费':result.known ? result.amount+'元' : '待确认', '估算依据':'小时价 × 天数 × 每天工时 × 台数；客户自报，待核实，不含其他费用', '提交时间':new Date().toISOString()});
  form.querySelectorAll('[data-generated]').forEach(el=>el.remove());
  const values=new FormData(form);
  const rate=Rental.machines[values.get('机型')]?.rate;
  let proposal;
  try {proposal=rate?RentalPolicy.advance({rate,days:values.get('预计使用天数'),hours:values.get('每天工时'),count:values.get('需求台数'),cycle:values.get('结算周期')||7,buffer:values.get('缓冲天数')||2}):null;}
  catch(error){document.getElementById('quoteHint').textContent=error.message;return;}
  const summary={...data,'设备名称':Rental.machines[form.elements['机型'].value]?.name||'待确认','需求金额区间':result.scale,'数量提示':result.capacityNote,'柴油承担':'客户提供柴油；小时租金不含柴油费','首期预付建议':proposal?`${proposal.advance}元（${proposal.percent}%，按${proposal.cycle}天结算+${proposal.buffer}天缓冲测算；合同确认后生效）`:'机型待确认','评估边界':'客户自报需求，不代表实际订单或支付能力'};
  form.append(...Object.entries(summary).map(([name,value]) => {
    const input = document.createElement('input');
    input.type='hidden'; input.name=name; input.value=value; input.dataset.generated='true';
    return input;
  }));
  form.action='https://formsubmit.co/'+FORM_ID;
  form.method='POST';
  form.querySelector('button[type=submit]').disabled=true;
  document.getElementById('quoteHint').textContent='正在前往安全验证；完成后才会提交。';
  HTMLFormElement.prototype.submit.call(form);
});
window.addEventListener('pageshow',()=>{form.querySelector('button[type=submit]').disabled=false;document.getElementById('quoteHint').textContent='填写后提交，完成安全验证即可发送给出租方。';});
