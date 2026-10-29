'use strict';
const c=require('./contracts');
const decisionSchema=c.obj({sessionId:c.id,operationId:c.id,operationDigest:c.str(64),recipients:{type:'array',items:c.origin,minItems:1,maxItems:32,uniqueItems:true},nonce:c.id,expiresAt:c.num(1,Number.MAX_SAFE_INTEGER)});
const schemas=Object.freeze({
 '/input-agent-supply':c.obj({interventionId:c.id,values:require('./fieldInput').valuesSchema}),
 '/input-agent-prepare':c.obj({request:c.schemas.browser_authenticate}),
 '/operation-agent-complete':c.obj({operationId:c.id,operationDigest:c.str(64)}),
 '/operation-inspect':c.obj({operationId:c.id}),
 '/operation-complete':c.obj({operationId:c.id,proof:c.str(8192)}),
 '/operation-cancel':c.obj({operationId:c.id}),
 '/input-inspect':c.obj({interventionId:c.id}),
 '/input-supply':{oneOf:[c.obj({interventionId:c.id,username:{type:'string',maxLength:4096},password:c.str(4096),proof:c.str(8192)}),c.obj({interventionId:c.id,values:require('./fieldInput').valuesSchema,proof:c.str(8192)})]},
 '/input-prepare':c.obj({request:c.schemas.browser_authenticate,proof:c.str(8192),decision:decisionSchema,recipients:{type:'array',items:c.origin,minItems:1,maxItems:32,uniqueItems:true}}),
 '/input-cancel':c.obj({interventionId:c.id}),
});
const outputs=Object.freeze({
 '/input-agent-supply':c.obj({state:{const:'ready'},credentialRef:c.id,expiresAt:c.num(1,Number.MAX_SAFE_INTEGER)}),
 '/input-agent-prepare':c.obj({prepared:{const:true}}),
 '/operation-agent-complete':c.obj({prepared:{const:true}}),
 '/operation-inspect':c.obj({...require('./operationBroker').requestSchema.properties,ownerId:c.id}),
 '/operation-complete':c.obj({prepared:{const:true}}),
 '/operation-cancel':c.obj({cancelled:{const:true}}),
 '/input-inspect':c.obj({interventionId:c.id,sessionId:c.id,origin:c.origin,purpose:c.str(1000),ownerId:c.id,recipients:{type:'array',items:c.origin,minItems:1,maxItems:32,uniqueItems:true},expiresAt:c.num(1,Number.MAX_SAFE_INTEGER),...c.fieldSelection},['interventionId','sessionId','origin','purpose','ownerId','recipients','expiresAt']),
 '/input-supply':c.obj({state:{const:'ready'},credentialRef:c.id,expiresAt:c.num(1,Number.MAX_SAFE_INTEGER)}),
 '/input-prepare':c.obj({prepared:{const:true}}),
 '/input-cancel':c.obj({cancelled:{const:true}}),
});
module.exports={schemas,outputs};
