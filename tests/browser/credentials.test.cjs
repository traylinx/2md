'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createCredentialProvider}=require('../../lib/browser/credentialProvider');
const {createCredentialSurface}=require('../../lib/browser/credentialSurface');
const {bound}=require('./support.cjs');
const owner={workspaceUserId:'owner1',organizationId:bound.principal.organizationId,projectId:bound.principal.projectId};
const request=()=>({sessionId:'s1',origin:'https://site.example.org',purpose:'Read account',recipients:['https://site.example.org'],ownerId:'owner1',expiresAt:Date.now()+60000});
function provider(){return createCredentialProvider({verifyOwner:async context=>context==='paired'?owner:null});}
test('generic protected credentials bind owner, session, host and recipients and consume once',async()=>{
 const p=provider();try{
 const r=p.request(bound,request());assert.equal(p.request(bound,request()).interventionId,r.interventionId);
 await assert.rejects(p.inspect(r.interventionId,'URL-only'),{code:'FORBIDDEN'});
 await assert.rejects(p.submit(r.interventionId,'unpaired',{username:'u',password:'synthetic'}));
 const result=await p.submit(r.interventionId,'paired',{username:'u',password:'synthetic'});assert.doesNotMatch(JSON.stringify(result),/synthetic/);
 await assert.rejects(p.consume({...bound,hostId:'foreign'},{credentialRef:r.interventionId,...request()},()=>{}));
 await assert.rejects(p.consume(bound,{credentialRef:r.interventionId,...request(),sessionId:'s2'},()=>{}));
 let bytes;await assert.rejects(p.consume(bound,{credentialRef:r.interventionId,...request()},async secret=>{bytes=secret.password;assert.equal(bytes.toString(),'synthetic');throw Error('owned execution failure');}));
 assert.ok(bytes.every(n=>n===0));await assert.rejects(p.consume(bound,{credentialRef:r.interventionId,...request()},()=>{}),{code:'SESSION_LOST'});
 }finally{p.close();}
});
test('loopback entry requires pairing, same origin and single-use CSRF; no password response',async()=>{
 const p=provider();const s=await createCredentialSurface({provider:p,ownerContext:async req=>req.headers.cookie==='owner=paired'?'paired':null});
 try{
 const r=p.request(bound,request()),url=s.urlFor(r.interventionId),origin=new URL(url).origin;
 assert.equal((await fetch(url)).status,403);
 const page=await fetch(url,{headers:{cookie:'owner=paired'}}),html=await page.text();assert.equal(page.status,200);assert.equal(page.headers.get('cache-control'),'no-store');assert.equal(page.headers.get('referrer-policy'),'same-origin');
 const csrf=/name="csrf" value="([^"]+)"/.exec(html)[1];
 const body=new URLSearchParams({csrf,username:'owned-user',password:'SYNTHETIC_TEST_ONLY'}).toString();
 const headers={cookie:'owner=paired',origin,'content-type':'application/x-www-form-urlencoded'};
 assert.equal((await fetch(url,{method:'POST',headers:{...headers,origin:'https://hostile.example.org'},body})).status,403);
 const response=await fetch(url,{method:'POST',headers,body});assert.equal(response.status,200);assert.doesNotMatch(await response.text(),/SYNTHETIC_TEST_ONLY|owned-user/);
 assert.equal((await fetch(url,{method:'POST',headers,body})).status,403);
 assert.equal(p.resolve(bound,{sessionId:'s1',origin:r.origin}).state,'ready');
 }finally{await s.close();p.close();}
});
test('expired protected entry is removed and cannot be reused',async()=>{
 let now=1000;const p=createCredentialProvider({verifyOwner:async()=>owner,now:()=>now});
 try{const r=p.request(bound,{...request(),expiresAt:2000});await p.submit(r.interventionId,'paired',{username:'u',password:'owned'});now=2001;assert.equal(p.resolve(bound,{sessionId:'s1',origin:r.origin}),null);assert.equal(p.diagnostics().entries,0);}finally{p.close();}
});
