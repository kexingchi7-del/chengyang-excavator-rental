(function(root){
 'use strict';
 const version='JHSD-2026-10-17-v1';
 const terms='柴油：客户提供，小时租金不含柴油费；司机：待双方确认；运输：待双方确认；最低工时：待双方确认；停工待机：待双方确认；税费：待双方确认';
 function today(now=new Date()){
   return new Date(now.getTime()+8*3600000).toISOString().slice(0,10);
 }
 function validate(values,now=new Date()){
   for(const [key,value] of Object.entries(values)){
     if(String(value).length>(key==='其他说明'?2000:200)) throw Error(key+'超出最大长度');
   }
   const phone=String(values['联系电话']||'').trim();
   if(!/^[+\d\s()-]{7,25}$/.test(phone)||phone.replace(/\D/g,'').length<7) throw Error('请填写有效联系电话');
   const day=String(values['预计开工日期']||'');
   const parsed=new Date(day+'T00:00:00Z');
   if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==day||day<today(now)) throw Error('开工日期须为有效日期，且不得早于北京时间今天');
 }
 function reference(crypto){
   if(crypto&&typeof crypto.randomUUID==='function') return crypto.randomUUID();
   if(!crypto||typeof crypto.getRandomValues!=='function') throw Error('当前浏览器无法生成询价编号，请使用新版浏览器');
   const bytes=crypto.getRandomValues(new Uint8Array(16));
   bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
   const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
   return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
 }
 function summary(values){return Object.entries(values).map(([key,value])=>key+'：'+value).join('\n');}
 const api=Object.freeze({version,terms,today,validate,reference,summary});
 if(typeof module!=='undefined'&&module.exports) module.exports=api;
 root.RentalEnquiry=api;
})(typeof globalThis!=='undefined'?globalThis:this);
