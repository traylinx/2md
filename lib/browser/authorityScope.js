'use strict';
const {AsyncLocalStorage}=require('node:async_hooks');
const storage=new AsyncLocalStorage();
// Deduplicate only identical current-principal checks inside one HTTP phase.
// No TTL/cross-request permission cache. Post-action checks use a new phase.
async function run(operation){
 const context={active:true,phase:'before',values:new Map()};
 return storage.run(context,async()=>{try{return await operation();}finally{context.active=false;context.values.clear();}});
}
function after(){const context=storage.getStore();if(context?.active&&context.phase==='before'){context.phase='after';context.values.clear();}}
async function memo(key,operation){
 const context=storage.getStore();if(!context?.active)return operation();
 if(context.values.has(key))return context.values.get(key);
 if(context.values.size>=32)return operation();
 const promise=Promise.resolve().then(operation);context.values.set(key,promise);
 try{return await promise;}catch(error){if(context.values.get(key)===promise)context.values.delete(key);throw error;}
}
module.exports={run,after,memo};
