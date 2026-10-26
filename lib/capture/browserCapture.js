'use strict';
const { RequestPolicy } = require('./networkPolicy');
const { applyBrowserPolicy } = require('./browserPolicy');
const { login, verifyAccount } = require('./login');
const { settle } = require('./settle');
const { assertPageState, readPageState } = require('./publicPageState');
const { extract } = require('./extract');
const { buildResult } = require('./result');
const { CaptureError } = require('./errors');
const { resolveTarget } = require('./targetPolicy');

async function captureWithBrowser(browser, request, { deadline, recipe, resolver = resolveTarget, allowedOrigins = ['*'] }) {
  const context = await deadline.run(() => browser.createBrowserContext());
  try {
    const page = await deadline.run(() => context.newPage());
    const policy = new RequestPolicy({ deadline, recipe, resolver, allowedOrigins });
    const protections = await applyBrowserPolicy(page, browser, policy, deadline, recipe);
    if (recipe) await login(page, request, recipe, policy, deadline);
    const response = await deadline.run(() => page.goto(request.url, { waitUntil: 'domcontentloaded', timeout: deadline.remaining(1200) }));
    if (!response || response.status() >= 400) throw new CaptureError('UPSTREAM_FAILED');
    const warnings = await settle(page, deadline);
    await resolver(page.url(), { deadline });
    const final = new URL(page.url());
    if (!allowedOrigins.includes('*') && !allowedOrigins.includes(final.origin)) throw new CaptureError('FORBIDDEN');
    if (recipe && (final.origin !== recipe.origin || !recipe.readPaths.includes(final.pathname) || final.search)) {
      throw new CaptureError('TARGET_UNVERIFIED');
    }
    if (recipe) await verifyAccount(page, recipe, request.auth.username, deadline);
    const state = await deadline.run(() => page.evaluate(readPageState));
    assertPageState(state, !!recipe);
    const html = await deadline.run(() => page.evaluate(renderedHtml));
    if (html === null) throw new CaptureError('LIMIT_EXCEEDED');
    const secrets = request.auth ? [request.auth.username, request.auth.password] : [];
    const extracted = extract(html, page.url(), state.text, secrets);
    deadline.remaining(200);
    return buildResult({ url: request.url, finalUrl: page.url(), html, extracted,
      warnings: [...warnings, ...protections.warnings],
      secrets });
  } finally { await context.close(); }
}

function renderedHtml() {
  const nodes = [...document.querySelectorAll('*')];
  if (nodes.length > 50000) return null;
  const clone = document.documentElement.cloneNode(true);
  const copies = [clone, ...clone.querySelectorAll('*')];
  for (let i = nodes.length - 1; i >= 0; i--) {
    const element = nodes[i], copy = copies[i];
    if (!copy) continue;
    const style = getComputedStyle(element);
    if (['HTML', 'HEAD', 'TITLE'].includes(element.tagName)) continue;
    if (['INPUT', 'TEXTAREA', 'SCRIPT', 'NOSCRIPT', 'STYLE'].includes(element.tagName) ||
        element.hidden || style.display === 'none' || style.visibility === 'hidden') copy.remove();
  }
  const html = clone.outerHTML;
  return html.length > 5 * 1024 * 1024 ? null : html;
}

module.exports = { captureWithBrowser, renderedHtml };
