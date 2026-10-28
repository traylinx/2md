'use strict';
// Elicitation is presentation only. Acceptance never supplies credentials, signs
// consent or grants owner authority. The protected page retains all checks.
function createUrlElicitation(server,{now=Date.now}={}){
 const offered=new Map();
 return async function present(result,signal){
  if(!server.getClientCapabilities()?.elicitation?.url)return;
  const pending=result?.state==='needs_input'&&result.inputUrl?result:result?.output?.state==='needs_input'?result.output:null;
  if(!pending?.inputUrl||!pending.interventionId)return;
  let url;try{url=new URL(pending.inputUrl);}catch{return;}
  if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||!/^\/(credentials|decisions|operations)\/[A-Za-z0-9_-]+$/.test(url.pathname)||url.search||url.hash)return;
  for(const [id,expiry]of offered)if(expiry<=now())offered.delete(id);
  if(offered.has(pending.interventionId)||offered.size>=64||pending.expiresAt<=now())return;
  offered.set(pending.interventionId,pending.expiresAt);
  try{await server.elicitInput({mode:'url',elicitationId:pending.interventionId,url:url.href,message:'Open the protected Traylinx input page to complete this step. Accepting this prompt is not owner approval; the page verifies your identity and requested action.'},{timeout:10000,signal});}
  catch{/* Unsupported, declined transport or timeout: retain the original link. */}
 };
}
module.exports={createUrlElicitation};
