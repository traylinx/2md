'use strict';
const {createConfirmationAuthority}=require('./confirmationAuthority');
const {randomUUID}=require('node:crypto');
const c=require('./contracts');
const {Deadline}=require('../capture/deadline');
const {createPostgresAdmission}=require('./postgresAdmission');
const {createPostgresWorker}=require('./postgresWorker');
const {createTransientResults}=require('./transientResults');
const {createRunAdmissionController}=require('./runAdmissionController');
const {createRunReader}=require('./runReader');
const {createReadWorker}=require('./readWorker');
const {createDispatchClient}=require('./dispatch');
const {createDispatchGrantHandler}=require('./dispatchGrant');
const {createDispatcher}=require('./dispatcher');
const {createOwnerPrincipalResolver}=require('./ownerPrincipal');
function createWebRuntime({pool,redis,resultKey,resolvePrincipal,authorizeOwner,authorizeConfirmation,
  verifySearchService,readSdk,readAgentId,searchAgentId,searchEndpoint,policyVersion,workerId,
  ownerAccessEndpoint,confirmationAuthority,fetchImpl=fetch,concurrency=2,intervalMs=1000}={}) {
  // These must be real, operator-bound authorities. No snapshot/current-user
  // fallback for a worker and no implicit confirmation from request body text.
  if(authorizeOwner===undefined && ownerAccessEndpoint)authorizeOwner=createOwnerPrincipalResolver({url:ownerAccessEndpoint,sdk:readSdk,agentUserId:readAgentId,fetchImpl});
  if(authorizeConfirmation===undefined && confirmationAuthority)authorizeConfirmation=createConfirmationAuthority(confirmationAuthority);
  if([resolvePrincipal,authorizeOwner,authorizeConfirmation,verifySearchService].some(f=>typeof f!=='function'))c.deny('UNAVAILABLE');
  c.identifier(workerId);c.identifier(policyVersion);
  const repository=createPostgresAdmission({pool,authorizeConfirmation,policyVersion});
  const store=createPostgresWorker({pool});
  const results=createTransientResults({redis,key:resultKey});
  const execute=createDispatchClient({url:searchEndpoint,sdk:readSdk,agentUserId:readAgentId,fetchImpl});
  const processRun=createReadWorker({store,authorize:authorizeOwner,execute,results,policyVersion,workerId});
  const dispatcher=createDispatcher({pool,processRun,reconcileExpired:store.reconcileExpired,concurrency,intervalMs});
  const admit=createRunAdmissionController({repository,resolvePrincipal,policyVersion});
  const read=createRunReader({pool,resolvePrincipal,results});
  const grant=createDispatchGrantHandler({pool,verifyService:verifySearchService,searchAgentId,authorize:authorizeOwner,policyVersion});
  async function withActor(input,operation){
    const organizationId=c.identifier(input.organizationId),projectId=c.identifier(input.projectId);
    const authorization=input.authorization,deadline=new Deadline(5000,input.signal);
    try {
      const actor=c.executionPrincipal(await deadline.run(()=>resolvePrincipal({authorization,agentProof:input.agentProof,organizationId,projectId,signal:deadline.signal})));
      if(actor.organizationId!==organizationId || actor.projectId!==projectId)c.deny('FORBIDDEN');
      return await deadline.run(()=>operation(actor,deadline.signal));
    } catch(e){if(e instanceof c.WebBoundaryError)throw e;c.deny('UNAVAILABLE');}finally{deadline.close();}
  }
  return Object.freeze({admit,read,grant,dispatcher,
    async inspect(input){
      const planId=c.identifier(input.planId);
      return withActor(input,(principal)=>repository.loadPlan({planId,principal}));
    },
    async plan(input){
      c.exact(input.spec,['urls','deadlineMs','maxResponseBytes']);
      // Snapshot caller data before asynchronous authority lookup.
      const urls=c.publicTargets(input.spec.urls),deadlineMs=input.spec.deadlineMs,maxResponseBytes=input.spec.maxResponseBytes;
      return withActor(input,(actor,signal)=>repository.savePlan({principal:actor,signal,plan:{...(actor.kind==='agent'?{principalKind:'agent'}:{}),version:1,planId:randomUUID(),
        authSubject:actor.authSubject,workspaceUserId:actor.workspaceUserId,organizationId:actor.organizationId,projectId:actor.projectId,
        operation:'public-read',urls,policyVersion,outputSchema:'captured-pages-v1',deadlineMs,maxResponseBytes,expiresAt:Date.now()+300000,retention:'transient'}}));
    },
    async confirm(input){
      const planId=c.identifier(input.planId),confirmationId=c.identifier(input.confirmationId),authorization=input.authorization;
      return withActor(input,(principal,signal)=>repository.confirm({planId,confirmationId,principal,authorization,confirmationProof:input.confirmationProof,signal}));
    }
  });
}
module.exports={createWebRuntime};
