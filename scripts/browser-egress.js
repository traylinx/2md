'use strict';
const {createSessionEgress}=require('../lib/browser/egressControl');
if(require.main===module){
  const app=createSessionEgress({token:process.env.BROWSER_PROXY_TOKEN});
  app.server.listen(8290,'0.0.0.0');
  process.once('SIGTERM',()=>app.close().finally(()=>process.exit(0)));
}
