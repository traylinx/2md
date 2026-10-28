'use strict';
const http=require('node:http');
const {randomUUID,timingSafeEqual}=require('node:crypto');
const c=require('./contracts');
const {Deadline}=require('../capture/deadline');
const {readBody}=require('../capture/readBody');
const {createEgressProxy}=require('../capture/egressProxy');

// Independent namespace/controller. Never borrows capture ports or changes its 60s cap.
function createSessionEgress({token,port=8291,bind='0.0.0.0',now=Date.now,
  makeProxy=createEgressProxy}={}) {
  if(typeof token!=='string'||token.length<32||!Number.isInteger(port)||port<0||port>65535||[8280,8281,8282].includes(port))c.deny('UNAVAILABLE');
  const expected=Buffer.from(`Bearer ${token}`);let slot,closing=false,quarantined=false;
  async function release(id) {
    if(!slot||slot.id!==id)return {released:true,absent:true};
    const owned=slot;if(owned.closing)return owned.closing;
    owned.closing=(async()=>{
      try {await owned.ready?.catch(()=>{});await owned.proxy.close();owned.deadline.close();slot=null;return {released:true,...owned.proxy.stats()};}
      catch {quarantined=true;c.deny('UNAVAILABLE');}
    })();return owned.closing;
  }
  async function sweep() {
    if(slot&&(now()>=slot.expiresAt||now()-slot.heartbeatAt>=45000))await release(slot.id);
  }
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
    if(req.method==='GET'&&req.url==='/health'){res.writeHead(quarantined?503:200);res.end(JSON.stringify({healthy:!quarantined}));return;}
    const authorization=Buffer.from(req.headers.authorization||'');
    const names=req.rawHeaders.filter((_,i)=>i%2===0).map(n=>n.toLowerCase());
    if(names.filter(n=>n==='authorization').length!==1||req.headers.origin||req.headers.cookie||authorization.length!==expected.length||!timingSafeEqual(authorization,expected)){
      res.writeHead(401);res.end();return;
    }
    const deadline=new Deadline(3000);
    try {
      if(closing||quarantined)c.deny('UNAVAILABLE');
      if(req.method!=='POST'||!['/lease','/heartbeat','/release'].includes(req.url))c.deny();
      const raw=await readBody(req,2048,deadline);await sweep();
      if(req.url!=='/lease'){
        const {id}=c.parse(c.obj({id:c.id}),raw);
        if(req.url==='/release'){res.end(JSON.stringify(await release(id)));return;}
        if(!slot||slot.id!==id||slot.closing)c.deny('SESSION_LOST');
        slot.heartbeatAt=now();res.end(JSON.stringify({alive:true}));return;
      }
      const input=c.parse(c.obj({sessionId:c.id,ttlMs:c.num(1,600000),maxTrafficBytes:c.num(1,33554432),maxRequests:c.num(1,500)}),raw);
      if(slot){
        if(slot.sessionId!==input.sessionId)c.deny('CAPACITY');
        if(slot.digest!==c.digest(input))c.deny('IDEMPOTENCY_CONFLICT');
        if(slot.closing||!slot.port)c.deny('BUSY');
        res.end(JSON.stringify({id:slot.id,port:slot.port,expiresAt:slot.expiresAt}));return;
      }
      const leaseDeadline=new Deadline(input.ttlMs);
      const proxy=makeProxy({deadline:leaseDeadline,maximumBytes:input.maxTrafficBytes,maximumRequests:input.maxRequests});
      const owned={id:randomUUID(),sessionId:input.sessionId,digest:c.digest(input),proxy,deadline:leaseDeadline,
        expiresAt:now()+input.ttlMs,heartbeatAt:now(),port:null};slot=owned;
      try{
        owned.ready=new Promise((resolve,reject)=>{proxy.server.once('error',reject);proxy.server.listen(port,bind,resolve);});
        await deadline.run(()=>owned.ready);
        if(closing||owned.closing)c.deny('UNAVAILABLE');
        owned.port=proxy.server.address().port;
        res.end(JSON.stringify({id:owned.id,port:owned.port,expiresAt:owned.expiresAt}));
      }catch(error){await release(owned.id);throw error;}
    }catch(error){const safe=c.publicError(error);if(!res.headersSent)res.writeHead(safe.status);res.end(JSON.stringify(safe.body));}
    finally{deadline.close();}
  });
  server.headersTimeout=5000;server.requestTimeout=5000;
  const timer=setInterval(()=>{void sweep().catch(()=>{});},1000);timer.unref();
  return {server,sweep,async close(){closing=true;clearInterval(timer);if(slot)await release(slot.id);await new Promise(r=>server.close(r));},
    diagnostics:()=>({leased:Boolean(slot),quarantined})};
}
module.exports={createSessionEgress};
