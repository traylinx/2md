'use strict';
const {randomUUID}=require('node:crypto');
const c=require('./contracts');
const {parseTarget,resolveTarget}=require('../capture/targetPolicy');

// One instance per browser context. Only trusted runtime code receives this
// object; no MCP tool can call enterPrivate/startAuthentication directly.
function createSessionNetwork({sessionId,limits,navigation,lifetime,resolve=resolveTarget,now=Date.now,
  verifyDecision,drainPublic,requestDecision}={}) {
  c.validate(c.id,sessionId);
  if(!limits||!navigation||!lifetime)c.deny('UNAVAILABLE');
  let phase='public',generation=0,requests=0,bytes=0,recipients=new Set(),auth=null,pending=null,humanAsync=false,locked=false;
  const queue=[],counts={blocked:0,cancelled:0,denied:0,capacity:0};
  function cancelQueue(){for(const entry of queue.splice(0)){clearTimeout(entry.timer);entry.reject(new c.BrowserError('CANCELLED'));}}
  function acquire(){
    check();if(!locked){locked=true;return Promise.resolve();}
    if(queue.length>=15)c.deny('CAPACITY');
    return new Promise((resolve,reject)=>{const entry={resolve,reject,timer:null};
      entry.timer=setTimeout(()=>{const index=queue.indexOf(entry);if(index>=0)queue.splice(index,1);reject(new c.BrowserError('CANCELLED'));},Math.min(120000,lifetime.remaining()));entry.timer.unref?.();queue.push(entry);});
  }
  function release(){const entry=queue.shift();if(entry){clearTimeout(entry.timer);entry.resolve();}else locked=false;}
  function check(){lifetime.remaining();if(phase==='closing'||phase==='closed')c.deny('SESSION_LOST');}
  function origins(values){c.validate({type:'array',items:c.origin,minItems:1,maxItems:32,uniqueItems:true},values);return new Set(values);}
  async function decision(proof,record){
    if(typeof verifyDecision!=='function')c.deny('PERMISSION_REQUIRED');
    const accepted=await verifyDecision(proof,record);check();
    if(!accepted||accepted.sessionId!==sessionId||accepted.operationId!==record.operationId||c.digest(accepted.recipients)!==c.digest(record.recipients))c.deny('PERMISSION_REQUIRED');
    return accepted;
  }
  async function enterPrivate(proof,record){
    check();if(phase!=='public'||typeof drainPublic!=='function')c.deny('PERMISSION_REQUIRED');
    const allowed=origins(record.recipients);await decision(proof,record);
    // Irreversible transition happens before any await that drains public bytes.
    if(phase!=='public')c.deny('BUSY');phase='closing';generation++;
    try{await drainPublic();lifetime.remaining();recipients=allowed;phase='private';}
    catch(error){phase='closed';throw error;}
  }
  async function addRecipients(proof,record){
    check();if(phase!=='private')c.deny('PERMISSION_REQUIRED');
    const next=origins(record.recipients);await decision(proof,record);
    if(new Set([...recipients,...next]).size>32)c.deny('LIMIT_EXCEEDED');
    recipients=new Set([...recipients,...next]);if(!humanAsync)generation++;
  }
  async function enterHuman(origin,{asyncNetwork=false}={}){
    humanAsync=asyncNetwork===true;
    check();const allowed=origins([origin]);
    if(phase==='public'){if(typeof drainPublic!=='function')c.deny('UNAVAILABLE');phase='closing';generation++;try{await drainPublic();recipients=allowed;phase='private';}catch(error){phase='closed';throw error;}}
  }
  function startHumanAuthentication(operationId){if(humanAsync)auth=null;startAuthentication({operationId,origins:[...recipients],expiresAt:now()+30000});auth.human=true;}
  function startAuthentication({operationId,origins:values,expiresAt,maxRequests=16}){
    check();if(phase!=='private'||auth&&auth.expiresAt>now())c.deny('PERMISSION_REQUIRED');
    c.validate(c.id,operationId);const set=origins(values);
    if([...set].some(origin=>!recipients.has(origin))||expiresAt<=now()||expiresAt>now()+30000||!Number.isInteger(maxRequests)||maxRequests<1||maxRequests>32)c.deny('PERMISSION_REQUIRED');
    auth={operationId,origins:set,expiresAt,left:maxRequests};
  }
  async function authorizeRequest(request){
    check();const epoch=generation;
    const {url,method,type,mainFrame}=request,u=parseTarget(url);
    if(u.protocol!=='https:'||!['GET','HEAD','POST','OPTIONS'].includes(method)||['websocket','eventsource','other','media'].includes(type)||request.upload)c.deny('TARGET_DENIED');
    if(type==='document'&&navigation.mode==='origins'&&!navigation.origins.includes(u.origin))c.deny('TARGET_DENIED');
    const newRecipient=phase==='private'&&!recipients.has(u.origin);
    if(newRecipient&&typeof requestDecision!=='function')c.deny('RECIPIENT_PERMISSION_REQUIRED');
    const result=await resolve(url,{deadline:lifetime});check();
    // DNS resolution started under a broader phase must not authorize forwarding.
    if(epoch!==generation)c.deny('TARGET_DENIED');
    if(!newRecipient&&['GET','HEAD'].includes(method))return result;
    if(!newRecipient&&auth&&auth.expiresAt>now()&&auth.origins.has(u.origin)&&auth.left>0){auth.left--;return result;}
    if(typeof requestDecision!=='function')c.deny('OPERATION_PERMISSION_REQUIRED');
    if(pending)c.deny('BUSY');
    // Hash exact outbound operation; expose neither query nor body to the model.
    // The interception owner retains bounded volatile bytes while this awaits.
    const bodyBytes=Buffer.byteLength(request.body||'');if(bodyBytes>65536)c.deny('LIMIT_EXCEEDED');
    const record={sessionId,operationId:randomUUID(),operationDigest:c.digest({url,method,type,mainFrame:!!mainFrame,body:request.body||''}),
      recipients:[u.origin],expiresAt:now()+Math.min(120000,lifetime.remaining()),nonce:randomUUID()};
    pending=record;
    // A human reviewing a held request is not browser execution time. Preserve
    // only this action's remaining window, not a new window or request budget.
    const pausedAuth=auth?.human&&auth.expiresAt>now()?auth:null;
    const authRemaining=pausedAuth?pausedAuth.expiresAt-now():0;
    try{
      const proof=await requestDecision(c.frozen({...record,reason:newRecipient?'recipient':'operation',method,origin:u.origin,type,bodyBytes}));
      await decision(proof,record);
      if(pending!==record||record.expiresAt<=now()||generation!==epoch)c.deny('PERMISSION_REQUIRED');
      if(pausedAuth&&auth===pausedAuth)auth.expiresAt=now()+Math.min(authRemaining,lifetime.remaining());
      if(newRecipient){if(recipients.size>=32)c.deny('LIMIT_EXCEEDED');recipients.add(u.origin);if(!humanAsync)generation++;if(auth?.human)auth.origins.add(u.origin);}
      return result;
    }finally{if(pending===record)pending=null;}
  }
  async function allow(request){
    let acquired=false;
    try{
      check();if(++requests>limits.maxRequests)c.deny('LIMIT_EXCEEDED');
      // Serialize only permission-sensitive human requests, not ordinary reads.
      // Re-evaluate recipients, DNS and the remaining original budget AFTER wait.
      const origin=parseTarget(request.url).origin;
      if(humanAsync&&(!recipients.has(origin)||!['GET','HEAD'].includes(request.method))){await acquire();acquired=true;check();if(!humanAsync)c.deny('CANCELLED');}
      return await authorizeRequest(request);
    }catch(error){counts.blocked++;const kind=error.code==='CANCELLED'?'cancelled':['CAPACITY','LIMIT_EXCEEDED','BUSY'].includes(error.code)?'capacity':'denied';counts[kind]++;throw error;}
    finally{if(acquired)release();}
  }
  return Object.freeze({allow,enterPrivate,addRecipients,startAuthentication,enterHuman,startHumanAuthentication,
    endAuthentication(){auth=null;},
    endHuman(){humanAsync=false;auth=null;cancelQueue();},
    diagnostics(){return {...counts};},
    received(n){check();if(!Number.isFinite(n)||n<0)c.deny('LIMIT_EXCEEDED');bytes+=n;if(bytes>limits.maxTrafficBytes)c.deny('LIMIT_EXCEEDED');},
    close(){phase='closed';generation++;auth=null;pending=null;humanAsync=false;cancelQueue();recipients.clear();},
    state(){return {phase,requests,bytes,pending:!!pending||queue.length>0||(humanAsync&&locked)};},
  });
}
module.exports={createSessionNetwork};
