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
  pilotPolicy,ownerAccessEndpoint,confirmationAuthority,fetchImpl=fetch,concurrency=2,intervalMs=1000}={}) {
  // These must be real, operator-bound authorities. No snapshot/current-user
  // fallback for a worker and no implicit confirmation from request body text.
  if(authorizeOwner===undefined && ownerAccessEndpoint)authorizeOwner=createOwnerPrincipalResolver({url:ownerAccessEndpoint,sdk:readSdk,agentUserId:readAgentId,fetchImpl});
  if(authorizeConfirmation===undefined && confirmationAuthority)authorizeConfirmation=createConfirmationAuthority(confirmationAuthority);
  if([resolvePrincipal,authorizeOwner,authorizeConfirmation,verifySearchService].some(f=>typeof f!=='function'))c.deny('UNAVAILABLE');
  if(pilotPolicy){resolvePrincipal=pilotPolicy.wrap(resolvePrincipal);authorizeOwner=pilotPolicy.wrapOwner(authorizeOwner);}
  c.identifier(workerId);c.identifier(policyVersion);
  const publicGrants=require('./publicReadGrants').createPublicReadGrants({pool,policyVersion});
  const repository=createPostgresAdmission({pool,authorizeConfirmation,policyVersion,validatePlan:pilotPolicy?.plan});
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
    async capabilities(input){return withActor(input,async principal=>({authorizationMode:'standing_public_read',livePermissionChecked:true,grants:(await publicGrants.list(principal)).map(g=>({origins:g.origins,maxUrls:g.maxUrls,deadlineMs:g.deadlineMs,maxResponseBytes:g.maxResponseBytes,expiresAt:g.expiresAt}))}));},
    async publicAuthorization(input){return withActor(input,async principal=>publicGrants.availability(await repository.loadPlan({planId:c.identifier(input.planId),principal}),principal));},
    async admitPublic(input){return withActor(input,async principal=>publicGrants.admit(await repository.loadPlan({planId:c.identifier(input.planId),principal}),principal));},
    async inspect(input){
      const planId=c.identifier(input.planId);
      return withActor(input,(principal)=>repository.loadPlan({planId,principal}));
    },
    async plan(input){
      c.exact(input.spec,['urls','deadlineMs','maxResponseBytes']);
      // Snapshot caller data before asynchronous authority lookup.
      const urls=(pilotPolicy?.targets||c.publicTargets)(input.spec.urls),deadlineMs=input.spec.deadlineMs,maxResponseBytes=input.spec.maxResponseBytes;
      return withActor(input,(actor,signal)=>{
        const ref=actor.kind==='agent'?c.authorizationRef(actor.authorizationRef):undefined;
        if(ref && ref.expiresAt<=Date.now())c.deny('UNAUTHENTICATED');
        return repository.savePlan({principal:actor,signal,plan:{...(ref?{principalKind:'agent',authorizationRef:ref}:{}),version:1,planId:randomUUID(),
        authSubject:actor.authSubject,workspaceUserId:actor.workspaceUserId,organizationId:actor.organizationId,projectId:actor.projectId,
        operation:'public-read',urls,policyVersion,outputSchema:'captured-pages-v1',deadlineMs,maxResponseBytes,expiresAt:Math.min(Date.now()+300000,ref?.expiresAt??Number.MAX_SAFE_INTEGER),retention:'transient'}});});
    },
    async confirm(input){
      const planId=c.identifier(input.planId),confirmationId=c.identifier(input.confirmationId),authorization=input.authorization;
      return withActor(input,(principal,signal)=>repository.confirm({planId,confirmationId,principal,authorization,confirmationProof:input.confirmationProof,signal}));
    }
  });
}
module.exports={createWebRuntime};
