'use strict';
const c=require('./contracts');
// Generic field metadata is not a site recipe. Values travel only via the
// authenticated host channel; selection is bound before owner entry.
const valuesSchema={type:'array',items:{type:'string',maxLength:4096},minItems:1,maxItems:8,uniqueItems:false};
function selection(record){return Array.isArray(record.fields)?{observationId:record.observationId,fields:record.fields,...(record.submitRef?{submitRef:record.submitRef}:{})}:{};}
function matches(record,action){return c.digest(selection(record))===c.digest(selection(action));}
function validateValues(record,values){
 c.validate(valuesSchema,values);
 if(!Array.isArray(record.fields)||values.length!==record.fields.length||values.reduce((n,v)=>n+Buffer.byteLength(v),0)>16384)c.deny('INVALID_INPUT');
 return values;
}
function buffers(record,values){return Object.fromEntries(validateValues(record,values).map((v,i)=>['field_'+i,Buffer.from(v)]));}
function validBuffers(secret){
 if(!secret||typeof secret!=='object')c.deny('INVALID_INPUT');
 const keys=Object.keys(secret),generic=keys[0]==='field_0';
 if(generic){if(keys.length<1||keys.length>8||keys.some((k,i)=>k!=='field_'+i))c.deny('INVALID_INPUT');}
 else if(keys.length!==2||!keys.includes('username')||!keys.includes('password'))c.deny('INVALID_INPUT');
 if(keys.some(k=>!Buffer.isBuffer(secret[k])||secret[k].length>16384)||keys.reduce((n,k)=>n+secret[k].length,0)>(generic?16384:32768))c.deny('LIMIT_EXCEEDED');
 return keys;
}
function encode(secret){return Object.fromEntries(validBuffers(secret).map(k=>[k,secret[k].toString('base64')]));}
function decode(encoded){
 if(!encoded||typeof encoded!=='object'||Array.isArray(encoded))c.deny('INVALID_INPUT');
 const keys=Object.keys(encoded),secret={};
 try{
  if(keys.length>8)c.deny('INVALID_INPUT');
  for(const k of keys){if(!/^(username|password|field_[0-7])$/.test(k)||typeof encoded[k]!=='string'||encoded[k].length>22000||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded[k]))c.deny('INVALID_INPUT');secret[k]=Buffer.from(encoded[k],'base64');encoded[k]='';}
  validBuffers(secret);return secret;
 }catch(error){Object.values(secret).forEach(b=>b.fill(0));throw error;}
}
module.exports={valuesSchema,selection,matches,validateValues,buffers,validBuffers,encode,decode};
