'use strict';
const {createHash}=require('node:crypto');
const c=require('./contracts');
const {Deadline}=require('../capture/deadline');
const {readResult}=require('./readResult');
function createRunReader({pool,resolvePrincipal,results}={}) {
  if(typeof pool?.query!=='function' || typeof resolvePrincipal!=='function' || typeof results?.get!=='function') c.deny('UNAVAILABLE');
  return async function read(input={}) {
    const executionId=c.identifier(input.executionId),organizationId=c.identifier(input.organizationId),projectId=c.identifier(input.projectId);
    if(input.result!==undefined && typeof input.result!=='boolean') c.deny();
    const wantsResult=input.result===true, authorization=input.authorization,deadline=new Deadline(5000,input.signal);
    const resolve=async()=>{
      const actor=c.principal(await deadline.run(()=>resolvePrincipal({authorization,agentProof:input.agentProof,organizationId,projectId,signal:deadline.signal})));
      if(actor.organizationId!==organizationId || actor.projectId!==projectId)c.deny('FORBIDDEN');return actor;
    };
    try {
      const actor=await resolve();
      const owner=createHash('sha256').update(JSON.stringify(['public-read',actor.authSubject,actor.workspaceUserId,actor.organizationId,actor.projectId])).digest('hex');
      const selected=await deadline.run(()=>pool.query(`SELECT r.execution_id,r.digest,r.fence,r.state,r.result_state,r.result_expires_at,p.body
        FROM web_read.runs r JOIN web_read.plans p ON p.plan_id=r.plan_id WHERE r.execution_id=$1 AND r.owner_scope=$2`,[executionId,owner]));
      if(selected.rows.length!==1)c.deny('NOT_FOUND');
      const row=selected.rows[0],plan=c.plan(row.body);c.bindPrincipal(actor,plan);
      if(row.execution_id!==executionId || row.digest!==c.digest(plan))c.deny('UNAVAILABLE');
      const metadata={executionId,planDigest:row.digest,state:row.state,resultState:row.result_state,resultExpiresAt:row.result_expires_at===null?null:Number(row.result_expires_at)};
      if(!wantsResult){c.bindPrincipal(await resolve(),plan);return Object.freeze(metadata);}
      if(!['completed','failed'].includes(row.state) || row.result_expires_at===null)c.deny('RESULT_NOT_READY');
      if(!Number.isSafeInteger(metadata.resultExpiresAt))c.deny('UNAVAILABLE');
      if(metadata.resultExpiresAt<=Date.now())c.deny('ARTIFACT_EXPIRED');
      const stored=await deadline.run(()=>results.get({executionId,planDigest:row.digest,fence:String(row.fence),plan}));
      const result=readResult(stored.result,plan);
      if(stored.expiresAt!==metadata.resultExpiresAt || result.state!==row.result_state)c.deny('INVALID_RESULT');
      // Access can change while decrypting/loading. Recheck immediately before disclosure.
      c.bindPrincipal(await resolve(),plan);
      if(stored.expiresAt<=Date.now())c.deny('ARTIFACT_EXPIRED');
      return Object.freeze({...metadata,result});
    } catch(e) {if(e instanceof c.WebBoundaryError)throw e;c.deny(input.signal?.aborted?'CANCELLED':'UNAVAILABLE');}
    finally{deadline.close();}
  };
}
module.exports={createRunReader};
