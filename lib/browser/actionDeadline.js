'use strict';
const {performance}=require('node:perf_hooks');
const {Deadline}=require('../capture/deadline');
const c=require('./contracts');
// Browser-only deadline. An owner wait pauses active-action time, not the parent
// session lifetime. Only trusted orchestration receives pause/resume methods.
class ActionDeadline extends Deadline {
 constructor(budgetMs,parentSignal,{clock=()=>performance.now(),maxPauseMs=120000}={}){
  super(budgetMs,parentSignal);this.clock=clock;this.actionEnd=clock()+budgetMs;this.paused=null;this.pauseTimer=null;this.maxPauseMs=maxPauseMs;
 }
 remaining(reserveMs=0){
  this.signal.throwIfAborted();const left=Math.floor((this.paused?this.paused.remaining:this.actionEnd-this.clock())-reserveMs);
  if(left<=0)c.deny('DEADLINE');return left;
 }
 pause(id){
  c.validate(c.id,id);if(this.paused)c.deny('BUSY');
  const remaining=this.remaining();clearTimeout(this.timer);
  this.paused={id,remaining};this.pauseTimer=setTimeout(()=>this.abort('DEADLINE'),this.maxPauseMs);this.pauseTimer.unref?.();
 }
 resume(id){
  this.signal.throwIfAborted();if(!this.paused||this.paused.id!==id)c.deny('PERMISSION_REQUIRED');
  clearTimeout(this.pauseTimer);this.actionEnd=this.clock()+this.paused.remaining;this.paused=null;
  this.timer=setTimeout(()=>this.abort('DEADLINE'),this.remaining());this.timer.unref?.();
 }
 close(){clearTimeout(this.pauseTimer);super.close();}
}
module.exports={ActionDeadline};
