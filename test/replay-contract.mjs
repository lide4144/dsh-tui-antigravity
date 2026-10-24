// Offline integration: real SSE parser + assembler + next-turn request; fake credentials/network only.
import assert from 'node:assert/strict';
import { createAntigravityAdapter } from '../lib/adapter.js';
import { buildRequest, createSseAssembler } from '../lib/wire.js';
class LlmError extends Error { constructor(message, code) { super(message); this.code = code; } }
const model = 'gemini-3.8-flash';
const user = { role: 'user', content: [{ type: 'text', text: 'inspect both' }] };
const frames = [
  { candidates: [{ content: { parts: [{ thought: true, text: 'thinking', thoughtSignature: 'QUJD' }] } }] },
  { candidates: [{ content: { parts: [{ text: 'Checking' }] } }] },
  { candidates: [{ content: { parts: [{ thoughtSignature: 'REVG' }] } }] },
  { candidates: [{ content: { parts: [
    { functionCall: { name: 'read', args: { path: 'a' } }, thoughtSignature: 'R0hJ' },
    { functionCall: { name: 'read', args: { path: 'b' } }, thoughtSignature: 'SktM' },
  ] } }] },
  { candidates: [{ finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 10 } },
];
const realFetch = globalThis.fetch;
let requests = 0;
globalThis.fetch = async (_url, init) => {
  requests++;
  assert.equal(JSON.parse(init.body).model, `${model}-medium`);
  const bytes = new TextEncoder().encode(frames.map(response => `data: ${JSON.stringify({ response })}\n\n`).join('') + 'data: [DONE]\n\n');
  return new Response(new ReadableStream({ start(controller) {
    // Split within JSON/data prefixes to exercise the real transport parser.
    for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7));
    controller.close();
  } }), { headers: { 'content-type': 'text/event-stream' } });
};
try {
  const adapter = createAntigravityAdapter({ LlmError, credentialsService: {
    readRecord: async () => ({ kind: 'grant', payload: { refresh: 'fake-refresh', access: 'fake-access', expires: Date.now() + 3600000, projectId: 'fake-project' } }),
  } });
  const chunks = [];
  for await (const chunk of adapter.stream({ model, messages: [user], reasoningEffort: 'medium' })) chunks.push(chunk);
  assert.equal(requests, 1);
  const finish = chunks.find(c => c.type === 'finish');
  assert.equal(finish.reason.kind, 'tool-calls');
  const starts = chunks.filter(c => c.type === 'block-start');
  const content = chunks.filter(c => c.type === 'block-end').sort((a, b) => a.index - b.index).map(c => c.block);
  assert.equal(finish.replayState.blocks.length, starts.length);
  assert.deepEqual(finish.replayState.blocks.map(b => b.kind), content.map(b => b.type));
  assert.deepEqual(finish.replayState.blocks.map(b => b.signature), ['QUJD', 'REVG', 'R0hJ', 'SktM']);
  assert.ok(Object.hasOwn(finish.replayState, 'response'));
  const calls = content.filter(b => b.type === 'tool-call');
  assert.equal(new Set(calls.map(c => c.id)).size, 2);
  for (const call of calls) assert.ok(call.id);
  const assistant = { role: 'assistant', content, source: { kind: 'model', provider: 'antigravity', model, replayState: finish.replayState } };
  const results = { role: 'user', content: calls.map(c => ({ type: 'tool-result', toolCallId: c.id, content: [{ type: 'text', text: c.id }] })) };
  for (const runtimeModel of [`${model}-medium`, 'claude-opus-4-6']) {
    const body = buildRequest({ projectId: 'fake-project', modelPublicId: model, runtimeModel, messages: [user, assistant, results] });
    const parts = body.request.contents.flatMap(c => c.parts);
    const replayCalls = parts.filter(p => p.functionCall);
    assert.equal(replayCalls.length, 2);
    assert.deepEqual(replayCalls.map(p => p.thoughtSignature), ['R0hJ', 'SktM']);
    assert.equal(parts.find(p => p.text === 'Checking').thoughtSignature, 'REVG');
    assert.equal(parts.find(p => p.thought).thoughtSignature, 'QUJD');
    const responses = parts.filter(p => p.functionResponse);
    assert.equal(responses.length, 2);
    if (runtimeModel.startsWith('claude')) {
      assert.deepEqual(replayCalls.map(p => p.functionCall.id), calls.map(c => c.id));
      assert.deepEqual(responses.map(p => p.functionResponse.id), calls.map(c => c.id));
    }
  }
  console.log('PASS real SSE -> replayState -> next buildRequest; parallel same-name calls');
} finally { globalThis.fetch = realFetch; }

for (const ending of [null, 'SAFETY', 'RECITATION', 'OTHER']) {
  const chunks = [];
  const a = createSseAssembler(c => chunks.push(c));
  a.feed({ candidates: [{ content: { parts: [{ functionCall: { name: 'read', args: {} } }] } }] });
  if (ending) a.feed({ candidates: [{ finishReason: ending }] });
  a.finish();
  a.finish();
  const finishes = chunks.filter(c => c.type === 'finish');
  assert.equal(finishes.length, 1);
  assert.equal(finishes[0].reason.kind, 'error', String(ending));
  assert.ok(finishes[0].reason.failure.message.includes(ending ?? 'without a finish reason'));
  assert.equal(finishes[0].replayState.blocks.length, 1);
}
{
  const chunks = [];
  const a = createSseAssembler(c => chunks.push(c));
  a.feed({ promptFeedback: { blockReason: 'SAFETY' } });
  assert.equal(a.failed, true);
  a.finish();
  assert.equal(chunks.at(-1).reason.kind, 'error');
}
console.log('PASS truncated and safety/unsupported finish reasons reject success');
