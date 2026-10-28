'use strict';
const c=require('./contracts');
const {failure}=require('./diagnostics');
const {reference,jsonBody}=require('./dispatch');
const {Deadline}=require('../capture/deadline');
// Request/Response adapter only. Production must supply the existing Sentinel
// verifier and live subject/project resolver; no route registered here.
function createDispatchGrantHandler({pool,verifyService,searchAgentId,authorize,policyVersion}={}) {
  if(typeof pool?.query!=='function' || typeof verifyService!=='function' || typeof authorize!=='function') c.deny('UNAVAILABLE');
  c.identifier(searchAgentId);c.identifier(policyVersion);
  return async request=>{
    const deadline=new Deadline(5000,request.signal);
    const response=(body,status)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
    let stage='request';
    try {
      if(request.method!=='POST' || request.headers.get('content-type')?.split(';')[0]!=='application/json') return response({error:'INVALID_INPUT'},400);
      if(request.headers.has('authorization')) c.deny('FORBIDDEN');
      stage='verify';
      const service=await deadline.run(()=>verifyService(request,deadline));
      if(service?.id!==`agent:${searchAgentId}` || !service.operations?.includes('web:consume-dispatch')) c.deny('FORBIDDEN');
      stage='reference';
      const ref=reference(await jsonBody(request,deadline,2048));
      const args=[ref.executionId,ref.workerId,ref.fence,ref.planDigest];
      stage='lookup';
      const loaded=await deadline.run(()=>pool.query(`SELECT p.body FROM web_read.runs r JOIN web_read.plans p ON p.plan_id=r.plan_id
        WHERE r.execution_id=$1 AND r.worker_id=$2 AND r.fence=$3 AND r.digest=$4 AND r.state='running'
        AND r.dispatch_consumed_at IS NULL AND r.lease_until>clock_timestamp()`,args));
      if(loaded.rows.length!==1) c.deny('FORBIDDEN');
      stage='plan';
      const plan=c.plan(loaded.rows[0].body);
      if(c.digest(plan)!==ref.planDigest || plan.policyVersion!==policyVersion) c.deny('FORBIDDEN');
      stage='authorize';
      c.bindPrincipal(c.executionPrincipal(await deadline.run(()=>authorize(plan,deadline.signal))),plan);
      stage='consume';
      const consumed=await deadline.run(()=>pool.query('SELECT * FROM web_read.consume_dispatch($1,$2,$3,$4)',args));
      if(consumed.rows.length!==1 || c.digest(consumed.rows[0].plan)!==ref.planDigest) c.deny('FORBIDDEN');
      stage='expiry';
      const expiresAt=Number(consumed.rows[0].expires_at);
      if(!Number.isSafeInteger(expiresAt) || expiresAt<=Date.now() || expiresAt>plan.expiresAt) c.deny('FORBIDDEN');
      return response({executionId:ref.executionId,planDigest:ref.planDigest,audience:'search-public-read',
        urls:plan.urls,expiresAt,deadlineMs:plan.deadlineMs,maxResponseBytes:plan.maxResponseBytes},200);
    } catch(error) {failure('grant',stage,error);return response({error:'DISPATCH_DENIED'},403);} finally {deadline.close();}
  };
}
module.exports={createDispatchGrantHandler};
