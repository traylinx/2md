'use strict';
// Fixed vocabulary only: never serialize exceptions, URLs, headers, plans or tokens.
const stages={dispatch:new Set(['proof','transport','response','result']),grant:new Set(['request','verify','reference','lookup','plan','authorize','consume','expiry']),worker:new Set(['policy','authorize','dispatch','validate','cache','finish'])};
const codes=new Set(['UNAUTHENTICATED','FORBIDDEN','UNAVAILABLE','CANCELLED','INVALID_INPUT','INVALID_RESULT','STALE_PLAN','CAPACITY']);
function failure(component,stage,error,write=line=>process.stderr.write(line)){
 if(!stages[component]?.has(stage))return;
 const code=codes.has(error?.code)?error.code:'UNAVAILABLE';
 try{write(JSON.stringify({event:'web_boundary_failure',component,stage,code})+'\n');}catch{/* Observation must not change the boundary outcome. */}
}
module.exports={failure};
