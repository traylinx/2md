'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {RequestPolicy}=require('../../lib/capture/networkPolicy');
const {resourceOrigins}=require('../../lib/capture/resourceScope');
const {assertScope}=require('../../lib/capture/principal');
const page='https://site.example.com',cdn='https://assets.example.net';
const deadline={remaining:()=>1000};
function policy(extra={}) { const calls=[];return {calls,policy:new RequestPolicy({deadline,allowedOrigins:[page],resolver:async url=>{calls.push(url);return {url};},...extra})}; }
test('reproduces blocked cross-origin application bundle without explicit resource grant',async()=>{
 const p=policy();await assert.rejects(p.policy.allow({url:cdn+'/app.js',method:'GET',type:'script'}),{code:'FORBIDDEN'});assert.equal(p.calls.length,0);
});
test('explicit resource grant admits script and stylesheet through DNS validation',async()=>{
 const p=policy({allowedResourceOrigins:[cdn]});
 for(const type of ['script','stylesheet']) await p.policy.allow({url:cdn+'/bundle',method:'GET',type});
 assert.equal(p.calls.length,2);
});
test('resource grant is not navigation, API, image, worker, or write authority',async()=>{
 const p=policy({allowedResourceOrigins:[cdn]});
 for(const type of ['document','xhr','fetch','image','worker','other']) await assert.rejects(p.policy.allow({url:cdn+'/resource',method:'GET',type}));
 await assert.rejects(p.policy.allow({url:cdn+'/app.js',method:'POST',type:'script'}));
 await assert.rejects(p.policy.allow({url:'https://other.example.net/app.js',method:'GET',type:'script'}));
 assert.equal(p.calls.length,0);
 assert.throws(()=>assertScope({operations:['capture:public'],origins:[page],resourceOrigins:[cdn]},{url:cdn+'/report'}));
});
test('redirect destinations are independently scoped; private/rebound DNS remains denied',async()=>{
 const p=policy({allowedResourceOrigins:[cdn],resolver:async()=>{throw Object.assign(new Error(),{code:'TARGET_DENIED'});}});
 await assert.rejects(p.policy.allow({url:cdn+'/app.js',method:'GET',type:'script'}),{code:'TARGET_DENIED'});
 await assert.rejects(p.policy.allow({url:'http://127.0.0.1/app.js',method:'GET',type:'script'}),{code:'TARGET_DENIED'});
});
test('authenticated recipes never inherit cross-origin resource permission',async()=>{
 const p=policy({allowedResourceOrigins:[cdn],recipe:{origin:page,resourcePaths:['/app.js']}});
 await assert.rejects(p.policy.allow({url:cdn+'/app.js',method:'GET',type:'script'}));assert.equal(p.calls.length,0);
});
test('resource scope defaults closed and validates exact bounded public HTTPS origins',()=>{
 assert.deepEqual(resourceOrigins({}),[]);
 for(const value of ['*','http://assets.example.net',cdn+'/',cdn+'/path','https://127.0.0.1','https://user:pass@assets.example.net','https://assets.example.net:8443']) assert.throws(()=>resourceOrigins({resourceOrigins:[value]}));
 assert.throws(()=>resourceOrigins({resourceOrigins:Array(17).fill(cdn)}));
 assert.throws(()=>resourceOrigins({resourceOrigins:'*'}));
});
