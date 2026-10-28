'use strict';
const { CaptureError } = require('./errors');

function assertPageState({ password, challenge, text }, authenticated = false) {
  if (challenge) throw new CaptureError('HUMAN_REQUIRED');
  if (password) throw new CaptureError(authenticated ? 'AUTH_FAILED' : 'AUTH_REQUIRED');
  if (!text || text.trim().length < 20 || /^(?:loading|please wait|javascript required)[.\s…!]*$/i.test(text.trim())) {
    throw new CaptureError('EMPTY_CONTENT');
  }
}

// Runs in the page. Return only bounded content/state, never cookies or form values.
function readPageState() {
  const visible = element => !!element && element.getClientRects().length > 0 &&
    getComputedStyle(element).visibility !== 'hidden' && getComputedStyle(element).display !== 'none';
  const text = (document.body?.innerText || '').slice(0, 5 * 1024 * 1024 + 1);
  const password = [...document.querySelectorAll('input[type="password"]')].some(visible);
  const challenge = [...document.querySelectorAll('[id*="captcha"], [class*="captcha"], iframe[src*="challenge"]')].some(visible) ||
    /^(?:just a moment|verify you are human|access denied|attention required)/i.test(document.title);
  const loginPrompts=[...document.querySelectorAll('label')].filter(visible).slice(0,32).map(e=>e.textContent.slice(0,160));
  if(document.querySelector('input[autocomplete="one-time-code"]'))loginPrompts.push('one-time code');
  return { password, challenge, text, loginPrompts };
}

module.exports = { assertPageState, readPageState };
