'use strict';
const c=require('./contracts');
const lease={sessionId:c.id,handoffId:c.id};
const input={oneOf:[
 c.obj({type:{const:'click'},x:c.num(0,1279),y:c.num(0,799)}),
 c.obj({type:{const:'scroll'},deltaY:c.num(-1000,1000)}),
 c.obj({type:{const:'text'},text:c.str(4096)}),
 c.obj({type:{const:'key'},key:{enum:['Tab','Enter','Backspace','Escape','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','PageUp','PageDown','Space']}}),
]};
const command=c.obj({...lease,runtimeEpoch:c.id,actionId:c.id,frameId:c.id,input});
const state=c.obj({state:{enum:['human_control','agent_control','expired']},sessionId:c.id,handoffId:c.id,expiresAt:c.num(1,Number.MAX_SAFE_INTEGER),action:c.outputSchemas.browser_action_status,pending:require('./operationBroker').requestSchema},['state','sessionId','handoffId','expiresAt']);
const schemas=Object.freeze({
 '/human-begin':c.obj({sessionId:c.id,viewerVersion:{const:2}},['sessionId']),'/human-activate':c.obj(lease),'/human-view':c.obj(lease),'/human-state':c.obj(lease),'/human-frame':c.obj(lease),'/human-input':command,'/human-interact':command,'/human-finish':c.obj(lease),
 '/human-decide':c.obj({...lease,operationId:c.id,operationDigest:c.str(64),decision:{enum:['approve','deny']}}),
});
const frame=c.obj({frameId:c.id,jpeg:c.str(1500000),width:{const:1280},height:{const:800},origin:c.origin});
const outputs=Object.freeze({
 '/human-begin':state,'/human-activate':state,'/human-view':c.obj({...state.properties,frame},state.required),'/human-state':state,'/human-frame':frame,'/human-input':c.outputSchemas.browser_action_status,'/human-interact':c.obj({...state.properties,frame},state.required),'/human-finish':c.obj({state:{const:'agent_control'}}),
 '/human-decide':{oneOf:[c.obj({prepared:{const:true}}),c.obj({cancelled:{const:true}})]},
});
const toolInput=c.obj({sessionId:c.id,action:{enum:['start','status']},reason:c.str(500)},['sessionId','action']);
const toolOutput=c.obj({sessionId:c.id,state:{enum:['human_control','agent_control','expired']},expiresAt:c.num(1,Number.MAX_SAFE_INTEGER),inputUrl:{type:'string',pattern:'^http://127\\.0\\.0\\.1:[0-9]+/takeover/[A-Za-z0-9_-]{43}$',maxLength:256}},['sessionId','state','expiresAt']);
module.exports={schemas,outputs,command,state,frame,toolInput,toolOutput};
