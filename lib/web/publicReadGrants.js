'use strict';
const {createHash,randomUUID}=require('node:crypto');const c=require('./contracts');
const scope=p=>createHash('sha256').update(JSON.stringify(['public-read',p.authSubject,p.workspaceUserId,p.organizationId,p.projectId])).digest('hex');
function limits(value){
 c.exact(value,['origins','maxUrls','deadlineMs','maxResponseBytes','expiresAt']);
 if(!Array.isArray(value.origins)||!value.origins.length||value.origins.length>20)c.deny();
 const origins=value.origins.map(v=>{try{if(new URL(v).origin!==v)c.deny();c.publicTargets([v]);return v;}catch{c.deny();}});
 if(new Set(origins).size!==origins.length)c.deny();
 for(const [key,min,max] of [['maxUrls',1,5],['deadlineMs',1000,180000],['maxResponseBytes',1024,2097152],['expiresAt',1,Number.MAX_SAFE_INTEGER]])
  if(!Number.isSafeInteger(value[key])||value[key]<min||value[key]>max)c.deny();
 return {...value,origins};
}
function covers(g,p){return g.policyVersion===p.policyVersion&&g.expiresAt>Date.now()&&p.urls.length<=g.maxUrls&&p.deadlineMs<=g.deadlineMs&&p.maxResponseBytes<=g.maxResponseBytes&&p.urls.every(u=>g.origins.includes(new URL(u).origin));}
function createPublicReadGrants({pool,policyVersion}){
 async function query(sql,args){try{return await pool.query(sql,args);}catch(e){if(e.code==='P0001'&&['FORBIDDEN','STALE_PLAN','PUBLIC_READ_PERMISSION_REQUIRED','ALREADY_ADMITTED','IDEMPOTENCY_CONFLICT'].includes(e.message))c.deny(e.message);c.deny('UNAVAILABLE');}}
 async function list(principal){const actor=c.executionPrincipal(principal);if(actor.kind!=='agent')return [];
 const r=await query('SELECT grant_id,body,expires_at FROM web_read.public_read_grants WHERE owner_scope=$1 AND NOT revoked AND expires_at>$2 ORDER BY created_at DESC LIMIT 100',[scope(actor),Date.now()]);
 return r.rows.filter(row=>row.body.policyVersion===policyVersion).map(row=>({grantId:row.grant_id,...row.body,expiresAt:Number(row.expires_at)}));}
 return Object.freeze({list,
 async availability(plan,principal){const grants=await list(principal);return {canRun:grants.some(g=>covers(g,plan)),mode:'standing_public_read'};},
 async admit(plan,principal){const actor=c.executionPrincipal(principal);c.bindPrincipal(actor,plan);if(actor.kind!=='agent')c.deny('FORBIDDEN');
 // Selection is only a hint: SQL revalidates under a lock; recovery precedes grant checking.
 const g=(await list(actor)).find(g=>covers(g,plan));
 const r=await query('SELECT * FROM web_read.admit_public($1,$2,$3,$4,$5)',[plan.planId,c.digest(plan),scope(actor),g?.grantId||null,randomUUID()]);
 if(r.rows.length!==1)c.deny('UNAVAILABLE');const row=r.rows[0];return {executionId:row.execution_id,planDigest:row.plan_digest,state:row.state,replayed:row.replayed};},
 async create({plan,principal,approvedBy,grantId,spec}){
  c.bindPrincipal(c.executionPrincipal(principal),plan);if(principal.kind!=='agent')c.deny('FORBIDDEN');c.identifier(approvedBy);c.identifier(grantId);
  const bounded=limits(spec);if(bounded.expiresAt<=Date.now()||bounded.expiresAt>Date.now()+30*86400000)c.deny();
  const body={...bounded,policyVersion,organizationId:plan.organizationId,projectId:plan.projectId};
  const r=await query(`INSERT INTO web_read.public_read_grants(grant_id,owner_scope,body,approved_by,expires_at)
   VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING grant_id`,[grantId,scope(principal),JSON.stringify(body),approvedBy,bounded.expiresAt]);
  if(r.rows.length!==1){const old=await query('SELECT body,owner_scope,approved_by,revoked FROM web_read.public_read_grants WHERE grant_id=$1',[grantId]);
   if(old.rows.length!==1||old.rows[0].revoked||old.rows[0].owner_scope!==scope(principal)||old.rows[0].approved_by!==approvedBy||!require('node:util').isDeepStrictEqual(old.rows[0].body,body))c.deny('IDEMPOTENCY_CONFLICT');}
  return {grantId,...bounded};
 },
 async revoke({grantId,organizationId,projectId}){const r=await query("UPDATE web_read.public_read_grants SET revoked=true WHERE grant_id=$1 AND body->>'organizationId'=$2 AND body->>'projectId'=$3 RETURNING grant_id",[c.identifier(grantId),c.identifier(organizationId),c.identifier(projectId)]);if(r.rows.length!==1)c.deny('FORBIDDEN');return {grantId,revoked:true};}
 });
}
module.exports={createPublicReadGrants,limits,covers};
