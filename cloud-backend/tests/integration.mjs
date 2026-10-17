import assert from 'node:assert/strict';
// Local mock identity and local D1 only. Never run this against production.
const origin='http://127.0.0.1:5174';
const anonymous=await fetch(origin+'/api/state');assert.equal(anonymous.status,401);
const login=await fetch(origin+'/signin-with-chatgpt?return_to=/',{redirect:'manual'});
const cookie=login.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
assert.ok(cookie,'Local preview sign-in should set mock session cookie');
async function get(){const r=await fetch(origin+'/api/state',{headers:{cookie}});const b=await r.json();assert.equal(r.status,200,JSON.stringify(b));return b.data;}
async function post(version,action,from=origin){const r=await fetch(origin+'/api/state',{method:'POST',headers:{cookie,origin:from,'content-type':'application/json'},body:JSON.stringify({version,action})});const raw=await r.text();let body;try{body=JSON.parse(raw);}catch{body={error:raw};}return {status:r.status,body};}
let data=await get();const suffix=Date.now().toString();const id='LOCAL-QA-'+suffix;
const order={id,customer:'本地测试，非真实客户',machine:'972',rate:800,dailyHours:8,company:'青岛佳和盛达工程劳务有限公司'};
const first=await post(data.version,{type:'order.add',order});assert.equal(first.status,200);data=first.body.data;
assert.equal((await post(data.version-1,{type:'order.add',order:{...order,id:id+'-stale'}})).status,409);
assert.equal((await post(data.version,{type:'order.add',order:{...order,id:id+'-csrf'}},'https://untrusted.invalid')).status,403);
const date=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
for(const [kind,value] of [['payment',30000],['hours',8]]){const r=await post(data.version,{type:'entry.add',entry:{id:kind+'-'+suffix,orderId:id,kind,date,value,reference:'LOCAL-QA',confirmedBy:'本地测试人',note:'仅本地模拟，不是真实凭证'}});assert.equal(r.status,200,JSON.stringify(r.body));data=r.body.data;}
assert.equal(data.state.entries.find(e=>e.id==='hours-'+suffix).amountCents,640000);
assert.equal((await get()).version,data.version);
const reverse=await post(data.version,{type:'entry.reverse',id:'payment-'+suffix,note:'本地验收冲正'});assert.equal(reverse.status,200);data=reverse.body.data;
assert.equal(data.state.entries.find(e=>e.reversalOf==='payment-'+suffix).amountCents,-3000000);
const booking={id:'BOOK-'+suffix,orderId:id,machine:'972',start:date,end:date};const book=await post(data.version,{type:'booking.add',booking});assert.equal(book.status,200,JSON.stringify(book.body));data=book.body.data;
assert.equal((await post(data.version,{type:'booking.add',booking:{...booking,id:'CONFLICT-'+suffix}})).status,400);
const cancelled=await post(data.version,{type:'booking.cancel',id:booking.id,note:'本地验收结束'});assert.equal(cancelled.status,200);
console.log('Local API integration passed: unauthenticated rejection, sign-in, persistent writes, version conflicts, CSRF rejection, monetary entries, reversal and booking conflict.');
