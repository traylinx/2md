'use strict';
const http=require('node:http');
const {randomBytes,createHash}=require('node:crypto');
const c=require('./contracts');
const {createHostIdentity,saveHostConnection}=require('./hostEnrollmentFile');
const {createEnrollmentClient}=require('./enrollmentClient');
// Host installer primitive, never an MCP tool. All callback state stays local.
async function startEnrollmentSetup({url,ownerSetupUrl,file,organizationId,projectId,agentId,sdk,operations=['browser:public','browser:login_read'],fetchImpl=fetch}={}){
 let ownerUrl;try{ownerUrl=new URL(ownerSetupUrl);}catch{c.deny('UNAVAILABLE');}
 if(ownerUrl.protocol!=='https:'||ownerUrl.username||ownerUrl.password||ownerUrl.search||ownerUrl.hash||ownerUrl.pathname!=='/admin/browser/connect')c.deny('UNAVAILABLE');
 const identity=createHostIdentity(),client=createEnrollmentClient({url,organizationId,projectId,agentId,sdk,identity,fetchImpl});
 const state=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url');
 let pending,principal,timer,busy=false,finished=false,resolveDone,rejectDone;
 const done=new Promise((resolve,reject)=>{resolveDone=resolve;rejectDone=reject;});done.catch(()=>{});
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'");
  try{
   const address=server.address();if(!address||req.headers.host!==`127.0.0.1:${address.port}`||req.method!=='GET'||req.headers.origin||busy||finished||!pending)c.deny('FORBIDDEN');
   const callback=new URL(req.url,'http://127.0.0.1');
   if(callback.pathname!=='/pair/callback'||[...callback.searchParams.keys()].sort().join(',')!=='code,state'||callback.searchParams.get('state')!==state||! /^[A-Za-z0-9_-]{43}$/.test(callback.searchParams.get('code')||''))c.deny('FORBIDDEN');
   if(pending.expiresAt<=Date.now())c.deny('SESSION_LOST');busy=true;
   const result=await client.exchange(principal,{enrollmentId:pending.enrollmentId,state,verifier,code:callback.searchParams.get('code')});
   if(finished)c.deny('SESSION_LOST');
   if(result.grantId!==pending.grantId)c.deny('FORBIDDEN');
   const runtime=new URL('/api/browser/v1',url).href;
   saveHostConnection({file,url:runtime,bound:{principal,hostId:identity.hostId,hostKeyFingerprint:identity.hostKeyFingerprint},grantId:result.grantId,privateKey:identity.privateKey});
   finished=true;clearTimeout(timer);res.end('Traylinx browser connected. You can return to your agent.');resolveDone({file});server.close();
  }catch(error){res.statusCode=c.publicError(error).status;res.end('Connection not completed. Return to your agent.');if(busy)close(error);}
 });
 function close(error=new c.BrowserError('CANCELLED')){if(finished)return;finished=true;clearTimeout(timer);server.close();server.closeAllConnections();rejectDone(error);}
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});server.requestTimeout=10000;server.headersTimeout=5000;
  principal=await client.identify();
  pending=await client.begin(principal,{hostId:identity.hostId,hostPublicKey:identity.hostPublicKey,state,challenge:createHash('sha256').update(verifier).digest('base64url'),redirectUri:`http://127.0.0.1:${server.address().port}/pair/callback`,operations});
  ownerUrl.searchParams.set('enrollmentId',pending.enrollmentId);ownerUrl.searchParams.set('organizationId',organizationId);ownerUrl.searchParams.set('projectId',projectId);
  timer=setTimeout(()=>close(new c.BrowserError('SESSION_LOST')),Math.max(1,pending.expiresAt-Date.now()));timer.unref();
  return Object.freeze({url:ownerUrl.href,hostKeyFingerprint:identity.hostKeyFingerprint,expiresAt:pending.expiresAt,done,close});
 }catch(e){close(e);throw e;}
}
module.exports={startEnrollmentSetup};
