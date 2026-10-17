const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),Rental=require('../business.js'),RentalPolicy=require('../policy.js');
function fixture(overrides={}){
 const fields={'机型':'972','预计使用天数':'20','每天工时':'8','需求台数':'1','联系电话':'13800000000','预计开工日期':'2099-01-01',...overrides};
 const handlers={},hidden=[],hint={},estimate={},button={};let submitted=0;
 const form={elements:Object.fromEntries(Object.entries(fields).map(([key,value])=>[key,{value}])),reportValidity:()=>true,addEventListener:(name,fn)=>{handlers[name]=fn;},querySelectorAll:()=>[],append:(...els)=>hidden.push(...els),querySelector:()=>button};
 const nodes={},stored=[];
 const document={getElementById:id=>id==='quoteForm'?form:id==='estimate'?estimate:id==='quoteHint'?hint:(nodes[id]||= {addEventListener(){}}),createElement:()=>({dataset:{}})};
 const context=vm.createContext({Rental,RentalPolicy,RentalEnquiry:require('../enquiry.js'),document,FormData:function(){this.get=k=>fields[k];this[Symbol.iterator]=()=>Object.entries(fields)[Symbol.iterator]();},window:{crypto:{randomUUID:()=> '123e4567-e89b-42d3-a456-426614174000'},sessionStorage:{setItem:(...args)=>stored.push(args)},addEventListener:()=>{}},HTMLFormElement:{prototype:{submit:function(){submitted++;}}},Date});
 vm.runInContext(fs.readFileSync('form.js','utf8'),context);
 const submit=handlers.submit;handlers.submit=event=>{submit(event);if(submitted===0&&nodes.enquiryPreview?.hidden===false)submit(event);};
 return {form,hidden,hint,estimate,button,handlers,nodes,stored,firstSubmit:submit,submitted:()=>submitted};
}
test('填写到邮件提交的集成流程，匿名端点与结构化金额正确',()=>{const f=fixture();f.handlers.input();assert.match(f.estimate.textContent,/128,000/);f.handlers.submit({preventDefault(){}});assert.equal(f.submitted(),1);assert.equal(f.form.method,'POST');assert.match(f.form.action,/formsubmit.co\/[a-f0-9]{32}$/);assert.equal(f.hidden.find(x=>x.name==='预计机械费').value,'128000元');assert.equal(f.hidden.find(x=>x.name==='设备名称').value,'柳工972');assert.equal(f.button.disabled,true);assert.doesNotMatch(f.hint.textContent,/已提交|成功/);});
test('非法台数不提交、不显示成功',()=>{const f=fixture({'需求台数':'-1'});f.handlers.submit({preventDefault(){}});assert.equal(f.submitted(),0);assert.match(f.hint.textContent,/台数/);});
test('非法电话不提交',()=>{const f=fixture({'联系电话':'abc'});f.handlers.submit({preventDefault(){}});assert.equal(f.submitted(),0);assert.match(f.hint.textContent,/电话/);});
test('询价使用客户调整后的结算周期与缓冲',()=>{const f=fixture({'结算周期':'3','缓冲天数':'1'});f.handlers.submit({preventDefault(){}});assert.match(f.hidden.find(x=>x.name==='首期预付建议').value,/25600元.*3天结算\+1天缓冲/);});
test('公司询价有明确归属，不混淆客户公司字段',()=>{const f=fixture();f.handlers.submit({preventDefault(){}});assert.equal(f.hidden.find(x=>x.name==='询价服务公司').value,'青岛佳和盛达工程劳务有限公司');assert.equal(f.hidden.find(x=>x.name==='_subject').value,'青岛佳和盛达工程劳务有限公司｜新客户询价');});
test('先展示摘要，再提交；只存编号，重复提交被阻止',()=>{
 const f=fixture(),event={preventDefault(){}};
 f.firstSubmit(event);
 assert.equal(f.submitted(),0);
 assert.equal(f.nodes.enquiryPreview.hidden,false);
 assert.match(f.nodes.enquirySummary.value,/询价编号：.*\n报价版本：/);
 assert.match(f.nodes.enquirySummary.value,/联系电话：13800000000/);
 assert.match(f.hint.textContent,/尚未发送/);
 f.firstSubmit(event);f.firstSubmit(event);
 assert.equal(f.submitted(),1);
 assert.deepEqual(f.stored,[['rentalEnquiryRef','123e4567-e89b-42d3-a456-426614174000']]);
 assert.equal(new URL(f.hidden.find(x=>x.name==='_next').value).search,'');
 assert.match(f.hidden.find(x=>x.name==='首期预付建议').value,/不代表公司已接受或承诺/);
 assert.ok(f.hidden.find(x=>x.name==='公司来源'));
});
test('编辑后须重新生成摘要',()=>{
 const f=fixture(),event={preventDefault(){}};
 f.firstSubmit(event);f.handlers.input();f.firstSubmit(event);
 assert.equal(f.submitted(),0);assert.equal(f.nodes.enquiryPreview.hidden,false);
});
test('非法日期与超长内容不生成摘要或提交',()=>{
 for(const fields of [{'预计开工日期':'2026-02-30'},{'预计开工日期':'2020-01-01'},{'其他说明':'a'.repeat(2001)}]){
  const f=fixture(fields);f.firstSubmit({preventDefault(){}});assert.equal(f.submitted(),0);assert.equal(f.nodes.enquirySummary.value,undefined);
 }
});
test('页面保留模块顺序、原生 CAPTCHA 和不可聚焦蜜罐',()=>{
 const html=fs.readFileSync('index.html','utf8');
 assert.match(html,/name="_honey" hidden tabindex="-1" aria-hidden="true"/);
 assert.ok(html.indexOf('src="enquiry.js"')<html.indexOf('src="form.js"'));
 assert.doesNotMatch(fs.readFileSync('form.js','utf8'),/_captcha|fetch\(/);
 assert.doesNotMatch(fs.readFileSync('thanks.html','utf8'),/<h1>询价已提交/);
});
