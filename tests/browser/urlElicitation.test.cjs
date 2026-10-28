'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createUrlElicitation}=require('../../lib/browser/urlElicitation');
const pending={state:'needs_input',interventionId:'input1',reason:'credentials',expiresAt:2000,inputUrl:'http://127.0.0.1:1234/credentials/input1'};
test('URL elicitation negotiates capability, offers once, and never changes pending authority',async()=>{
 let calls=0;const present=createUrlElicitation({getClientCapabilities:()=>({elicitation:{url:{}}}),elicitInput:async input=>{calls++;assert.equal(input.mode,'url');assert.equal(input.url,pending.inputUrl);return {action:'accept'};}},{now:()=>1000});
 const original=JSON.stringify(pending);await present({state:'needs_input',output:pending});await present(pending);assert.equal(calls,1);assert.equal(JSON.stringify(pending),original);
});
test('form-only, absent URL capability, external link, and expired input use link fallback without requests',async()=>{
 for(const capabilities of [{},{elicitation:{form:{}}}]){await createUrlElicitation({getClientCapabilities:()=>capabilities,elicitInput:()=>assert.fail('must not request')},{now:()=>1000})(pending);}
 let calls=0;const present=createUrlElicitation({getClientCapabilities:()=>({elicitation:{url:{}}}),elicitInput:async()=>{calls++;}},{now:()=>1000});
 await present({...pending,inputUrl:'https://evil.example/credentials/input1'});await present({...pending,expiresAt:999});assert.equal(calls,0);
});
test('elicitation transport failure leaves protected link usable and does not retry prompt',async()=>{
 let calls=0;const present=createUrlElicitation({getClientCapabilities:()=>({elicitation:{url:{}}}),elicitInput:async()=>{calls++;throw Error('unsupported');}},{now:()=>1000});
 await present(pending);await present(pending);assert.equal(calls,1);assert.ok(pending.inputUrl);
});
