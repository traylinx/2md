'use strict';
const { performance } = require('node:perf_hooks');
const { inspect } = require('node:util');
const { setMaxListeners } = require('node:events');
const { CaptureError } = require('./errors');

const unavailable = () => new CaptureError('UNAVAILABLE');
function erase(client) {
  if (!client) return;
  client.accessToken = client.agentSecretToken = client.clientSecret = null;
  client.tokenExpiration = client.agentTokenExpiration = 0;
  if (client.config) client.config.clientSecret = null;
}

// Trusted startup configuration only. Tokens/credentials never leave process
// memory. This caches verifier credentials, NEVER caller authorization results.
class VerifierTokenRegistry {
  #entries = new Map();
  #retained = new Set();
  #leases = new WeakMap();
  #handles = new WeakMap();
  #limit;
  #waiterLimit;
  constructor({ maxIdentities = 16, maxWaiters = 128 } = {}) {
    if (!Number.isInteger(maxIdentities) || maxIdentities < 1 || maxIdentities > 16 ||
        !Number.isInteger(maxWaiters) || maxWaiters < 1 || maxWaiters > 128) throw unavailable();
    this.#limit = maxIdentities; this.#waiterLimit = maxWaiters;
  }
  [inspect.custom]() { return '[VerifierTokenRegistry redacted]'; }
  toJSON() { return '[VerifierTokenRegistry redacted]'; }

  #prepare(config) {
    const { apiBaseUrl, clientId, clientSecret, verifierId, timeoutMs, Sdk } = config;
    const values = [apiBaseUrl, clientId, clientSecret, verifierId];
    if (!values.every((v, i) => typeof v === 'string' && v.length > 0 && v.length <= [2048, 4096, 16384, 256][i]) ||
        !Number.isInteger(timeoutMs) || timeoutMs < 1 || typeof Sdk !== 'function') throw unavailable();
    // Let the unchanged installed SDK validate URL/credential/lifetime policy.
    let client;
    try { client = new Sdk(clientId, clientSecret, apiBaseUrl, verifierId, { timeout: timeoutMs, maxRetries: 0 }); }
    catch { throw unavailable(); }
    return { key: JSON.stringify([client.apiBaseUrl, clientId, verifierId]),
      config: { apiBaseUrl, clientId, clientSecret, verifierId, timeoutMs, Sdk }, client };
  }
  register(config) {
    const prepared = this.#prepare(config);
    const old = this.#entries.get(prepared.key);
    if (old) {
      const same = Object.keys(prepared.config).every(k => old.config[k] === prepared.config[k]);
      erase(prepared.client);
      if (!same || old.closed) throw unavailable(); // rotation must be explicit
      return this.#handle(old);
    }
    if (this.#retained.size >= this.#limit) { erase(prepared.client); throw unavailable(); }
    return this.#handle(this.#install(prepared));
  }
  replace(handle, config) {
    const binding = this.#handles.get(handle);
    if (!binding || binding.closed || binding.record.closed) throw unavailable();
    const prepared = this.#prepare(config), old = binding.record;
    const conflict = this.#entries.get(prepared.key);
    // A draining old transport still consumes a slot. Never accumulate orphan
    // generations under repeated rotation of an uncooperative transport.
    const retainedAfter = this.#retained.size - (old.flight ? 0 : 1);
    if ((conflict && conflict !== old) || retainedAfter >= this.#limit) {
      erase(prepared.client); throw unavailable();
    }
    this.#retire(old); binding.closed = true;
    old.signal.signal.removeEventListener('abort', binding.onRecordAbort);
    return this.#handle(this.#install(prepared));
  }
  #install(prepared) {
    const record = { ...prepared, refs: 0, closed: false, signal: new AbortController(),
      flight: null, current: null };
    setMaxListeners(129, record.signal.signal);
    this.#entries.set(record.key, record); this.#retained.add(record);
    this.#configureClient(record, record.client);
    return record;
  }
  #configureClient(record, client) {
    client.axiosInstance.interceptors.request.use(config => {
      const flight = record.flight;
      if (!flight || flight.client !== client || flight.controller.signal.aborted || record.closed) throw unavailable();
      const remaining = Math.floor(flight.end - performance.now());
      if (remaining <= 0) throw unavailable();
      config.signal = flight.controller.signal; config.timeout = Math.max(1, remaining);
      config.proxy = false;
      return config;
    });
  }
  #handle(record) {
    if (record.refs >= 128) throw unavailable();
    const controller = new AbortController(); setMaxListeners(129, controller.signal);
    const onRecordAbort = () => controller.abort();
    record.signal.signal.addEventListener('abort', onRecordAbort, { once: true });
    const binding = { record, closed: false, onRecordAbort }; record.refs++;
    const live = () => { if (binding.closed || record.closed) throw unavailable(); };
    const handle = Object.freeze({
      signal: controller.signal,
      acquire: context => { live(); return this.#acquire(record, context); },
      recover: (lease, context) => { live(); return this.#recover(record, lease, context); },
      invalidate: lease => { live(); this.#invalidate(record, lease); },
      valid: lease => !binding.closed && this.#valid(record, lease),
      token: lease => { live(); if (!this.#valid(record, lease)) throw unavailable(); return this.#leases.get(lease).token; },
      close: () => {
        if (binding.closed) return;
        binding.closed = true; controller.abort();
        record.signal.signal.removeEventListener('abort', onRecordAbort);
        if (--record.refs === 0) this.#retire(record);
      },
      toJSON: () => '[VerifierTokenHandle redacted]',
      [inspect.custom]: () => '[VerifierTokenHandle redacted]',
    });
    this.#handles.set(handle, binding);
    return handle;
  }
  #valid(record, lease) {
    const data = this.#leases.get(lease);
    return !!data && data.record === record && !record.closed && record.current === lease &&
      !data.invalidated && Date.now() < data.expires && performance.now() < data.monotonicEnd;
  }
  #invalidate(record, lease) {
    const data = this.#leases.get(lease);
    if (!data || data.record !== record) throw unavailable();
    data.invalidated = true; data.token = null;
    if (record.current === lease) {
      record.current = null;
      if (record.client) {
        record.client.accessToken = record.client.agentSecretToken = null;
        record.client.tokenExpiration = record.client.agentTokenExpiration = 0;
      }
    }
  }
  #acquire(record, context) {
    context.remaining();
    if (this.#valid(record, record.current)) return Promise.resolve(record.current);
    if (record.flight && record.flight.state !== 'pending') return this.#drain(record, record.flight, context);
    return this.#wait(record, record.flight || this.#start(record), context);
  }
  #recover(record, lease, context) {
    context.remaining();
    const data = this.#leases.get(lease);
    if (!data || data.record !== record || record.closed) throw unavailable();
    if (!data.replacement) {
      this.#invalidate(record, lease);
      // Late401 for an older token cannot discard a newer credential. Bind each
      // old token to ONE replacement flight/result, including a failed result.
      data.replacement = this.#valid(record, record.current) ?
        { state: 'fulfilled', value: record.current } : record.flight || this.#start(record);
    }
    return this.#wait(record, data.replacement, context);
  }
  #start(record) {
    if (record.closed) throw unavailable();
    if (!record.client) {
      const c = record.config;
      record.client = new c.Sdk(c.clientId, c.clientSecret, c.apiBaseUrl, c.verifierId, { timeout: c.timeoutMs, maxRetries: 0 });
      this.#configureClient(record, record.client);
    }
    const flight = { client: record.client, controller: new AbortController(), waiters: new Set(), drainers: new Set(),
      state: 'pending', value: null, end: performance.now() + Math.min(5000, record.config.timeoutMs), timer: null };
    record.flight = flight;
    flight.timer = setTimeout(() => this.#cancel(record, flight), Math.max(1, flight.end - performance.now()));
    flight.timer.unref?.();
    // One completion handler, not one promise closure per waiter. Aborted
    // waiters are removable even when a broken transport never settles.
    Promise.resolve().then(() => flight.client.getAccessToken()).then(token => {
      if (record.closed || flight.controller.signal.aborted || record.flight !== flight ||
          performance.now() >= flight.end || typeof token !== 'string' || !token.length ||
          !Number.isFinite(flight.client.tokenExpiration) || flight.client.tokenExpiration <= Date.now()) throw unavailable();
      const expires = flight.client.tokenExpiration;
      const lease = Object.freeze({ toJSON: () => '[VerifierTokenLease redacted]', [inspect.custom]: () => '[VerifierTokenLease redacted]' });
      this.#leases.set(lease, { record, token, expires, monotonicEnd: performance.now() + expires - Date.now(),
        invalidated: false, replacement: null });
      record.current = lease;
      flight.client.agentSecretToken = null; flight.client.agentTokenExpiration = 0; // unused verifier pass
      this.#complete(record, flight, 'fulfilled', lease);
    }).catch(() => this.#complete(record, flight, 'rejected'));
    return flight;
  }
  #complete(record, flight, state, value) {
    if (flight.physicalDone) return;
    flight.physicalDone = true; clearTimeout(flight.timer);
    if (record.closed || flight.controller.signal.aborted || state !== 'fulfilled') {
      erase(flight.client);
      if (record.client === flight.client) record.client = null;
    }
    // Remove the physical flight before resolving callers. An immediate401
    // must never bind its replacement to this already completed old flight.
    if (record.flight === flight) record.flight = null;
    if (record.closed) this.#retained.delete(record);
    this.#settle(flight, state, value);
    for (const waiter of [...flight.drainers]) waiter.finish();
  }
  #settle(flight, state, value) {
    if (flight.state !== 'pending') return;
    flight.state = state; flight.value = value;
    for (const waiter of [...flight.waiters]) waiter.finish();
  }
  #cancel(record, flight) {
    flight.controller.abort();
    this.#settle(flight, 'rejected');
    // Keep physical flight installed until its transport actually settles.
    // New calls fail boundedly rather than spawning parallel orphaned POSTs.
    erase(flight.client);
    if (record.client === flight.client) record.client = null;
  }
  #wait(record, flight, context) {
    context.remaining();
    if (flight.state !== 'pending') {
      if (flight.state === 'fulfilled' && this.#valid(record, flight.value)) return Promise.resolve(flight.value);
      return Promise.reject(unavailable());
    }
    if (flight.waiters.size + flight.drainers.size >= this.#waiterLimit) return Promise.reject(unavailable());
    return new Promise((resolve, reject) => {
      let done = false;
      const remove = () => { flight.waiters.delete(waiter); context.signal.removeEventListener('abort', abort); };
      const abort = () => {
        if (done) return;
        done = true; remove(); reject(unavailable());
        if (flight.waiters.size === 0 && flight.state === 'pending') this.#cancel(record, flight);
      };
      const waiter = { finish: () => {
        if (done) return;
        done = true; remove();
        try {
          context.remaining();
          if (flight.state !== 'fulfilled' || !this.#valid(record, flight.value)) throw unavailable();
          resolve(flight.value);
        } catch { reject(unavailable()); }
      } };
      flight.waiters.add(waiter);
      context.signal.addEventListener('abort', abort, { once: true });
      if (context.signal.aborted) abort();
    });
  }
  #drain(record, flight, context) {
    // A new independent call may wait for an aborted transport to actually close
    // before starting its own exchange. No overlapping issuance or busy polling.
    if (flight.waiters.size + flight.drainers.size >= this.#waiterLimit) return Promise.reject(unavailable());
    return new Promise((resolve, reject) => {
      let done = false;
      const remove = () => { flight.drainers.delete(waiter); context.signal.removeEventListener('abort', abort); };
      const abort = () => { if (done) return; done = true; remove(); reject(unavailable()); };
      const waiter = { finish: () => {
        if (done) return;
        done = true; remove();
        try { context.remaining(); if (record.closed) throw unavailable(); resolve(this.#acquire(record, context)); }
        catch { reject(unavailable()); }
      } };
      flight.drainers.add(waiter); context.signal.addEventListener('abort', abort, { once: true });
      if (context.signal.aborted) abort();
    });
  }
  #retire(record) {
    if (record.closed) return;
    record.closed = true; record.signal.abort();
    if (record.current) this.#invalidate(record, record.current);
    if (record.flight) this.#cancel(record, record.flight);
    erase(record.client); record.client = null; record.config.clientSecret = null;
    if (this.#entries.get(record.key) === record) this.#entries.delete(record.key);
    if (!record.flight) this.#retained.delete(record);
  }
  snapshot() {
    let flights = 0, waiters = 0, cached = 0;
    for (const record of this.#retained) {
      if (record.flight) { flights++; waiters += record.flight.waiters.size + record.flight.drainers.size; }
      if (this.#valid(record, record.current)) cached++;
    }
    return Object.freeze({ identities: this.#entries.size, retainedGenerations: this.#retained.size,
      flights, waiters, cachedTokens: cached });
  }
  close() { for (const record of [...this.#retained]) this.#retire(record); }
}
const verifierTokens = new VerifierTokenRegistry();
module.exports = { VerifierTokenRegistry, verifierTokens, erase };
