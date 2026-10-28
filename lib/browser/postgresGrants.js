'use strict';
const c=require('./contracts');

// Durable permissions only. No sessions, credentials, private content or replay
// queue belong in this repository. Caller supplies an already configured pool.
function createPostgresGrants({pool}={}) {
  if(typeof pool?.query!=='function')c.deny('UNAVAILABLE');
  async function query(text,values,{signal}={}) {
    if(signal?.aborted)c.deny('CANCELLED');
    let result;try {result=await pool.query({text,values,query_timeout:5000});}
    catch {c.deny('UNAVAILABLE');}
    if(signal?.aborted)c.deny('CANCELLED');return result;
  }
  function scope(input) {for(const k of ['grantId','organizationId','projectId'])c.validate(c.id,input[k]);return [input.grantId,input.organizationId,input.projectId];}
  return Object.freeze({
    async create(record,options={}) {
      // Only grantAuthority creates this record after current human/agent checks.
      const raw=Object.fromEntries(Object.keys(c.grantSchema.properties).map(k=>[k,record[k]]));
      const g=c.parseGrant(raw);
      c.validate(c.id,record.approvedBy);c.validate(c.id,record.approvedByWorkspaceUserId);
      if(record.policyVersion!==c.POLICY||record.hostKeyFingerprint!==c.fingerprint(g.hostPublicKey))c.deny('INVALID_INPUT');
      const body={...g,policyVersion:record.policyVersion,approvedBy:record.approvedBy,
        approvedByWorkspaceUserId:record.approvedByWorkspaceUserId,hostKeyFingerprint:record.hostKeyFingerprint};
      const result=await query(`INSERT INTO web_browser.grants
        (grant_id,organization_id,project_id,agent_subject,host_id,body,expires_at)
        VALUES($1,$2,$3,$4,$5,$6::jsonb,$7) ON CONFLICT DO NOTHING RETURNING grant_id`,
        [g.grantId,g.agent.organizationId,g.agent.projectId,g.agent.authSubject,g.hostId,JSON.stringify(body),g.expiresAt],options);
      if(result.rows.length===1)return;
      const old=await this.get({grantId:g.grantId,organizationId:g.agent.organizationId,projectId:g.agent.projectId},options);
      if(!old||old.revoked)c.deny('IDEMPOTENCY_CONFLICT');
      const {revoked,...existing}=old;
      if(c.digest(existing)!==c.digest(body))c.deny('IDEMPOTENCY_CONFLICT');
    },
    async get(input,options={}) {
      const result=await query(`SELECT body,revoked FROM web_browser.grants
        WHERE grant_id=$1 AND organization_id=$2 AND project_id=$3`,scope(input),options);
      if(result.rows.length!==1)return null;
      return {...result.rows[0].body,revoked:result.rows[0].revoked};
    },
    async revoke(input,options={}) {
      const result=await query(`UPDATE web_browser.grants SET revoked=true
        WHERE grant_id=$1 AND organization_id=$2 AND project_id=$3 RETURNING grant_id`,scope(input),options);
      if(result.rows.length!==1)c.deny('FORBIDDEN');
    },
  });
}
module.exports={createPostgresGrants};
