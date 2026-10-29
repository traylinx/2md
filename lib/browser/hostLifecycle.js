'use strict';
const c=require('./contracts');
// One host owns its session heartbeat, not the model. Never retries an action.
function createHostLifecycle({backend,now=Date.now,autoHeartbeat=true,privateAvailable=true}={}){
 if(typeof backend?.call!=='function'||typeof backend?.protectedCall!=='function')c.deny('UNAVAILABLE');
 const sessions=new Map();let stopped=false,running=false;
 function track(result){
  if(result?.sessionId&&(result.output?.state==='active'||['running','needs_input'].includes(result.state))&&!sessions.has(result.sessionId)){
   // Runtime enforces one pilot slot. A new admitted ID supersedes stale local state.
   sessions.clear();sessions.set(result.sessionId,{ack:now(),lost:false});
  }
 }
 async function heartbeat(){
  if(stopped||running)return;running=true;
  try{for(const [sessionId,state]of sessions){
   if(state.lost)continue;
   if(now()-state.ack>=60000){state.lost=true;continue;}
   try{const reply=await backend.protectedCall('heartbeat',{sessionId},{signal:AbortSignal.timeout(10000)});
    if(reply.sessionId!==sessionId)c.deny('FORBIDDEN');state.ack=now();
   }catch(error){if(['SESSION_LOST','PERMISSION_REQUIRED','UNAUTHENTICATED','FORBIDDEN'].includes(error.code)||now()-state.ack>=60000)state.lost=true;}
  }}finally{running=false;}
 }
 const timer=autoHeartbeat?setInterval(()=>{void heartbeat().catch(()=>{});},30000):null;timer?.unref?.();
 return Object.freeze({
  async call(name,input,options){
   if(stopped)c.deny('UNAVAILABLE');if(!privateAvailable&&(['browser_credentials','browser_authenticate'].includes(name)||(name==='browser_open'&&input.mode==='login_read')))c.deny('UNSUPPORTED');const state=sessions.get(input?.sessionId);
   if(state&&(state.lost||now()-state.ack>=60000)&&!['browser_close','browser_action_status'].includes(name))c.deny('SESSION_LOST');
   let result=await backend.call(name,input,options);
   if(name==='get_browser_capabilities'&&!privateAvailable){const {ownerConnection,...rest}=result;result={...rest,available:result.available.filter(n=>!['browser_credentials','browser_authenticate'].includes(n)),permitted:result.permitted.filter(n=>!['browser_credentials','browser_authenticate'].includes(n)),credentialChannel:'unavailable',...(result.inputModes?{inputModes:[]}:{} )};}
   if(stopped){if(name==='browser_open'&&result.sessionId)await backend.call('browser_close',{sessionId:result.sessionId},{signal:AbortSignal.timeout(5000)}).catch(()=>{});c.deny('CANCELLED');}
   if(['browser_open','browser_action_status'].includes(name))track(result);
   if(name==='browser_close')sessions.delete(input.sessionId);
   return result;
  },
  protectedCall:(...args)=>backend.protectedCall(...args),heartbeat,
  async close(){if(stopped)return;stopped=true;clearInterval(timer);
   const ids=[...sessions.keys()];sessions.clear();await Promise.all(ids.map(sessionId=>backend.call('browser_close',{sessionId},{signal:AbortSignal.timeout(5000)}).catch(()=>{})));
  },
 });
}
module.exports={createHostLifecycle};
