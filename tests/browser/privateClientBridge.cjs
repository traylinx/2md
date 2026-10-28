'use strict';
// Test-only simulated human owner. The agent never receives fixture credentials
// or an approval tool. Exercise the actual paired HTTP form/signing transport.
const assert=require('node:assert/strict');
const {createBrowserHttpClient}=require('../../lib/browser/httpClient');
const {createProtectedHost}=require('../../lib/browser/protectedHost');
const {createHostLifecycle}=require('../../lib/browser/hostLifecycle');
const {bound,owner,privateKey}=require('./support.cjs');
async function servePrivateClient(runtime,g){
 const api=runtime.app.listen(0,'127.0.0.1');await new Promise(r=>api.once('listening',r));
 const client=createBrowserHttpClient({url:'https://browser.example.org/api/browser/v1',bound,grantId:g.grantId,privateKey,agentId:'agent1',sdk:{getAgentRequestHeaders:async()=>({'X-Agent-User-Id':'agent1','X-Agent-Secret-Token':'owned-fixture'})},fetchImpl:async(url,options)=>{
  const result=await fetch('http://127.0.0.1:'+api.address().port+new URL(url).pathname,options);
  return new Response(await result.text(),{status:result.status,headers:result.headers});
 }});
 let host,lifecycle;
 try{
  host=await createProtectedHost({client,bound,grantId:g.grantId,privateKey,ownerSetupUrl:'https://traylinx.example.org/admin/browser/connect'});
  const caps=await host.call('get_browser_capabilities',{});const pairing=new URL(caps.ownerConnection.url).searchParams.get('pairingId');
  const approved=await fetch('http://127.0.0.1:'+api.address().port+'/api/browser/control/v1/pairings/'+pairing+'/approve?organizationId='+owner.organizationId+'&projectId='+owner.projectId,{method:'POST',headers:{Authorization:'Bearer owned-human-fixture','Content-Type':'application/json'},body:'{}'});
  assert.equal(approved.status,200);const callback=await fetch((await approved.json()).redirectUri,{redirect:'manual'});assert.equal(callback.status,303);
  const cookie=callback.headers.get('set-cookie').split(';')[0];
  lifecycle=createHostLifecycle({backend:host});let supplied=0;
  const input=require('node:readline').createInterface({input:process.stdin});let pending=Promise.resolve();const timer=setTimeout(()=>input.close(),230000);
  process.stdout.write(JSON.stringify({ready:true})+'\n');
  try{await new Promise(done=>{
   input.on('line',line=>{pending=pending.then(async()=>{
    let request;try{
     request=JSON.parse(line);if(line.length>16384)throw Error('limit');
     let result=await lifecycle.call(request.name,request.arguments||{});
     if(request.name==='browser_credentials'&&result.state==='needs_input'){
      assert.equal(supplied++,0,'No automatic password retry');
      const url=result.inputUrl;const page=await fetch(url,{headers:{Cookie:cookie}});assert.equal(page.status,200);
      const csrf=/name="csrf" value="([^"]+)"/.exec(await page.text())[1];
      const response=await fetch(url,{method:'POST',headers:{Cookie:cookie,Origin:new URL(url).origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf,username:'owned',password:'SYNTHETIC_WORKER_PASSWORD'})});assert.equal(response.status,200);
      result=await lifecycle.call(request.name,request.arguments||{});assert.equal(result.state,'ready');
     }
     assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC_WORKER_PASSWORD|owned-human-fixture/);
     process.stdout.write(JSON.stringify({id:request.id,result})+'\n');
    }catch(error){process.stdout.write(JSON.stringify({id:request?.id,error:error.code||'UNAVAILABLE'})+'\n');}
   });});input.once('close',done);
  });await pending;}finally{clearTimeout(timer);}
 }finally{await lifecycle?.close();await host?.close();api.closeAllConnections();await new Promise(r=>api.close(r));}
}
module.exports={servePrivateClient};
