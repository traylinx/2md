'use strict';
const childProcess=require('node:child_process');
const {Deadline}=require('../lib/capture/deadline');
const {ActionDeadline}=require('../lib/browser/actionDeadline');
const c=require('../lib/browser/contracts');
const {createChildBridge}=require('../lib/browser/protectedBridge');
const {createPublicSession}=require('../lib/browser/publicSession');
const spawn=childProcess.spawn;
childProcess.spawn=function(file,args,options){
  if(file===process.env.PUPPETEER_EXECUTABLE_PATH)options={...options,detached:false};
  return spawn.call(this,file,args,options);
};
let used=false,busy=false,browser,engine,lifetime,limits,bridge,stage='initialize';
function terminate(){
  // This child is the detached group leader. Kill only this worker and its browser.
  try{process.kill(-process.pid,'SIGKILL');}catch{process.exit(1);}
}
process.on('disconnect',terminate);
process.on('message',async message=>{
  if(bridge?.handle(message))return;
  if(message?.type!=='command'||typeof message.requestId!=='string')return;
  const {requestId,name,input}=message;
  const respond=(type,result)=>process.send?.({type,requestId,...(type==='result'?{result}:{code:result||'UNAVAILABLE'})});
  if(busy){respond('error');return;}busy=true;
  let deadline;const started=Date.now();stage=name==='initialize'?'initialize':'execute';
  try{
    if(name==='initialize'){
      if(used)c.deny('FORBIDDEN');used=true;limits=input.limits;
      if(!['public','login_read'].includes(input.mode)||!/^http:\/\/[a-zA-Z0-9.-]+:\d+$/.test(input.proxyUrl))c.deny('UNSUPPORTED');
      lifetime=new Deadline(Math.max(1,Math.min(limits.absoluteMs,input.expiresAt-Date.now())));
      lifetime.signal.addEventListener('abort',terminate,{once:true});
      deadline=new ActionDeadline(limits.actionMs,lifetime.signal);
      browser=await deadline.run(()=>require('puppeteer').launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH,
        headless:true,userDataDir:input.profile,pipe:true,dumpio:false,timeout:deadline.remaining(),
        handleSIGINT:false,handleSIGTERM:false,handleSIGHUP:false,
        env:{HOME:input.profile,TMPDIR:input.profile,PATH:'/usr/bin:/bin',LANG:'C.UTF-8'},
        args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--disable-breakpad',
          '--disable-crash-reporter','--disable-component-update','--disable-sync','--no-first-run','--disable-quic',
          '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',`--proxy-server=${input.proxyUrl}`,
          '--proxy-bypass-list=<-loopback>',`--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${new URL(input.proxyUrl).hostname}`]}));
      const protectedInput=(input.mode==='login_read'||input.interventionsEnabled===true)?{getAuthDecision:(...args)=>bridge.provider.getAuthDecision(...args),verifyDecision:(...args)=>bridge.provider.verifyDecision(...args),requestDecision:(...args)=>bridge.provider.requestDecision(...args),credentialAccess:(...args)=>bridge.provider.credentialAccess(...args)}:undefined;
      bridge=createChildBridge({send:message=>process.send?.(message),requestId,signal:deadline.signal,actionDeadline:deadline});
      engine=await deadline.run(()=>createPublicSession(browser,input,lifetime,{protectedInput,initialDeadline:deadline,onStage:value=>{stage=value;}}));respond('result',{ready:true});
    }else{
      if(!engine||!lifetime)c.deny('UNAVAILABLE');
      deadline=new ActionDeadline(limits.actionMs,lifetime.signal);
      bridge=createChildBridge({send:message=>process.send?.(message),requestId,signal:deadline.signal,actionDeadline:deadline});
      const result=await deadline.run(()=>engine.execute(name,input,deadline));
      if(Buffer.byteLength(JSON.stringify(result))>limits.maxResultBytes)c.deny('LIMIT_EXCEEDED');
      respond('result',result);
    }
  }catch(error){const code=c.publicError(error).body.error;process.send?.({type:'diagnostic',requestId,...require('../lib/browser/diagnostics').failure({operation:name,stage,code,elapsedMs:Date.now()-started})});respond('error',code);}
  finally{bridge?.close();bridge=null;deadline?.close();busy=false;}
});
