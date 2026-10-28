'use strict';
let count=0,initialized=false;
process.on('message',message=>{
  const {requestId,name,input}=message;
  if(name==='initialize'){
    initialized=true;
    process.send({type:'result',requestId,result:{ready:true}});return;
  }
  if(!initialized)process.exit(2);
  if(name==='crash')process.exit(1);
  if(name==='hang')return;
  const allowed=['PATH','HOME','TMPDIR','LANG','PUPPETEER_EXECUTABLE_PATH'];
  // macOS inserts this CoreFoundation locale variable after process creation.
  if(process.platform==='darwin')allowed.push('__CF_USER_TEXT_ENCODING');
  process.send({type:'result',requestId,result:{count:++count,name,
    profileMode:require('node:fs').statSync(process.env.HOME).mode&0o777,
    environmentClean:Object.keys(process.env).every(k=>allowed.includes(k)),
    unexpectedEnvironmentKeys:Object.keys(process.env).filter(k=>!allowed.includes(k)),input}});
});
process.on('disconnect',()=>process.exit(0));
