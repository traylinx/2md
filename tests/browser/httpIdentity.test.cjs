'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const express=require('express'),request=require('supertest');
const {createBrowserHttpIdentity}=require('../../lib/browser/httpIdentity');
const {createBrowserHttpClient}=require('../../lib/browser/httpClient');
const {createBrowserRouter}=require('../../routes/browser');
const {createGrantAuthority}=require('../../lib/browser/grantAuthority');
const {bound,grant,privateKey,observation}=require('./support.cjs');
const c=require('../../lib/browser/contracts');
test('signed client and actual router compose current identity, host proof and single nonce consumption',async()=>{
 const g={...grant(),policyVersion:c.POLICY,hostKeyFingerprint:bound.hostKeyFingerprint};let resolved=0,executed=0,tamper=false;const nonces=new Set();
 const repository={get:async scope=>scope.organizationId===g.agent.organizationId&&scope.projectId===g.agent.projectId&&scope.grantId===g.grantId?g:null,create:async()=>{},revoke:async()=>{}};
 const authority=createGrantAuthority({repository,resolveAgent:async()=>bound.principal});
 const identity=createBrowserHttpIdentity({repository,authority,resolvePrincipal:async()=>{resolved++;return bound.principal;},consumeNonce:async({nonce})=>{if(nonces.has(nonce))return false;nonces.add(nonce);return true;}});
 const app=express();app.use('/api/browser/v1',createBrowserRouter({enabled:true,...identity,service:{call:async()=>{executed++;return observation();}}}));
 const client=createBrowserHttpClient({url:'https://browser.example.org/api/browser/v1',bound,grantId:g.grantId,privateKey,agentId:'agent1',sdk:{getAgentRequestHeaders:async()=>({'X-Agent-User-Id':'agent1','X-Agent-Secret-Token':'synthetic'})},fetchImpl:async(url,options)=>{
 const response=await request(app).post(new URL(url).pathname).set(options.headers).send(tamper?{sessionId:'tampered'}:JSON.parse(options.body));
 return new Response(response.text,{status:response.status,headers:response.headers});
 }});
 assert.equal((await client.call('browser_observe',{sessionId:'s1'})).observationId,'o1');assert.equal(resolved,2);assert.equal(nonces.size,1);assert.equal(executed,1);
 tamper=true;await assert.rejects(client.call('browser_observe',{sessionId:'s1'}),{code:'UNAUTHENTICATED'});assert.equal(executed,1);assert.equal(nonces.size,1);
});
