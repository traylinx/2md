'use strict';
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {fork}=require('node:child_process');const {randomUUID}=require('node:crypto');
const c=require('./contracts');const {killGroup}=require('../capture/workerAdapter');

// Child contains browser/session state only. Parent holds authority. No dotenv,
// inherited credentials, executable caller scripts, stdout forwarding or queues.
function createPersistentWorkerFactory({lease,executablePath='/usr/bin/chromium',tempRoot=os.tmpdir(),
  workerPath=path.resolve(__dirname,'../../scripts/browser-worker.js')}={}) {
  if(typeof lease!=='function')c.deny('UNAVAILABLE');let quarantined=false;
  return async function createWorker({sessionId,url,mode,limits,navigation={mode:'origins',origins:[new URL(url).origin]},expiresAt,signal}) {
    if(quarantined||signal?.aborted)c.deny('UNAVAILABLE');
    let proxy,profile,child,disposed=false,pending,sequence=0,disposePromise;
    const fail=()=>{if(pending){const p=pending;pending=null;p.reject(new c.BrowserError('SESSION_LOST'));}};
    async function dispose() {
      if(disposePromise)return disposePromise;
      disposed=true;fail();
      disposePromise=(async()=>{
        let failed=false;
        try{
          if(child?.pid){
            killGroup(child.pid);
            if(child.exitCode===null&&child.signalCode===null)await new Promise((resolve,reject)=>{
              const timer=setTimeout(()=>reject(Error()),1500);
              child.once('exit',()=>{clearTimeout(timer);resolve();});
            });
          }
          if(profile){fs.rmSync(profile,{recursive:true,force:true});if(fs.existsSync(profile))throw Error();}
        }catch{failed=true;}
        try{await proxy?.release();}catch{failed=true;}
        if(failed){quarantined=true;c.deny('UNAVAILABLE');}
      })();return disposePromise;
    }
    function send(name,input,signal) {
      if(disposed||!child?.connected||proxy.healthy?.()===false)c.deny('SESSION_LOST');
      if(pending)c.deny('BUSY');if(signal?.aborted)c.deny('CANCELLED');
      const requestId=`${++sequence}-${randomUUID()}`;
      return new Promise((resolve,reject)=>{
        const abort=()=>{void dispose().catch(()=>{});};
        const finish=fn=>value=>{signal?.removeEventListener('abort',abort);fn(value);};
        pending={requestId,resolve:finish(resolve),reject:finish(reject)};
        signal?.addEventListener('abort',abort,{once:true});
        child.send({type:'command',requestId,name,input},error=>{if(error&&pending?.requestId===requestId)fail();});
      });
    }
    try{
      proxy=await lease({sessionId,limits,expiresAt,signal});
      if(signal?.aborted)c.deny('CANCELLED');
      if(!/^http:\/\/[a-zA-Z0-9.-]+:\d+$/.test(proxy.proxyUrl))c.deny('UNAVAILABLE');
      profile=fs.mkdtempSync(path.join(tempRoot,'2md-browser-'));fs.chmodSync(profile,0o700);
      child=fork(workerPath,[],{detached:true,silent:true,serialization:'json',execArgv:['--max-old-space-size=256'],
        env:{PATH:'/usr/bin:/bin',HOME:profile,TMPDIR:profile,LANG:'C.UTF-8',PUPPETEER_EXECUTABLE_PATH:executablePath}});
      child.stdout.resume();child.stderr.resume();
      child.once('error',fail);child.once('exit',fail);
      child.on('message',message=>{
        if(!pending||message?.requestId!==pending.requestId)return;
        const p=pending;pending=null;
        if(message.type==='result')p.resolve(message.result);else p.reject(new c.BrowserError('UNAVAILABLE'));
      });
      await send('initialize',{sessionId,url,mode,limits,navigation,expiresAt,profile,proxyUrl:proxy.proxyUrl},signal);
      return Object.freeze({execute:(name,input,{signal}={})=>send(name,input,signal),dispose});
    }catch(error){await dispose();throw error;}
  };
}
module.exports={createPersistentWorkerFactory};
