(function(root){
 'use strict';
 const machines=Object.freeze({972:Object.freeze({name:'柳工972',rate:800}),965:Object.freeze({name:'柳工965',rate:750}),6500:Object.freeze({name:'临工6500',rate:550})});
 function number(v,name,min,max,integer){
   if(v===''||v===null||v===undefined)throw Error(name+'不能为空');
   const n=Number(v);if(!Number.isFinite(n)||n<min||n>max||(integer&&!Number.isInteger(n)))throw Error(name+'超出有效范围');return n;
 }
 function quote(input){
   const m=Object.hasOwn(machines,input.machine)?machines[input.machine]:null;const days=number(input.days,'天数',1,3650,true);const hours=number(input.hours,'每日工时',0.5,24,false);const count=number(input.count,'台数',1,100,true);
   const totalHours=days*hours*count;const amount=m?Math.round(m.rate*totalHours*100)/100:null;
   return Object.freeze({totalHours,amount,scale:amount===null?'待定':amount>=100000?'10万元及以上':amount>=30000?'3万至10万元':'3万元以下',capacityNote:count>1?'所选机型仅一台，超量需求待确认':'设备档期待确认'});
 }
 function balance(o){
   const rate=number(o.rate,'合同单价',0.01,100000,false),hours=number(o.actualHours,'累计台时',0,1000000,false),paid=number(o.paid,'实际到账',0,100000000,false),extras=number(o.extras,'其他费用',0,100000000,false),daily=number(o.dailyHours,'每天台时',0.5,2400,false);
   const used=Math.round((rate*hours+extras)*100)/100,remaining=Math.round((paid-used)*100)/100;
   return Object.freeze({used,remaining,topup:Math.max(0,Math.round((rate*daily*7-remaining)*100)/100),days:Math.max(0,remaining/(rate*daily)),status:remaining<0?'已欠款':remaining<rate*daily*2?'建议补款':'余额充足'});
 }
 function validateOrder(o){
   if(!o||typeof o!=='object'||Array.isArray(o))throw Error('订单格式错误');
   const text=(key,max)=>{if(typeof o[key]!=='string'||!o[key].trim()||o[key].length>max)throw Error(key+'无效');return o[key].trim();};
   const result={id:text('id',100),customer:text('customer',120),machine:text('machine',30),rate:o.rate,actualHours:o.actualHours,paid:o.paid,extras:o.extras,dailyHours:o.dailyHours};
   if(!Object.hasOwn(machines,result.machine))throw Error('未知机型');balance(result);return Object.freeze(result);
 }
 const api=Object.freeze({machines,quote,balance,validateOrder});if(typeof module!=='undefined'&&module.exports)module.exports=api;root.Rental=api;
})(typeof globalThis!=='undefined'?globalThis:this);
