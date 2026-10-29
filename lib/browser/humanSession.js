'use strict';
const {randomUUID}=require('node:crypto'),c=require('./contracts'),h=require('./humanContracts');
// Only the trusted parent invokes these commands. No model tool exposes pixels,
// coordinates, keystrokes, raw CDP, JavaScript, selectors or file upload.
function createHumanSession({page,network,observations,warnings,remember,enabled=false}={}){
 let active=false,frame=null,asyncNetwork=false,responsive=false;const frames=new Map();
 page.on?.('framenavigated',changed=>{if(changed===page.mainFrame()){frames.clear();frame=null;}});
 return {async execute(name,input,deadline){
  if(!enabled)c.deny('UNSUPPORTED');
  if(name==='human_begin'){
   if(active)c.deny('BUSY');asyncNetwork=input.asyncNetwork===true;responsive=asyncNetwork&&input.responsive===true;frames.clear();await deadline.run(()=>network.enterHuman(new URL(page.url()).origin,{asyncNetwork}));await observations.clear();active=true;frame=null;return {state:'active'};
  }
  if(!active)c.deny('FORBIDDEN');
  if(name==='human_end'){network.endHuman();active=false;frame=null;frames.clear();await observations.clear();return {state:'active'};}
  if(name==='human_frame'){
   const jpeg=await deadline.run(()=>page.screenshot({type:'jpeg',quality:65,encoding:'base64',captureBeyondViewport:false}));
   const result=c.parse(h.frame,{frameId:randomUUID(),jpeg,width:1280,height:800,origin:new URL(page.url()).origin,...(asyncNetwork?{network:network.diagnostics()}:{} )});frame={id:result.frameId,expiresAt:Date.now()+30000,url:page.url()};if(responsive){for(const [id,f]of frames)if(f.expiresAt<=Date.now()||f.url!==page.url())frames.delete(id);frames.set(frame.id,frame);while(frames.size>3)frames.delete(frames.keys().next().value);}return result;
  }
  if(name!=='human_input')c.deny('UNSUPPORTED');
  c.parse(h.command,input);if(asyncNetwork&&network.state().pending)c.deny('OPERATION_PERMISSION_REQUIRED');const selected=responsive?frames.get(input.frameId):frame;if(!selected||selected.id!==input.frameId||selected.expiresAt<=Date.now()||responsive&&selected.url!==page.url())c.deny('STALE_REFERENCE');frame=null;frames.clear();
  await observations.clear();network.startHumanAuthentication(input.actionId);
  try{
   const a=input.input;
   if(a.type==='click')await deadline.run(()=>page.mouse.click(a.x,a.y));
   else if(a.type==='scroll')await deadline.run(()=>page.mouse.wheel({deltaY:a.deltaY}));
   else if(a.type==='key')await deadline.run(()=>page.keyboard.press(a.key));
   else if(a.type==='text'){remember(a.text);await deadline.run(()=>page.keyboard.sendCharacter(a.text));}
   // Human control observes asynchronous changes; a dispatched input is not page completion.
   // The persistent consent bridge continues to protect delayed work. Legacy still settles.
   if(!responsive)await require('./settle').settlePage(page,deadline,{pending:()=>network.state().pending,warnings});return {state:'active'};
  }finally{if(!asyncNetwork)network.endAuthentication();}
 }};
}
module.exports={createHumanSession};
