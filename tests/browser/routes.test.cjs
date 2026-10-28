'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const express=require('express'),request=require('supertest');
const c=require('../../lib/browser/contracts');const {createBrowserRouter}=require('../../routes/browser');
const {createBrowserControlRouter}=require('../../routes/browserControl');
const {bound,owner,principal,grant,observation}=require('./support.cjs');
function app(router){const a=express();a.use('/api/browser/v1',router);a.get('/legacy',(_q,r)=>r.json({unchanged:true}));return a;}
test('default off does not advertise a working browser or alter other routes',async()=>{
 const a=app(createBrowserRouter());await request(a).post('/api/browser/v1/sessions').send({}).expect(404);
 await request(a).get('/legacy').expect(200,{unchanged:true});
});
test('authenticated malformed JSON denied before parsing and before service',async()=>{
 let called=0;const a=app(createBrowserRouter({enabled:true,resolveCaller:async()=>c.deny('UNAUTHENTICATED'),service:{call:async()=>called++}}));
 await request(a).post('/api/browser/v1/sessions').set('Content-Type','application/json').send('{invalid').expect(401);assert.equal(called,0);
});
test('strict request and fresh owner binding are checked around execution',async()=>{
 let checks=0,calls=0;const a=app(createBrowserRouter({enabled:true,resolveCaller:async()=>{checks++;return bound;},service:{call:async()=>{calls++;return observation();}}}));
 const r=await request(a).post('/api/browser/v1/observe').send({sessionId:'s'}).expect(200);
 assert.equal(r.body.observationId,'o1');assert.equal(r.headers['cache-control'],'no-store');assert.equal(checks,2);
 await request(a).post('/api/browser/v1/observe').send({sessionId:'s',password:'never-reflect-this'}).expect(400);assert.equal(calls,1);
});
test('runtime result contracts reject accidental secret fields before serialization',async()=>{
 const a=app(createBrowserRouter({enabled:true,resolveCaller:async()=>bound,service:{call:async()=>({...observation(),cookies:'never-return'})}}));
 const r=await request(a).post('/api/browser/v1/observe').send({sessionId:'s'}).expect(503);
 assert.ok(!JSON.stringify(r.body).includes('never-return'));
});
test('revoked or changed caller never receives the service result',async()=>{
 let n=0;const a=app(createBrowserRouter({enabled:true,resolveCaller:async()=>++n===1?bound:{...bound,hostId:'changed'},service:{call:async()=>({private:'not returned'})}}));
 const r=await request(a).post('/api/browser/v1/extract').send({sessionId:'s'}).expect(403);assert.ok(!JSON.stringify(r.body).includes('not returned'));
});
test('cookies, cross-origin calls and already-parsed body cannot bypass the boundary',async()=>{
 let calls=0;const router=()=>createBrowserRouter({enabled:true,resolveCaller:async()=>{calls++;return bound;},service:{call:async()=>({})}});
 for(const header of ['Origin','Cookie']) await request(app(router())).post('/api/browser/v1/observe').set(header,'x').send({sessionId:'s'}).expect(403);
 const a=express();a.use(express.json());a.use('/api/browser/v1',router());await request(a).post('/api/browser/v1/observe').send({sessionId:'s'}).expect(503);assert.equal(calls,0);
});
test('unexpected errors are sanitized, not logged or reflected',async()=>{
 const a=app(createBrowserRouter({enabled:true,resolveCaller:async()=>bound,service:{call:async()=>{throw Error('sensitive body');}}}));
 const r=await request(a).post('/api/browser/v1/observe').send({sessionId:'s'}).expect(503);assert.ok(!JSON.stringify(r.body).includes('sensitive'));
});
test('human control refuses agent headers and agent principal before mutation',async()=>{
 let mutated=0;const r=createBrowserControlRouter({enabled:true,resolveHuman:async()=>principal,authority:{create:async()=>mutated++,revoke:async()=>mutated++}});
 const a=app(r);await request(a).post('/api/browser/v1/grants?organizationId=org-1&projectId=project-1').set('Authorization','Bearer synthetic').send(grant()).expect(403);
 await request(a).post('/api/browser/v1/grants?organizationId=org-1&projectId=project-1').set('X-Agent-User-Id','agent').send(grant()).expect(403);assert.equal(mutated,0);
});
test('owner grant creation has no public-read plan prerequisite and verifies owner twice',async()=>{
 let checks=0,received;const a=app(createBrowserControlRouter({enabled:true,resolveHuman:async()=>{checks++;return owner;},authority:{create:async(g,h)=>{received={g,h};return {grantId:g.grantId};},revoke:async()=>({})}}));
 await request(a).post('/api/browser/v1/grants?organizationId=org-1&projectId=project-1').set('Authorization','Bearer synthetic').send(grant()).expect(200,{grantId:'grant-1'});
 assert.equal(checks,2);assert.equal(received.h.authSubject,owner.authSubject);assert.ok(!Object.hasOwn(received.g,'planId'));
});
