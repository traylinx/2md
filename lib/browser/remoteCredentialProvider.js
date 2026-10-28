'use strict';
const c=require('./contracts');
const {createCompletionSigner}=require('./completionProof');
// Adapter for the existing paired loopback form. Never exposed to MCP.
// No local credential storage, website catalogue or model approval path.
function createRemoteCredentialProvider({client,bound,grantId,privateKey,verifyOwner,now=Date.now}={}){
 if(typeof client?.protectedCall!=='function'||typeof verifyOwner!=='function')c.deny('UNAVAILABLE');
 const binding=c.binding(bound),complete=createCompletionSigner({bound:binding,grantId,privateKey,verifyOwner,now});
 async function inspect(id,context){
  c.validate(c.id,id);const owner=await verifyOwner(context);
  if(!owner||owner.organizationId!==binding.principal.organizationId||owner.projectId!==binding.principal.projectId)c.deny('FORBIDDEN');
  const record=await client.protectedCall('input-inspect',{interventionId:id});
  if(record.interventionId!==id||record.ownerId!==owner.workspaceUserId||record.expiresAt<=now())c.deny('FORBIDDEN');
  return record;
 }
 return Object.freeze({inspect,async submit(id,context,input){
  c.validate(c.obj({username:{type:'string',maxLength:4096},password:c.str(4096)}),input);
  const record=await inspect(id,context),proof=await complete(record,context);
  return client.protectedCall('input-supply',{interventionId:id,username:input.username,password:input.password,proof});
 }});
}
module.exports={createRemoteCredentialProvider};
