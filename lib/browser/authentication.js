'use strict';
const c=require('./contracts');
const {readBrowserPageState:readPageState}=require('./pageState');
const {describeElement}=require('./observations');

// Called inside the worker by protected runtime composition. credentialAccess
// supplies only the exact consumed credential; no passwords in MCP arguments.
function createAuthentication({page,observations,network,credentialAccess,warnings=new Set(),onStage=()=>{}}={}){
  if(!page||!observations||!network||typeof credentialAccess!=='function')c.deny('UNAVAILABLE');
  return async function authenticate(request,{proof,decision,recipients},deadline){
    c.parseTool('browser_authenticate',request);
    if(decision.sessionId!==request.sessionId||decision.operationId!==request.actionId||decision.operationDigest!==c.digest(request))c.deny('PERMISSION_REQUIRED');
    const {observationId,fields,submitRef}=request;
    const generic=Array.isArray(fields);
    const bindings=generic?fields.map((f,i)=>({ref:f.ref,key:'field_'+i})):Object.entries(fields).map(([key,ref])=>({ref,key:key==='passwordRef'?'password':'username'}));
    const frame=observations.page;
    const origin=new URL(frame.url()).origin;
    if(!recipients.includes(origin)||c.digest(recipients)!==c.digest(decision.recipients))c.deny('PERMISSION_REQUIRED');
    onStage('auth_page');const state=await require('./verification').waitForVerification(frame,deadline);
    // Access-code/MFA/invitation labels describe the page; they are not a workflow veto.
    // Legacy login keeps its historical contract. CAPTCHA is still human-operated.
    if(state.verification==='pending')c.deny('VERIFICATION_PENDING');
    if(state.verification==='failed')c.deny('VERIFICATION_FAILED');
    if(state.challenge&&(!generic||state.accessGate==='captcha'))c.deny('HUMAN_REQUIRED');
    const refs=[...bindings.map(f=>f.ref),...(submitRef?[submitRef]:[])];if(new Set(refs).size!==refs.length)c.deny('INVALID_INPUT');
    async function targets(){
      const submit=submitRef?await observations.resolve(observationId,submitRef):null,handles={};
      if(submit){const meta=await submit.evaluate(describeElement);
        if(!['button','input','a'].includes(meta.tag)&&!['button','link'].includes(meta.role))c.deny('UNSUPPORTED');
        if(await submit.evaluate(el=>el.type==='file'||el.hasAttribute('download')))c.deny('UNSUPPORTED');
      }
      for(const {key,ref} of bindings){
        const handle=await observations.resolve(observationId,ref),kind=await handle.evaluate(el=>({tag:el.tagName,type:el.type,editable:el.isContentEditable,autocomplete:el.autocomplete||''}));
        if(generic){
          const input=kind.tag==='INPUT'&&!['hidden','file','button','submit','reset','image','checkbox','radio','range','color'].includes(kind.type);
          if(!input&&!['TEXTAREA','SELECT'].includes(kind.tag)&&!kind.editable)c.deny('UNSUPPORTED');
        }else{
          if(kind.tag!=='INPUT'||(key==='password'?kind.type!=='password':!['text','email','tel'].includes(kind.type))||/one-time-code|cc-/.test(kind.autocomplete))c.deny('PROTECTED_INPUT_REQUIRED');
          if(!await submit.evaluate((button,input)=>button.ownerDocument===input.ownerDocument&&button.form===input.form,handle))c.deny('STALE_REFERENCE');
        }
        handles[key]=handle;
      }
      // The live transport guard checks redirects and newly discovered API origins.
      // No guessed endpoint or requirement for all controls to belong to one form.
      if(submit&&!generic){const destination=await submit.evaluate(el=>el.getAttribute('formaction')?new URL(el.getAttribute('formaction'),el.baseURI).href:el.form?.action||location.href);
        const url=new URL(destination);if(url.protocol!=='https:'||!recipients.includes(url.origin))c.deny('RECIPIENT_PERMISSION_REQUIRED');}
      return {submit,handles};
    }
    onStage('auth_targets');await targets();
    onStage('auth_private_transition');
    if(network.state().phase==='public')await deadline.run(()=>network.enterPrivate(proof,decision));
    else await deadline.run(()=>network.addRecipients(proof,decision));
    await targets(); // drain or owner interaction may have changed the DOM
    onStage('auth_credentials');return credentialAccess({credentialRef:request.credentialRef,sessionId:request.sessionId,origin,recipients},async secret=>{
      require('./fieldInput').validBuffers(secret);
      if(generic&&(Object.keys(secret).length!==bindings.length||bindings.some(f=>!Buffer.isBuffer(secret[f.key]))))c.deny('INVALID_INPUT');
      network.startAuthentication({operationId:request.actionId,origins:recipients,expiresAt:Date.now()+Math.min(30000,deadline.remaining())});
      try{
        onStage('auth_fill');for(const {key} of bindings){
          const current=await targets();
          await deadline.run(()=>current.handles[key].evaluate((el,value)=>{
            if(el.isContentEditable)el.textContent=value;
            else {const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);}
            el.dispatchEvent(new Event('input',{bubbles:true,composed:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
          },secret[key].toString('utf8')));
        }
        onStage('auth_submit');const current=await targets();if(current.submit)await deadline.run(()=>current.submit.click());
        // Allow selected XHR/native requests to enter interception before closing
        // the transport transaction. Never repeat a click after a timeout.
        onStage('auth_settle');await require('./settle').settlePage(page,deadline,{pending:()=>network.state().pending,warnings});
        onStage('auth_result');const outcome=await deadline.run(()=>frame.evaluate(readPageState));
        return {state:outcome.credentialsRejected?'credentials_rejected':generic?(submitRef?'form_submitted':'input_applied'):'login_submitted',evidenceIds:[]};
      }finally{network.endAuthentication();await observations.clear();}
    });
  };
}
module.exports={createAuthentication};
