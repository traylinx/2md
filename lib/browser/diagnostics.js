'use strict';
const c=require('./contracts');
// Closed vocabularies only. Never serialize an exception, request, DOM, URL,
// field/value, cookie, header, principal or credential reference.
const stages=new Set(['initialize','execute','auth_decision','auth_page','auth_targets','auth_private_transition','auth_credentials','auth_fill','auth_submit','auth_settle','auth_result','caller_before','host_proof','service','caller_after','response']);
const operations=new Set(['initialize',...Object.keys(c.schemas),'protected_input']);
function workerCode(code){return c.publicError(new c.BrowserError(code)).body.error;}
function failure({operation,stage,code,elapsedMs}){
 return {event:'browser_failure',operation:operations.has(operation)?operation:'execute',stage:stages.has(stage)?stage:'execute',code:workerCode(code),elapsedMs:Math.max(0,Math.min(3600000,Math.round(Number(elapsedMs)||0)))};
}
function emitFailure(value,write=line=>process.stderr.write(line+'\n')){write(JSON.stringify(failure(value)));}
module.exports={failure,emitFailure,workerCode,stages};
