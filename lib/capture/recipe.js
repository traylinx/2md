'use strict';
const { CaptureError } = require('./errors');
const { parseTarget } = require('./targetPolicy');
const { exactKeys } = require('./requestContract');

function freezeRecipe(request) {
  const recipe = request.login;
  if (recipe?.mode === "xhr") return freezeXhrRecipe(request);
  exactKeys(recipe, ['submitPath', 'readPaths', 'resourcePaths', 'fields', 'proof'],
    ['submitPath', 'readPaths', 'fields', 'proof']);
  exactKeys(recipe.fields, ['form', 'username', 'password', 'submit']);
  exactKeys(recipe.proof, ['selector', 'attribute']);
  const origin = parseTarget(request.loginUrl).origin;
  const loginPath = new URL(request.loginUrl).pathname;
  if (!origin.startsWith('https:') ||
      !Array.isArray(recipe.readPaths) || !recipe.readPaths.length || recipe.readPaths.length > 32 ||
      (recipe.resourcePaths !== undefined && (!Array.isArray(recipe.resourcePaths) || recipe.resourcePaths.length > 64)) ||
      ![loginPath, recipe.submitPath, ...recipe.readPaths, ...(recipe.resourcePaths || [])].every(validPath) ||
      !Object.values(recipe.fields).every(validSelector) || !validSelector(recipe.proof.selector) ||
      !/^(?:data-[a-z0-9-]+|value|textContent)$/.test(recipe.proof.attribute)) {
    throw new CaptureError('INVALID_INPUT');
  }
  const target = new URL(request.url), login = new URL(request.loginUrl);
  if (target.origin !== origin || login.origin !== origin ||
      login.search || !recipe.readPaths.includes(target.pathname) || target.search) throw new CaptureError('FORBIDDEN');
  const snapshot = JSON.parse(JSON.stringify({ ...recipe, origin, loginPath, resourcePaths: recipe.resourcePaths || [] }));
  Object.freeze(snapshot.fields); Object.freeze(snapshot.proof); Object.freeze(snapshot.readPaths); Object.freeze(snapshot.resourcePaths);
  return Object.freeze(snapshot);
}

function validPath(path) { return typeof path === 'string' && /^\/(?!\/)[^?#\\\s]*$/.test(path); }
function validSelector(selector) { return typeof selector === 'string' && selector.length > 0 && selector.length <= 256; }

function freezeXhrRecipe(request) {
  const r=request.login;
  exactKeys(r,['mode','postUrls','readUrls','readPaths','resourceUrls','fields','proof'],['mode','postUrls','readUrls','readPaths','fields','proof']);
  exactKeys(r.fields,['form','username','password','submit']);
  exactKeys(r.proof,['url','path']);
  const origin=parseTarget(request.loginUrl).origin;
  const target=new URL(request.url),entry=new URL(request.loginUrl);
  const urls=(items,min,max,allowQuery=false)=>{
    if(!Array.isArray(items)||items.length<min||items.length>max)throw new CaptureError('INVALID_INPUT');
    const result=items.map(value=>{const u=parseTarget(value);if(u.protocol!=='https:'||(!allowQuery&&u.search)||u.hash)throw new CaptureError('INVALID_INPUT');return u.href;});
    if(new Set(result).size!==result.length)throw new CaptureError('INVALID_INPUT');return result;
  };
  const postUrls=urls(r.postUrls,1,3),readUrls=urls(r.readUrls,0,32,true),resourceUrls=urls(r.resourceUrls||[],0,64);
  if(!origin.startsWith('https:')||target.origin!==origin||target.search||entry.search||
    !Array.isArray(r.readPaths)||!r.readPaths.length||r.readPaths.length>32||!r.readPaths.every(validPath)||!r.readPaths.includes(target.pathname)||
    !Object.values(r.fields).every(validSelector)||!postUrls.concat(readUrls).includes(r.proof.url)||
    !Array.isArray(r.proof.path)||!r.proof.path.length||r.proof.path.length>8||!r.proof.path.every(k=>typeof k==='string'&&/^[a-zA-Z0-9_]{1,64}$/.test(k)&&!['__proto__','constructor','prototype'].includes(k)))throw new CaptureError('INVALID_INPUT');
  const result={mode:'xhr',origin,loginPath:entry.pathname,postUrls,readUrls,resourceUrls,readPaths:[...r.readPaths],fields:{...r.fields},proof:{url:r.proof.url,path:[...r.proof.path]}};
  for(const value of Object.values(result))if(value&&typeof value==='object')Object.freeze(value);
  Object.freeze(result.proof.path);return Object.freeze(result);
}
module.exports = { freezeRecipe };
