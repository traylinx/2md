'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createHumanSurface}=require('../../lib/browser/humanSurface');
test('expired and consumed handoff links give distinct user guidance, never new authority',async()=>{
 let now=Date.now(),calls=0;const surface=await createHumanSurface({now:()=>now,client:{protectedCall:async()=>{calls++;throw Error('Must not call runtime');}}});
 try{
  const record={sessionId:'s',handoffId:'h',expiresAt:now+180000};
  const url=surface.urlFor(record,'e');const first=await fetch(url,{redirect:'manual'});assert.equal(first.status,303);assert.match(first.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
  const used=await fetch(url,{redirect:'manual'});assert.equal(used.status,403);assert.match(await used.text(),/already opened/);assert.equal(used.headers.get('set-cookie'),null);
  now+=180001;const expired=await fetch(url);assert.equal(expired.status,410);const body=await expired.text();assert.match(body,/has expired/);assert.match(body,/does not mean your website credentials were rejected/);assert.ok(!body.includes(new URL(url).pathname));
  const fresh=surface.urlFor({sessionId:'s2',handoffId:'h2',expiresAt:now+1000},'e');now+=1001;const neverOpened=await fetch(fresh);assert.equal(neverOpened.status,410);assert.match(await neverOpened.text(),/fresh authorized browser session/);
  assert.equal((await fetch(url,{headers:{origin:'https://untrusted.example'}})).status,403);assert.equal((await fetch(new URL('/takeover/'+'a'.repeat(43),url))).status,403);
  assert.equal(expired.headers.get('cache-control'),'no-store');assert.match(expired.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.equal(calls,0);
  now+=600001;assert.equal((await fetch(url)).status,403); // Bounded history is forgotten.
 }finally{await surface.close();}
});
test('reason history is bounded and never makes a replaced link reusable',async()=>{
 const now=Date.now(),surface=await createHumanSurface({now:()=>now,client:{protectedCall:async()=>{throw Error('No runtime call');}}});
 try{const urls=[];for(let i=0;i<35;i++)urls.push(surface.urlFor({sessionId:'s',handoffId:'h',expiresAt:now+180000},'e'));
 const old=await fetch(urls[0]);assert.equal(old.status,403);assert.equal(old.headers.get('content-type'),'application/json');
 const replaced=await fetch(urls[33]);assert.equal(replaced.status,403);assert.equal(replaced.headers.get('set-cookie'),null);assert.match(await replaced.text(),/was replaced/);
 const active=await fetch(urls[34],{redirect:'manual'});assert.equal(active.status,303);
 }finally{await surface.close();}
});
