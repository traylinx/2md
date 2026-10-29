'use strict';
const c=require('./contracts');
function createBrowserService({manager,authorize,credentialService,privateReady=async()=>false,agentInputReady=async()=>false}={}){
  if(!manager||['open','query','execute','describe','status','close'].some(k=>typeof manager[k]!=='function')||typeof authorize!=='function')c.deny('UNAVAILABLE');
  async function capabilities(bound,input){
    let grant=null;try{grant=await authorize(bound);}catch(error){if(error.code!=='PERMISSION_REQUIRED')throw error;}
    const privateAvailable=typeof credentialService==='function'&&await privateReady(bound)===true;
    const available=Object.keys(c.schemas).filter(name=>privateAvailable||!['browser_credentials','browser_authenticate'].includes(name));
    const permitted=grant?available.filter(name=>!['browser_credentials','browser_authenticate'].includes(name)||grant.operations.includes('browser:login_read')):['get_browser_capabilities'];
    return c.parseResult('get_browser_capabilities',{agent:'Traylinx Web Agent',protocolVersion:1,runtimeEpoch:manager.runtimeEpoch,
      implemented:Object.keys(c.schemas),available,permitted,permission:grant?'granted':'permission_required',credentialChannel:privateAvailable?'protected_provider':'unavailable',...(input.includeInputModes?{inputModes:privateAvailable?['username_password','observed_fields']:[]}:{}),...(input.includeAgentInput?{agentInputAvailable:!!(privateAvailable&&grant?.operations.includes('browser:login_read')&&await agentInputReady(bound))}:{}),limits:grant?.limits||c.LIMITS});
  }
  return Object.freeze({async call(name,raw,bound,{signal}={}){
    const b=c.binding(bound),input=c.parseTool(name,raw);if(signal?.aborted)c.deny('CANCELLED');
    if(name==='get_browser_capabilities')return capabilities(b,input);
    let result;
    switch(name){
      case 'browser_open':
        if(input.mode==='login_read'&&(typeof credentialService!=='function'||await privateReady(b)!==true))c.deny('UNSUPPORTED');
        result=await manager.open(b,input);break;
      case 'browser_observe':case 'browser_extract':result=await manager.query(b,name,input);break;
      case 'browser_navigate':case 'browser_act':result=await manager.execute(b,name,input);break;
      case 'browser_authenticate':
        if(typeof credentialService!=='function'||await privateReady(b)!==true)c.deny('UNSUPPORTED');
        result=await manager.execute(b,name,input);break;
      case 'browser_action_status':result=await manager.status(b,input);break;
      case 'browser_close':result=await manager.close(b,input.sessionId);break;
      case 'browser_credentials':{
        if(typeof credentialService!=='function'||await privateReady(b)!==true)c.deny('UNSUPPORTED');
        const session=await manager.describe(b,input.sessionId);
        if(session.mode!=='login_read'||!session.ownerId)c.deny('PERMISSION_REQUIRED');
        result=await credentialService({bound:b,input,session,signal});
        await manager.describe(b,input.sessionId);break;
      }
      default:c.deny('UNSUPPORTED');
    }
    if(signal?.aborted)c.deny('CANCELLED');return c.parseResult(name,result);
  }});
}
module.exports={createBrowserService};
