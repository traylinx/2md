'use strict';
const c=require('./contracts');
const opaque={type:'string',pattern:'^[A-Za-z0-9_-]{43}$',minLength:43,maxLength:43};
const owner=c.obj({workspaceUserId:c.id,organizationId:c.id,projectId:c.id});
const schemas=Object.freeze({
 '/heartbeat':c.obj({sessionId:c.id}),
 '/pair-begin':c.obj({grantId:c.id,state:opaque,challenge:opaque,redirectUri:c.str(512)}),
 '/pair-exchange':c.obj({pairingId:c.id,state:opaque,code:opaque,verifier:{type:'string',pattern:'^[A-Za-z0-9_-]{43,128}$',minLength:43,maxLength:128}}),
 '/owner-check':c.obj({owner}),
});
const outputs=Object.freeze({
 '/heartbeat':c.obj({sessionId:c.id,state:{enum:['opening','active','needs_input']}}),
 '/pair-begin':c.obj({pairingId:c.id,expiresAt:c.num(1,Number.MAX_SAFE_INTEGER)}),
 '/pair-exchange':c.obj({owner,hostId:c.id,hostKeyFingerprint:{type:'string',pattern:'^[a-f0-9]{64}$',minLength:64,maxLength:64},grantId:c.id}),
 '/owner-check':c.obj({authorized:{const:true}}),
});
module.exports={schemas,outputs};
