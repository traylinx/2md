'use strict';
const express=require('express');
const {createWebRuntime}=require('./runtime');
const {createWebRouter}=require('./httpRouter');
// Dedicated composition entry. No import-time listening, database connection,
// migration, global middleware modification or dispatcher autostart.
function createWebApplication({enabled=false,allowedOrigins=[],dependencies}={}) {
  const app=express();app.disable('x-powered-by');
  const runtime=enabled===true?createWebRuntime(dependencies):null;
  app.use('/web/v1',createWebRouter({enabled,runtime,allowedOrigins}));
  app.use((_req,res)=>res.status(404).set('Cache-Control','no-store').json({error:'NOT_FOUND'}));
  return Object.freeze({app,runtime,
    start(){runtime?.dispatcher.start();},
    async stop(){await runtime?.dispatcher.stop();}
  });
}
module.exports={createWebApplication};
