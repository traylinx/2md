'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createBrowserHttpClient}=require('../../lib/browser/httpClient');
const {createHostVerifier}=require('../../lib/browser/hostProof');
const {bound,grant,privateKey,observation}=require('./support.cjs');
const c=require('../../lib/browser/contracts');
const sdk={getAgentRequestHeaders:async()=>({'X-Agent-User-Id':'agent1','X-Agent-Secret-Token':'synthetic-proof',Authorization:'Bearer not-forwarded'})};
test('HTTP backend sends fresh Sentinel proof and exact signed body without forwarding ambient credentials',async()=>{
 let calls=0;const g={...grant(),hostKeyFingerprint:bound.hostKeyFingerprint};const verify=createHostVerifier({authorize:async()=>g,consumeNonce:async()=>true});
 const client=createBrowserHttpClient({url:'https://browser.example.org/api/browser/v1',bound,grantId:g.grantId,privateKey,agentId:'agent1',sdk,fetchImpl:async(url,options)=>{
 calls++;assert.equal(url,'https://browser.example.org/api/browser/v1/observe');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,undefined);assert.equal(options.headers['X-Agent-Secret-Token'],'synthetic-proof');
 await verify({proof:options.headers['X-Browser-Host-Proof'],bound,grantId:g.grantId,method:'POST',path:'/api/browser/v1/observe',body:JSON.parse(options.body)});
 return Response.json(observation(),{headers:{'Cache-Control':'no-store'}});
 }});
 const result=await client.call('browser_observe',{sessionId:'s1'});assert.equal(result.observationId,'o1');assert.equal(calls,1);
});
test('HTTP backend rejects redirect/cache violations, oversized results and unknown errors without retry',async()=>{
 for(const response of [()=>Response.json(observation()),()=>Response.json({error:'INTERNAL_PRIVATE_ERROR'},{status:503,headers:{'Cache-Control':'no-store'}}),()=>new Response('x'.repeat(c.LIMITS.maxResultBytes+1),{headers:{'Cache-Control':'no-store','Content-Type':'application/json'}})]){
 let calls=0;const client=createBrowserHttpClient({url:'https://browser.example.org/api/browser/v1',bound,grantId:'grant1',privateKey,agentId:'agent1',sdk,fetchImpl:async()=>{calls++;return response();}});
 await assert.rejects(client.call('browser_observe',{sessionId:'s1'}));assert.equal(calls,1);
 }
});
