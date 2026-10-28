'use strict';
const express=require('express');const {createPrivateKey,createPublicKey,sign}=require('node:crypto');
const c=require('./contracts');const {Deadline}=require('../capture/deadline');
const {createPostgresAdmission}=require('./postgresAdmission');const {createConfirmationAuthority}=require('./confirmationAuthority');
// Separate operator/control API, never an MCP tool. Only current human project
// OWNER/ADMIN may approve an agent plan. Pass possession alone is insufficient.
function createHeadlessApproval({pool,resolveHuman,authorizeOwner,privateKey,issuer,keyId,policyVersion,validateTargets=c.publicTargets}={}){
 if(typeof resolveHuman!=='function'||typeof authorizeOwner!=='function')c.deny('UNAVAILABLE');
 let key;try{key=createPrivateKey(privateKey);if(key.asymmetricKeyType!=='ed25519')throw Error();}catch{c.deny('UNAVAILABLE');}
 const repository=createPostgresAdmission({pool,policyVersion,authorizeConfirmation:createConfirmationAuthority({publicKey:createPublicKey(key).export({type:'spki',format:'pem'}),issuer,keyId})});
 const publicGrants=require('./publicReadGrants').createPublicReadGrants({pool,policyVersion});
 const router=express.Router();router.use((_req,res,next)=>{res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});next();});
 router.use(express.json({limit:'2kb'}));
 const handle=action=>async(req,res)=>{
 const deadline=new Deadline(5000);const cancel=()=>{if(!res.writableEnded)deadline.abort();};res.on('close',cancel);
 try{
 if(req.get('origin')||req.get('cookie')||req.get('x-agent-user-id')||req.get('x-agent-secret-token'))c.deny('FORBIDDEN');
 const authorization=req.get('authorization');if(!/^Bearer [^\s,]{1,8192}$/.test(authorization||''))c.deny('UNAUTHENTICATED');
 const organizationId=c.identifier(req.query.organizationId),projectId=c.identifier(req.query.projectId),planId=c.identifier(req.params.planId);
 const checkHuman=async()=>{const human=c.principal(await deadline.run(()=>resolveHuman({authorization,organizationId,projectId,signal:deadline.signal})));
 if(human.kind!=='human'||!['OWNER','ADMIN'].includes(human.effectiveRole)||human.organizationId!==organizationId||human.projectId!==projectId)c.deny('FORBIDDEN');return human;};
 const human=await checkHuman();
 const rows=await deadline.run(()=>pool.query('SELECT body FROM web_read.plans WHERE plan_id=$1 AND body->>\'organizationId\'=$2 AND body->>\'projectId\'=$3',[planId,organizationId,projectId]));
 if(rows.rows.length!==1)c.deny('FORBIDDEN');const plan=c.plan(rows.rows[0].body);
 if(plan.planId!==planId||plan.organizationId!==organizationId||plan.projectId!==projectId||plan.principalKind!=='agent')c.deny('FORBIDDEN');
 if(plan.policyVersion!==policyVersion||plan.expiresAt<=Date.now())c.deny('STALE_PLAN');
 const owner=c.executionPrincipal(await deadline.run(()=>authorizeOwner(plan,deadline.signal)));c.bindPrincipal(owner,plan);
 if(action==='inspect'){res.json({planId,planDigest:c.digest(plan),urls:plan.urls,deadlineMs:plan.deadlineMs,maxResponseBytes:plan.maxResponseBytes,retention:plan.retention,outputSchema:plan.outputSchema,expiresAt:plan.expiresAt});return;}
 if(action==='delegate'){
  c.exact(req.body,['planDigest','grantId','limits']);if(req.body.planDigest!==c.digest(plan))c.deny('INVALID_CONFIRMATION');
  const spec=require('./publicReadGrants').limits(req.body.limits);for(const origin of spec.origins)validateTargets([origin]);
  const current=await checkHuman();if(current.authSubject!==human.authSubject||current.workspaceUserId!==human.workspaceUserId)c.deny('FORBIDDEN');
  res.json(await deadline.run(()=>publicGrants.create({plan,principal:owner,approvedBy:human.authSubject,grantId:req.body.grantId,spec})));return;
 }
 c.exact(req.body,['planDigest','confirmationId']);const confirmationId=c.identifier(req.body.confirmationId);
 if(req.body.planDigest!==c.digest(plan))c.deny('INVALID_CONFIRMATION');
 const current=await checkHuman();if(current.authSubject!==human.authSubject||current.workspaceUserId!==human.workspaceUserId)c.deny('FORBIDDEN');
 const now=Math.floor(Date.now()/1000);const body={iss:issuer,aud:'web-read-confirmation',scope:'web:confirm',sub:owner.authSubject,
 workspaceUserId:owner.workspaceUserId,organizationId,projectId,planId,planDigest:c.digest(plan),confirmationId,iat:now,exp:Math.min(now+120,Math.floor(plan.expiresAt/1000)),principalKind:'agent',approvedBy:human.authSubject};
 const message=[{alg:'EdDSA',typ:'web-confirm+jwt',kid:keyId},body].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
 const confirmationProof=message+'.'+sign(null,Buffer.from(message),key).toString('base64url');
 const result=await deadline.run(()=>repository.confirm({planId,confirmationId,principal:owner,confirmationProof,signal:deadline.signal}));res.json(result);
 }catch(e){const code=e instanceof c.WebBoundaryError?e.code:'UNAVAILABLE';res.status({FORBIDDEN:403,UNAUTHENTICATED:401,INVALID_INPUT:400,INVALID_CONFIRMATION:403,STALE_PLAN:409,IDEMPOTENCY_CONFLICT:409}[code]||503).json({error:code==='UNAVAILABLE'?'UNAVAILABLE':code});}
 finally{deadline.close();res.removeListener('close',cancel);}
 };
 router.post('/read-grants/:grantId/revoke',async(req,res)=>{
  const deadline=new Deadline(5000);try{
   if(req.get('origin')||req.get('cookie')||req.get('x-agent-user-id')||req.get('x-agent-secret-token'))c.deny('FORBIDDEN');
   const authorization=req.get('authorization');if(!/^Bearer [^\s,]{1,8192}$/.test(authorization||''))c.deny('UNAUTHENTICATED');
   c.exact(req.body,[]);const organizationId=c.identifier(req.query.organizationId),projectId=c.identifier(req.query.projectId);
   const human=c.principal(await deadline.run(()=>resolveHuman({authorization,organizationId,projectId,signal:deadline.signal})));
   if(human.kind!=='human'||!['OWNER','ADMIN'].includes(human.effectiveRole)||human.organizationId!==organizationId||human.projectId!==projectId)c.deny('FORBIDDEN');
   res.json(await deadline.run(()=>publicGrants.revoke({grantId:req.params.grantId,organizationId,projectId})));
  }catch(e){const code=e instanceof c.WebBoundaryError?e.code:'UNAVAILABLE';res.status({FORBIDDEN:403,UNAUTHENTICATED:401,INVALID_INPUT:400}[code]||503).json({error:code});}finally{deadline.close();}
 });
 router.post('/:planId/public-read-grants',handle('delegate'));
 router.get('/:planId',handle('inspect'));router.post('/:planId',handle('approve'));
 router.use((_error,_req,res,_next)=>res.status(400).json({error:'INVALID_INPUT'}));return router;
}
function createHeadlessApprovalApplication({enabled=false,...configuration}={}){
 const app=express();app.disable('x-powered-by');
 if(enabled===true)app.use('/approvals',createHeadlessApproval(configuration));
 app.use((_req,res)=>res.status(404).set('Cache-Control','no-store').json({error:'NOT_FOUND'}));
 return {app};
}
module.exports={createHeadlessApproval,createHeadlessApprovalApplication};
