'use strict';
const c=require('./contracts');
const {createGrantAuthority}=require('./grantAuthority');
// Read-only runtime authority. Grant creation remains in human control service.
function createRuntimeAuthority({repository,resolveCurrentAgent}={}){
 if(typeof resolveCurrentAgent!=='function')c.deny('UNAVAILABLE');
 const grants=createGrantAuthority({repository,resolveAgent:async()=>c.deny('UNSUPPORTED')});
 return Object.freeze({async authorize(bound,options={}){
  const b=c.binding(bound);if(!b.grantId)c.deny('PERMISSION_REQUIRED');
  const current=c.actor(await resolveCurrentAgent(b.principal,options));
  if(c.digest(c.identity(current))!==c.digest(c.identity(b.principal)))c.deny('PERMISSION_REQUIRED');
  return grants.authorize(b.grantId,{...b,principal:current},options);
 },async authorizeGrant(grantId,bound,options={}){
  if(bound.grantId&&bound.grantId!==grantId)c.deny('PERMISSION_REQUIRED');
  return this.authorize({...bound,grantId},options);
 }});
}
module.exports={createRuntimeAuthority};
