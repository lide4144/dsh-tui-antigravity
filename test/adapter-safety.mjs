// Offline safety regressions: only synthetic credentials and mocked fetch.
import assert from 'node:assert/strict';
import { createAntigravityAdapter } from '../lib/adapter.js';
class LlmError extends Error {
  constructor(message, code, options) { super(message, options); this.name = 'LlmError'; this.code = code; }
}
const creds = { refresh: 'fake-refresh', access: 'fake-access', expires: Date.now() + 3600000, projectId: 'fake-project' };
const adapter = (read = async () => creds) => {
  let stored;
  return createAntigravityAdapter({ LlmError, credentialsService: {
    readRecord: async () => ({ kind: 'grant', payload: stored ?? await read() }),
    modifyRecord: async (_key, update) => { stored = update({ kind: 'grant', payload: stored ?? await read() }).payload; },
  } });
};
const options = (signal) => ({ model: 'gemini-3.8-flash', messages: [], signal });
const collect = async (a, signal) => { const out = []; for await (const c of a.stream(options(signal))) out.push(c); return out; };
const originalFetch = globalThis.fetch;
let calls, resources;
const frame = new TextEncoder().encode('data: {"candidates":[{"content":{"parts":[{"text":"hello"}]}}]}\n\n');
function response({ fail = false, output = false } = {}) {
  const state = { cancel: 0, release: 0, reads: 0, signal: null };
  resources.push(state);
  return { ok: true, body: { getReader: () => ({
    async read() { state.reads++; if (output && state.reads === 1) return { value: frame, done: false }; if (fail) throw new Error('socket failed'); return { done: true }; },
    async cancel() { state.cancel++; }, releaseLock() { state.release++; },
  }) }, state };
}
function reset(fn) { calls = 0; resources = []; globalThis.fetch = async (...args) => { calls++; return fn(...args); }; }
function cleaned() { for (const r of resources) { assert.equal(r.cancel, 1); assert.equal(r.release, 1); assert.equal(r.signal.aborted, true); } }
try {
  for (const status of [400, 401, 403, 429, 500, 501]) {
    reset(() => ({ ok: false, status, text: async () => 'synthetic failure' }));
    await assert.rejects(collect(adapter()), e => e.code === (status === 400 ? 'INVALID_REQUEST' : status === 401 || status === 403 ? 'AUTH' : status === 429 ? 'RATE_LIMIT' : 'TRANSPORT')
      && !e.message.includes('synthetic failure')); // non-JSON bodies are never echoed
    assert.equal(calls, 1, `HTTP ${status} must not replay`);
  }
  for (const status of [404, 502, 503, 504, 'transport']) {
    reset((_url, init) => {
      if (calls === 1) { if (status === 'transport') throw new Error('offline'); return { ok: false, status, text: async () => 'retryable' }; }
      const r = response(); r.state.signal = init.signal; return r;
    });
    await collect(adapter()); assert.equal(calls, 2); cleaned();
  }
  reset(() => { throw new Error('must not fetch'); });
  const pre = new AbortController(); pre.abort();
  let reads = 0;
  await assert.rejects(collect(adapter(async () => { reads++; return creds; }), pre.signal), { code: 'ABORTED' });
  assert.equal(calls, 0); assert.equal(reads, 0);
  const waiting = new AbortController();
  let unblock;
  const pending = collect(adapter(() => new Promise(resolve => { unblock = resolve; })), waiting.signal);
  await Promise.resolve(); waiting.abort(); unblock(creds);
  await assert.rejects(pending, { code: 'ABORTED' }); assert.equal(calls, 0);
  for (const patch of [{ access: undefined }, { expires: undefined }, { expires: 'invalid' }, { expires: 0 }]) {
    let refreshes = 0, generations = 0;
    reset((url, init) => {
      if (url === 'https://oauth2.googleapis.com/token') { refreshes++; return { ok: true, json: async () => ({ access_token: 'refreshed-fake', expires_in: 3600 }) }; }
      generations++; const r = response(); r.state.signal = init.signal; return r;
    });
    await collect(adapter(async () => ({ ...creds, ...patch })));
    assert.equal(refreshes, 1); assert.equal(generations, 1); cleaned();
  }
  reset((_url, init) => { const r = response({ output: true, fail: true }); r.state.signal = init.signal; return r; });
  await assert.rejects(collect(adapter())); assert.equal(calls, 1); cleaned();
  reset((_url, init) => { const r = response({ output: true }); r.state.signal = init.signal; return r; });
  const stream = adapter().stream(options()); await stream.next(); await stream.return(); assert.equal(calls, 1); cleaned();
  reset((_url, init) => { const r = response({ fail: true }); r.state.signal = init.signal; return r; });
  await assert.rejects(collect(adapter())); assert.ok(calls > 1); cleaned();
  for (const service of [
    { readRecord: async () => null },
    { readRecord: async () => { throw new Error('synthetic store failure'); } },
    { readRecord: async () => ({ kind: 'grant', payload: { ...creds, access: undefined } }), modifyRecord: async () => { throw new Error('synthetic write failure'); } },
    { readRecord: async () => ({ kind: 'grant', payload: { ...creds, access: undefined } }), modifyRecord: async (_key, update) => update({ kind: 'grant', payload: { ...creds, refresh: 'other-login' } }) },
  ]) {
    let generations = 0;
    reset((url) => {
      if (url === 'https://oauth2.googleapis.com/token') return { ok: true, json: async () => ({ access_token: 'refreshed-fake', expires_in: 3600 }) };
      generations++; throw new Error('must not generate');
    });
    await assert.rejects(collect(createAntigravityAdapter({ LlmError, credentialsService: service })), e => ['AUTH', 'MISSING_CREDENTIAL'].includes(e.code));
    assert.equal(generations, 0);
  }
  console.log('PASS adapter safety: HTTP fallback, cancellation, refresh, reader cleanup, no partial replay, fail-closed store and refresh CAS');
} finally { globalThis.fetch = originalFetch; }
