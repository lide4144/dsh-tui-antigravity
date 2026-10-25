// Offline regression for the real DSH tool-continuation 400:
// user -> assistant(tool-call + replayState) -> role:'tool' long result -> next request.
// Fake credentials and a mocked fetch only; never touches the network or real creds.
import assert from 'node:assert/strict';
import { createAntigravityAdapter } from '../lib/adapter.js';
import { buildRequest, describeUpstreamError, redactSecrets } from '../lib/wire.js';

class LlmError extends Error {
  constructor(message, code, options) { super(message, options); this.name = 'LlmError'; this.code = code; }
}
const MODEL = 'gemini-3.8-flash';
const RUNTIME = 'gemini-3.8-flash-medium';
const FAKE_ACCESS = 'fake-access-token-value';
const creds = { refresh: 'fake-refresh', access: FAKE_ACCESS, expires: Date.now() + 3600000, projectId: 'fake-project' };
const makeAdapter = () => createAntigravityAdapter({ LlmError, credentialsService: {
  readRecord: async () => ({ kind: 'grant', payload: creds }),
  modifyRecord: async () => { throw new Error('must not refresh'); },
} });
const sse = (frames) => new Response(new ReadableStream({ start(c) {
  c.enqueue(new TextEncoder().encode(frames.map(r => `data: ${JSON.stringify({ response: r })}\n\n`).join('')));
  c.close();
} }), { headers: { 'content-type': 'text/event-stream' } });

// Tools as dsh-tools would declare them, including schema keywords Gemini rejects.
const tools = [
  { name: 'skill', description: 'Load a skill', parameters: {
    $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', additionalProperties: false,
    properties: { name: { type: 'string', description: 'skill name' } }, required: ['name'] } },
  { name: 'edit', description: 'Edit', parameters: {
    type: 'object', $defs: { Pos: { type: 'object', properties: { line: { type: 'integer' } } } },
    properties: { at: { $ref: '#/$defs/Pos' }, remote: { $ref: 'https://example.invalid/x.json' },
      $schema: { type: 'string', description: 'property literally named $schema is kept' } } } },
];
const systemMsg = { id: 's1', role: 'system', content: [{ type: 'text', text: 'You are dsh.' }], source: { kind: 'system-prompt' } };
const userMsg = { id: 'u1', role: 'user', content: [{ type: 'text', text: '加载 skill 然后回答' }], source: { kind: 'user' } };
// Long skill text with markdown, quotes, unicode, JSON-ish fragments and control chars.
const LONG = ('# Skill\n```json\n{"a": [1,2,3]}\n```\n"quoted" \\ back\tslash — 中文 ✓\n').repeat(4000);

const keysDeep = (node, out = []) => {
  if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) { out.push(k); keysDeep(v, out); }
  return out;
};
function assertWellFormed(body) {
  const { contents } = body.request;
  assert.ok(contents.length > 0);
  assert.equal(contents[0].role, 'user');
  assert.equal(contents.at(-1).role, 'user', 'request must end on a user turn');
  for (let i = 0; i < contents.length; i++) {
    const turn = contents[i];
    assert.ok(['user', 'model'].includes(turn.role), `bad role ${turn.role}`);
    if (i > 0) assert.notEqual(turn.role, contents[i - 1].role, 'roles must alternate');
    assert.ok(Array.isArray(turn.parts) && turn.parts.length > 0, 'no empty parts');
    for (const p of turn.parts) {
      if ('text' in p && !p.thoughtSignature) assert.ok(String(p.text).trim(), 'no empty text parts');
      if (p.functionResponse) {
        assert.equal(turn.role, 'user');
        const r = p.functionResponse.response;
        assert.ok(r && typeof r === 'object' && !Array.isArray(r), 'functionResponse.response must be a Struct');
      }
      if (p.functionCall) {
        assert.equal(turn.role, 'model');
        const a = p.functionCall.args;
        assert.ok(a && typeof a === 'object' && !Array.isArray(a), 'functionCall.args must be a Struct');
      }
    }
    // every functionCall turn is answered by an equal number of functionResponses (same names, same order)
    const calls = turn.parts.filter(p => p.functionCall);
    if (calls.length) {
      const next = contents[i + 1];
      assert.ok(next && next.role === 'user', 'functionCall turn must be followed by a user turn');
      const responses = next.parts.filter(p => p.functionResponse);
      assert.deepEqual(responses.map(p => p.functionResponse.name), calls.map(p => p.functionCall.name));
      assert.ok(next.parts[0].functionResponse, 'functionResponse parts come first');
      assert.ok(calls[0].thoughtSignature, 'Gemini 3 needs a signature on the first functionCall');
    }
  }
  assert.deepEqual(body.request.systemInstruction.parts, [{ text: 'You are dsh.' }]);
  for (const decl of body.request.tools?.[0]?.functionDeclarations ?? []) {
    const s = decl.parametersJsonSchema;
    assert.equal(s.type, 'object');
    const keys = keysDeep({ ...s, properties: Object.fromEntries(Object.entries(s.properties ?? {}).map(([, v]) => ['x', v])) });
    for (const banned of ['$schema', '$ref', '$defs', 'definitions', '$id']) assert.ok(!keys.includes(banned), `${decl.name} schema has ${banned}`);
  }
  const gc = body.request.generationConfig;
  assert.deepEqual(gc.thinkingConfig, { includeThoughts: true, thinkingBudget: 4000 });
  if (gc.maxOutputTokens !== undefined) assert.ok(gc.maxOutputTokens > gc.thinkingConfig.thinkingBudget);
}

const realFetch = globalThis.fetch;
try {
  // ── Turn 1: real SSE stream -> assembled DSH assistant message ────────────
  globalThis.fetch = async () => sse([
    { candidates: [{ content: { parts: [{ thought: true, text: 'I should load the skill.' }] } }] },
    { candidates: [{ content: { parts: [{ functionCall: { name: 'skill', args: { name: 'dsh-tui-guide' } }, thoughtSignature: 'U0lHTkFUVVJF' }] } }] },
    { candidates: [{ finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 5 } },
  ]);
  const chunks = [];
  for await (const c of makeAdapter().stream({ model: MODEL, reasoningEffort: 'medium', messages: [systemMsg, userMsg], tools })) chunks.push(c);
  const finish = chunks.find(c => c.type === 'finish');
  assert.equal(finish.reason.kind, 'tool-calls');
  const content = chunks.filter(c => c.type === 'block-end').sort((a, b) => a.index - b.index).map(c => c.block);
  const call = content.find(b => b.type === 'tool-call');
  assert.ok(call.id);
  const assistant = { id: 'a1', role: 'assistant', content,
    source: { kind: 'model', provider: 'antigravity', model: MODEL, replayState: JSON.parse(JSON.stringify(finish.replayState)) } };
  // DSH ToolResultMessage (role 'tool'), plus a developer tool-update message.
  const toolMsg = { id: 't1', role: 'tool', toolCallId: call.id, isError: false,
    content: [{ type: 'text', text: LONG }], source: { kind: 'tool', callId: call.id } };
  const developer = { id: 'd1', role: 'developer', content: [{ type: 'tool-addition', toolName: 'edit' }], source: { kind: 'tools' } };
  const history = [systemMsg, userMsg, assistant, toolMsg, developer];

  // ── Turn 2: pure buildRequest structure ───────────────────────────────────
  const body = buildRequest({ projectId: 'fake-project', modelPublicId: MODEL, runtimeModel: RUNTIME, effort: 'medium',
    maxTokens: 65536, messages: history, tools, requestIndex: 1 });
  assertWellFormed(body);
  const { contents } = body.request;
  assert.deepEqual(contents.map(c => c.role), ['user', 'model', 'user']);
  const modelTurn = contents[1];
  assert.ok(!modelTurn.parts.some(p => typeof p.text === 'string' && p.text.includes('# Skill')), 'tool output must never be replayed as model text');
  const fc = modelTurn.parts.find(p => p.functionCall);
  assert.equal(fc.functionCall.name, 'skill');
  assert.deepEqual(fc.functionCall.args, { name: 'dsh-tui-guide' });
  assert.equal(fc.thoughtSignature, 'U0lHTkFUVVJF');
  const fr = contents[2].parts[0].functionResponse;
  assert.equal(fr.name, 'skill');
  assert.equal(fr.response.output, LONG, 'long tool text is passed through intact');
  const schemas = Object.fromEntries(body.request.tools[0].functionDeclarations.map(d => [d.name, d.parametersJsonSchema]));
  assert.deepEqual(schemas.edit.properties.at, { type: 'object', properties: { line: { type: 'integer' } } });
  assert.deepEqual(schemas.edit.properties.remote, {});
  assert.ok(schemas.edit.properties.$schema, 'property names are not stripped');
  console.log('PASS DSH tool continuation: role:tool -> functionResponse, signature replay, alternation, schema cleanup');

  // Parallel calls with a signature only on the first one (Gemini 3 behaviour), error result.
  {
    const a2 = { id: 'a2', role: 'assistant', source: { kind: 'model', provider: 'antigravity', model: MODEL,
      replayState: { response: {}, blocks: [{ kind: 'tool-call', signature: 'QUJD' }, { kind: 'tool-call' }] } },
      content: [{ type: 'tool-call', id: 'c1', name: 'skill', arguments: '{"name":"a"}' }, { type: 'tool-call', id: 'c2', name: 'edit', arguments: '[1]' }] };
    const r1 = { id: 'r1', role: 'tool', toolCallId: 'c1', content: [{ type: 'text', text: 'A' }], source: { kind: 'tool', callId: 'c1' } };
    const r2 = { id: 'r2', role: 'tool', toolCallId: 'c2', isError: true, content: [], source: { kind: 'tool', callId: 'c2' } };
    const b = buildRequest({ projectId: 'p', modelPublicId: MODEL, runtimeModel: RUNTIME, effort: 'medium', messages: [systemMsg, userMsg, a2, r1, r2], tools });
    assertWellFormed(b);
    const resp = b.request.contents[2].parts.map(p => p.functionResponse);
    assert.deepEqual(resp.map(r => r.name), ['skill', 'edit']);
    assert.deepEqual(resp[1].response, { error: 'Tool failed' });
    assert.deepEqual(b.request.contents[1].parts[1].functionCall.args, {}, 'non-object args become {}');
    // tool result identified only through source.callId
    const r1b = { ...r1, toolCallId: undefined };
    const b2 = buildRequest({ projectId: 'p', modelPublicId: MODEL, runtimeModel: RUNTIME, effort: 'medium', messages: [systemMsg, userMsg, a2, r1b, r2] });
    assert.equal(b2.request.contents[2].parts[0].functionResponse.name, 'skill');
    console.log('PASS parallel calls, error result, source.callId correlation');
  }

  // ── Turn 2 through the adapter: captured wire body, no secrets in body ────
  let captured;
  globalThis.fetch = async (_url, init) => {
    captured = init;
    return sse([{ candidates: [{ content: { parts: [{ text: 'done' }] }, finishReason: 'STOP' }] }]);
  };
  const out = [];
  for await (const c of makeAdapter().stream({ model: MODEL, reasoningEffort: 'medium', messages: history, tools })) out.push(c);
  assert.equal(out.at(-1).reason.kind, 'stop');
  const wire = JSON.parse(captured.body);
  assert.equal(wire.model, RUNTIME);
  assertWellFormed(wire);
  assert.ok(!captured.body.includes(FAKE_ACCESS), 'request body must not carry credentials');
  console.log('PASS adapter second turn wire body well-formed');

  // Unanswered final tool call fails locally (no fetch) with INVALID_REQUEST.
  let fetched = 0;
  globalThis.fetch = async () => { fetched++; throw new Error('must not fetch'); };
  await assert.rejects(async () => { for await (const _ of makeAdapter().stream({ model: MODEL, messages: [userMsg, assistant] })); },
    e => e.name === 'LlmError' && e.code === 'INVALID_REQUEST');
  assert.equal(fetched, 0);
  console.log('PASS unanswered tool call rejected locally');

  // ── 400 diagnostics: parsed, redacted, truncated; never the raw body ──────
  const secretBody = JSON.stringify({ error: { code: 400, status: 'INVALID_ARGUMENT',
    message: 'Invalid value at contents[2] Bearer ya29.SECRETACCESS refresh_token="1//SECRETREFRESH" access_token=abc123 ' + 'x'.repeat(1000),
    details: [{ request: 'REQUEST-BODY-ECHO' }] } });
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(secretBody, { status: 400, headers: { 'content-type': 'application/json' } }); };
  await assert.rejects(async () => { for await (const _ of makeAdapter().stream({ model: MODEL, reasoningEffort: 'medium', messages: history, tools })); }, (e) => {
    assert.equal(e.code, 'INVALID_REQUEST');
    assert.match(e.message, /^Antigravity upstream 400 on .* \(model gemini-3\.8-flash-medium\): INVALID_ARGUMENT: Invalid value at contents\[2\]/);
    for (const leak of ['SECRETACCESS', 'SECRETREFRESH', 'abc123', 'REQUEST-BODY-ECHO', FAKE_ACCESS, '# Skill']) assert.ok(!e.message.includes(leak), `leaked ${leak}`);
    assert.ok(e.message.includes('[redacted]'));
    const detail = e.message.slice(e.message.indexOf('INVALID_ARGUMENT'));
    assert.ok(detail.length <= 301, `detail too long: ${detail.length}`);
    return true;
  });
  assert.equal(calls, 1, '400 is terminal (no endpoint fallback)');
  // Array-wrapped bodies, non-JSON, and context-window classification.
  assert.equal(describeUpstreamError('[{"error":{"status":"INVALID_ARGUMENT","message":"bad"}}]'), 'INVALID_ARGUMENT: bad');
  assert.equal(describeUpstreamError('<html>oops</html>'), undefined);
  assert.equal(describeUpstreamError('{"foo":1}'), undefined);
  assert.equal(redactSecrets('{"access_token": "tok", "refresh_token":"1//r"}'), '{"access_token": "[redacted]", "refresh_token":"[redacted]"}');
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { status: 'INVALID_ARGUMENT', message: 'The input token count exceeds the maximum number of tokens allowed' } }), { status: 400 });
  await assert.rejects(async () => { for await (const _ of makeAdapter().stream({ model: MODEL, messages: [userMsg] })); }, { code: 'CONTEXT_WINDOW_EXCEEDED' });
  console.log('PASS 400 diagnostics: redacted, truncated, no body echo, classified');
} finally {
  globalThis.fetch = realFetch;
}
