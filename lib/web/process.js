'use strict';
const http=require('node:http');
const c=require('./contracts');
const {createWebApplication}=require('./application');
// Process ownership only. Authorities must be supplied by trusted composition;
// this module never invents a confirmation authority or runs schema migrations.
function createWebProcess({enabled=false,host='127.0.0.1',port=8081,shutdownMs=10000,
  clients,allowedOrigins=[],dependencies={},applicationFactory=createWebApplication}={}) {
  if(typeof host!=='string'||!host||!Number.isInteger(port)||port<0||port>65535||
     !Number.isInteger(shutdownMs)||shutdownMs<100||shutdownMs>30000)c.deny('UNAVAILABLE');
  if(enabled && (typeof clients?.open!=='function'||typeof clients?.close!=='function'))c.deny('UNAVAILABLE');
  // Validate all runtime authorities before opening infrastructure or a listener.
  const application=applicationFactory({enabled,allowedOrigins,dependencies:enabled?
    {...dependencies,pool:clients.pool,redis:clients.redis}:undefined});
  let state='created',starting,stopping,cleaning,ready=false;
  const server=http.createServer((req,res)=>{
    if(req.url==='/health/live'||req.url==='/health/ready'){
      const ok=req.url==='/health/live'?state==='running':ready;
      res.writeHead(ok?200:503,{'Content-Type':'application/json','Cache-Control':'no-store'});
      return res.end(JSON.stringify({status:ok?'ok':'unavailable'}));
    }
    if(!ready){res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end('{"error":"UNAVAILABLE"}');}
    application.app(req,res);
  });
  server.headersTimeout=10000;server.requestTimeout=15000;server.keepAliveTimeout=5000;
  function closeListener(){return new Promise(resolve=>{
    if(!server.listening)return resolve();
    const timer=setTimeout(()=>{server.closeAllConnections();},shutdownMs);
    server.close(()=>{clearTimeout(timer);resolve();});server.closeIdleConnections();
  });}
  function cleanup(){
    if(cleaning)return cleaning;
    cleaning=drain();return cleaning;
  }
  async function drain(){
    ready=false;
    // Stop new HTTP admissions while aborting/draining claimed worker operations.
    const drained=await Promise.allSettled([closeListener(),application.stop()]);
    if(enabled)await clients.close();
    if(drained.some(r=>r.status==='rejected'))c.deny('UNAVAILABLE');
  }
  async function boot(){
    try{
      if(enabled)await clients.open();
      await new Promise((resolve,reject)=>{
        const fail=e=>{server.removeListener('listening',done);reject(e);};
        const done=()=>{server.removeListener('error',fail);resolve();};
        server.once('error',fail);server.once('listening',done);server.listen(port,host);
      });
      application.start();state='running';ready=enabled;return server.address();
    }catch{
      state='failed';try{await cleanup();}catch{}c.deny('UNAVAILABLE');
    }
  }
  return Object.freeze({
    start(){if(starting && ['starting','running'].includes(state))return starting;if(state!=='created')return Promise.reject(new c.WebBoundaryError('UNAVAILABLE'));state='starting';starting=boot();return starting;},
    stop(){if(stopping)return stopping;stopping=(async()=>{
      if(starting)try{await starting;}catch{}
      state='stopping';try{await cleanup();}finally{state='stopped';}
    })();return stopping;},
    status:()=>Object.freeze({state,ready}),
  });
}
module.exports={createWebProcess};
