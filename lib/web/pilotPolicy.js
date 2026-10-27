'use strict';
const {createHash}=require('node:crypto');const c=require('./contracts');
// Operator-owned rollout boundary, applied only after principal verification.
function createPilotPolicy(env,prefix){
 try{
 const organizationId=c.identifier(env.WEB_PILOT_ORGANIZATION_ID),projectId=c.identifier(env.WEB_PILOT_PROJECT_ID);
 const raw=env.WEB_CAPTURE_ALLOWED_ORIGINS;
 if(typeof raw!=='string')c.deny();
 const origins=raw.split(',');
 if(!origins.length||origins.length>20||new Set(origins).size!==origins.length)c.deny();
 for(const origin of origins){if(new URL(origin).origin!==origin)c.deny();c.publicTargets([origin]);}
 const allowed=new Set(origins);
 const base=c.identifier(env[prefix+'_POLICY_VERSION']);
 // A changed source or pilot scope invalidates already-approved plans automatically.
 const policyVersion=c.identifier('pilot-'+createHash('sha256').update(JSON.stringify([base,organizationId,projectId,[...origins].sort()])).digest('hex'));
 function principal(value){const p=c.executionPrincipal(value);if(p.organizationId!==organizationId||p.projectId!==projectId)c.deny('FORBIDDEN');return p;}
 function targets(values){const urls=c.publicTargets(values);if(urls.some(url=>!allowed.has(new URL(url).origin)))c.deny('TARGET_DENIED');return urls;}
 function plan(value){const p=c.plan(value);if(p.organizationId!==organizationId||p.projectId!==projectId)c.deny('FORBIDDEN');if(p.policyVersion!==policyVersion)c.deny('STALE_PLAN');targets(p.urls);return p;}
 return Object.freeze({policyVersion,principal,targets,plan,wrap:resolve=>async(...args)=>principal(await resolve(...args)),wrapOwner:resolve=>async(value,...args)=>{plan(value);return principal(await resolve(value,...args));}});
 }catch{c.deny('UNAVAILABLE');}
}
module.exports={createPilotPolicy};
