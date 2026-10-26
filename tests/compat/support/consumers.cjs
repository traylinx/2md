// Execute frozen consumer source unchanged; only host/dependency capabilities injected.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');
const fixtures = path.join(process.env.COMPAT_REPO, 'tests/fixtures/compat');
function compile(name, supplied = {}) {
  const source = fs.readFileSync(path.join(fixtures, name), 'utf8');
  const { code } = transformSync(source, { loader: name.endsWith('.ts') ? 'ts' : 'js', format: 'cjs' });
  const module = { exports: {} };
  const context = { module, exports: module.exports, URLSearchParams, AbortController, TextDecoder,
    FormData, setTimeout, clearTimeout, console, ...supplied };
  vm.runInNewContext(code, context, { filename: name, timeout: 2000 });
  return module.exports;
}
function search(fetch) { return compile('search-service.ts', { fetch }).Html2mdService; }
function frontend(fetch, base) {
  const errors = []; let slot = 0;
  const hooks = {
    useCallback: fn => fn, useRef: value => ({ current: value }),
    useState: initial => { const index = slot++; return [initial, value => { if (index === 2 && value) errors.push(value); }]; },
  };
  const require = id => {
    if (id === 'preact/hooks') return hooks;
    if (id === '../utils') return { API_BASE: base, getClientId: () => 'synthetic-ui' };
    throw new Error(`Unexpected consumer dependency ${id}`);
  };
  return { hook: compile('frontend-hook.js', { fetch, require }).useStreamFetch(), errors };
}
function billable(result) {
  const source = fs.readFileSync(path.join(fixtures, 'scrap-agent.ts'), 'utf8');
  const match = source.match(/billableCall: ([^\n]+),/);
  if (!match) throw new Error('Pinned billing expression missing');
  // Execute exact original expression, not a rewritten billing implementation.
  return vm.runInNewContext(`(function(){ return ${match[1]}; }).call({backend:'html2md'})`, { result });
}
module.exports = { search, frontend, billable };
