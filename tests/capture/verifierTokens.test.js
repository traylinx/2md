import { it, expect, afterEach } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { VerifierTokenRegistry } = require('../../lib/capture/verifierTokens');
const { Deadline } = require('../../lib/capture/deadline');
const { inspect } = require('node:util');
let registries = [], deadlines = [], pending = [], instances = [], fetches = 0;
class OwnedSdk {
  constructor(clientId, clientSecret, apiBaseUrl, verifierId) {
    this.apiBaseUrl = apiBaseUrl; this.clientSecret = clientSecret; this.config = { clientSecret };
    this.hooks = []; this.axiosInstance = { interceptors: { request: { use: fn => this.hooks.push(fn) } } };
    instances.push(this);
  }
  getAccessToken() {
    if (this.accessToken && Date.now() < this.tokenExpiration) return Promise.resolve(this.accessToken);
    fetches++;
    const config = this.hooks.reduce((c, fn) => fn(c), {});
    return new Promise((resolve, reject) => {
      pending.push({ client: this, config, reject, finish: (token = 'SYNTHETIC-TOKEN') => {
        this.accessToken = token; this.agentSecretToken = 'UNUSED-VERIFIER-PASS';
        this.tokenExpiration = Date.now() + 60000; resolve(token);
      } });
      // Deliberately does NOT obey cancellation. Tests prove bounded retained
      // transport slots, no stale cache write and removable waiter ownership.
    });
  }
}
const config = (changes = {}) => ({ apiBaseUrl: 'https://sentinel.example.test/api', clientId: 'client',
  clientSecret: 'SYNTHETIC-SECRET', verifierId: 'verifier', timeoutMs: 1000, Sdk: OwnedSdk, ...changes });
function registry(options) { const r = new VerifierTokenRegistry(options); registries.push(r); return r; }
function deadline(ms = 5000) { const d = new Deadline(ms); deadlines.push(d); return d; }
const tick = async () => { await new Promise(resolve => setImmediate(resolve)); };
afterEach(async () => {
  registries.splice(0).forEach(r => r.close()); deadlines.splice(0).forEach(d => d.close());
  pending.forEach(p => p.reject(new Error('SYNTHETIC-PRIVATE-FAILURE'))); await tick();
  pending = []; instances = []; fetches = 0;
});

it('100 waiters share one owner; cancelling one releases only its waiter', async () => {
  const r = registry(), h = r.register(config());
  const ds = Array.from({ length: 100 }, () => deadline());
  const work = ds.map(d => h.acquire(d).then(value => ({ value }), error => ({ error })));
  await tick(); expect(fetches).toBe(1); expect(r.snapshot().waiters).toBe(100);
  ds[0].abort(); expect((await work[0]).error.code).toBe('UNAVAILABLE');
  expect(r.snapshot().waiters).toBe(99); expect(pending[0].config.signal.aborted).toBe(false);
  pending[0].finish(); const outcomes = await Promise.all(work); await tick();
  expect(outcomes.filter(x => x.value)).toHaveLength(99);
  expect(new Set(outcomes.slice(1).map(x => x.value)).size).toBe(1);
  expect(r.snapshot()).toEqual({ identities: 1, retainedGenerations: 1, flights: 0, waiters: 0, cachedTokens: 1 });
  expect(pending[0].client.agentSecretToken).toBeNull(); expect(pending[0].config.proxy).toBe(false);
});
it('waiter bound refuses129 without another exchange; zero waiters aborts orphan', async () => {
  const r = registry(), h = r.register(config()), ds = Array.from({ length: 128 }, () => deadline());
  const work = ds.map(d => h.acquire(d).catch(e => e)); await tick();
  await expect(h.acquire(deadline())).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  expect(fetches).toBe(1); ds.forEach(d => d.abort()); await Promise.all(work);
  expect(r.snapshot().waiters).toBe(0); expect(r.snapshot().flights).toBe(1);
  expect(pending[0].config.signal.aborted).toBe(true);
  pending[0].finish('LATE-OLD-TOKEN'); await tick();
  expect(r.snapshot().cachedTokens).toBe(0); expect(r.snapshot().flights).toBe(0);
  expect(pending[0].client.accessToken).toBeNull();
});
it('new caller waits for an orphan to drain, not a parallel credential exchange', async () => {
  const r = registry(), h = r.register(config()), d = deadline();
  const first = h.acquire(d).catch(e => e); await tick(); d.abort(); await first;
  const next = h.acquire(deadline()); await tick();
  expect(fetches).toBe(1); expect(r.snapshot().waiters).toBe(1);
  pending[0].finish('LATE'); await tick(); expect(fetches).toBe(2);
  pending[1].finish('CURRENT'); const lease = await next;
  expect(h.token(lease)).toBe('CURRENT'); await tick(); expect(r.snapshot().waiters).toBe(0);
});
it('owner deadline rejects all waiters and late completion cannot install credentials', async () => {
  const r = registry(), h = r.register(config({ timeoutMs: 30 }));
  const result = h.acquire(deadline()).catch(e => e); await tick();
  expect((await result).code).toBe('UNAVAILABLE'); expect(pending[0].config.signal.aborted).toBe(true);
  pending[0].finish('TOO-LATE'); await tick(); expect(r.snapshot().cachedTokens).toBe(0);
  expect(r.snapshot().waiters).toBe(0);
});
it('one lease has exactly one replacement; late401 cannot invalidate a newer token', async () => {
  const r = registry(), h = r.register(config());
  const initial = h.acquire(deadline()); await tick(); pending[0].finish('OLD'); const old = await initial; await tick();
  const retries = Array.from({ length: 100 }, () => h.recover(old, deadline())); await tick();
  expect(fetches).toBe(2); pending[1].finish('NEW'); const leases = await Promise.all(retries); await tick();
  expect(new Set(leases).size).toBe(1); expect(h.token(leases[0])).toBe('NEW');
  expect(await h.recover(old, deadline())).toBe(leases[0]); expect(fetches).toBe(2);
  h.invalidate(leases[0]);
  await expect(h.recover(old, deadline())).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  expect(fetches).toBe(2);
});
it('failed replacement is retained for late401s, never retried per waiter', async () => {
  const r = registry(), h = r.register(config());
  const p = h.acquire(deadline()); await tick(); pending[0].finish(); const old = await p; await tick();
  const retry = h.recover(old, deadline()).catch(e => e); await tick(); pending[1].reject(Error('private'));
  expect((await retry).code).toBe('UNAVAILABLE'); await tick();
  await expect(h.recover(old, deadline())).rejects.toMatchObject({ code: 'UNAVAILABLE' }); expect(fetches).toBe(2);
});
it('explicit rotation fences stale work, erases old credentials and refuses implicit changes', async () => {
  const r = registry(), old = r.register(config());
  const before = old.acquire(deadline()).catch(e => e); await tick();
  expect(() => r.register(config({ clientSecret: 'ROTATED' }))).toThrow();
  const current = r.replace(old, config({ clientSecret: 'ROTATED', verifierId: 'new-verifier' }));
  expect((await before).code).toBe('UNAVAILABLE'); expect(old.signal.aborted).toBe(true);
  const after = current.acquire(deadline()); await tick(); expect(fetches).toBe(2);
  pending[0].finish('STALE'); pending[1].finish('FRESH'); const lease = await after; await tick();
  expect(old.valid(lease)).toBe(false); expect(current.token(lease)).toBe('FRESH');
  expect(pending[0].client.clientSecret).toBeNull(); expect(pending[0].client.accessToken).toBeNull();
});
it('identity and retained-generation limits prevent unbounded rotation of hung transports', async () => {
  const r = registry({ maxIdentities: 2 }); let h = r.register(config());
  const first = h.acquire(deadline()).catch(e => e); await tick();
  h = r.replace(h, config({ clientSecret: 'NEXT' })); await first;
  const second = h.acquire(deadline()).catch(e => e); await tick();
  expect(() => r.replace(h, config({ clientSecret: 'THIRD' }))).toThrow();
  expect(() => r.register(config({ verifierId: 'third-id' }))).toThrow();
  expect(r.snapshot().retainedGenerations).toBe(2); r.close(); await second;
  expect(r.snapshot().waiters).toBe(0); expect(fetches).toBe(2);
});
it('shared handle close aborts its own callers but preserves peer refresh ownership', async () => {
  const r = registry(), a = r.register(config()), b = r.register(config());
  const da = deadline(), db = deadline();
  a.signal.addEventListener('abort', () => da.abort(), { once: true });
  const pa = a.acquire(da).catch(e => e), pb = b.acquire(db); await tick(); a.close();
  expect((await pa).code).toBe('UNAVAILABLE'); expect(b.signal.aborted).toBe(false);
  expect(pending[0].config.signal.aborted).toBe(false); pending[0].finish();
  expect(b.token(await pb)).toBe('SYNTHETIC-TOKEN'); expect(fetches).toBe(1);
});
it('diagnostics and lease serialization contain no credentials or identity labels', async () => {
  const r = registry(), h = r.register(config()); const p = h.acquire(deadline()); await tick(); pending[0].finish();
  const lease = await p;
  const output = JSON.stringify([r, h, lease, r.snapshot()]) + inspect(r) + inspect(h) + inspect(lease);
  for (const text of ['SYNTHETIC-TOKEN', 'SYNTHETIC-SECRET', 'sentinel.example', 'UNUSED-VERIFIER']) expect(output).not.toContain(text);
  h.close(); await tick(); expect(r.snapshot().identities).toBe(0);
});

it('immediate recovery at the completion microtask boundary cannot reuse the old flight', async () => {
  const r = registry(), h = r.register(config());
  const initial = h.acquire(deadline()); await tick(); pending[0].finish('OLD'); const old = await initial;
  const next = h.recover(old, deadline()); await tick();
  expect(fetches).toBe(2); pending[1].finish('NEW'); expect(h.token(await next)).toBe('NEW');
});
it('sixteen distinct configured identities are the hard process-registry bound', () => {
  const r = registry(); const handles = Array.from({ length: 16 }, (_, i) => r.register(config({ verifierId: `v${i}` })));
  expect(r.snapshot().identities).toBe(16);
  expect(() => r.register(config({ verifierId: 'overflow' }))).toThrow();
  handles[0].close(); const fresh = r.register(config({ verifierId: 'fresh' }));
  expect(r.snapshot().identities).toBe(16); fresh.close();
  expect(fetches).toBe(0);
});

it('different configured verifier identities cannot share leases or recovery', async () => {
  const r = registry(), a = r.register(config()), b = r.register(config({ verifierId: 'other-verifier' }));
  const pa = a.acquire(deadline()), pb = b.acquire(deadline()); await tick(); expect(fetches).toBe(2);
  pending[0].finish('TOKEN-A'); pending[1].finish('TOKEN-B'); const la = await pa, lb = await pb;
  expect(a.token(la)).toBe('TOKEN-A'); expect(b.token(lb)).toBe('TOKEN-B');
  expect(a.valid(lb)).toBe(false); expect(b.valid(la)).toBe(false);
  expect(() => a.token(lb)).toThrow(); expect(() => a.recover(lb, deadline())).toThrow();
  expect(() => r.replace(a, config({ verifierId: 'other-verifier' }))).toThrow();
  expect(a.token(la)).toBe('TOKEN-A'); expect(b.token(lb)).toBe('TOKEN-B');
});
it('draining waiters stay bounded and cancellation removes them before a hung transport completes', async () => {
  const r = registry({ maxWaiters: 2 }), h = r.register(config()), original = deadline();
  const first = h.acquire(original).catch(e => e); await tick(); original.abort(); await first;
  const a = deadline(), b = deadline();
  const work = [a, b].map(d => h.acquire(d).catch(e => e));
  await expect(h.acquire(deadline())).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  expect(r.snapshot().waiters).toBe(2); a.abort(); b.abort(); await Promise.all(work);
  expect(r.snapshot().waiters).toBe(0); expect(fetches).toBe(1);
  pending[0].finish('STALE'); await tick(); expect(r.snapshot().cachedTokens).toBe(0);
});
