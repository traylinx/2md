'use strict';
// Runs only in a fresh, credential-free page. No input values, cookies, storage,
// scripts, headers or response bodies are returned to the model.
function inspectLoginPage(){
 const visible=e=>e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';
 const selector=e=>{
  if(e.id&&document.querySelectorAll('#'+CSS.escape(e.id)).length===1)return '#'+CSS.escape(e.id);
  const parts=[];for(let n=e;n&&n!==document.documentElement&&parts.length<16;n=n.parentElement){let index=1;for(let s=n.previousElementSibling;s;s=s.previousElementSibling)if(s.tagName===n.tagName)index++;parts.unshift(n.tagName.toLowerCase()+':nth-of-type('+index+')');}return parts.join(' > ');
 };
 const safe=value=>{try{const u=new URL(value,location.href);return u.origin+u.pathname;}catch{return null;}};
 return {url:safe(location.href),title:document.title.slice(0,256),readyState:document.readyState,
  headings:[...document.querySelectorAll('h1,h2,h3')].filter(visible).slice(0,12).map(e=>e.textContent.slice(0,160)),
  forms:[...document.forms].filter(visible).slice(0,8).map(f=>({selector:selector(f),method:f.method,action:safe(f.action),
   inputs:[...f.querySelectorAll('input')].filter(visible).slice(0,16).map(e=>({selector:selector(e),type:e.type,name:e.name.slice(0,128),autocomplete:e.autocomplete})),
   buttons:[...f.querySelectorAll('button,input[type=submit]')].filter(visible).slice(0,8).map(e=>({selector:selector(e),type:e.type,text:e.tagName==='BUTTON'?e.textContent.slice(0,80):''}))})),
  visibleText:(document.body?.innerText||'').slice(0,2000),
  challenge:[...document.querySelectorAll('[id*="captcha"],[class*="captcha"],iframe[src*="challenge"]')].some(visible)};
}
module.exports={inspectLoginPage};
