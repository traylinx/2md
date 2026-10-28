'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {freezeRecipe}=require('../../lib/capture/recipe');
const {RequestPolicy}=require('../../lib/capture/networkPolicy');
const {assertScope}=require('../../lib/capture/principal');
const page='https://site.example.com',api='https://auth.example.com';
const login={mode:'xhr',postUrls:[api+'/bootstrap',api+'/token'],readUrls:[api+'/organizations'],readPaths:['/report'],fields:{form:'form',username:'#username',password:'#password',submit:'button[type=submit]'},proof:{url:api+'/token',path:['data','email']}};
const request={url:page+'/report',loginUrl:page+'/login',login};
function setup(){const seen=[];const policy=new RequestPolicy({deadline:{remaining:()=>1000},recipe:freezeRecipe(request),allowedOrigins:[page,api],resolver:async url=>{seen.push(url);return {url};}});return {policy,seen};}
test('XHR contract is immutable, bounded and has no arbitrary script/body/query fields',()=>{
 const r=freezeRecipe(request);assert.ok(Object.isFrozen(r.proof.path));assert.notEqual(r.postUrls,login.postUrls);
 for(const change of [{script:'x'},{postUrls:[api+'/token?secret=x']},{postUrls:[api+'/token',api+'/token']},{proof:{url:api+'/elsewhere',path:['email']}},{proof:{url:api+'/token',path:['__proto__']}},{readPaths:['/other']}])assert.throws(()=>freezeRecipe({...request,login:{...login,...change}}));
});
test('XHR requires dedicated authenticated permission plus approved auth POSTs and every origin',()=>{
 const p={operations:['capture:authenticated'],origins:[page,api],loginPostUrls:login.postUrls};assertScope(p,request,true);
 for(const change of [{operations:['capture:public']},{origins:[page]},{loginPostUrls:[api+'/token']},{loginPostUrls:undefined}])assert.throws(()=>assertScope({...p,...change},request,true),{code:'FORBIDDEN'});
});
test('only ordered once-only auth POSTs during submit; all business writes denied before DNS',async()=>{
 const {policy:p,seen}=setup();const post=url=>p.allow({url,method:'POST',type:'fetch'});
 await assert.rejects(post(api+'/bootstrap'));p.phase='submit';await assert.rejects(post(api+'/token'));
 const both=await Promise.allSettled([post(api+'/bootstrap'),post(api+'/bootstrap')]);assert.equal(both.filter(r=>r.status==='fulfilled').length,1);
 await post(api+'/token');assert.equal(p.submitted,true);assert.equal(p.phase,'verify');
 for(const url of login.postUrls.concat([api+'/delete']))await assert.rejects(post(url));assert.equal(seen.length,2);
});
test('exact GET resources and API; no API wildcard, redirect escape or query exfiltration',async()=>{
 const {policy:p,seen}=setup();
 await p.allow({url:page+'/main.js',method:'GET',type:'script'});await p.allow({url:api+'/organizations',method:'GET',type:'fetch'});
 for(const [url,type]of [[api+'/keys','fetch'],[api+'/organizations?password=x','fetch'],['https://evil.example/app.js','script'],[api+'/organizations','document']])await assert.rejects(p.allow({url,method:'GET',type}));assert.equal(seen.length,2);
});
test('preflight does not consume POST, refresh and replay remain denied',async()=>{
 const {policy:p}=setup();p.phase='submit';await p.allow({url:api+'/bootstrap',method:'OPTIONS',type:'preflight'});assert.equal(p.postIndex,0);
 await p.allow({url:api+'/bootstrap',method:'POST',type:'xhr'});await assert.rejects(p.allow({url:api+'/bootstrap',method:'OPTIONS',type:'preflight'}));
});
test('private grant expiry blocks login; exact non-secret GET query is allowed without a wildcard',async()=>{
 assert.throws(()=>assertScope({operations:['capture:authenticated'],origins:[page,api],loginPostUrls:login.postUrls,authenticatedUntil:Date.now()-1},request,true),{code:'FORBIDDEN'});
 const u=api+'/settings?client=web&includes=dashboard',r=freezeRecipe({...request,login:{...login,readUrls:[u]}});
 const p=new RequestPolicy({deadline:{remaining:()=>1000},recipe:r,allowedOrigins:[page,api],resolver:async url=>({url})});
 await p.allow({url:u,method:'GET',type:'xhr'});await assert.rejects(p.allow({url:u+'&extra=true',method:'GET',type:'xhr'}));
});
