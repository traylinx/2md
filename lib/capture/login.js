'use strict';
const { CaptureError } = require('./errors');
const { readPageState } = require('./publicPageState');

async function verifyAccount(page, recipe, username, deadline) {
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
  const state = await deadline.run(() => page.evaluate(readPageState));
  if (state.challenge) throw new CaptureError('HUMAN_REQUIRED');
  const valid = await deadline.run(() => page.evaluate(config => {
    const form = document.querySelector(config.fields.form);
    const user = document.querySelector(config.fields.username), password = document.querySelector(config.fields.password);
    const submit = document.querySelector(config.fields.submit);
    if (!form || !user || !password || !submit || user.form !== form || password.form !== form || submit.form !== form) return false;
    const action = new URL(form.action, location.href);
    return form.method.toUpperCase() === 'POST' && action.origin === config.origin &&
      action.pathname === config.submitPath && !action.search && password.type === 'password' &&
      !form.querySelector('input[type="file"]') && !submit.formAction?.includes('javascript:');
  }, recipe));
  if (!valid) throw new CaptureError('AUTH_FAILED');
  await deadline.run(() => page.type(recipe.fields.username, request.auth.username));
  await deadline.run(() => page.type(recipe.fields.password, request.auth.password));
  policy.phase = 'submit';
  await deadline.run(() => Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: deadline.remaining(1200) }),
    page.click(recipe.fields.submit),
  ]));
  if (!policy.submitted) throw new CaptureError('AUTH_FAILED');
  policy.phase = 'read';
  await verifyAccount(page, recipe, request.auth.username, deadline);
}

module.exports = { login, verifyAccount };
