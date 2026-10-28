'use strict';
const c=require('./contracts');
const {readPageState}=require('../capture/publicPageState');
const {describeElement}=require('./observations');

// Called inside the worker by protected runtime composition. credentialAccess
// supplies only the exact consumed credential; no passwords in MCP arguments.
function createAuthentication({page,observations,network,credentialAccess}={}){
  if(!page||!observations||!network||typeof credentialAccess!=='function')c.deny('UNAVAILABLE');
  return async function authenticate(request,{proof,decision,recipients},deadline){
    c.parseTool('browser_authenticate',request);
    if(decision.sessionId!==request.sessionId||decision.operationId!==request.actionId||decision.operationDigest!==c.digest(request))c.deny('PERMISSION_REQUIRED');
    const {observationId,fields,submitRef}=request;
    const frame=observations.page;
    const origin=new URL(frame.url()).origin;
    if(!recipients.includes(origin)||c.digest(recipients)!==c.digest(decision.recipients))c.deny('PERMISSION_REQUIRED');
    const state=await frame.evaluate(readPageState);
    if(state.challenge)c.deny('HUMAN_REQUIRED');
    const refs=[...Object.values(fields),submitRef];if(new Set(refs).size!==refs.length)c.deny('INVALID_INPUT');
    async function targets(){
      const submit=await observations.resolve(observationId,submitRef),handles={};
      const meta=await submit.evaluate(describeElement);
      if(!['button','input'].includes(meta.tag)&&meta.role!=='button')c.deny('UNSUPPORTED');
      if(/\b(delete|remove|send|purchase|buy|pay|subscribe|logout|publish|save|transfer)\b/i.test(meta.name))c.deny('OPERATION_PERMISSION_REQUIRED');
      for(const [field,ref] of Object.entries(fields)){
        const handle=await observations.resolve(observationId,ref),kind=await handle.evaluate(el=>({tag:el.tagName,type:el.type,autocomplete:el.autocomplete||''}));
        if(kind.tag!=='INPUT'||(field==='passwordRef'?kind.type!=='password':!['text','email','tel'].includes(kind.type))||/one-time-code|cc-/.test(kind.autocomplete))c.deny('PROTECTED_INPUT_REQUIRED');
        // Same DOM/frame and form identity, including form-less SPA controls.
        if(!await submit.evaluate((button,input)=>button.ownerDocument===input.ownerDocument&&button.form===input.form,handle))c.deny('STALE_REFERENCE');
        handles[field]=handle;
      }
      const destination=await submit.evaluate(el=>el.getAttribute('formaction')?new URL(el.getAttribute('formaction'),el.baseURI).href:el.form?.action||location.href);
      const url=new URL(destination);if(url.protocol!=='https:'||!recipients.includes(url.origin))c.deny('RECIPIENT_PERMISSION_REQUIRED');
      return {submit,handles};
    }
    await targets();
    if(network.state().phase==='public')await deadline.run(()=>network.enterPrivate(proof,decision));
    else await deadline.run(()=>network.addRecipients(proof,decision));
    await targets(); // drain or owner interaction may have changed the DOM
    return credentialAccess({credentialRef:request.credentialRef,sessionId:request.sessionId,origin,recipients},async secret=>{
      if(!Buffer.isBuffer(secret.username)||!Buffer.isBuffer(secret.password)||secret.username.length>16384||secret.password.length>16384)c.deny('INVALID_INPUT');
      network.startAuthentication({operationId:request.actionId,origins:recipients,expiresAt:Date.now()+Math.min(30000,deadline.remaining())});
      try{
        for(const [field,key]of [['usernameRef','username'],['passwordRef','password']])if(fields[field]){
          const current=await targets();
          await deadline.run(()=>current.handles[field].evaluate((el,value)=>{
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);
            el.dispatchEvent(new Event('input',{bubbles:true,composed:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
          },secret[key].toString('utf8')));
        }
        const current=await targets();await deadline.run(()=>current.submit.click());
        // Allow selected XHR/native requests to enter interception before closing
        // the transport transaction. Never repeat a click after a timeout.
        await deadline.run(()=>page.waitForNetworkIdle({idleTime:500,timeout:0}));
        return {state:'login_submitted',evidenceIds:[]};
      }finally{network.endAuthentication();await observations.clear();}
    });
  };
}
module.exports={createAuthentication};
