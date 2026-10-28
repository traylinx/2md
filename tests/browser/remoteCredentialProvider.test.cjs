'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const express=require('express'),request=require('supertest');
const {createRemoteCredentialProvider}=require('../../lib/browser/remoteCredentialProvider');
const {createCredentialSurface}=require('../../lib/browser/credentialSurface');
const {createRemoteInput}=require('../../lib/browser/remoteInput');
const {createCompletionVerifier}=require('../../lib/browser/completionProof');
const {createBrowserHttpClient}=require('../../lib/browser/httpClient');
const {createHostVerifier}=require('../../lib/browser/hostProof');
const {createBrowserInputRouter}=require('../../routes/browserInput');
const {bound,owner,grant,privateKey}=require('./support.cjs');
const c=require('../../lib/browser/contracts');
test('paired local form supplies remote volatile broker over signed host HTTP without secret response',async()=>{
 const g={...grant(),hostKeyFingerprint:bound.hostKeyFingerprint,approvedByWorkspaceUserId:owner.workspaceUserId};
 const nonces=new Set(),consumeNonce=async({nonce})=>{if(nonces.has(nonce))return false;nonces.add(nonce);return true;};
 const authorize=async()=>g,verifyCompletion=createCompletionVerifier({authorize,consumeNonce}),verifyHost=createHostVerifier({authorize,consumeNonce});
 const broker=createRemoteInput({describeSession:async()=>({mode:'login_read',ownerId:owner.workspaceUserId,expiresAt:g.expiresAt}),verifyCompletion,verifyDecision:async()=>null});
 const app=express();app.use('/api/browser/v1',createBrowserInputRouter({enabled:true,broker,resolveCaller:async()=>bound,verifyHost:args=>verifyHost({...args,proof:args.request.headers['x-browser-host-proof'],grantId:g.grantId})}));
 const replies=[];const client=createBrowserHttpClient({url:'https://browser.example.org/api/browser/v1',bound,grantId:g.grantId,privateKey,agentId:'agent1',sdk:{getAgentRequestHeaders:async()=>({'X-Agent-User-Id':'agent1','X-Agent-Secret-Token':'synthetic'})},fetchImpl:async(url,options)=>{
  const r=await request(app).post(new URL(url).pathname).set(options.headers).send(JSON.parse(options.body));replies.push(r.text);return new Response(r.text,{status:r.status,headers:r.headers});
 }});
 const provider=createRemoteCredentialProvider({client,bound,grantId:g.grantId,privateKey,verifyOwner:async context=>context});
 const surface=await createCredentialSurface({provider,ownerContext:async req=>{if(req.headers.cookie!=='paired=owned-fixture')c.deny('FORBIDDEN');return owner;}});
 try{
  const input={sessionId:'s1',origin:'https://unfamiliar.example.org',purpose:'Read account'};
  const entry=await broker.request({bound,input}),url=surface.urlFor(entry.interventionId);
  assert.equal((await fetch(url)).status,403);
  const page=await fetch(url,{headers:{Cookie:'paired=owned-fixture'}}),html=await page.text();assert.equal(page.status,200);
  const csrf=/name="csrf" value="([^"]+)"/.exec(html)[1];
  const response=await fetch(url,{method:'POST',headers:{Cookie:'paired=owned-fixture',Origin:new URL(url).origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf,username:'SYNTHETIC_ACCOUNT',password:'SYNTHETIC_SECRET'})});
  assert.equal(response.status,200);assert.doesNotMatch(await response.text(),/SYNTHETIC/);
  assert.equal((await broker.request({bound,input})).state,'ready');
  assert.doesNotMatch(replies.join('\n'),/SYNTHETIC_ACCOUNT|SYNTHETIC_SECRET/);
  await assert.rejects(provider.inspect(entry.interventionId,{...owner,workspaceUserId:'foreign'}));
  await assert.rejects(provider.submit(entry.interventionId,owner,{username:'u',password:'p'}));
  await client.protectedCall('input-cancel',{interventionId:entry.interventionId});
  await assert.rejects(provider.inspect(entry.interventionId,owner));
 }finally{await surface.close();broker.close();}
});
test('host transport refuses unexpected response fields rather than leaking them',async()=>{
 const client=createBrowserHttpClient({url:'https://browser.example.org/api/browser/v1',bound,grantId:'g1',privateKey,agentId:'agent1',sdk:{getAgentRequestHeaders:async()=>({'X-Agent-User-Id':'agent1','X-Agent-Secret-Token':'synthetic'})},fetchImpl:async()=>Response.json({cancelled:true,password:'should-not-be-returned'},{headers:{'Cache-Control':'no-store'}})});
 await assert.rejects(client.protectedCall('input-cancel',{interventionId:'i1'}));
 assert.throws(()=>client.protectedCall('unregistered',{}));
});
