import assert from 'node:assert/strict';
import { LlmAdapter } from '@deepseek-ai/dsh-llm';
import { apply } from '../lib/index.js';

let adapter, command, released = 0;
const dispose = apply({
  llm: {
    registerAdapter(routes, value) {
      assert.deepEqual(routes, ['antigravity']);
      assert.ok(value instanceof LlmAdapter);
      adapter = value;
      return () => released++;
    },
    registerConfigurableProviders() { return () => released++; },
  },
  logger: { info() {} },
  get(key) {
    if (key === 'commands') return { register(value) {
      command = value;
      assert.equal(value.recordInput, false);
      return () => released++;
    } };
    if (key === 'userQuestions') return { ask: async () => { throw new Error('not used'); } };
  },
});
assert.equal(command.name, 'antigravity-auth');
const models = await adapter.listModels('antigravity');
assert.ok(models.length > 0);
const prepared = await adapter.prepareCall('antigravity', models[0].id);
assert.equal(typeof prepared.stream, 'function');
const controller = new AbortController(); controller.abort();
await assert.rejects(async () => {
  for await (const chunk of adapter.stream({ provider: 'antigravity', model: models[0].id,
    messages: [], signal: controller.signal })) assert.fail('pre-cancelled request emitted chunk');
});
dispose();
assert.equal(released, 3);
console.log('PASS installed DSH LlmAdapter, plugin registration, command privacy, metadata and teardown');
