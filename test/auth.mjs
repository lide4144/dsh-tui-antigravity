import assert from 'node:assert/strict';
import { mkdtemp, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAuthStore } from '../lib/auth-store.js';
import { login, parseCallback, createAuthCommand } from '../lib/auth.js';
import { REDIRECT_URI } from '../lib/core.js';

const dir = await mkdtemp(join(tmpdir(), 'dsh-antigravity-auth-'));
try {
  const store = createAuthStore(join(dir, 'auth.json'));
  assert.equal(await store.read(), null);
  await store.write({ refresh: 'fake-refresh', access: 'fake-access', expires: 123 });
  assert.equal((await stat(store.path)).mode & 0o777, 0o600);
  assert.equal((await store.read()).refresh, 'fake-refresh');
  assert.equal(await store.remove(), true);
  assert.equal(await store.remove(), false);
  await assert.rejects(store.modifyRecord('', () => ({ payload: { refresh: 'resurrect' } })), /signed out/);
  assert.equal(await store.read(), null);
  assert.equal(parseCallback(`${REDIRECT_URI}?state=s&code=c`, 's'), 'c');
  assert.throws(() => parseCallback(`${REDIRECT_URI}?state=bad&code=c`, 's'), /状态/);
  assert.throws(() => parseCallback('https://evil.example/?state=s&code=c', 's'), /地址/);
  let calls = 0;
  const creds = await login({
    ask: async request => {
      assert.equal(request.questions[0].secret, true);
      assert.equal(request.questions[0].purpose, 'auth');
      const url = new URL(request.questions[0].link);
      assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
      return { answers: [{ custom: `${REDIRECT_URI}?state=${url.searchParams.get('state')}&code=fake-code` }] };
    },
    fetchImpl: async (url, options) => {
      assert.ok(options.signal);
      calls++;
      return new Response(JSON.stringify(calls === 1
        ? { access_token: 'fake-access', refresh_token: 'fake-refresh', expires_in: 3600 }
        : { cloudaicompanionProject: 'fake-project' }), { status: 200 });
    },
  });
  assert.equal(creds.projectId, 'fake-project');
  assert.equal(calls, 2);
  const command = createAuthCommand(store, { loginImpl: async () => { throw new Error('SECRET'); } });
  const result = await command({ rawInput: 'login' });
  assert.equal(result.kind, 'error');
  assert.ok(!result.text.includes('SECRET'));
  const abort = new AbortController(); abort.abort();
  await assert.rejects(login({ ask: async () => assert.fail(), signal: abort.signal,
    fetchImpl: async () => assert.fail() }));
  console.log('PASS auth store, permissions, callback state, PKCE, mocked login, redaction, cancellation');
} finally {
  // dir is the exact mkdtemp result created above, confined to the test's temp tree.
  assert.ok(dir.startsWith(join(tmpdir(), 'dsh-antigravity-auth-')));
  await rm(dir, { recursive: true, force: true });
}
