'use strict';
const {redactText}=require('../capture/redact');
// Redact page-controlled content, never generated IDs or protocol enums. A short
// access value such as "1" must not corrupt references needed for the next step.
const textKeys=new Set(['text','title','name','markdown','accountLabel']);
function redactUrl(value,secrets){
 const u=new URL(value);u.username='';u.password='';u.hash='';
 const scrub=part=>redactText(part,secrets.filter(s=>s.length>=4||s===part));
 u.pathname=u.pathname.split('/').map(segment=>{let raw;try{raw=decodeURIComponent(segment);}catch{return segment;}const next=scrub(raw);return next===raw?segment:encodeURIComponent(next);}).join('/');
 for(const [key,val]of [...u.searchParams]){const next=scrub(val);if(next!==val)u.searchParams.set(key,next);}
 return u.href;
}
function redactOutput(value,secrets,key=''){
 if(typeof value==='string')return textKeys.has(key)?redactText(value,secrets):key==='url'?redactUrl(value,secrets):value;
 if(Array.isArray(value))return value.map(v=>redactOutput(v,secrets,key));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,redactOutput(v,secrets,k)]));
 return value;
}
module.exports={redactOutput,redactUrl};
