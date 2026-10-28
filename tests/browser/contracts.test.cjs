'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const c = require('../../lib/browser/contracts');
const open = {runtimeEpoch:'epoch-1',actionId:'open-1',url:'https://unfamiliar.example.org/start',purpose:'Read account overview',mode:'login_read'};
const bad = fn => assert.throws(fn, e => e instanceof c.BrowserError && e.code === 'INVALID_INPUT');
test('unknown sites use generic tools with no connection, recipe or vendor parameter', () => {
  assert.equal(c.toolDefinitions.length,10);
  assert.equal(c.parseTool('browser_open',open).url,open.url);
  assert.equal(c.parseTool('browser_credentials',{sessionId:'s1',origin:'https://another.example.org',purpose:'Account login'}).origin,'https://another.example.org');
  assert.ok(c.toolDefinitions.every(t => t.inputSchema.additionalProperties === false && t.description.length > 80));
});
test('strict contracts reject raw credentials, scripts, selectors and forged approval', () => {
  for (const key of ['password','cookie','token','script','selector','approved','connectionId','loginStrategyId']) bad(() => c.parseTool('browser_open',{...open,[key]:'x'}));
  bad(() => c.parseTool('browser_act',{sessionId:'s',runtimeEpoch:'e',actionId:'a',observationId:'o',action:{type:'evaluate',script:'x'}}));
  bad(() => c.parseTool('browser_act',{sessionId:'s',runtimeEpoch:'e',actionId:'a',observationId:'o',action:{type:'click',ref:'r',password:'x'}}));
});
test('creation recovery needs no lost session id; changed action payload has a different digest', () => {
  assert.deepEqual(c.parseTool('browser_action_status',{runtimeEpoch:'epoch-1',actionId:'open-1'}),{runtimeEpoch:'epoch-1',actionId:'open-1'});
  assert.equal(c.digest(open),c.digest(Object.fromEntries(Object.entries(open).reverse())));
  assert.notEqual(c.digest(open),c.digest({...open,url:'https://unfamiliar.example.org/next'}));
});
test('URL contracts reject local targets, secrets in URLs and non-HTTPS', () => {
  for (const url of ['http://example.org','https://localhost','https://127.0.0.1','https://example.org/?token=abc','https://user:pass@example.org','file:///etc/passwd']) {
    assert.throws(() => c.parseTool('browser_open',{...open,url}),e => e instanceof c.BrowserError);
  }
});
test('DOM actions are bounded typed unions and credential refs are not raw passwords', () => {
  const base={sessionId:'s',runtimeEpoch:'e',actionId:'a',observationId:'o'};
  for (const action of [{type:'click',ref:'r'},{type:'fill',ref:'r',text:'query'},{type:'select',ref:'r',values:['one']},{type:'scroll',deltaY:300},{type:'wait',milliseconds:500},{type:'select_page',pageId:'p'}]) assert.ok(c.parseTool('browser_act',{...base,action}));
  bad(() => c.parseTool('browser_act',{...base,action:{type:'wait',milliseconds:30001}}));
  bad(() => c.parseTool('browser_authenticate',{...base,credentialRef:'c',fields:{},submitRef:'r'}));
  assert.ok(c.parseTool('browser_authenticate',{...base,credentialRef:'c',fields:{usernameRef:'u'},submitRef:'r'}));
});
test('unknown tools and unexpected internal errors never reflect input or details', () => {
  assert.throws(() => c.parseTool('eval',{}),e=>e.code==='UNSUPPORTED');
  assert.deepEqual(c.publicError(new Error('credential-value')), {status:503,body:{error:'UNAVAILABLE',recovery:'Retry status with the original action ID; do not repeat an uncertain action.'}});
});
test('every tool publishes a bounded output contract and output never permits raw auth fields',()=>{
 assert.ok(c.toolDefinitions.every(t=>t.outputSchema));
 const value={sessionId:'s',state:'closed'};assert.deepEqual(c.parseResult('browser_close',value),value);
 bad(()=>c.parseResult('browser_close',{...value,cookies:'never-serialize'}));
 assert.ok(c.parseResult('browser_action_status',{runtimeEpoch:'e',actionId:'a',state:'outcome_unknown'}));
 bad(()=>c.parseResult('browser_action_status',{runtimeEpoch:'e',actionId:'a',state:'succeeded',output:{password:'x'}}));
});
