'use strict';
const c=require('./contracts');
// No connect at construction. Credentials are supplied by the operator and never
// returned, logged, persisted in a plan or inherited from the legacy public cache.
function createRuntimeClients({postgresUrl,redisUrl,maxConnections=4,Pool,Redis}={}) {
  let pgUrl,cacheUrl;
  try{pgUrl=new URL(postgresUrl);cacheUrl=new URL(redisUrl);}catch{c.deny('UNAVAILABLE');}
  if(!['postgres:','postgresql:'].includes(pgUrl.protocol)||!['redis:','rediss:'].includes(cacheUrl.protocol)||
     !Number.isInteger(maxConnections)||maxConnections<1||maxConnections>4)c.deny('UNAVAILABLE');
  let pool,redis;
  try {
    const PgPool=Pool||require('pg').Pool,RedisClient=Redis||require('ioredis');
    pool=new PgPool({connectionString:postgresUrl,max:maxConnections,connectionTimeoutMillis:2000,
      idleTimeoutMillis:10000,statement_timeout:5000,query_timeout:6000,application_name:'web-read-v1'});
    // Idle connection errors must not terminate the worker or leak connection text.
    pool.on('error',()=>{});
    redis=new RedisClient(redisUrl,{lazyConnect:true,connectTimeout:2000,commandTimeout:5000,
      maxRetriesPerRequest:0,enableOfflineQueue:false,autoResendUnfulfilledCommands:false,retryStrategy:()=>null});
    redis.on('error',()=>{});
  }catch{if(pool)void pool.end().catch(()=>{});c.deny('UNAVAILABLE');}
  let closed=false;
  return Object.freeze({pool,redis,
    async open(){if(closed)c.deny('UNAVAILABLE');try{await redis.connect();await pool.query('SELECT 1');}catch{redis.disconnect();await pool.end().catch(()=>{});closed=true;c.deny('UNAVAILABLE');}},
    async close(){if(closed)return;closed=true;redis.disconnect();await pool.end();}
  });
}
module.exports={createRuntimeClients};
