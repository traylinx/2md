'use strict';
const c=require('./contracts');
function createDispatcher({pool,processRun,reconcileExpired,concurrency=2,intervalMs=1000}={}) {
  if(typeof pool?.query!=='function' || typeof processRun!=='function' || typeof reconcileExpired!=='function' ||
    !Number.isInteger(concurrency) || concurrency<1 || concurrency>4 || !Number.isInteger(intervalMs) || intervalMs<250 || intervalMs>60000)c.deny('UNAVAILABLE');
  let active=null,timer=null,started=false,stopped=false;const controller=new AbortController();
  const status={ticks:0,claimed:0,errors:0,reconciled:0};
  async function work(){
    if(stopped)return;
    status.reconciled+=await reconcileExpired(100);
    if(stopped)return;
    const rows=await pool.query(`SELECT o.execution_id FROM web_read.outbox o JOIN web_read.runs r ON r.execution_id=o.execution_id
      WHERE r.state='admitted' ORDER BY o.created_at,o.execution_id LIMIT $1`,[concurrency]);
    if(stopped)return;
    await Promise.all(rows.rows.map(async row=>{
      try {const executionId=c.identifier(row.execution_id);const result=await processRun({executionId,signal:controller.signal});
        if(result.state!=='not_claimed')status.claimed++;}
      catch {status.errors++;} // no raw DB/token/URL errors in diagnostics
    }));status.ticks++;
  }
  function tick(){
    if(active)return active; if(stopped)return Promise.resolve();
    active=work().catch(()=>{status.errors++;}).finally(()=>{active=null;});return active;
  }
  const schedule=()=>{if(stopped)return;timer=setTimeout(async()=>{await tick();schedule();},intervalMs);timer.unref?.();};
  return Object.freeze({tick,
    start(){if(started || stopped)return;started=true;schedule();},
    async stop(){stopped=true;clearTimeout(timer);controller.abort();if(active)await active;},
    status:()=>Object.freeze({...status,running:started&&!stopped,busy:active!==null})
  });
}
module.exports={createDispatcher};
