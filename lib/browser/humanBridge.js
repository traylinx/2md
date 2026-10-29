'use strict';
const c=require('./contracts');
const {createChildBridge}=require('./protectedBridge');
// This channel can ONLY request/verify network consent during a current human
// lease. It cannot obtain credentials or inherit an agent command's permission.
function createHumanParentBridge({sessionId,getLease,getProvider,send}){
 let busy=false,record=null;
 async function handle(message){
  if(message?.type!=='human_protected_request')return false;
  const lease=getLease();
  if(!lease||lease.signal.aborted||message.requestId!=='human:'+lease.handoffId)return true;
  const reply=(type,value)=>{if(getLease()===lease&&!lease.signal.aborted)send({type,requestId:message.requestId,callId:message.callId,...(type==='human_protected_result'?{result:value}:{code:value})});};
  if(busy){reply('human_protected_error','BUSY');return true;}
  busy=true;
  try{
   c.validate(c.id,message.callId);if(Buffer.byteLength(JSON.stringify(message))>65536)c.deny('LIMIT_EXCEEDED');
   const provider=await getProvider();const input=message.input;
   const fresh=async()=>{if(getLease()!==lease||lease.signal.aborted)c.deny('CANCELLED');if(await provider?.verifyHuman?.({sessionId,handoffId:lease.handoffId})!==true)c.deny('FORBIDDEN');};
   await fresh();let result;
   if(message.method==='operation'){
    const next=c.parse(require('./operationBroker').requestSchema,input);
    if(next.sessionId!==sessionId||record)c.deny('FORBIDDEN');record=next;
    try{result=await provider.requestDecision(next,{signal:lease.signal});}catch(error){record=null;throw error;}
   }else if(message.method==='verify'){
    if(!record||input?.record?.sessionId!==sessionId)c.deny('FORBIDDEN');
    const exact=c.parse(require('./operationBroker').decisionSchema,Object.fromEntries(Object.keys(require('./operationBroker').decisionSchema.properties).map(k=>[k,record[k]])));
    if(c.digest(input.record)!==c.digest(exact))c.deny('FORBIDDEN');
    try{result=await provider.verifyDecision(input.proof,input.record,{signal:lease.signal});}finally{record=null;}
   }else c.deny('FORBIDDEN');
   require('./authorityScope').after();await fresh();if(Buffer.byteLength(JSON.stringify(result))>65536)c.deny('LIMIT_EXCEEDED');reply('human_protected_result',result);
  }catch(error){reply('human_protected_error',c.publicError(error).body.error);}
  finally{busy=false;}
  return true;
 }
 return {handle:message=>require('./authorityScope').run(()=>handle(message)),clear(){record=null;}};
}
function createHumanChildBridge({handoffId,send,signal,getActionDeadline}){
 const paused=new Map();
 const bridge=createChildBridge({requestId:'human:'+handoffId,signal,
  send:message=>send({...message,type:'human_protected_request'}),
  actionDeadline:{pause(id){const d=getActionDeadline();if(d){d.pause(id);paused.set(id,d);}},resume(id){const d=paused.get(id);paused.delete(id);if(d&&!d.signal.aborted)d.resume(id);}},
 });
 return {provider:{requestDecision:bridge.provider.requestDecision,verifyDecision:bridge.provider.verifyDecision},
  handle(message){return ['human_protected_result','human_protected_error'].includes(message?.type)&&bridge.handle({...message,type:message.type.replace('human_','')});},
  close(){bridge.close();paused.clear();}};
}
module.exports={createHumanParentBridge,createHumanChildBridge};
