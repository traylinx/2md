'use strict';
const c=require('./contracts'),h=require('./humanContracts');
async function createHumanHost({client}={}){
 const surface=await require('./humanSurface').createHumanSurface({client});const leases=new Map();
 return Object.freeze({async call(name,raw,options){
  if(name!=='browser_handoff')return client.call(name,raw,options);
  for(const [id,r]of leases)if(r.expiresAt<=Date.now())leases.delete(id);
  const input=c.parse(h.toolInput,raw);let saved=leases.get(input.sessionId),result;
  if(input.action==='start'){
   const caps=await client.call('get_browser_capabilities',{includeHuman:true},options);if(!caps.humanHandoffAvailable)c.deny('UNSUPPORTED');
   result=await client.protectedCall('human-begin',{sessionId:input.sessionId},options);
   {saved={...result,inputUrl:surface.urlFor(result,caps.runtimeEpoch)};leases.set(input.sessionId,saved);}
  }else{
   if(!saved)c.deny('SESSION_LOST');result=await client.protectedCall('human-state',{sessionId:input.sessionId,handoffId:saved.handoffId},options);
  }
  return c.parse(h.toolOutput,{sessionId:result.sessionId,state:result.state,expiresAt:result.expiresAt,...(result.state==='human_control'?{inputUrl:saved.inputUrl}:{})});
 },protectedCall:(...args)=>client.protectedCall(...args),async close(){leases.clear();await surface.close();await client.close?.();}});
}
const instructions=`When a genuine CAPTCHA or other human-only interaction blocks the task and humanHandoffAvailable is true, call browser_handoff with action=start for the EXISTING login_read session. Show its one-use local inputUrl to the user. This opens a viewer of that SAME remote browser, not a different browser or a model-control tool. The user clicks/types in the view, explicitly approves any required destination, and chooses Return to agent. Do not fetch/screenshot/control the viewer yourself or solve the challenge. Do not close the session while waiting. Poll browser_handoff action=status after the user returns; resume only at agent_control, then browser_observe for fresh references and continue from actual page state. Never repeat the old uncertain submission. A viewer lease lasts at most three minutes within the existing session lifetime; expiry closes it. This local viewer requires access to the MCP host loopback (remote hosts need their own trusted UI adapter). If unavailable, state that limitation honestly. Ordinary invitation codes and credentials use generic observed fields, not human takeover unless the user requests it.`;
module.exports={createHumanHost,instructions};
