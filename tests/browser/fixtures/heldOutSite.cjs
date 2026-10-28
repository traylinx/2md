'use strict';

// Independently authored synthetic site. No browser-driver knowledge or real data.
const { randomBytes } = require('node:crypto');

function createSite({ spa = false } = {}) {
  if (spa) return createSpaSite();
  const counters = {
    requests: 0, identitySubmissions: 0, passwordSubmissions: 0,
    successfulLogins: 0, rejectedLogins: 0, mailboxViews: 0,
    messageViews: 0, rejectedBodies: 0,
  };
  const sessions = new Map();
  const messages = [
    'Synthetic 01: Observatory opening',
    'Synthetic 02: Lantern inventory',
    'Synthetic 03: Orchard timetable',
    'Synthetic 04: Workshop notes',
    'Synthetic 05: Harbour checklist',
  ];
  const cookieName = 'folio_ticket';
  const cookie = (token) => `${cookieName}=${token}; Path=/; Secure; HttpOnly; SameSite=Lax`;
  const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  function page(title, body) {
    // This clock changes without navigation: unrelated DOM churn is not progress.
    return `<!doctype html><html lang="en"><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>${escape(title)} | Paper Lantern</title>
      <style>body{font:18px system-ui;max-width:50rem;margin:3rem auto;padding:1rem}
      label,input,button{display:block;margin:1rem 0}input,button{font:inherit}
      article{border-bottom:1px solid #aaa;padding:1rem 0}nav a{margin-right:2rem}
      [hidden]{display:none!important}aside{color:#555}</style></head><body>
      <header><p>Paper Lantern correspondence room</p></header>
      <aside aria-label="Studio clock">Studio clock: <span id="studio-clock">${Date.now()}</span></aside>
      <main><h1>${escape(title)}</h1>${body}</main>
      <script>setInterval(function(){document.getElementById('studio-clock').textContent=String(Date.now())},733)</script>
      </body></html>`;
  }

  function reply(res, code, body, headers = {}) {
    res.writeHead(code, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    });
    res.end(body);
  }

  function redirect(res, path, token) {
    reply(res, 303, '', { Location: path, ...(token ? { 'Set-Cookie': cookie(token) } : {}) });
  }

  function issue(stage) {
    // Bound fixture state; expired sessions cannot authenticate later requests.
    const now = Date.now();
    for (const [key, entry] of sessions) if (entry.expires <= now) sessions.delete(key);
    if (sessions.size >= 128) sessions.delete(sessions.keys().next().value);
    const token = randomBytes(24).toString('hex');
    sessions.set(token, { stage, expires: now + 10 * 60 * 1000 });
    return token;
  }

  function readForm(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      let bytes = 0;
      let settled = false;
      const timer = setTimeout(() => finish(new Error('body_timeout')), 3000);
      function finish(error) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        req.removeListener('data', data);
        req.removeListener('end', end);
        req.removeListener('aborted', aborted);
        req.removeListener('error', failed);
        if (error) { body = ''; req.resume(); reject(error); }
        else resolve(new URLSearchParams(body));
      }
      function data(chunk) {
        bytes += Buffer.byteLength(chunk);
        if (bytes > 4096) return finish(new Error('body_limit'));
        body += chunk.toString('utf8');
      }
      function end() { finish(); }
      function aborted() { finish(new Error('body_aborted')); }
      function failed() { finish(new Error('body_error')); }
      req.on('data', data);
      req.on('end', end);
      req.on('aborted', aborted);
      req.on('error', failed);
    });
  }

  async function handler(req, res) {
    counters.requests += 1;
    let url;
    try { url = new URL(req.url, 'https://example.com'); }
    catch { return reply(res, 400, page('Invalid address', 'Please return to the entrance.')); }
    const token = (req.headers.cookie || '').split(';').map((s) => s.trim())
      .find((s) => s.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    let session = sessions.get(token);
    if (session && session.expires <= Date.now()) {
      sessions.delete(token);
      session = undefined;
    }
    if (req.method === 'GET' && url.pathname === '/') {
      if (session?.stage === 'member') return redirect(res, '/desk/correspondence');
      return reply(res, 200, page('Enter your correspondence room', `
        <p>First, identify your account. Your password is requested on the next page.</p>
        <form method="post" action="/entry/identify">
        <label for="account-key">Correspondence address or account alias</label>
        <input id="account-key" name="account" type="text" autocomplete="username" required>
        <button type="submit">Continue to password</button></form>`));
    }
    if (req.method === 'POST' && ['/entry/identify', '/entry/unseal'].includes(url.pathname)) {
      let form;
      try { form = await readForm(req); }
      catch {
        counters.rejectedBodies += 1;
        if (!res.destroyed) return reply(res, 400, page('Request not accepted', '<a href="/">Start again</a>'));
        return;
      }
      if (url.pathname === '/entry/identify') {
        counters.identitySubmissions += 1;
        if (form.get('account') !== 'owned') {
          counters.rejectedLogins += 1;
          return reply(res, 401, page('Account not found', '<a href="/">Try another account</a>'));
        }
        if (token) sessions.delete(token);
        return redirect(res, '/entry/passphrase', issue('identified'));
      }
      counters.passwordSubmissions += 1;
      if (session?.stage !== 'identified' || form.get('phrase') !== 'SYNTHETIC_WORKER_PASSWORD') {
        counters.rejectedLogins += 1;
        return reply(res, 401, page('Unable to enter', '<a href="/">Return to account entry</a>'));
      }
      sessions.delete(token);
      counters.successfulLogins += 1;
      return redirect(res, '/desk/correspondence', issue('member'));
    }
    if (req.method === 'GET' && url.pathname === '/entry/passphrase') {
      if (session?.stage !== 'identified') return redirect(res, '/');
      return reply(res, 200, page('Unlock your room', `
        <p>Account: owned@example.test</p>
        <form method="post" action="/entry/unseal">
        <label for="private-phrase">Room password</label>
        <input id="private-phrase" type="password" name="phrase" autocomplete="current-password" required>
        <button type="submit">Unlock correspondence</button></form>`));
    }
    if (req.method === 'GET' && url.pathname.startsWith('/desk/')) {
      if (session?.stage !== 'member') return redirect(res, '/');
      // Visible identity and descending dates make ownership and order explicit.
      const identity = '<p>Signed in as <strong>owned@example.test</strong></p>';
      if (url.pathname === '/desk/correspondence') {
        const sheet = url.searchParams.get('sheet') || '1';
        if (!['1', '2', '3'].includes(sheet)) return reply(res, 404, page('Sheet not found', identity));
        const n = Number(sheet);
        counters.mailboxViews += 1;
        const rows = messages.slice((n - 1) * 2, n * 2).map((subject, offset) => {
          const index = (n - 1) * 2 + offset;
          return `<article><h2><a href="/desk/letter/${index + 1}">${escape(subject)}</a></h2>
            <p>From: studio@example.test</p><p>To: owned@example.test</p>
            <time datetime="2026-10-${27 - index}T09:00:00Z">${27 - index} October 2026, 09:00 UTC</time>
            <p>Synthetic correspondence item ${index + 1}.</p></article>`;
        }).join('');
        return reply(res, 200, page('Inbox', `${identity}<p>5 messages, newest first. Sheet ${n} of 3.</p>${rows}
          <article hidden aria-hidden="true"><h2>Synthetic hidden: do not report this message</h2>
          <p>This is a concealed layout sample, not a visible inbox item.</p></article>
          <nav aria-label="Inbox sheets">${n > 1 ? `<a href="/desk/correspondence?sheet=${n - 1}">Newer messages</a>` : ''}
          ${n < 3 ? `<a href="/desk/correspondence?sheet=${n + 1}">Older messages</a>` : '<p>End of inbox</p>'}</nav>`));
      }
      const match = /^\/desk\/letter\/([1-5])$/.exec(url.pathname);
      if (match) {
        counters.messageViews += 1;
        const index = Number(match[1]) - 1;
        return reply(res, 200, page(messages[index], `${identity}
          <p>From: studio@example.test</p><p>To: owned@example.test</p>
          <p>Synthetic correspondence item ${index + 1}. No real business content.</p>
          <a href="/desk/correspondence?sheet=${Math.floor(index / 2) + 1}">Back to inbox</a>`));
      }
    }
    return reply(res, 404, page('Not found', '<a href="/">Return to entrance</a>'));
  }

  // Only aggregate evidence leaves the fixture; never expose sessions or inputs.
  return { handler, stats: () => ({ ...counters }) };
}

function createSpaSite() {
  const counts = { requests: 0, identitySubmissions: 0, passwordSubmissions: 0,
    successfulLogins: 0, rejectedLogins: 0, mailboxViews: 0, rejectedBodies: 0 };
  const tickets = new Map();
  const subjects = [
    'Synthetic 01: Observatory opening', 'Synthetic 02: Lantern inventory',
    'Synthetic 03: Orchard timetable', 'Synthetic 04: Workshop notes',
    'Synthetic 05: Harbour checklist',
  ];
  const origin = 'https://example.com';
  const shell = `<!doctype html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Paper Lantern online correspondence</title>
    <style>body{font:18px system-ui;max-width:50rem;margin:3rem auto;padding:1rem}
    label,input,button{display:block;margin:1rem 0}input,button{font:inherit}
    article{border-bottom:1px solid #aaa;padding:1rem 0}[hidden]{display:none!important}
    nav a{margin-right:2rem}</style></head><body>
    <header>Paper Lantern correspondence room</header>
    <aside>Studio clock: <span id="clock">starting</span></aside>
    <main id="room"></main><p role="status" id="notice"></p>
    <script>
    'use strict';
    const room = document.getElementById('room');
    const notice = document.getElementById('notice');
    let service;
    setInterval(() => { document.getElementById('clock').textContent = String(Date.now()); }, 733);
    async function request(url, fields) {
      const options = { credentials: 'include', cache: 'no-store' };
      if (fields) { options.method = 'POST'; options.body = new URLSearchParams(fields); }
      const response = await fetch(url, options);
      if (!response.ok) throw new Error('Request not accepted. Please try again.');
      return response.json();
    }
    function showError(error) { notice.textContent = error.message; }
    function accountEntry() {
      room.innerHTML = '<h1>Enter your correspondence room</h1>' +
        '<p>First identify your account; your password comes next.</p>' +
        '<form><label for="alias">Correspondence address or account alias</label>' +
        '<input id="alias" name="account" autocomplete="username" required>' +
        '<button>Continue to password</button></form>';
      room.querySelector('form').addEventListener('submit', async event => {
        event.preventDefault(); notice.textContent = '';
        const account = new FormData(event.target).get('account');
        try {
          const discovery = await request('/room-directory');
          service = discovery.correspondenceService;
          await request(service + '/lantern/open', { account });
          passwordEntry();
        } catch (error) { showError(error); }
      });
    }
    function passwordEntry() {
      room.innerHTML = '<h1>Unlock your room</h1><p>Account: owned@example.test</p>' +
        '<form><label for="phrase">Room password</label>' +
        '<input id="phrase" name="phrase" type="password" autocomplete="current-password" required>' +
        '<button>Unlock correspondence</button></form>';
      room.querySelector('form').addEventListener('submit', async event => {
        event.preventDefault(); notice.textContent = '';
        const phrase = new FormData(event.target).get('phrase');
        try { await request(service + '/lantern/key', { phrase }); await inbox(1); }
        catch (error) { showError(error); }
      });
    }
    async function inbox(leaf) {
      const data = await request(service + '/lantern/postbox?leaf=' + leaf);
      room.replaceChildren();
      const heading = document.createElement('h1'); heading.textContent = 'Inbox'; room.append(heading);
      const identity = document.createElement('p'); identity.textContent = 'Signed in as ' + data.account;
      room.append(identity);
      const summary = document.createElement('p');
      summary.textContent = '5 messages, newest first. Sheet ' + data.leaf + ' of 3.'; room.append(summary);
      for (const item of data.messages) {
        const article = document.createElement('article');
        const title = document.createElement('h2'); title.textContent = item.subject;
        const from = document.createElement('p'); from.textContent = 'From: ' + item.from;
        const to = document.createElement('p'); to.textContent = 'To: ' + data.account;
        const date = document.createElement('time'); date.dateTime = item.date; date.textContent = item.date;
        article.append(title, from, to, date); room.append(article);
      }
      const decoy = document.createElement('article'); decoy.hidden = true;
      decoy.setAttribute('aria-hidden', 'true');
      decoy.textContent = 'Synthetic hidden: do not report this message'; room.append(decoy);
      const navigation = document.createElement('nav'); navigation.setAttribute('aria-label', 'Inbox sheets');
      for (const [target, text] of [[data.leaf - 1, 'Newer messages'], [data.leaf + 1, 'Older messages']]) {
        if (target < 1 || target > 3) continue;
        const link = document.createElement('a'); link.href = '/?sheet=' + target; link.textContent = text;
        link.addEventListener('click', event => {
          event.preventDefault(); notice.textContent = '';
          inbox(target).catch(showError);
        }); navigation.append(link);
      }
      room.append(navigation);
      if (data.leaf === 3) { const end = document.createElement('p'); end.textContent = 'End of inbox'; room.append(end); }
    }
    accountEntry();
    </script></body></html>`;

  function send(res, status, payload, headers = {}) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true', 'Vary': 'Origin', ...headers });
    res.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
  }
  function issue(stage) {
    for (const [key, value] of tickets) if (value.expires <= Date.now()) tickets.delete(key);
    if (tickets.size >= 128) tickets.delete(tickets.keys().next().value);
    const key = randomBytes(24).toString('hex');
    tickets.set(key, { stage, expires: Date.now() + 600000 });
    return `lantern_room=${key}; Path=/; Secure; HttpOnly; SameSite=Lax`;
  }
  function read(req) {
    return new Promise((resolve, reject) => {
      let value = '', bytes = 0, done = false;
      const timer = setTimeout(() => finish(new Error('body_timeout')), 3000);
      function finish(error) {
        if (done) return; done = true; clearTimeout(timer);
        req.removeListener('data', chunk); req.removeListener('end', end);
        req.removeListener('error', failed); req.removeListener('aborted', failed);
        if (error) { value = ''; req.resume(); reject(error); }
        else resolve(new URLSearchParams(value));
      }
      function chunk(part) {
        bytes += Buffer.byteLength(part);
        if (bytes > 4096) return finish(new Error('body_limit'));
        value += part.toString('utf8');
      }
      function end() { finish(); }
      function failed() { finish(new Error('body_error')); }
      req.on('data', chunk); req.on('end', end); req.on('error', failed); req.on('aborted', failed);
    });
  }
  async function handler(req, res) {
    counts.requests += 1;
    let url;
    try { url = new URL(req.url, origin); }
    catch { return send(res, 400, { error: 'Invalid address' }); }
    if (req.method === 'GET' && url.pathname === '/') {
      return send(res, 200, shell, { 'Content-Type': 'text/html; charset=utf-8' });
    }
    // Ordinary frontend service discovery; no credential values or workflow hints.
    if (req.method === 'GET' && url.pathname === '/room-directory') {
      return send(res, 200, { correspondenceService: 'https://api.example.com' });
    }
    if (req.method === 'OPTIONS') return send(res, 204, '', {
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type',
    });
    const token = (req.headers.cookie || '').split(';').map(s => s.trim())
      .find(s => s.startsWith('lantern_room='))?.slice('lantern_room='.length);
    let session = tickets.get(token);
    if (session && session.expires <= Date.now()) { tickets.delete(token); session = undefined; }
    if (req.method === 'POST' && ['/lantern/open', '/lantern/key'].includes(url.pathname)) {
      let form;
      try { form = await read(req); }
      catch { counts.rejectedBodies += 1; if (!res.destroyed) send(res, 400, { error: 'Invalid body' }); return; }
      if (url.pathname === '/lantern/open') {
        counts.identitySubmissions += 1;
        if (form.get('account') !== 'owned') {
          counts.rejectedLogins += 1; return send(res, 401, { error: 'Account not found' });
        }
        if (token) tickets.delete(token);
        return send(res, 200, { ready: true }, { 'Set-Cookie': issue('identified') });
      }
      counts.passwordSubmissions += 1;
      if (session?.stage !== 'identified' || form.get('phrase') !== 'SYNTHETIC_WORKER_PASSWORD') {
        counts.rejectedLogins += 1; return send(res, 401, { error: 'Unable to enter' });
      }
      tickets.delete(token); counts.successfulLogins += 1;
      return send(res, 200, { ready: true }, { 'Set-Cookie': issue('member') });
    }
    if (req.method === 'GET' && url.pathname === '/lantern/postbox') {
      if (session?.stage !== 'member') return send(res, 401, { error: 'Sign in required' });
      const leaf = url.searchParams.get('leaf');
      if (!['1', '2', '3'].includes(leaf)) return send(res, 404, { error: 'Sheet not found' });
      counts.mailboxViews += 1;
      const start = (Number(leaf) - 1) * 2;
      return send(res, 200, { account: 'owned@example.test', leaf: Number(leaf),
        messages: subjects.slice(start, start + 2).map((subject, offset) => ({
          subject, from: 'studio@example.test', date: `2026-10-${27 - start - offset}T09:00:00Z`,
        })) });
    }
    return send(res, 404, { error: 'Not found' });
  }
  // The visible account and five ordered subjects are evidence; hidden samples are not.
  return { handler, stats: () => ({ ...counts }) };
}

module.exports = { createSite };
