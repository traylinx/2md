'use strict';

const {randomUUID} = require('node:crypto');
const {Deadline} = require('../capture/deadline');
const {ActionDeadline}=require('./actionDeadline');
const c = require('./contracts');

// Session orchestration only. Real containment/egress and result sanitization are
// mandatory injected boundaries, not permissive defaults. No production wiring.
function createSessionManager({authorize,createWorker,validateOutput,now=Date.now,
  runtimeEpoch=randomUUID(),privateEnabled=false,humanEnabled=false,maxReceipts=256,autoSweep=true}={}) {
  if ([authorize,createWorker,validateOutput].some(fn=>typeof fn!=='function') ||
      !Number.isInteger(maxReceipts) || maxReceipts<1 || maxReceipts>256) c.deny('UNAVAILABLE');
  c.validate(c.id,runtimeEpoch);
  const sessions=new Map(),receipts=new Map();
  let slot,stopped=false,quarantined=false,sweeping=false;
  function epoch(input) {if(input.runtimeEpoch!==runtimeEpoch)c.deny('SESSION_LOST');}
  function key(bound,input) {return `${c.scope(bound)}:${input.actionId}`;}
  function get(bound,sessionId) {
    const s=sessions.get(sessionId);
    if (!s) c.deny('SESSION_LOST');
    if (s.scope!==c.scope(bound)) c.deny('FORBIDDEN');return s;
  }
  function purge() {
    for (const [k,r] of receipts) if (r.until<=now() && !['running','needs_input'].includes(r.state)) receipts.delete(k);
    for (const [id,s] of sessions) if (['closed','failed','expired','revoked'].includes(s.state) && s.expiresAt<=now() && s!==slot) sessions.delete(id);
  }
  function previous(bound,name,input) {
    const r=receipts.get(key(bound,input));
    if (!r) return null;
    if (r.digest!==c.digest({name,input})) c.deny('IDEMPOTENCY_CONFLICT');
    return r;
  }
  function reserve(bound,name,input,s) {
    purge();const scope=c.scope(bound);
    // Global bound protects against many caller identities on the one-slot pilot.
    if (receipts.size>=1024 || [...receipts.values()].filter(r=>r.scope===scope).length>=maxReceipts) c.deny('CAPACITY');
    const r={scope,digest:c.digest({name,input}),actionId:input.actionId,sessionId:s.id,
      state:'running',until:s.expiresAt};receipts.set(key(bound,input),r);return r;
  }
  function view(r) {
    // Receipt recovery returns only sanitized output; no underlying exception.
    return c.frozen({runtimeEpoch,actionId:r.actionId,sessionId:r.sessionId,state:r.state,
      ...(r.output===undefined?{}:{output:r.output}),...(r.error?{error:r.error}:{})});
  }
  async function fresh(bound,s) {
    if(s?.authorityUnavailableAt!==undefined&&now()-s.authorityUnavailableAt>=30000){await end(s,'expired');c.deny('SESSION_LOST');}
    const deadline=new Deadline(5000);
    try {
      const raw=await deadline.run(()=>authorize(c.binding(bound),{signal:deadline.signal}));
      const rawGrant=Object.fromEntries(Object.keys(c.grantSchema.properties).map(k=>[k,raw?.[k]]));
      const parsed=c.parseGrant(rawGrant,now());
      // Owner provenance is repository metadata, not caller-supplied grant input.
      if(raw?.approvedByWorkspaceUserId!==undefined)c.validate(c.id,raw.approvedByWorkspaceUserId);
      const g=c.frozen({...parsed,...(raw?.approvedByWorkspaceUserId?{approvedByWorkspaceUserId:raw.approvedByWorkspaceUserId}:{})});
      if (raw?.revoked || raw?.policyVersion!==c.POLICY || c.digest(g.agent)!==c.digest(c.identity(bound.principal)) ||
          g.hostId!==bound.hostId || c.fingerprint(g.hostPublicKey)!==bound.hostKeyFingerprint) c.deny('PERMISSION_REQUIRED');
      if (s && (s.grantId!==g.grantId || s.grantDigest!==c.digest(g))) c.deny('PERMISSION_REQUIRED');
      if (s){s.checkedAt=now();delete s.authorityUnavailableAt;delete s.nextAuthorityCheckAt;}return g;
    } catch(error) {if(s){if(error.code==='AUTHORITY_UNAVAILABLE'){s.authorityUnavailableAt??=now();s.nextAuthorityCheckAt=now()+5000;}else await end(s,'revoked');}throw error;}
    finally {deadline.close();}
  }
  async function dispose(handle) {
    if (!handle) return;
    const deadline=new Deadline(5000);
    try {
      if (typeof handle.dispose!=='function') c.deny('UNAVAILABLE');
      await deadline.run(()=>handle.dispose({signal:deadline.signal}));
    } catch {quarantined=true;c.deny('UNAVAILABLE');}
    finally {deadline.close();}
  }
  async function end(s,state='closed') {
    if (s.ending) return s.ending;
    s.state=state;s.controller.abort();if(s.handoff){s.handoff.state='expired';s.lastHandoff=s.handoff;s.handoff=null;}
    for(const r of receipts.values()) if(r.sessionId===s.id) {
      // Closed sessions retain receipt identity, never retained private page bytes.
      r.output=undefined;
      if(['running','needs_input'].includes(r.state)){r.state='outcome_unknown';r.error='SESSION_LOST';}
    }
    s.ending=(async()=>{
      try { await dispose(s.worker); }
      finally {
        // An unresolved creation still owns its slot; its late handle must be disposed.
        if (!s.creating && !quarantined && slot===s) slot=null;
      }
    })();
    return s.ending;
  }
  function live(s) {
    if (!['opening','active','needs_input'].includes(s.state)) c.deny('SESSION_LOST');
    if (s.handoff&&now()>=s.handoff.expiresAt)c.deny('SESSION_LOST');
    if (now()>=s.expiresAt || now()-s.heartbeatAt>=60000 ||
        (!s.handoff && s.state!=='needs_input' && now()-s.lastActivity>=s.limits.idleMs)) c.deny('SESSION_LOST');
  }
  function target(g,value) {
    const canonical=c.parseTool('browser_open',{runtimeEpoch,actionId:'scope-check',url:value,purpose:'Scope check',mode:'public'}).url;
    if (g.navigation.mode==='origins' && !g.navigation.origins.includes(new URL(canonical).origin)) c.deny('TARGET_DENIED');
  }
  async function output(name,result,s) {
    const clean=await validateOutput(name,result,{mode:s.mode});
    const serialized=JSON.stringify(clean);
    if (serialized===undefined || Buffer.byteLength(serialized)>s.limits.maxResultBytes) c.deny('LIMIT_EXCEEDED');
    return c.frozen(JSON.parse(serialized));
  }
  async function open(bound,raw) {
    const input=c.parseTool('browser_open',raw);epoch(input);
    if(stopped||quarantined)c.deny('UNAVAILABLE');
    const g=await fresh(bound);
    const old=previous(bound,'browser_open',input);if(old)return view(old);
    if (input.mode==='login_read' && !privateEnabled) c.deny('UNSUPPORTED');
    if(!g.operations.includes(input.mode==='public'?'browser:public':'browser:login_read'))c.deny('PERMISSION_REQUIRED');
    target(g,input.url);if(slot)c.deny('CAPACITY');
    const s={id:randomUUID(),scope:c.scope(bound),bound:c.binding(bound),mode:input.mode,
      state:'opening',grantId:g.grantId,grantDigest:c.digest(g),limits:g.limits,
      expiresAt:Math.min(now()+g.limits.absoluteMs,g.expiresAt),lastActivity:now(),heartbeatAt:now(),checkedAt:now(),
      actions:0,controller:new AbortController(),creating:true,busy:true};
    const r=reserve(bound,'browser_open',input,s);sessions.set(s.id,s);slot=s;
    const deadline=new ActionDeadline(s.limits.actionMs,s.controller.signal);
    let notify;const pending=new Promise(resolve=>{notify=resolve;});
    const command={r,deadline,notify,opening:true};s.command=command;
    // The factory receives no Sentinel token, principal or host private key.
    const creation=Promise.resolve().then(()=>createWorker({sessionId:s.id,url:input.url,mode:s.mode,
      limits:s.limits,navigation:g.navigation,expiresAt:s.expiresAt,signal:deadline.signal,onLost:()=>end(s,'failed')},{bound:s.bound,grantId:s.grantId}));
    const delivery=creation.then(async handle=>{
      s.creating=false;
      if (deadline.signal.aborted || !['opening','needs_input'].includes(s.state)) {
        await dispose(handle); if(!quarantined&&slot===s)slot=null;c.deny('SESSION_LOST');
      }
      s.worker=handle;
      if (typeof handle?.execute!=='function' || typeof handle?.dispose!=='function') c.deny('UNAVAILABLE');
      return handle;
    },error=>{
      s.creating=false;
      if(!['opening','needs_input'].includes(s.state) && !quarantined && slot===s)slot=null;
      throw error;
    });
    const completion=(async()=>{
    try {
      await deadline.run(()=>delivery);await fresh(bound,s);deadline.remaining();live(s);
      s.state='active';r.state='succeeded';r.output={state:'active'};
    } catch(error) {
      r.state='failed';r.error=c.publicError(error).body.error;await end(s,'failed');
    } finally {deadline.close();s.busy=false;if(s.command===command)s.command=null;}
    return view(r);
    })();
    return Promise.race([completion,pending]);
  }
  async function execute(bound,name,raw,human=false) {
    const input=human?c.parse(require('./humanContracts').command,raw):c.parseTool(name,raw);
    if(!['browser_navigate','browser_act','browser_authenticate',...(human?['human_input']:[])].includes(name))c.deny('UNSUPPORTED');
    epoch(input);const s=get(bound,input.sessionId);await fresh(bound,s);
    if(human)checkHuman(s,input);else if(s.handoff)c.deny('BUSY');
    const old=previous(bound,name,input);if(old)return view(old);
    try {live(s);}catch(e){await end(s,'expired');throw e;}
    if(name==='browser_navigate' && input.target.url) {
      // Static ceiling here; per-hop public-IP/private-phase policy stays in worker.
      const g=await fresh(bound,s);target(g,input.target.url);
    }
    // Recheck AFTER the final await: another command may now own the session.
    const raced=previous(bound,name,input);if(raced)return view(raced);
    live(s);
    if(s.busy||s.state==='needs_input'||s.handoff?.pending)c.deny('BUSY');
    if(name==='browser_authenticate' && (!privateEnabled||s.mode!=='login_read'))c.deny('UNSUPPORTED');
    if(s.actions>=s.limits.maxActions){await end(s,'expired');c.deny('LIMIT_EXCEEDED');}
    const r=reserve(bound,name,input,s);if(human)s.handoff.actionId=input.actionId;s.busy=true;s.actions++;s.lastActivity=now();
    const deadline=new ActionDeadline(s.limits.actionMs,s.controller.signal);
    let notify;const pending=new Promise(resolve=>{notify=resolve;});
    const command={r,deadline,notify};s.command=command;
    const completion=(async()=>{
    try {
      const result=await deadline.run(()=>s.worker.execute(name,input,{signal:deadline.signal}));
      const clean=await deadline.run(()=>output(name,result,s));
      // The browser operation completed. Preserve its receipt before a remote
      // permission outage can hide the response; release it only after fresh auth.
      r.output=clean;r.state='succeeded';require('./authorityScope').after();
      await fresh(bound,s);deadline.remaining();live(s);
    } catch(error) {
      if(error.code==='AUTHORITY_UNAVAILABLE'&&r.state==='succeeded')throw error;
      r.error=c.publicError(error).body.error;
      if(['STALE_REFERENCE','PROTECTED_INPUT_REQUIRED','OPERATION_PERMISSION_REQUIRED','HUMAN_REQUIRED','VERIFICATION_PENDING','VERIFICATION_FAILED'].includes(r.error)) {
        // Trusted worker pre-action rejection: nothing executed, fresh observation
        // remains possible. All ambiguous/process/network failures still close.
        r.state='failed';
      } else {r.state='outcome_unknown';await end(s,'failed');}
    } finally {deadline.close();s.busy=false;if(s.command===command)s.command=null;}
    return view(r);
    })();
    return Promise.race([completion,pending]);
  }
  async function suspend(bound,pending){
    const {sessionId,interventionId,reason,expiresAt}=pending;
    c.validate(c.id,interventionId);
    if(!['recipient_consent','operation_consent'].includes(reason)||!Number.isFinite(expiresAt))c.deny('INVALID_INPUT');
    const s=get(bound,sessionId);await fresh(bound,s);live(s);
    const command=s.command;
    if(s.handoff&&!command&&s.state==='active'){
      if(s.handoff.pending)c.deny('BUSY');
      checkHuman(s,{handoffId:s.handoff.id});
      if(expiresAt<=now()||expiresAt>s.expiresAt||expiresAt>now()+120000)c.deny('PERMISSION_REQUIRED');
      s.handoff.pending={interventionId,expiresAt};return {paused:true};
    }
    if(!command||!s.busy||!['active','opening'].includes(s.state)||command.r.state!=='running')c.deny('BUSY');
    if(expiresAt<=now()||expiresAt>s.expiresAt||expiresAt>now()+120000)c.deny('PERMISSION_REQUIRED');
    command.deadline.pause(interventionId);command.interventionId=interventionId;
    s.state='needs_input';command.r.state='needs_input';
    command.r.output=c.frozen({state:'needs_input',interventionId,reason,expiresAt});
    command.notify(view(command.r));return {paused:true};
  }
  async function resume(bound,{sessionId,interventionId}){
    const s=get(bound,sessionId);await fresh(bound,s);live(s);const command=s.command;
    if(!command||s.state!=='needs_input'||command.interventionId!==interventionId||command.r.output?.expiresAt<=now())c.deny('PERMISSION_REQUIRED');
    command.deadline.resume(interventionId);command.interventionId=null;
    command.r.state='running';command.r.output=undefined;s.state=command.opening?'opening':'active';s.lastActivity=now();return {resumed:true};
  }
  async function resumePending(bound,input){const s=get(bound,input.sessionId);if(s.handoff?.pending?.interventionId===input.interventionId){s.handoff.pending=null;return {resumed:true};}if(s.command?.interventionId===input.interventionId&&s.state==='needs_input')return resume(bound,input);return {resumed:false};}
  async function query(bound,name,raw) {
    if(!['browser_observe','browser_extract'].includes(name))c.deny('UNSUPPORTED');
    const input=c.parseTool(name,raw),s=get(bound,input.sessionId);await fresh(bound,s);
    try{live(s);}catch(error){await end(s,'expired');throw error;}
    if(s.handoff||s.busy||s.state==='needs_input')c.deny('BUSY');
    if(s.actions>=s.limits.maxActions){await end(s,'expired');c.deny('LIMIT_EXCEEDED');}
    s.busy=true;s.actions++;s.lastActivity=now();
    const deadline=new Deadline(s.limits.actionMs,s.controller.signal);
    try{
      const result=await deadline.run(()=>s.worker.execute(name,input,{signal:deadline.signal}));
      const clean=await deadline.run(()=>output(name,result,s));
      require('./authorityScope').after();await fresh(bound,s);deadline.remaining();live(s);return clean;
    }catch(error){if(error.code!=='AUTHORITY_UNAVAILABLE')await end(s,'failed');throw error;}
    finally{deadline.close();s.busy=false;}
  }
  async function status(bound,raw) {
    const input=c.parseTool('browser_action_status',raw);epoch(input);await fresh(bound);
    const r=receipts.get(key(bound,input));
    if (!r || r.until<=now()) return {runtimeEpoch,actionId:input.actionId,state:'outcome_unknown'};
    if(input.sessionId && input.sessionId!==r.sessionId)c.deny('FORBIDDEN');
    const s=get(bound,r.sessionId);await fresh(bound,s);
    if(['active','opening','needs_input'].includes(s.state)) {
      try {live(s);}catch {await end(s,'expired');}
    }
    return view(r);
  }
  async function close(bound,sessionId) {
    c.validate(c.id,sessionId);const s=get(bound,sessionId);
    // Closing one's own session remains possible after its grant is revoked.
    await end(s);return {sessionId,state:'closed'};
  }
  async function describe(bound,sessionId){
    c.validate(c.id,sessionId);const s=get(bound,sessionId),g=await fresh(bound,s);
    try{live(s);}catch(error){await end(s,'expired');throw error;}
    return c.frozen({sessionId:s.id,mode:s.mode,expiresAt:s.expiresAt,grantId:s.grantId,
      ownerId:g.approvedByWorkspaceUserId||null,state:s.state,handoffActive:!!s.handoff});
  }
  async function heartbeat(bound,sessionId) {
    const s=get(bound,sessionId);await fresh(bound,s);
    try {live(s);}catch(e){await end(s,'expired');throw e;}
    s.heartbeatAt=now();return {sessionId,state:s.state};
  }

  function checkHuman(s,input){
    if(!humanEnabled||!s.handoff||s.handoff.id!==input.handoffId||s.handoff.expiresAt<=now())c.deny('SESSION_LOST');
    live(s);return s.handoff;
  }
  async function verifyHuman(bound,input){
    const s=get(bound,input.sessionId);await fresh(bound,s);checkHuman(s,input);return true;
  }
  function humanView(s,h){
    const r=h.actionId?receipts.get(key(s.bound,{actionId:h.actionId})):null;
    return {sessionId:s.id,handoffId:h.id,state:h.state,expiresAt:h.expiresAt,...(r?{action:view(r)}:{}),...(h.pending?{interventionId:h.pending.interventionId}:{})};
  }
  async function beginHuman(bound,sessionId,{viewerVersion}={}){
    if(!humanEnabled||!privateEnabled)c.deny('UNSUPPORTED');
    const s=get(bound,sessionId),g=await fresh(bound,s);live(s);
    if(s.mode!=='login_read'||!g.operations.includes('browser:login_read')||!g.approvedByWorkspaceUserId)c.deny('PERMISSION_REQUIRED');
    if(s.handoff)return humanView(s,s.handoff);
    if(s.busy||s.state!=='active')c.deny('BUSY');
    s.handoff={id:randomUUID(),state:'human_control',expiresAt:Math.min(s.expiresAt,now()+180000),frames:0,viewerVersion};s.busy=true;s.lastActivity=now();
    const deadline=new Deadline(s.limits.actionMs,s.controller.signal);
    try{await deadline.run(()=>s.worker.execute('human_begin',{sessionId:s.id,handoffId:s.handoff.id,asyncNetwork:viewerVersion===3},{signal:deadline.signal}));await fresh(bound,s);live(s);return humanView(s,s.handoff);}
    catch(error){await end(s,'failed');throw error;}finally{s.busy=false;deadline.close();}
  }
  async function activateHuman(bound,input){
    const s=get(bound,input.sessionId);await fresh(bound,s);const h=checkHuman(s,input);
    if(![2,3].includes(h.viewerVersion))c.deny('UNSUPPORTED');
    // One activation only; reload/status cannot extend the lease or revive it.
    if(h.activatedAt===undefined){h.activatedAt=now();h.expiresAt=Math.min(s.expiresAt,now()+300000);}
    return humanView(s,h);
  }
  async function humanState(bound,input){
    const s=get(bound,input.sessionId);await fresh(bound,s);
    const h=s.handoff||s.lastHandoff;if(!h||h.id!==input.handoffId)c.deny('SESSION_LOST');
    if(h.state==='human_control'){try{checkHuman(s,input);}catch{await end(s,'expired');}}
    return humanView(s,h);
  }
  async function humanFrame(bound,input){
    const s=get(bound,input.sessionId);await fresh(bound,s);const h=checkHuman(s,input);
    if(s.busy||s.state!=='active'||h.pending)c.deny('BUSY');if(h.frames>=120)c.deny('LIMIT_EXCEEDED');h.frames++;s.busy=true;s.lastActivity=now();
    const deadline=new Deadline(s.limits.actionMs,s.controller.signal);
    try{const result=await deadline.run(()=>s.worker.execute('human_frame',input,{signal:deadline.signal}));await fresh(bound,s);checkHuman(s,input);if(h.pending)c.deny('BUSY');return c.parse(require('./humanContracts').frame,result);}
    catch(error){if(!['BUSY','STALE_REFERENCE'].includes(error.code))await end(s,'failed');throw error;}finally{s.busy=false;deadline.close();}
  }
  async function finishHuman(bound,input){
    const s=get(bound,input.sessionId);await fresh(bound,s);
    if(s.lastHandoff?.id===input.handoffId&&s.lastHandoff.state==='agent_control')return {state:'agent_control'};
    const h=checkHuman(s,input);if(s.busy||s.state!=='active'||h.pending)c.deny('BUSY');s.busy=true;
    const deadline=new Deadline(s.limits.actionMs,s.controller.signal);
    try{await deadline.run(()=>s.worker.execute('human_end',input,{signal:deadline.signal}));await fresh(bound,s);checkHuman(s,input);h.state='agent_control';s.lastHandoff=h;s.handoff=null;s.lastActivity=now();return {state:'agent_control'};}
    catch(error){await end(s,'failed');throw error;}finally{s.busy=false;deadline.close();}
  }
  async function sweep() {
    if(sweeping)return;sweeping=true;
    try {
      for(const s of sessions.values()) if(['active','opening','needs_input'].includes(s.state)) {
        try {live(s);if(now()-s.checkedAt>=10000&&now()>=(s.nextAuthorityCheckAt||0))await fresh(s.bound,s);}
        catch(error) {if(error.code!=='AUTHORITY_UNAVAILABLE')await end(s,'expired').catch(()=>{});}
      }
      purge();
    } finally {sweeping=false;}
  }
  const timer=autoSweep?setInterval(()=>{void sweep().catch(()=>{});},1000):null;timer?.unref?.();
  return Object.freeze({runtimeEpoch,open,execute,query,status,close,describe,heartbeat,sweep,suspend,resume,resumePending,beginHuman,activateHuman,humanState,humanFrame,finishHuman,verifyHuman,humanInput:(b,i)=>execute(b,'human_input',i,true),
    async shutdown(){stopped=true;clearInterval(timer);await Promise.all([...sessions.values()].map(s=>end(s).catch(()=>{})));},
    diagnostics(){return {active:slot?1:0,quarantined,receipts:receipts.size,sessions:sessions.size};},
  });
}
module.exports={createSessionManager};
