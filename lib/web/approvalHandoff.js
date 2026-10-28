'use strict';
const {createHash}=require('node:crypto');
const c=require('./contracts');

// Inform the host before it asks for consent. Chat text is not authenticated
// owner approval; do not manufacture a confirmation or expose control secrets.
function approvalHandoff(planId,expired){
 c.identifier(planId);
 return {
  status:expired?'plan_expired':'external_owner_approval_required',
  chatApprovalSupported:false,
  approvalStateVerified:false,
  instruction:expired?'This plan expired. Propose a new plan; do not execute or silently renew approval.':
   'Show the exact plan and explain that chat yes/go does not record owner approval in this host. The owner must use the separate authenticated control channel. Never request credentials in chat or run the owner command as the agent.',
  ownerCommand:expired?null:{cwd:'html2md',argv:['node','scripts/web-agent-approve.js',planId],requires:'User-operated terminal with separately configured OWNER/ADMIN control credentials; not the MCP environment.'},
  afterApproval:expired?null:{tool:'run_approved_read',required:['planId','confirmationId'],instruction:'Use the confirmation ID returned by the owner control. The server verifies consent. Reuse the same pair after an uncertain response; never mint a replacement confirmation to retry.'}
 };
}
function admissionKey(planId,confirmationId){
 c.identifier(planId);c.identifier(confirmationId);
 return 'mcp-read-'+createHash('sha256').update(JSON.stringify([planId,confirmationId])).digest('hex');
}
const {instructions}=require('./hostGuide');
module.exports={approvalHandoff,admissionKey,instructions};
