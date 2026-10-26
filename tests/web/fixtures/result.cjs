'use strict';
const {createHash}=require('node:crypto');
const {alice}=require('./principals.json');
const {digest}=require('../../../lib/web/contracts');
module.exports=()=>{
 const hash=s=>createHash('sha256').update(s).digest('hex');
 const plan={version:1,planId:'p1',authSubject:alice.authSubject,workspaceUserId:alice.workspaceUserId,organizationId:alice.organizationId,projectId:alice.projectId,
 operation:'public-read',urls:['https://example.com/','https://example.org/'],policyVersion:'v1',outputSchema:'captured-pages-v1',deadlineMs:10000,maxResponseBytes:65536,expiresAt:Date.now()+60000,retention:'transient'};
 const result={state:'partial',manifest:{version:1,serviceAgentId:'search-id',urls:plan.urls,sha256:hash(JSON.stringify([1,'search-id',plan.urls]))},
 pages:[{url:plan.urls[0],success:true,finalUrl:plan.urls[0],markdown:'private output',sha256:hash('private output'),quality:'degraded'},
 {url:plan.urls[1],success:false,code:'NOT_ATTEMPTED'}]};
 return {plan,result,ref:{executionId:'r1',planDigest:digest(plan),workerId:'w1',fence:'1',plan,expiresAt:plan.expiresAt}};
};
