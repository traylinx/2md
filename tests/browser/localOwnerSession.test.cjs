'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createOwnerPairing}=require('../../lib/browser/ownerPairing');
const {createLocalOwnerSession}=require('../../lib/browser/localOwnerSession');
const {createCredentialProvider}=require('../../lib/browser/credentialProvider');
const {createCredentialSurface}=require('../../lib/browser/credentialSurface');
const {bound,grant,owner}=require('./support.cjs');
test('real loopback callback establishes HttpOnly owner session for protected input; revocation invalidates it',async()=>{
 let authorized=true;const g={...grant(),hostKeyFingerprint:bound.hostKeyFingerprint,approvedByWorkspaceUserId:owner.workspaceUserId};
 const control=createOwnerPairing({authorize:async()=>g});
 const local=createLocalOwnerSession({bound,grantId:g.grantId,control,authorizeOwner:async()=>authorized});
 const provider=createCredentialProvider({verifyOwner:async context=>authorized?context:null});
 const surface=await createCredentialSurface({provider,ownerContext:local.ownerContext,pairing:local});
 try{
 const entry=provider.request(bound,{sessionId:'s1',origin:'https://site.example.org',purpose:'Read account',recipients:['https://site.example.org'],ownerId:owner.workspaceUserId,expiresAt:Date.now()+60000});
 const entryUrl=surface.urlFor(entry.interventionId);
 assert.equal((await fetch(entryUrl)).status,403);
 const pairing=await surface.beginPairing();const {redirectUri}=await control.approve(pairing.pairingId,owner);
 const wrong=new URL(redirectUri);wrong.searchParams.set('state','unknown');assert.equal((await fetch(wrong,{redirect:'manual'})).status,403);
 const callback=await fetch(redirectUri,{redirect:'manual'});assert.equal(callback.status,303);assert.equal(callback.headers.get('location'),'/paired');
 const cookie=callback.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);const headers={cookie:cookie.split(';')[0]};
 assert.equal((await fetch(redirectUri,{redirect:'manual'})).status,403);
 const form=await fetch(entryUrl,{headers});assert.equal(form.status,200);const csrf=/name="csrf" value="([^"]+)"/.exec(await form.text())[1];
 const submitted=await fetch(entryUrl,{method:'POST',headers:{...headers,origin:new URL(entryUrl).origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf,username:'owned',password:'SYNTHETIC_ONLY'})});assert.equal(submitted.status,200);
 authorized=false;assert.equal((await fetch(entryUrl,{headers})).status,403);
 authorized=true;assert.equal((await fetch(entryUrl,{headers})).status,403); // session discarded, not revived
 }finally{await surface.close();provider.close();control.close();}
});
