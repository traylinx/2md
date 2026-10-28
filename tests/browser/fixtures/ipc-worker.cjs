'use strict';
const {createChildBridge}=require('../../../lib/browser/protectedBridge');
let count=0,initialized=false,bridge;
process.on('message',async message=>{
  if(bridge?.handle(message))return;
  const {requestId,name,input}=message;
  if(name==='initialize'){
    initialized=true;
    process.send({type:'result',requestId,result:{ready:true}});return;
  }
  if(!initialized)process.exit(2);
  if(name==='browser_authenticate'){
    bridge=createChildBridge({send:m=>process.send(m),requestId,signal:AbortSignal.timeout(2000)});
    try{
      const decision=await bridge.provider.getAuthDecision(input);
      await bridge.provider.verifyDecision(decision.proof,decision.decision);
      let buffer;
      await bridge.provider.credentialAccess({sessionId:input.sessionId,credentialRef:input.credentialRef,origin:'https://example.org',recipients:['https://example.org']},async secret=>{buffer=secret.password;if(buffer.toString()!=='OWNED_SYNTHETIC')throw Error('fixture mismatch');});
      process.send({type:'result',requestId,result:{consumed:true,wiped:buffer.every(b=>b===0)}});
    }catch{process.send({type:'error',requestId,code:'UNAVAILABLE'});}finally{bridge.close();bridge=null;}return;
  }
  if(name==='crash')process.exit(1);
  if(name==='hang')return;
  const allowed=['PATH','HOME','TMPDIR','LANG','PUPPETEER_EXECUTABLE_PATH'];
  // macOS inserts this CoreFoundation locale variable after process creation.
  if(process.platform==='darwin')allowed.push('__CF_USER_TEXT_ENCODING');
  process.send({type:'result',requestId,result:{count:++count,name,
    profileMode:require('node:fs').statSync(process.env.HOME).mode&0o777,
    environmentClean:Object.keys(process.env).every(k=>allowed.includes(k)),
    unexpectedEnvironmentKeys:Object.keys(process.env).filter(k=>!allowed.includes(k)),input}});
});
process.on('disconnect',()=>process.exit(0));
