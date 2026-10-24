import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import * as core from './core.js';

export function parseCallback(raw, expectedState) {
  let url;
  try { url = new URL(raw.trim()); } catch { throw new Error('请粘贴完整回调 URL。'); }
  const redirect = new URL(core.REDIRECT_URI);
  if (url.origin !== redirect.origin || url.pathname !== redirect.pathname) {
    throw new Error('回调地址不匹配。');
  }
  const state = url.searchParams.get('state') || '';
  const a = Buffer.from(state), b = Buffer.from(expectedState);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('授权状态不匹配，请重新登录。');
  if (url.searchParams.has('error')) throw new Error('Google 拒绝了本次授权。');
  const code = url.searchParams.get('code');
  if (!code) throw new Error('回调缺少授权码。');
  return code;
}

// Manual callback transport deliberately needs no listening port or browser helper.
// The callback may show a connection error; its full address still carries code/state.
export async function login({ ask, signal, fetchImpl = fetch }) {
  if (typeof ask !== 'function') throw new Error('缺少 userQuestions 服务，无法交互登录。');
  const runSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(300000)]) : AbortSignal.timeout(300000);
  runSignal.throwIfAborted();
  const verifier = randomBytes(32).toString('base64url');
  const state = randomBytes(32).toString('base64url');
  const params = new URLSearchParams({
    client_id: core.CLIENT_ID, redirect_uri: core.REDIRECT_URI,
    response_type: 'code', scope: core.SCOPES.join(' '), access_type: 'offline', prompt: 'consent',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256', state,
  });
  const url = `${core.AUTH_URL}?${params}`;
  const answer = await ask({ questions: [{
    id: 'antigravity-login', header: 'Antigravity', purpose: 'auth', secret: true,
    question: '打开授权链接完成登录，再粘贴浏览器地址栏中的完整回调 URL。',
    detail: `回调页面可能提示无法连接，这是正常的。请勿将回调地址发到聊天中。\n${url}`,
    link: url,
  }], signal: runSignal });
  runSignal.throwIfAborted();
  const code = parseCallback(answer.answers?.[0]?.custom || '', state);
  const response = await fetchImpl(core.TOKEN_URL, {
    method: 'POST', signal: runSignal,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: core.CLIENT_ID, client_secret: core.CLIENT_SECRET,
      redirect_uri: core.REDIRECT_URI, code, code_verifier: verifier, grant_type: 'authorization_code' }),
  });
  if (!response.ok) throw new Error(`OAuth token exchange failed (HTTP ${response.status}).`);
  const data = await response.json();
  if (!data.access_token || !data.refresh_token || !Number.isFinite(data.expires_in) || data.expires_in <= 0) {
    throw new Error('OAuth 返回的凭据不完整，请重新登录。');
  }
  // Discover a real project; do not silently fabricate project IDs.
  let projectId;
  for (const endpoint of core.endpointCandidates()) {
    runSignal.throwIfAborted();
    const res = await fetchImpl(`${endpoint}/v1internal:loadCodeAssist`, {
      method: 'POST', signal: runSignal,
      headers: core.antigravityHeaders(data.access_token),
      body: JSON.stringify({ metadata: { ideType: 'ANTIGRAVITY' } }),
    });
    if (!res.ok) {
      if ([404, 502, 503, 504].includes(res.status)) continue;
      throw new Error(`Antigravity project discovery failed (HTTP ${res.status}).`);
    }
    const info = await res.json();
    projectId = typeof info.cloudaicompanionProject === 'string'
      ? info.cloudaicompanionProject : info.cloudaicompanionProject?.id;
    break;
  }
  if (!projectId) throw new Error('账号未返回 Antigravity 项目，请先在官方应用完成账号初始化。');
  return { access: data.access_token, refresh: data.refresh_token,
    expires: Date.now() + data.expires_in * 1000, projectId };
}

export function createAuthCommand(store, { ask, loginImpl = login } = {}) {
  let active = false;
  return async invocation => {
    const verb = invocation.rawInput.trim() || 'status';
    if (!['status', 'login', 'logout'].includes(verb)) {
      return { kind: 'error', text: '用法：/antigravity-auth [status|login|logout]' };
    }
    if (active) return { kind: 'error', text: 'Antigravity 授权操作正在进行。' };
    active = true;
    try {
      if (verb === 'status') {
        const credentials = await store.read();
        return { kind: 'success', text: credentials ? 'Antigravity 已登录。' : 'Antigravity 未登录。' };
      }
      if (verb === 'logout') {
        await store.remove();
        return { kind: 'success', text: '已删除本插件的本地凭据（不撤销 Google 端授权）。' };
      }
      const credentials = await loginImpl({ ask, signal: invocation.signal });
      invocation.signal?.throwIfAborted();
      await store.write(credentials);
      return { kind: 'success', text: 'Antigravity 登录成功，可通过 /model 选择模型。' };
    } catch (error) {
      // Do not surface arbitrary transport/provider errors: they may echo tokens.
      return { kind: 'error', text: invocation.signal?.aborted
        ? 'Antigravity 操作已取消。' : 'Antigravity 操作失败，请检查网络、授权与账号资格后重试。' };
    } finally { active = false; }
  };
}
