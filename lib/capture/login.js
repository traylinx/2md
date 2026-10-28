'use strict';
const { CaptureError } = require('./errors');
const { readPageState } = require('./publicPageState');

async function verifyAccount(page, recipe, username, deadline, policy) {
  if(recipe.mode==='xhr'){if(!policy?.accountVerified)throw new CaptureError('TARGET_UNVERIFIED');return;}
  const matches = await deadline.run(() => page.evaluate((proof, expected) => {
    const element = document.querySelector(proof.selector);
    if (!element) return false;
    const actual = proof.attribute === 'textContent' ? element.textContent : element.getAttribute(proof.attribute);
    return actual?.trim() === expected;
  }, recipe.proof, username));
  if (!matches) throw new CaptureError('TARGET_UNVERIFIED');
}

async function login(page, request, recipe, policy, deadline) {
  await deadline.run(() => page.goto(request.loginUrl, { waitUntil: 'domcontentloaded', timeout: deadline.remaining(1200) }));
  await deadline.run(()=>page.waitForSelector(recipe.fields.password,{visible:true,timeout:deadline.remaining(1200)}));
  const state = await deadline.run(() => page.evaluate(readPageState));
  if (state.challenge) throw new CaptureError('HUMAN_REQUIRED');
  const valid = await deadline.run(() => page.evaluate(config => {
    const form = document.querySelector(config.fields.form);
    const user = document.querySelector(config.fields.username), password = document.querySelector(config.fields.password);
    const submit = document.querySelector(config.fields.submit);
    if (!form || !user || !password || !submit || user.form !== form || password.form !== form || submit.form !== form) return false;
    const action = new URL(form.action, location.href);
    if(config.mode==='xhr')return password.type==='password'&&!form.querySelector('input[type="file"]')&&submit.type==='submit';
    return form.method.toUpperCase() === 'POST' && action.origin === config.origin &&
      action.pathname === config.submitPath && !action.search && password.type === 'password' &&
      !form.querySelector('input[type="file"]') && !submit.formAction?.includes('javascript:');
  }, recipe));
  if (!valid) throw new CaptureError('AUTH_FAILED');
  await deadline.run(() => page.type(recipe.fields.username, request.auth.username));
  await deadline.run(() => page.type(recipe.fields.password, request.auth.password));
  if(recipe.mode==='xhr')return loginXhr(page,request,recipe,policy,deadline);
  policy.phase = 'submit';
  await deadline.run(() => Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: deadline.remaining(1200) }),
    page.click(recipe.fields.submit),
  ]));
  if (!policy.submitted) throw new CaptureError('AUTH_FAILED');
  policy.phase = 'read';
  await verifyAccount(page, recipe, request.auth.username, deadline);
}

async function loginXhr(page,request,recipe,policy,deadline){
  // Listen before clicking. Only compare one field; never return/log token JSON.
  let resolveProof;const proof=new Promise(resolve=>{resolveProof=resolve;});
  const observe=async response=>{
    if(response.url()!==recipe.proof.url||!['POST','GET'].includes(response.request().method())||!policy.submitted)return;
    if(response.status()!==200){resolveProof(false);return;}
    try{
      const text=await response.text();if(Buffer.byteLength(text)>65536)return;
      let value=JSON.parse(text);
      const visit=(object,depth=0)=>{if(!object||typeof object!=='object'||depth>6)return;for(const [key,item] of Object.entries(object)){
        if(/token|secret|session|password/i.test(key)&&typeof item==='string'&&item.length>=4&&item.length<=16384&&policy.privateSecrets.length<64)policy.privateSecrets.push(item);
        else if(typeof item==='object')visit(item,depth+1);
      }};visit(value);
      for(const part of recipe.proof.path){if(!value||typeof value!=='object'||!Object.hasOwn(value,part))return;value=value[part];}
      if(typeof value==='string'&&value.trim()===request.auth.username){policy.accountVerified=true;resolveProof(true);}else resolveProof(false);
    }catch{ /* Failed/invalid proof never authorizes extraction. */ }
  };
  page.on('response',observe);policy.phase='submit';
  try{
    await deadline.run(()=>page.click(recipe.fields.submit));
    if(!await deadline.run(()=>proof))throw new CaptureError('TARGET_UNVERIFIED');
    policy.phase='read';
    // Let the site's submit handler finish its navigation before our target goto.
    await require('./settle').settle(page,deadline);
  }finally{page.off('response',observe);}
}
module.exports = { login, verifyAccount };
