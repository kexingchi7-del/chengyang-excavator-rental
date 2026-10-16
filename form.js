// 激活后填写 FormSubmit 匿名编号；不得填写邮箱地址。
const FORM_ID = '';
const form = document.getElementById('quoteForm');
function calculate() {
  const values = new FormData(form);
  const rate = Number(values.get('机型'));
  const hours = Number(values.get('预计使用天数')) * Number(values.get('每天工时')) * Number(values.get('需求台数'));
  return Object.freeze({hours, amount: rate * hours, known: rate > 0 && hours > 0});
}
form.addEventListener('input', () => {
  const result = calculate();
  document.getElementById('estimate').textContent = result.known ? `预计总台时${result.hours}小时，机械费约${result.amount.toLocaleString('zh-CN')}元。客户需求估算，不含其他费用。` : '填写工期后自动估算机械费。';
});
form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  if (!/^[a-zA-Z0-9-]{16,}$/.test(FORM_ID)) {
    document.getElementById('quoteHint').textContent = '邮件收单尚未启用，信息尚未发送，请稍后再试。';
    return;
  }
  const result = calculate();
  const data = Object.freeze({_subject:'城阳挖掘机租赁｜新客户询价', _template:'table', _next:'https://kexingchi7-del.github.io/chengyang-excavator-rental/thanks.html', '预计总台时':String(result.hours), '预计机械费':result.known ? result.amount+'元' : '待确认', '估算依据':'小时价 × 天数 × 每天工时 × 台数；客户自报，待核实，不含其他费用', '提交时间':new Date().toISOString()});
  form.append(...Object.entries(data).map(([name,value]) => {
    const input = document.createElement('input');
    input.type='hidden'; input.name=name; input.value=value;
    return input;
  }));
  form.action='https://formsubmit.co/'+FORM_ID;
  form.method='POST';
  HTMLFormElement.prototype.submit.call(form);
});
