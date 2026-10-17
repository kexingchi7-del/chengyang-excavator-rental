const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../enquiry.js');
test('Shanghai day rolls over at UTC 16:00',()=>{
 assert.equal(E.today(new Date('2026-10-16T16:00:00Z')),'2026-10-17');
});
test('reject invalid calendar, past date, phone and excessive text',()=>{
 const base={'联系电话':'13800000000','预计开工日期':'2026-10-17'};
 for(const change of [{'预计开工日期':'2026-02-30'},{'预计开工日期':'2026-10-16'},{'联系电话':'-------'},{'联系人':'a'.repeat(201)}])
 assert.throws(()=>E.validate({...base,...change},new Date('2026-10-17T00:00:00Z')));
 assert.doesNotThrow(()=>E.validate(base,new Date('2026-10-17T00:00:00Z')));
});
test('UUID reference and terms are explicit',()=>{
 assert.equal(E.reference({randomUUID:()=> '123e4567-e89b-42d3-a456-426614174000'}),'123e4567-e89b-42d3-a456-426614174000');
 assert.throws(()=>E.reference({}));
 assert.match(E.terms,/柴油.*客户/);
 for(const term of ['司机','运输','最低工时','停工待机','税费']) assert.ok(E.terms.includes(term+'：待双方确认'));
});
test('支持无randomUUID但有安全随机数的旧手机浏览器',()=>{
 const ref=E.reference({getRandomValues:bytes=>{for(let i=0;i<bytes.length;i++)bytes[i]=i;return bytes;}});
 assert.match(ref,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
});
