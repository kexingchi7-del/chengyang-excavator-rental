import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {emptyState,applyAction} from '../../../lib/domain.mjs';
export const dynamic='force-dynamic';
function response(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
async function identity(){const user=await getChatGPTUser();if(!user)throw Error('UNAUTHORIZED');if(!env.DB)throw Error('DATABASE_UNAVAILABLE');return {user,db:env.DB};}
async function read(db:D1Database,id:string){
 const row=await db.prepare('SELECT version,payload FROM ledgers WHERE owner_id=?').bind(id).first<{version:number,payload:string}>();
 return row?{version:row.version,state:JSON.parse(row.payload)}:{version:0,state:emptyState()};
}
export async function GET(){
 try{const {user,db}=await identity();return response({success:true,data:await read(db,user.userId)});}
 catch(e){console.error('Ledger read failed',e instanceof Error?e.message:'unknown');return response({success:false,error:e instanceof Error&&e.message==='UNAUTHORIZED'?'请先登录':'台账暂不可用，请稍后再试'},e instanceof Error&&e.message==='UNAUTHORIZED'?401:503);}
}
export async function POST(request:Request){
 try{
  const {user,db}=await identity();
  if(!request.headers.get('content-type')?.startsWith('application/json'))return response({success:false,error:'仅支持JSON请求'},415);
  const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return response({success:false,error:'跨站写入已拒绝'},403);
  const length=Number(request.headers.get('content-length')||0);if(length>1100000)return response({success:false,error:'请求过大'},413);
  const raw=await request.text();if(new TextEncoder().encode(raw).length>1100000)return response({success:false,error:'请求过大'},413);
  const input=JSON.parse(raw);if(!input||typeof input!=='object'||Array.isArray(input)||!Number.isInteger(input.version)||input.version<0)return response({success:false,error:'台账版本无效'},400);
  const slot=Math.floor(Date.now()/60000),bucket=user.userId+':'+slot;
  await db.prepare('INSERT INTO rate_limits(bucket,hits,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET hits=hits+1').bind(bucket,Date.now()+3600000).run();
  const limiter=await db.prepare('SELECT hits FROM rate_limits WHERE bucket=?').bind(bucket).first<{hits:number}>();
  if(limiter&&limiter.hits>60)return response({success:false,error:'操作过于频繁，请稍后再试'},429);
  await db.prepare('DELETE FROM rate_limits WHERE expires_at < ?').bind(Date.now()).run();
  const current=await read(db,user.userId);if(current.version!==input.version)return response({success:false,error:'其他设备已更新台账，请刷新后重试'},409);
  let state;
  try{state=applyAction(current.state,input.action,{now:new Date().toISOString(),actor:user.userId});}
  catch(e){return response({success:false,error:e instanceof Error?e.message:'业务输入无效'},400);}
  const payload=JSON.stringify(state);if(new TextEncoder().encode(payload).length>900000)return response({success:false,error:'台账容量接近上限，请先导出备份'},413);
  await db.prepare('INSERT INTO ledgers(owner_id,version,payload,updated_at) VALUES(?,0,?,?) ON CONFLICT(owner_id) DO NOTHING').bind(user.userId,JSON.stringify(emptyState()),new Date().toISOString()).run();
  const updated=await db.prepare('UPDATE ledgers SET payload=?,version=version+1,updated_at=? WHERE owner_id=? AND version=?').bind(payload,new Date().toISOString(),user.userId,input.version).run();
  if(!updated.meta.changes)return response({success:false,error:'其他设备同时修改，请刷新后重试'},409);
  return response({success:true,data:{version:input.version+1,state}});
 }catch(e){
  if(e instanceof Error&&e.message==='UNAUTHORIZED')return response({success:false,error:'请先登录'},401);
  if(e instanceof SyntaxError)return response({success:false,error:'请求格式无效'},400);
  console.error('Ledger operation failed',e instanceof Error?e.message:'unknown');
  return response({success:false,error:'后台暂不可用，请稍后重试；原始记录未被覆盖'},503);
 }
}
