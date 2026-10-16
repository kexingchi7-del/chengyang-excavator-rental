const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),Rental=require('../business.js');
function fixture(overrides={}){
 const fields={'机型':'972','预计使用天数':'20','每天工时':'8','需求台数':'1','联系电话':'13800000000',...overrides};
 const handlers={},hidden=[],hint={},estimate={},button={};let submitted=0;
 const form={elements:Object.fromEntries(Object.entries(fields).map(([key,value])=>[key,{value}])),reportValidity:()=>true,addEventListener:(name,fn)=>{handlers[name]=fn;},querySelectorAll:()=>[],append:(...els)=>hidden.push(...els),querySelector:()=>button};
 const document={getElementById:id=>id==='quoteForm'?form:id==='estimate'?estimate:hint,createElement:()=>({dataset:{}})};
 const context=vm.createContext({Rental,document,FormData:function(){this.get=k=>fields[k];},window:{addEventListener:()=>{}},HTMLFormElement:{prototype:{submit:function(){submitted++;}}},Date});
 vm.runInContext(fs.readFileSync('form.js','utf8'),context);
 return {form,hidden,hint,estimate,button,handlers,submitted:()=>submitted};
}
test('填写到邮件提交的集成流程，匿名端点与结构化金额正确',()=>{const f=fixture();f.handlers.input();assert.match(f.estimate.textContent,/128,000/);f.handlers.submit({preventDefault(){}});assert.equal(f.submitted(),1);assert.equal(f.form.method,'POST');assert.match(f.form.action,/formsubmit.co\/[a-f0-9]{32}$/);assert.equal(f.hidden.find(x=>x.name==='预计机械费').value,'128000元');assert.equal(f.hidden.find(x=>x.name==='设备名称').value,'柳工972');assert.equal(f.button.disabled,true);assert.doesNotMatch(f.hint.textContent,/已提交|成功/);});
test('非法台数不提交、不显示成功',()=>{const f=fixture({'需求台数':'-1'});f.handlers.submit({preventDefault(){}});assert.equal(f.submitted(),0);assert.match(f.hint.textContent,/台数/);});
test('非法电话不提交',()=>{const f=fixture({'联系电话':'abc'});f.handlers.submit({preventDefault(){}});assert.equal(f.submitted(),0);assert.match(f.hint.textContent,/电话/);});
