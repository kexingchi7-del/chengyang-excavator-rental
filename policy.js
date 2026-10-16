(function(root){
 'use strict';
 function n(v,name,min,max,integer){if(v===''||v==null)throw Error('请填写'+name);const x=Number(v);if(!Number.isFinite(x)||x<min||x>max||(integer&&!Number.isInteger(x)))throw Error(name+'无效');return x;}
 function advance(o){
   const rate=n(o.rate,'单价',0.01,100000),days=n(o.days,'天数',1,3650,true),hours=n(o.hours,'每天工时',0.5,24),count=n(o.count,'台数',1,100,true),cycle=n(o.cycle,'结算周期',1,90,true),buffer=n(o.buffer,'缓冲天数',0,30,true);
   const daily=rate*hours*count,total=Math.round(daily*days*100)/100,coveredDays=Math.min(days,cycle+buffer),amount=Math.round(daily*coveredDays*100)/100;
   return Object.freeze({daily,total,coveredDays,advance:amount,percent:Math.round(amount/total*10000)/100,current30000Days:30000/daily,cycle,buffer});
 }
 function fuel(o){
   const litresPerHour=n(o.litresPerHour,'实测每小时油耗',0.1,500),hours=n(o.hours,'每日工时',0.5,24),days=n(o.days,'天数',1,3650,true),count=n(o.count,'台数',1,100,true),price=n(o.price,'柴油单价',0.1,30);
   const litres=Math.round(litresPerHour*hours*days*count*100)/100;
   return Object.freeze({litres,amount:Math.round(litres*price*100)/100});
 }
 function costCoverage(o){
   const p=advance(o),cost=n(o.costPerHour,'每台时综合成本',0,100000),upfront=n(o.upfront,'其他项目成本',0,100000000);
   const totalCost=cost*Number(o.hours)*Number(o.count)*Number(o.days)+upfront;
   const fundingFloor=cost*Number(o.hours)*Number(o.count)*p.coveredDays+upfront;
   return Object.freeze({totalCost,contribution:p.total-totalCost,margin:(p.total-totalCost)/p.total*100,fundingFloor,aboveRevenue:fundingFloor>p.total});
 }
 const api=Object.freeze({advance,fuel,costCoverage});if(typeof module!=='undefined'&&module.exports)module.exports=api;root.RentalPolicy=api;
})(typeof globalThis!=='undefined'?globalThis:this);
