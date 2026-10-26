'use strict';
const { CaptureError } = require('./errors');
const { parseTarget } = require('./targetPolicy');
const { exactKeys } = require('./requestContract');

function freezeRecipe(request) {
  const recipe = request.login;
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

module.exports = { freezeRecipe };
