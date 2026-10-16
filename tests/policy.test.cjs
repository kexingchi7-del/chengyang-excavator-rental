const test=require('node:test'),assert=require('node:assert/strict'),P=require('../policy.js');
test('20天订单按7天结算+2天缓冲，45%覆盖',()=>{const p=P.advance({rate:800,days:20,hours:8,count:1,cycle:7,buffer:2});assert.equal(p.total,128000);assert.equal(p.advance,57600);assert.equal(p.percent,45);assert.equal(p.coveredDays,9);});
test('短工期不超过预计机械租赁费',()=>{const p=P.advance({rate:550,days:3,hours:8,count:1,cycle:7,buffer:2});assert.equal(p.advance,13200);assert.equal(p.percent,100);});
test('长工期保持9天覆盖，不无限提高首款',()=>{const p=P.advance({rate:800,days:60,hours:8,count:1,cycle:7,buffer:2});assert.equal(p.advance,57600);assert.equal(p.percent,15);});
test('客户供油预算不计入机械收入',()=>{const p=P.fuel({litresPerHour:30,hours:8,days:20,count:1,price:8.21});assert.equal(p.litres,4800);assert.equal(p.amount,39408);});
test('非法输入不计算',()=>{assert.throws(()=>P.advance({rate:800,days:0,hours:8,count:1,cycle:7,buffer:2}));assert.throws(()=>P.fuel({litresPerHour:-1,hours:8,days:20,count:1,price:8.21}));});
test('成本假设不填不能计算利润，成本覆盖和收入独立',()=>{const o={rate:800,days:20,hours:8,count:1,cycle:7,buffer:2,costPerHour:300,upfront:2000};const c=P.costCoverage(o);assert.equal(c.totalCost,50000);assert.equal(c.contribution,78000);assert.equal(c.fundingFloor,23600);assert.throws(()=>P.costCoverage({...o,costPerHour:''}));});
