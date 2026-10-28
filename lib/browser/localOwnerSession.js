'use strict';
const {randomBytes,createHash}=require('node:crypto');
const c=require('./contracts');
const hash=value=>createHash('sha256').update(value).digest('base64url');
const opaque=()=>randomBytes(32).toString('base64url');
// Local host adapter. control calls are signed/authenticated transport, not tools.
function createLocalOwnerSession({bound,grantId,control,authorizeOwner,now=Date.now}={}){
  const binding=c.binding(bound);c.validate(c.id,grantId);
  if(!control||typeof control.begin!=='function'||typeof control.exchange!=='function'||typeof authorizeOwner!=='function')c.deny('UNAVAILABLE');
  const pending=new Map(),sessions=new Map();
  const cookieName='traylinx_browser_owner_'+opaque().slice(0,12);
  function sweep(){for(const map of[pending,sessions])for(const [key,value]of map)if(value.expiresAt<=now())map.delete(key);}
  async function begin(origin){
    sweep();if(pending.size>=4)c.deny('CAPACITY');const base=new URL(origin);
    if(base.protocol!=='http:'||base.hostname!=='127.0.0.1'||!base.port||base.pathname!=='/'||base.search||base.hash||base.username||base.password)c.deny('INVALID_INPUT');
    const verifier=opaque(),state=opaque(),redirectUri=base.origin+'/pair/callback';
    const result=await control.begin(binding,{grantId,state,challenge:hash(verifier),redirectUri});
    if(!result||typeof result.pairingId!=='string'||result.expiresAt<=now())c.deny('UNAVAILABLE');
    sweep();if(pending.size>=4)c.deny('CAPACITY');
    pending.set(state,{pairingId:result.pairingId,verifier,expiresAt:Math.min(result.expiresAt,now()+120000)});
    return {pairingId:result.pairingId,expiresAt:result.expiresAt};
  }
  async function callback(url){
    sweep();if(url.pathname!=='/pair/callback'||[...url.searchParams.keys()].length!==2||url.searchParams.getAll('state').length!==1||url.searchParams.getAll('code').length!==1)c.deny('FORBIDDEN');
    const state=url.searchParams.get('state'),record=pending.get(state);if(!record)c.deny('FORBIDDEN');
    pending.delete(state); // uncertain exchange cannot be replayed automatically
    const result=await control.exchange(binding,{pairingId:record.pairingId,state,verifier:record.verifier,code:url.searchParams.get('code')});
    if(!result||result.hostId!==binding.hostId||result.hostKeyFingerprint!==binding.hostKeyFingerprint||result.grantId!==grantId)c.deny('FORBIDDEN');
    const owner=result.owner;
    if(!owner||owner.organizationId!==binding.principal.organizationId||owner.projectId!==binding.principal.projectId)c.deny('FORBIDDEN');
    c.validate(c.id,owner.workspaceUserId);if(await authorizeOwner({bound:binding,grantId,owner})!==true)c.deny('FORBIDDEN');
    sweep();if(sessions.size>=4)c.deny('CAPACITY');const token=opaque();sessions.set(hash(token),{owner:c.frozen({...owner}),expiresAt:now()+1800000});
    return `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=1800`;
  }
  async function ownerContext(req){
    sweep();const values=String(req.headers.cookie||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(cookieName+'='));
    if(values.length!==1)c.deny('FORBIDDEN');const token=values[0].slice(cookieName.length+1);
    if(!/^[A-Za-z0-9_-]{43}$/.test(token))c.deny('FORBIDDEN');const record=sessions.get(hash(token));if(!record)c.deny('FORBIDDEN');
    try{if(await authorizeOwner({bound:binding,grantId,owner:record.owner})!==true)c.deny('FORBIDDEN');}catch(error){sessions.delete(hash(token));throw error;}
    if(record.expiresAt<=now()||!sessions.has(hash(token)))c.deny('FORBIDDEN');return record.owner;
  }
  return Object.freeze({begin,callback,ownerContext,async isPaired(){sweep();for(const [key,record]of sessions){try{if(await authorizeOwner({bound:binding,grantId,owner:record.owner})===true)return true;}catch{}sessions.delete(key);}return false;},close(){pending.clear();sessions.clear();}});
}
module.exports={createLocalOwnerSession};
