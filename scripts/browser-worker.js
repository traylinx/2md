'use strict';
const childProcess=require('node:child_process');
const {Deadline}=require('../lib/capture/deadline');
const c=require('../lib/browser/contracts');
const {createPublicSession}=require('../lib/browser/publicSession');
const spawn=childProcess.spawn;
childProcess.spawn=function(file,args,options){
  if(file===process.env.PUPPETEER_EXECUTABLE_PATH)options={...options,detached:false};
  return spawn.call(this,file,args,options);
};
let used=false,busy=false,browser,engine,lifetime,limits;
function terminate(){
  // This child is the detached group leader. Kill only this worker and its browser.
  try{process.kill(-process.pid,'SIGKILL');}catch{process.exit(1);}
}
process.on('disconnect',terminate);
process.on('message',async message=>{
  if(message?.type!=='command'||typeof message.requestId!=='string')return;
  const {requestId,name,input}=message;
  const respond=(type,result)=>process.send?.({type,requestId,...(type==='result'?{result}:{code:'UNAVAILABLE'})});
  if(busy){respond('error');return;}busy=true;
  let deadline;
  try{
    if(name==='initialize'){
      if(used)c.deny('FORBIDDEN');used=true;limits=input.limits;
      if(input.mode!=='public'||!/^http:\/\/[a-zA-Z0-9.-]+:\d+$/.test(input.proxyUrl))c.deny('UNSUPPORTED');
      lifetime=new Deadline(Math.max(1,Math.min(limits.absoluteMs,input.expiresAt-Date.now())));
      lifetime.signal.addEventListener('abort',terminate,{once:true});
      deadline=new Deadline(limits.actionMs,lifetime.signal);
      browser=await deadline.run(()=>require('puppeteer').launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH,
        headless:true,userDataDir:input.profile,pipe:true,dumpio:false,timeout:deadline.remaining(),
        handleSIGINT:false,handleSIGTERM:false,handleSIGHUP:false,
        env:{HOME:input.profile,TMPDIR:input.profile,PATH:'/usr/bin:/bin',LANG:'C.UTF-8'},
        args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--disable-breakpad',
          '--disable-crash-reporter','--disable-component-update','--disable-sync','--no-first-run','--disable-quic',
          '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',`--proxy-server=${input.proxyUrl}`,
          '--proxy-bypass-list=<-loopback>',`--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${new URL(input.proxyUrl).hostname}`]}));
      engine=await deadline.run(()=>createPublicSession(browser,input,lifetime));respond('result',{ready:true});
    }else{
      if(!engine||!lifetime)c.deny('UNAVAILABLE');
      deadline=new Deadline(limits.actionMs,lifetime.signal);
      const result=await deadline.run(()=>engine.execute(name,input,deadline));
      if(Buffer.byteLength(JSON.stringify(result))>limits.maxResultBytes)c.deny('LIMIT_EXCEEDED');
      respond('result',result);
    }
  }catch{respond('error');}
  finally{deadline?.close();busy=false;}
});
