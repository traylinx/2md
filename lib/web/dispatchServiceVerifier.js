'use strict';
const {createSentinelVerifier}=require('../capture/sentinelPrincipal');
const c=require('./contracts');
// Reuse the deployed receiver's SDK introspection and verifier-token lifecycle.
// This grant authorizes only the internal consume operation, not target origins.
function createDispatchServiceVerifier({searchAgentId,...configuration}={}) {
  c.identifier(searchAgentId);
  const verify=createSentinelVerifier({...configuration,grants:{[searchAgentId]:{operations:['web:consume-dispatch'],origins:[]}}});
  const authenticate=async(request,deadline)=>{
    const id=request.headers.get('x-agent-user-id'),token=request.headers.get('x-agent-secret-token');
    if(request.headers.has('authorization') || id!==searchAgentId || !token || !/^[^\s,]{1,16384}$/.test(token)) c.deny('UNAUTHENTICATED');
    return verify(token,id,deadline);
  };
  authenticate.close=()=>verify.close();
  return authenticate;
}
module.exports={createDispatchServiceVerifier};
