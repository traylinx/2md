'use strict';
const {randomUUID}=require('node:crypto');
const c=require('./contracts');
// Parent-side bridge: only the current authenticated command may request input.
function createParentBridge({sessionId,getActive,getProvider,send}={}){
  let busy=false,verified=null;
  async function handle(message){
    if(message?.type!=='protected_request')return false;
    const active=getActive();
    if(!active||message.requestId!==active.requestId||busy)return true;
    let response;busy=true;
    try{
      c.validate(c.id,message.callId);
      if(Buffer.byteLength(JSON.stringify(message))>65536)c.deny('LIMIT_EXCEEDED');
      const provider=await getProvider();if(!provider)c.deny('UNSUPPORTED');
      const input=message.input;
      if(message.method==='decision'){
        if(active.name!=='browser_authenticate'||c.digest(input)!==c.digest(active.input))c.deny('FORBIDDEN');
        response=await provider.getAuthDecision(active.input,{signal:active.signal});
      }else if(message.method==='verify'){
        if(input?.record?.sessionId!==sessionId)c.deny('FORBIDDEN');
        response=await provider.verifyDecision(input.proof,input.record,{signal:active.signal});
        if(response?.sessionId===sessionId&&response.operationId===active.input.actionId&&input.record.operationDigest===c.digest(active.input)&&c.digest(response.recipients)===c.digest(input.record.recipients))verified={requestId:active.requestId,recipients:response.recipients};
      }else if(message.method==='credential'){
        if(active.name!=='browser_authenticate'||input?.sessionId!==sessionId||input.credentialRef!==active.input.credentialRef||verified?.requestId!==active.requestId||c.digest(input.recipients)!==c.digest(verified.recipients)||!input.recipients.includes(input.origin))c.deny('FORBIDDEN');
        // Consume before crossing IPC. Provider owns/wipes original buffers.
        response=await provider.credentialAccess(input,async secret=>{
          if(!Buffer.isBuffer(secret.username)||!Buffer.isBuffer(secret.password)||secret.username.length>16384||secret.password.length>16384)c.deny('LIMIT_EXCEEDED');
          return {username:secret.username.toString('base64'),password:secret.password.toString('base64')};
        });
        verified=null;
      }else if(message.method==='operation'){
        if(input?.sessionId!==sessionId||typeof provider.requestDecision!=='function')c.deny('FORBIDDEN');
        response=await provider.requestDecision(input,{signal:active.signal});
      }else c.deny('FORBIDDEN');
      if(active.signal?.aborted||getActive()!==active)c.deny('CANCELLED');
      if(Buffer.byteLength(JSON.stringify(response))>65536)c.deny('LIMIT_EXCEEDED');
      send({type:'protected_result',requestId:active.requestId,callId:message.callId,result:response});
    }catch{
      if(getActive()===active&&!active.signal?.aborted)send({type:'protected_error',requestId:active.requestId,callId:message.callId,code:'PERMISSION_REQUIRED'});
    }finally{response=null;busy=false;}
    return true;
  }
  return {handle,clear(){verified=null;}};
}
// Child-side callbacks. Responses are accepted only for the active request/call.
function createChildBridge({send,requestId,signal,actionDeadline}){
  let waiting,closed=false;
  function call(method,input){
    if(closed||waiting||signal?.aborted)c.deny('CANCELLED');const callId=randomUUID();
    return new Promise((resolve,reject)=>{
      const abort=()=>{if(waiting?.callId===callId){waiting=null;reject(new c.BrowserError('CANCELLED'));}};
      waiting={callId,resolve:value=>{signal?.removeEventListener('abort',abort);resolve(value);},reject:error=>{signal?.removeEventListener('abort',abort);reject(error);}};
      signal?.addEventListener('abort',abort,{once:true});send({type:'protected_request',requestId,callId,method,input});
    });
  }
  function handle(message){
    if(!waiting||message?.requestId!==requestId||message.callId!==waiting.callId||!['protected_result','protected_error'].includes(message.type))return false;
    const pending=waiting;waiting=null;
    if(message.type==='protected_error')pending.reject(new c.BrowserError('PERMISSION_REQUIRED'));else pending.resolve(message.result);return true;
  }
  return {handle,close(){closed=true;if(waiting){waiting.reject(new c.BrowserError('CANCELLED'));waiting=null;}},
    provider:{getAuthDecision:request=>call('decision',request),verifyDecision:(proof,record)=>call('verify',{proof,record}),async requestDecision(record){
        if(!actionDeadline)c.deny('UNSUPPORTED');
        actionDeadline.pause(record.operationId);
        try{return await call('operation',record);}finally{if(!signal?.aborted)actionDeadline.resume(record.operationId);}
      },
      async credentialAccess(binding,use){
        const encoded=await call('credential',binding);let secret;
        try{
          if(!encoded||['username','password'].some(k=>typeof encoded[k]!=='string'||encoded[k].length>22000))c.deny('INVALID_INPUT');
          secret={username:Buffer.from(encoded.username,'base64'),password:Buffer.from(encoded.password,'base64')};encoded.username='';encoded.password='';
          return await use(secret);
        }finally{if(secret)Object.values(secret).forEach(b=>b.fill(0));}
      },
    },
  };
}
module.exports={createParentBridge,createChildBridge};
