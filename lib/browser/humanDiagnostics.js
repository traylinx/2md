'use strict';
const {AsyncLocalStorage}=require('node:async_hooks'),{createHash}=require('node:crypto');
const c=require('./contracts'),storage=new AsyncLocalStorage();
const phases=new Set(['caller_before','host_proof','handler','caller_after','worker_input','worker_frame','sdk_headers','transport','decode']);
const routes=new Set(Object.keys(require('./humanContracts').schemas).map(x=>x.slice(1)));
const networkKeys=['http4xx','http5xx','transport_failed','policy_blocked'];
const samples=new Map();
const write=line=>process.stderr.write(line+'\n');
const tag=id=>createHash('sha256').update(id).digest('hex').slice(0,16);
const duration=n=>Math.max(0,Math.min(60000,Math.round(Number(n)||0)));
function emit(sessionId,value,output=write){
 c.validate(c.id,sessionId);const key=tag(sessionId),now=Date.now();
 for(const [k,v]of samples)if(v.until<=now)samples.delete(k);
 let record=samples.get(key);
 if(!record){if(samples.size>=128)return;record={count:0,until:now+1800000};samples.set(key,record);}
 if(record.count++>=512)return;
 try{output(JSON.stringify({...value,session:key}));}catch{} // Diagnostics never change execution.
}
function createTrace(route,{output=write,clock=()=>performance.now(),side='server'}={}){
 const times={};let sessionId,done=false;const started=clock();
 async function measured(name,operation){const start=clock();try{return await operation();}finally{if(phases.has(name))times[name]=(times[name]||0)+duration(clock()-start);}}
 return {run:fn=>storage.run(measured,fn),measure:measured,
  identify(id){c.validate(c.id,id);sessionId=id;},
  finish(code){
   if(done||!sessionId||!routes.has(route))return '';done=true;
   const ms=Object.fromEntries([...phases].filter(k=>times[k]!==undefined).map(k=>[k,duration(times[k])]));
   ms.total=duration(clock()-started);
   const outcome=code==='OK'?'OK':c.publicError(new c.BrowserError(code)).body.error;
   emit(sessionId,{event:'browser_human_timing',route,side:side==='host'?'host':'server',outcome,ms},output);
   return Object.entries(ms).map(([k,v])=>k+';dur='+v).join(', ');
  }};
}
function measure(name,operation){const current=storage.getStore();return current?current(name,operation):operation();}
function emitNetwork(sessionId,value,output=write){
 if(!value||Object.keys(value).some(k=>![...networkKeys,'limited'].includes(k))||networkKeys.some(k=>!Number.isInteger(value[k])||value[k]<0||value[k]>100000)||typeof value.limited!=='boolean')return;
 emit(sessionId,{event:'browser_network_summary',counts:Object.fromEntries(networkKeys.map(k=>[k,value[k]])),limited:value.limited},output);
}
module.exports={createTrace,measure,emitNetwork,networkKeys};
