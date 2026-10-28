'use strict';
const c=require('./contracts');
const {createHostVerifier}=require('./hostProof');
function header(request,name){
 const matches=request.rawHeaders.filter((_,i)=>i%2===0).filter(x=>x.toLowerCase()===name.toLowerCase());
 const value=request.headers[name.toLowerCase()];if(matches.length!==1||typeof value!=='string')c.deny('UNAUTHENTICATED');return value;
}
function createBrowserHttpIdentity({resolvePrincipal,repository,authority,consumeNonce}={}){
 if(typeof resolvePrincipal!=='function'||typeof repository?.get!=='function'||typeof authority?.authorize!=='function')c.deny('UNAVAILABLE');
 const verify=createHostVerifier({authorize:(grantId,bound)=>authority.authorize(grantId,bound),consumeNonce});
 return Object.freeze({
  async resolveCaller({credentials,request,deadline}){
   const organizationId=header(request,'X-Organization-Id'),projectId=header(request,'X-Project-Id'),grantId=header(request,'X-Browser-Grant-Id'),hostId=header(request,'X-Browser-Host-Id');
   for(const id of[organizationId,projectId,grantId,hostId])c.validate(c.id,id);
   const principal=c.actor(await resolvePrincipal({credentials,organizationId,projectId,deadline}));
   if(principal.organizationId!==organizationId||principal.projectId!==projectId)c.deny('FORBIDDEN');
   const grant=await repository.get({grantId,organizationId,projectId},{signal:deadline.signal});
   if(!grant||grant.hostId!==hostId)c.deny('PERMISSION_REQUIRED');
   const bound=c.binding({principal,hostId,grantId,hostKeyFingerprint:grant.hostKeyFingerprint});await authority.authorize(grantId,bound,{signal:deadline.signal});return bound;
  },
  async verifyHost({bound,request,method,path,body}){
   return verify({proof:header(request,'X-Browser-Host-Proof'),grantId:header(request,'X-Browser-Grant-Id'),bound,method,path,body});
  },
 });
}
module.exports={createBrowserHttpIdentity};
