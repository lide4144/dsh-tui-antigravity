// Offline tests for dsh-llm-antigravity (no dsh runtime, no network).
import assert from "node:assert/strict";
import { buildRequest, createSseAssembler, effortsForModel, defaultEffortForModel, thinkingFor } from "../lib/wire.js";
import { createAntigravityAdapter } from "../lib/adapter.js";

class LlmError extends Error {
  constructor(message, code, options) {
    super(message, options);
    this.name = "LlmError";
    this.code = code;
  }
}
const attributionHeaders = () => ({ "user-agent": "deepseek-harness/0.0.0 (test)" });

const userMsg = (text) => ({
  id: "u1",
  role: "user",
  content: [{ type: "text", text }],
  source: { kind: "user" },
});

// 1) buildRequest: structure, medium budget 4000, envelope fields
{
  const body = buildRequest({
    projectId: "aicode-consumers",
    modelPublicId: "gemini-3.8-flash",
    runtimeModel: "gemini-3.8-flash-medium",
    effort: "medium",
    maxTokens: 65536,
    system: "Be concise.",
    messages: [userMsg("Hello")],
    tools: [{ name: "read_file", description: "Read a file", parameters: { type: "object", properties: { path: { type: "string" } } } }],
    requestIndex: 0,
  });
  assert.equal(body.project, "aicode-consumers");
  assert.equal(body.model, "gemini-3.8-flash-medium");
  assert.equal(body.requestType, "agent");
  assert.equal(body.userAgent, "antigravity");
  assert.ok(body.requestId.startsWith("agent/"));
  assert.equal(body.request.contents[0].role, "user");
  assert.equal(body.request.contents[0].parts[0].text, "Hello");
  assert.equal(body.request.systemInstruction.parts[0].text, "Be concise.");
  assert.equal(body.request.generationConfig.maxOutputTokens, 65536);
  assert.deepEqual(body.request.generationConfig.thinkingConfig, { includeThoughts: true, thinkingBudget: 4000 });
  assert.ok(body.request.tools[0].functionDeclarations[0].parametersJsonSchema);
  assert.equal(typeof body.request.sessionId, "string");
  assert.equal(body.request.labels.last_step_index, "0");
  console.log("PASS buildRequest basic");
}

// 1b) effort maps
{
  assert.equal(thinkingFor("gemini-3.8-flash-medium", "medium").thinkingBudget, 4000);
  assert.equal(thinkingFor("gemini-3.8-flash-low", "low").thinkingBudget, 1000);
  assert.deepEqual(effortsForModel("gemini-3.8-flash"), ["low", "medium", "high"]);
  assert.deepEqual(effortsForModel("claude-opus-4-6"), ["high"]);
  assert.deepEqual(effortsForModel("gpt-oss-120b"), ["medium"]);
  assert.equal(defaultEffortForModel("gemini-3.8-flash"), "medium");
  console.log("PASS effort maps");
}

// 2) SSE assembler: thought/text/tool-call/usage/finish
{
  const chunks = [];
  const a = createSseAssembler((c) => chunks.push(c));
  const feed = (o) => a.feed(o);
  feed({ candidates: [{ content: { parts: [{ thought: true, text: "let me think", thoughtSignature: "QUJDRA==" }] } }] });
  feed({ candidates: [{ content: { parts: [{ text: "Hi" }, { text: " there" }] } }] });
  feed({ candidates: [{ content: { parts: [{ functionCall: { name: "read_file", args: { path: "a.ts" }, id: "call-1" } }] } }] });
  feed({ usageMetadata: { promptTokenCount: 120, cachedContentTokenCount: 10, candidatesTokenCount: 20, thoughtsTokenCount: 5, totalTokenCount: 145 } });
  feed({ candidates: [{ content: { parts: [] }, finishReason: "STOP" }] });
  a.finish();
  const types = chunks.map((c) => c.type);
  assert.ok(types.includes("reasoning-delta"), "reasoning-delta missing: " + types);
  assert.ok(types.includes("text-delta"), "text-delta missing");
  assert.ok(types.includes("tool-call-delta"), "tool-call-delta missing");
  assert.ok(types.includes("usage"), "usage missing");
  const finish = chunks.find((c) => c.type === "finish");
  assert.equal(finish.reason.kind, "tool-calls");
  const usage = chunks.find((c) => c.type === "usage");
  assert.equal(usage.usage.inputTokens, 110);
  assert.equal(usage.usage.reasoningTokens, 5);
  // replay signature must be captured for the tool-call block
  const blockEnd = chunks.find((c) => c.type === "block-end" && c.block.type === "tool-call");
  assert.ok(blockEnd && blockEnd.block.arguments.includes('"path"'));
  console.log("PASS SSE assembler");
}

// 3) replay: assistant tool-call signature round-trips into request functionCall
{
  const assistantMsg = {
    id: "a1",
    role: "assistant",
    content: [{ type: "tool-call", id: "call-1", name: "read_file", arguments: '{"path":"a.ts"}' }],
    source: { kind: "model", provider: "antigravity", model: "gemini-3.8-flash", replayState: { response: {}, blocks: [{ kind: "tool-call", signature: "U0lH" }] } },
  };
  const body = buildRequest({
    projectId: "p",
    modelPublicId: "gemini-3.8-flash",
    runtimeModel: "gemini-3.8-flash-medium",
    effort: "medium",
    messages: [
      userMsg("please"),
      assistantMsg,
      { id: "t1", role: "tool", toolCallId: "call-1", content: [{ type: "text", text: "ok" }], source: { kind: "tool", callId: "call-1" } },
    ],
  });
  const modelParts = body.request.contents.find((c) => c.role === "model").parts;
  assert.ok(modelParts[0].functionCall, "expected functionCall part");
  assert.equal(modelParts[0].thoughtSignature, "U0lH");
  assert.equal(modelParts[0].functionCall.name, "read_file");
  console.log("PASS replay signature");
}

// 4) empty response → EMPTY_RESPONSE finish
{
  const chunks = [];
  const a = createSseAssembler((c) => chunks.push(c));
  a.feed({ candidates: [{ content: { parts: [] }, finishReason: "STOP" }] });
  a.finish();
  const finish = chunks.find((c) => c.type === "finish");
  assert.equal(finish.reason.kind, "error");
  assert.equal(finish.reason.failure.code, "EMPTY_RESPONSE");
  console.log("PASS empty response");
}

// 5) adapter.stream offline with stubbed fetch + record credentials
{
  const ssePayloads = [
    { candidates: [{ content: { parts: [{ text: "Hello from " }, { text: "Gemini 3.8 Flash" }] } }] },
    { usageMetadata: { promptTokenCount: 10, cachedContentTokenCount: 0, candidatesTokenCount: 7, thoughtsTokenCount: 0, totalTokenCount: 17 } },
    { candidates: [{ content: { parts: [] }, finishReason: "STOP" }] },
  ];
  const body = new ReadableStream({
    start(controller) {
      for (const p of ssePayloads) controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(p)}\n\n`));
      controller.close();
    },
  });
  const realFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount++;
    return { ok: true, status: 200, body };
  };
  const adapter = createAntigravityAdapter({
    LlmError,
    attributionHeaders,
    logger: { info() {}, warn() {} },
    credentialsService: () => ({
      readRecord: async () => ({ kind: "grant", payload: { type: "oauth", refresh: "x", access: "tok", expires: Date.now() + 3_600_000, projectId: "aicode-consumers", email: "z@example.com" } }),
      modifyRecord: async (key, fn) => fn({}),
    }),
  });
  try {
    const chunks = [];
    for await (const chunk of adapter.stream({
      provider: "antigravity",
      model: "gemini-3.8-flash",
      reasoningEffort: "medium",
      system: "sys",
      messages: [userMsg("hi")],
    })) {
      chunks.push(chunk);
    }
    const types = chunks.map((c) => c.type);
    assert.ok(types.includes("text-delta"), "no text-delta: " + types);
    const finish = chunks.find((c) => c.type === "finish");
    assert.equal(finish.reason.kind, "stop");
    assert.ok(fetchCount >= 1);
    console.log("PASS adapter.stream (stubbed fetch/creds)");
  } finally {
    globalThis.fetch = realFetch;
  }
}

// 3b) tool-result must map to functionResponse with an OBJECT response (Struct)
{
  const assistant = { id: "a1", role: "assistant", content: [{ type: "tool-call", id: "call-9", name: "bash", arguments: "{\"cmd\":\"ls\"}" }], source: { kind: "model", provider: "antigravity", model: "gemini-3.8-flash", replayState: { response: {}, blocks: [{ kind: "tool-call", signature: "U0lH" }] } } };
  const result = { id: "r1", role: "user", content: [{ type: "tool-result", toolCallId: "call-9", content: [{ type: "text", text: "total 24" }], isError: false }], source: { kind: "tool", callId: "call-9" } };
  const body = buildRequest({ projectId: "p", modelPublicId: "gemini-3.8-flash", runtimeModel: "gemini-3.8-flash-medium", effort: "medium", messages: [userMsg("run it"), assistant, result] });
  const frPart = body.request.contents.flatMap((c) => (c.role === "user" ? c.parts : [])).find((p) => p.functionResponse);
  assert.ok(frPart, "expected functionResponse part");
  assert.deepEqual(frPart.functionResponse.response, { output: "total 24" });
  assert.equal(frPart.functionResponse.name, "bash");
  assert.equal(frPart.functionResponse.id, undefined); // gemini carries no id
  // error path
  const errResult = { id: "r2", role: "user", content: [{ type: "tool-result", toolCallId: "call-9", content: [{ type: "text", text: "boom" }], isError: true }], source: { kind: "tool", callId: "call-9" } };
  const body2 = buildRequest({ projectId: "p", modelPublicId: "gemini-3.8-flash", runtimeModel: "gemini-3.8-flash-medium", effort: "medium", messages: [userMsg("x"), assistant, errResult] });
  const fr2 = body2.request.contents.flatMap((c) => (c.role === "user" ? c.parts : [])).find((p) => p.functionResponse);
  assert.deepEqual(fr2.functionResponse.response, { error: "boom" });
  console.log("PASS tool-result struct");
}

// 3c) unsigned Gemini 3.x replay must degrade to [Observation] text (no 400)
{
  const assistant = { id: "a1", role: "assistant", content: [{ type: "tool-call", id: "call-u", name: "bash", arguments: "{\"cmd\":\"ls\"}" }], source: { kind: "model", provider: "deepseek", model: "deepseek-v4-flash" } };
  const result = { id: "r1", role: "user", content: [{ type: "tool-result", toolCallId: "call-u", content: [{ type: "text", text: "total 24" }], isError: false }], source: { kind: "tool", callId: "call-u" } };
  const body = buildRequest({ projectId: "p", modelPublicId: "gemini-3.8-flash", runtimeModel: "gemini-3.8-flash-medium", effort: "medium", messages: [userMsg("run it"), assistant, result] });
  const allText = body.request.contents.flatMap((c) => (c.role === "user" ? c.parts : [])).map((p) => p.text ?? "").join(" ");
  assert.ok(allText.includes("[Observation from `bash`"), "expected observation fallback, got: " + allText.slice(0,120));
  const hasFunctionResponse = body.request.contents.some((c) => (c.parts || []).some((p) => p.functionResponse));
  assert.equal(hasFunctionResponse, false);
  console.log("PASS unsigned replay fallback");
}

console.log("ALL TESTS PASSED");
