'use strict';
const {sign}=require('node:crypto');
const c=require('./contracts');
const {AUDIENCE,schema}=require('./consent');
const {decisionSchema}=require('./operationBroker');
// Only the paired local form calls approve/cancel. Never exposed as MCP tools.
function createOperationHost({client,bound,grantId,privateKey,verifyOwner,now=Date.now}={}){
 if(typeof client?.protectedCall!=='function'||typeof verifyOwner!=='function')c.deny('UNAVAILABLE');
 const binding=c.binding(bound),busy=new Set();
 async function inspect(id,context){
  c.validate(c.id,id);const owner=await verifyOwner(context),r=await client.protectedCall('operation-inspect',{operationId:id});
  if(!owner||owner.workspaceUserId!==r.ownerId||owner.organizationId!==binding.principal.organizationId||owner.projectId!==binding.principal.projectId||r.expiresAt<=now())c.deny('FORBIDDEN');
  return c.frozen({...r,interventionId:r.operationId});
 }
 return Object.freeze({inspect,
  async approve(id,context){
   if(busy.has(id))c.deny('BUSY');busy.add(id);
   try{
    const record=await inspect(id,context),decision=Object.fromEntries(Object.keys(decisionSchema.properties).map(k=>[k,record[k]]));
    const body=c.parse(schema,{version:1,audience:AUDIENCE,grantId,principalScope:c.scope(binding),hostId:binding.hostId,...decision,issuedAt:now()});
    const payload=Buffer.from(JSON.stringify(body)).toString('base64url'),proof=payload+'.'+sign(null,Buffer.from(AUDIENCE+'.'+payload),privateKey).toString('base64url');
    return await client.protectedCall('operation-complete',{operationId:id,proof});
   }finally{busy.delete(id);}
  },
  async cancel(id,context){await inspect(id,context);return client.protectedCall('operation-cancel',{operationId:id});},
  close(){busy.clear();},
 });
}
module.exports={createOperationHost};
