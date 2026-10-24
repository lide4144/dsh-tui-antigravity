// wire.js — dsh <-> Google Cloud Code Assist (Antigravity) pure wire logic.
// Ported semantics from pi-antigravity (MIT) by Rahularya01; message/block shapes
// follow @deepseek-ai/dsh-llm vocabulary. No dsh / pi-ai runtime imports — testable offline.
import { createHash, randomBytes } from "node:crypto";

// ── constants (pi-antigravity auth/client/util) ─────────────────────────────
export const DEFAULT_SYSTEM_INSTRUCTION =
  "You are Antigravity, a powerful agentic AI coding assistant designed by Google DeepMind. " +
  "You are pair programming with a user to solve coding tasks. Be concise, practical, and tool-aware.";
export const NO_PREAMBLE_INSTRUCTION =
  'CRITICAL: NEVER output rule checks, formatting guidelines, constraint checklists (e.g. "No emdashes"), or your thinking/personality preambles in the final response. Output only the final response.';

// ── ids ──────────────────────────────────────────────────────────────────────
function sha1Hex(input) {
  return createHash("sha1").update(input).digest();
}
/** v5-style UUID from a seed string (matches pi stableUuid). */
export function stableUuid(seed) {
  const bytes = sha1Hex(`antigravity:${seed}`).subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function randomUuid() {
  return stableUuid(`${Date.now()}-${randomBytes(16).toString("hex")}`);
}
/** Random signed 64-bit decimal string (sessionId), matches pi. */
function randomSessionId() {
  let big = 0n;
  for (let i = 0; i < 4; i++) big = (big << 16n) | BigInt(randomBytes(2).readUInt16LE(0));
  return (big & 0x7fffffffffffffffn).toString(10);
}

// ── model effort metadata ────────────────────────────────────────────────────
const FLASH3 = ["low", "medium", "high"];
export function effortsForModel(modelId) {
  const id = String(modelId);
  if (id.startsWith("claude-")) return ["high"];
  if (id.startsWith("gpt-oss-")) return ["medium"];
  if (id === "gemini-3.1-pro" || id === "gemini-pro-agent") return ["low", "high"];
  return FLASH3; // gemini-3.5/3.6/3.7/3.8 flash families
}
export function defaultEffortForModel(modelId) {
  const id = String(modelId);
  if (id.startsWith("claude-")) return "high";
  if (id.startsWith("gpt-oss-")) return "medium";
  if (id === "gemini-3.1-pro" || id === "gemini-pro-agent") return "low";
  return "medium"; // gemini flash families: -low tiers are often unavailable; medium is live-verified
}

// ── schema normalization for tools ───────────────────────────────────────────
const ALLOW_KEYS = new Set(["type", "description", "properties", "required", "items", "enum"]);
/** Remove JSON-Schema meta keys and inline local $defs/definitions references. */
export function normalizeToolSchema(schema, maxDepth = 64, maxNodes = 10000) {
  if (schema === null || typeof schema !== "object") return schema;
  const defs = {};
  collectDefs(schema, defs, 0);
  const state = { nodes: 0 };
  return deref(schema, defs, state, maxDepth, maxNodes);
}
function collectDefs(node, defs, depth) {
  if (depth > 64 || node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) collectDefs(item, defs, depth + 1);
    return;
  }
  for (const key of ["$defs", "definitions"]) {
    if (node[key] && typeof node[key] === "object") {
      for (const [name, value] of Object.entries(node[key])) defs[name] = value;
    }
  }
  for (const key of Object.keys(node)) {
    if (key === "$defs" || key === "definitions") continue;
    collectDefs(node[key], defs, depth + 1);
  }
}
function deref(node, defs, state, maxDepth, maxNodes) {
  if (state.nodes++ > maxNodes) throw new Error("tool schema too large");
  if (node === null || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map((x) => deref(x, defs, state, maxDepth, maxNodes));
  const out = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "$defs" || key === "definitions") continue;
    if (key === "$ref" && typeof value === "string") {
      const name = value.replace(/^#\/(\$defs|definitions)\//, "");
      const target = defs[name];
      if (target !== undefined) {
        Object.assign(out, deref(target, defs, state, maxDepth - 1, maxNodes));
        continue;
      }
    }
    if (maxDepth <= 0) throw new Error("tool schema too deep");
    out[key] = deref(value, defs, state, maxDepth - 1, maxNodes);
  }
  return out;
}
/** Schema shape for Gemini functionDeclarations. */
export function geminiToolDeclaration(tool) {
  const parameters = normalizeToolSchema(tool.parameters ?? {});
  return { name: tool.name, description: tool.description ?? "", parametersJsonSchema: parameters };
}
/** Schema shape for Claude/GPT-OSS custom tools (allowlist keys only). */
export function customToolDeclaration(tool) {
  const strip = (node) => {
    if (node === null || typeof node !== "object") return node;
    if (Array.isArray(node)) return node.map(strip);
    const out = {};
    for (const key of Object.keys(node)) {
      if (key === "$schema" || key === "$defs" || key === "definitions") continue;
      out[key] = strip(node[key]);
    }
    return out;
  };
  const params = strip(normalizeToolSchema(tool.parameters ?? {}));
  const allowed = {};
  for (const key of Object.keys(params)) if (ALLOW_KEYS.has(key)) allowed[key] = params[key];
  return { name: tool.name, description: tool.description ?? "", parameters: allowed };
}

// ── messages → Gemini-ish contents ───────────────────────────────────────────
function sanitizeText(text) {
  return typeof text === "string" ? text : String(text ?? "");
}
function parseArgs(raw) {
  if (raw && typeof raw === "object") return raw;
  if (typeof raw === "string" && raw.length > 0) {
    try {
      return JSON.parse(raw);
    } catch {
      /* fall through */
    }
  }
  return {};
}
function metaOf(message, index) {
  return blockMeta(message.source, index);
}
function isValidThoughtSignature(sig) {
  if (!sig || typeof sig !== "string" || sig.length === 0 || sig.length % 4 !== 0) return false;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(sig);
}
function blockMeta(assistantSource, index) {
  const rs = assistantSource && typeof assistantSource === "object" ? assistantSource.replayState : undefined;
  if (rs && Array.isArray(rs.blocks)) return rs.blocks[index];
  return undefined;
}
/** Map dsh messages to { contents, tools, sawTools } for the internal request. */
export function convertToContents({ messages, tools, runtimeModel, modelId }) {
  const contents = [];
  const idToName = new Map();
  const droppedToolCallIds = new Map(); // toolCallId -> argsText, only when replay had no valid signature
  const isGemini = runtimeModel.startsWith("gemini-");
  const isClaude = runtimeModel.startsWith("claude-");
  const isGpt = runtimeModel.startsWith("gpt-oss-");
  const requiresSig = isGemini && geminiMajor(runtimeModel) >= 3;
  const idNeeded = isClaude || isGpt;
  const toolDecls =
    tools && tools.length > 0
      ? tools.map((t) => (isClaude || isGpt ? customToolDeclaration(t) : geminiToolDeclaration(t)))
      : undefined;

  const push = (role, parts) => {
    if (parts.length === 0) return;
    const last = contents[contents.length - 1];
    if (last && last.role === role) last.parts.push(...parts);
    else contents.push({ role, parts });
  };

  for (const message of messages) {
    const content = Array.isArray(message.content) ? message.content : [];
    const role = message.role;
    if (role === "system") continue; // handled in buildRequest system slot
    if (role === "user") {
      const textParts = [];
      const respParts = [];
      for (const block of content) {
        if (!block) continue;
        if (block.type === "text") {
          textParts.push({ text: sanitizeText(block.text) });
        } else if (block.type === "image") {
          throw Object.assign(new Error("Antigravity adapter (native) does not support image content"), { __code: "UNSUPPORTED_CONTENT" });
        } else if (block.type === "tool-result") {
          const text = (block.content ?? [])
            .filter((b) => b && b.type === "text")
            .map((b) => sanitizeText(b.text))
            .join("\n");
          const responseText = text || (block.isError ? "Tool failed" : "");
          const rawId = String(block.toolCallId ?? "");
          const sanitizedId = idNeeded ? sanitizeToolCallId(rawId, idToName.get(rawId) ?? "tool") : rawId;
          const name = idToName.get(rawId) ?? "unknown_tool";
          const droppedArgs = requiresSig
            ? (droppedToolCallIds.get(rawId) ??
              droppedToolCallIds.get(sanitizedId) ??
              (rawId === "" ? droppedToolCallIds.get(`empty:${name}`) : undefined))
            : undefined;
          if (droppedArgs !== undefined) {
            const label = droppedArgs === "{}" ? `\`${name}\`` : `\`${name}\` (${droppedArgs})`;
            push("user", [{ text: sanitizeText(`[Observation from ${label}:\n${responseText}]`) }]);
          } else {
            respParts.push({
              functionResponse: {
                name,
                response: block.isError ? { error: responseText } : { output: responseText },
                ...(idNeeded ? { id: sanitizedId } : {}),
              },
            });
          }
        }
      }
      if (respParts.length > 0) {
        if (textParts.length > 0) push("user", textParts);
        push("user", respParts);
      } else {
        push("user", textParts);
      }
      continue;
    }
    // assistant
    const isSameModel =
      message.source &&
      typeof message.source === "object" &&
      message.source.kind === "model" &&
      message.source.provider === "antigravity" &&
      message.source.model === modelId;
    const toolCalls = content.filter((b) => b && b.type === "tool-call");
    const firstSigValid =
      toolCalls.length === 0 || isValidThoughtSignature(metaOf(message, content.indexOf(toolCalls[0]))?.signature);
    const allSigsValid = toolCalls.every((tc) => {
      const sig = metaOf(message, content.indexOf(tc))?.signature;
      return sig === undefined || isValidThoughtSignature(sig);
    });
    const groupIsSigned = isSameModel && firstSigValid && allSigsValid;

    const parts = [];
    for (const block of content) {
      if (!block) continue;
      if (block.type === "text") {
        const meta = metaOf(message, content.indexOf(block));
        const textSig =
          isSameModel && isValidThoughtSignature(meta?.signature) ? meta.signature : undefined;
        if ((!block.text || String(block.text).trim() === "") && !textSig) continue;
        parts.push({ text: sanitizeText(block.text), ...(textSig ? { thoughtSignature: textSig } : {}) });
      } else if (block.type === "reasoning") {
        if (!isSameModel) continue;
        if (!String(block.text ?? "").trim()) continue;
        const meta = metaOf(message, content.indexOf(block));
        parts.push({
          thought: true,
          text: sanitizeText(block.text),
          ...(meta?.signature ? { thoughtSignature: meta.signature } : {}),
        });
      } else if (block.type === "tool-call") {
        const rawId = String(block.id ?? "");
        idToName.set(rawId, String(block.name));
        const meta = metaOf(message, content.indexOf(block));
        const sig = meta?.signature;
        if (requiresSig && !groupIsSigned) {
          let argsText = "{}";
          try {
            argsText = JSON.stringify(typeof block.arguments === "string" ? JSON.parse(block.arguments) : (block.arguments ?? {}));
          } catch {
            /* keep {} */
          }
          if (rawId) {
            droppedToolCallIds.set(rawId, argsText);
            droppedToolCallIds.set(sanitizeToolCallId(rawId, block.name), argsText);
          } else {
            droppedToolCallIds.set(`empty:${block.name}`, argsText);
          }
        } else {
          const call = {
            name: String(block.name),
            args: parseArgs(block.arguments),
            ...(idNeeded ? { id: sanitizeToolCallId(rawId, String(block.name)) } : {}),
          };
          parts.push({ functionCall: call, ...(sig && groupIsSigned ? { thoughtSignature: sig } : {}) });
        }
      }
    }
    push("model", parts);
  }

  // Google Antigravity requires a natural-language user part in tool-only turns.
  const hasUserText = contents.some(
    (turn) => turn.role === "user" && turn.parts.some((part) => "text" in part && Boolean(String(part.text).trim())),
  );
  if (!hasUserText && contents.length > 0) {
    const bridge = { text: "Continue the active task using the available instructions and context." };
    const userTurn = contents.find((turn) => turn.role === "user");
    if (userTurn) userTurn.parts.push(bridge);
    else contents.unshift({ role: "user", parts: [bridge] });
  }

  return { contents, tools: toolDecls };
}

function geminiMajor(runtimeModel) {
  const m = /^gemini-(\d+)/.exec(runtimeModel);
  return m ? Number.parseInt(m[1], 10) : 0;
}
function sanitizeToolCallId(id, fallbackName) {
  const cleaned = String(id).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  return cleaned || `${fallbackName || "tool"}`;
}

// ── request assembly (envelope rules ported from pi util.ts/buildRequest) ────
export function buildRequest({
  projectId,
  modelPublicId,
  runtimeModel,
  effort = "low",
  maxTokens,
  system,
  messages,
  tools,
  requestIndex = 0,
}) {
  const { contents, tools: toolDecls } = convertToContents({ messages, tools, runtimeModel, modelId: modelPublicId });
  let systemParts;
  if (system && system.trim().length > 0) {
    systemParts = [{ text: sanitizeText(system) }];
  } else {
    // No explicit system prompt: append any role:'system' message text, then defaults.
    const sysTexts = [];
    for (const m of messages) {
      if (m && m.role === "system") {
        for (const b of m.content ?? []) if (b && b.type === "text") sysTexts.push(sanitizeText(b.text));
      }
    }
    systemParts = sysTexts.length > 0
      ? sysTexts.map((text) => ({ text }))
      : [{ text: DEFAULT_SYSTEM_INSTRUCTION }, { text: NO_PREAMBLE_INSTRUCTION }];
  }

  // trajectory / conversation ids seeded from the first user text
  const firstUserText = (() => {
    for (const m of messages) {
      if (m && m.role === "user") {
        const t = (m.content ?? []).find((b) => b && b.type === "text");
        if (t && typeof t.text === "string" && t.text.trim()) return t.text;
      }
    }
    return "";
  })();
  const trajectoryId = stableUuid(firstUserText || `session-${Date.now()}`);
  const conversationId = firstUserText ? stableUuid(`${trajectoryId}:conversation`) : undefined;

  const step = Math.max(1, contents.length);
  const lastStepIndex = String(Math.max(0, contents.length - 1));
  const sessionId = randomSessionId();
  const usedClaude = String(runtimeModel.startsWith("claude-"));
  const usedNonGemini = String(!runtimeModel.startsWith("gemini-"));

  const labels = {
    last_step_index: lastStepIndex,
    request_id: `${trajectoryId}-${requestIndex}`,
    trajectory_id: trajectoryId,
    used_claude: usedClaude,
    used_claude_conservative: usedClaude,
    used_non_gemini_model: usedNonGemini,
  };

  const generationConfig = {};
  if (maxTokens !== undefined) generationConfig.maxOutputTokens = maxTokens;
  const thinkingConfig = thinkingFor(runtimeModel, effort);
  if (thinkingConfig) generationConfig.thinkingConfig = thinkingConfig;

  const request = { contents, systemInstruction: { role: "user", parts: systemParts } };
  if (Object.keys(generationConfig).length) request.generationConfig = generationConfig;
  if (toolDecls && toolDecls.length > 0) request.tools = [{ functionDeclarations: toolDecls }];
  request.sessionId = sessionId;
  request.labels = labels;

  const requestId = `agent/${conversationId ?? randomUuid()}/${Date.now()}/${trajectoryId}/${step}`;
  return {
    project: projectId,
    model: runtimeModel,
    request,
    requestType: "agent",
    userAgent: "antigravity",
    requestId,
  };
}

// ── SSE assembler → dsh chunks ───────────────────────────────────────────────
/** Build thinkingConfig for a runtime model id + effort. */
export function thinkingFor(runtimeModel, effort) {
  if (!effort || effort === "off") return { includeThoughts: false, thinkingBudget: 0 };
  if (runtimeModel.startsWith("claude-")) return { includeThoughts: true, thinkingBudget: 1024 };
  if (runtimeModel.startsWith("gpt-oss-")) return { includeThoughts: true, thinkingBudget: 8192 };
  if (runtimeModel.startsWith("gemini-3.5-flash") || runtimeModel === "gemini-3-flash-agent") {
    const budget = effort === "high" ? 10_000 : effort === "medium" ? 4_000 : 1_000;
    return { includeThoughts: true, thinkingBudget: budget };
  }
  if (runtimeModel.startsWith("gemini-3.1-pro") || runtimeModel === "gemini-pro-agent") {
    return { includeThoughts: true, thinkingBudget: effort === "high" ? 10_001 : 1_001 };
  }
  const budget = effort === "high" ? -1 : effort === "medium" ? 4_000 : 1_000;
  return { includeThoughts: true, thinkingBudget: budget };
}

/**
 * Incremental SSE assembler. Feed parsed JSON payloads with .feed(payload);
 * call .finish() at stream end. Emits dsh StreamChunks via `emit`.
 */
export function createSseAssembler(emit) {
  let nextIndex = 0;
  let current = null; // { index, kind: 'text'|'reasoning'|'tool-call', ... }
  const blocks = []; // replay meta per emitted block (kind + signature)
  let sawTool = false;
  let pendingUsage = null;
  let finishReason = null; // 'stop' | 'max-tokens' | 'tool-calls' | 'error'
  let errorFailure = null;
  let response = null;
  let finished = false;
  const callIds = new Set();

  const closeCurrent = () => {
    if (!current) return;
    if (current.kind === "text") {
      emit({ type: "block-end", index: current.index, block: { type: "text", text: current.text } });
    } else if (current.kind === "reasoning") {
      emit({ type: "block-end", index: current.index, block: { type: "reasoning", text: current.text } });
    } else if (current.kind === "tool-call") {
      emit({
        type: "block-end",
        index: current.index,
        block: { type: "tool-call", id: current.callId, name: current.name, arguments: current.arguments },
      });
    }
    current = null;
  };

  const open = (kind) => {
    closeCurrent();
    const block = { index: nextIndex++, kind };
    current = block;
    blocks.push({ kind });
    emit({ type: "block-start", index: block.index, blockType: kind });
    return block;
  };

  const feedPart = (part) => {
    if (!part || typeof part !== "object") return;
    if (part.thought === true) {
      if (!current || current.kind !== "reasoning") open("reasoning");
      const text = typeof part.text === "string" ? part.text : "";
      if (text) {
        current.text = (current.text ?? "") + text;
        emit({ type: "reasoning-delta", index: current.index, text });
      }
      if (typeof part.thoughtSignature === "string" && part.thoughtSignature) {
        const meta = blocks[blocks.length - 1];
        if (meta) meta.signature = part.thoughtSignature;
      }
      return;
    }
    const fc = part.functionCall;
    if (fc && typeof fc === "object") {
      open("tool-call");
      sawTool = true;
      const baseId = sanitizeToolCallId(fc.id ?? "", `call_${current.index}`);
      let callId = baseId;
      let suffix = 0;
      while (callIds.has(callId)) {
        const tail = `_${++suffix}`;
        callId = `${baseId.slice(0, 64 - tail.length)}${tail}`;
      }
      callIds.add(callId);
      const name = String(fc.name ?? "tool");
      const argsRaw = fc.args === undefined ? (fc.arguments ?? {}) : fc.args;
      const args = typeof argsRaw === "string" ? argsRaw : JSON.stringify(argsRaw ?? {});
      current.callId = callId;
      current.name = name;
      current.arguments = args;
      const meta = blocks[blocks.length - 1];
      if (meta) {
        if (typeof part.thoughtSignature === "string" && part.thoughtSignature) meta.signature = part.thoughtSignature;
        else if (fc.thoughtSignature) meta.signature = String(fc.thoughtSignature);
      }
      emit({ type: "tool-call-delta", index: current.index, id: callId, name, argumentsDelta: args });
      return;
    }
    // plain text part
    const text = typeof part.text === "string" ? part.text : "";
    if (!text && !part.thoughtSignature) return;
    if (!current || current.kind !== "text") open("text");
    current.text = (current.text ?? "") + text;
    emit({ type: "text-delta", index: current.index, text });
    if (typeof part.thoughtSignature === "string" && part.thoughtSignature) {
      const meta = blocks[blocks.length - 1];
      if (meta) meta.signature = part.thoughtSignature;
    }
  };

  return {
    feed(payload) {
      if (finished || errorFailure || !payload || typeof payload !== "object") return;
      const obj = payload.response && typeof payload.response === "object" ? payload.response : payload;
      response = obj;
      if (obj.promptFeedback?.blockReason) {
        finishReason = "error";
        errorFailure = { message: `Antigravity blocked response: ${obj.promptFeedback.blockReason}`, code: "TRANSPORT" };
        return;
      }
      if (obj.error && typeof obj.error === "object") {
        finishReason = "error";
        errorFailure = { message: String(obj.error.message ?? "Antigravity upstream error"), code: classifyError(obj.error) };
        return;
      }
      if (obj.usageMetadata && typeof obj.usageMetadata === "object") {
        pendingUsage = usageFrom(obj.usageMetadata);
      }
      const candidates = Array.isArray(obj.candidates) ? obj.candidates : [];
      for (const cand of candidates) {
        if (!cand || typeof cand !== "object") continue;
        if (cand.finishReason) {
          const fr = String(cand.finishReason);
          if (fr === "STOP") finishReason = "stop";
          else if (fr === "MAX_TOKENS") finishReason = "max-tokens";
          else {
            finishReason = "error";
            errorFailure = { message: `Antigravity finish reason: ${fr}`, code: "TRANSPORT" };
          }
        }
        if (cand.error && typeof cand.error === "object") {
          finishReason = "error";
          errorFailure = { message: String(cand.error.message ?? "Antigravity upstream error"), code: classifyError(cand.error) };
          continue;
        }
        const content = cand.content && typeof cand.content === "object" ? cand.content : {};
        const parts = Array.isArray(content.parts) ? content.parts : Array.isArray(cand.parts) ? cand.parts : [];
        for (const part of parts) feedPart(part);
      }
    },
    /** True when we saw an in-band error payload. */
    get failed() {
      return finishReason === "error" && errorFailure !== null;
    },
    finish() {
      if (finished) return;
      finished = true;
      const replayState = { response, blocks: blocks.map((block) => ({ ...block })) };
      if (finishReason === null) {
        finishReason = "error";
        errorFailure = { message: "Antigravity stream ended without a finish reason", code: "TRANSPORT" };
      }
      if (finishReason === "error" && errorFailure) {
        closeCurrent();
        const failure = errorFailure;
        if (pendingUsage) {
          emit({ type: "usage", usage: pendingUsage });
          pendingUsage = null;
        }
        emit({ type: "finish", reason: { kind: "error", failure }, replayState });
        return;
      }
      closeCurrent();
      if (pendingUsage) {
        emit({ type: "usage", usage: pendingUsage });
        pendingUsage = null;
      }
      let reason = finishReason === "max-tokens" ? { kind: "max-tokens" } : { kind: "stop" };
      if (sawTool && finishReason !== "max-tokens") reason = { kind: "tool-calls" };
      if (blocks.length === 0 && reason.kind === "stop") {
        reason = { kind: "error", failure: { message: "Antigravity returned an empty response", code: "EMPTY_RESPONSE" } };
      }
      emit({ type: "finish", reason, replayState });
    },
  };
}
function usageFrom(u) {
  const cacheRead = Number(u.cachedContentTokenCount ?? 0);
  const prompt = Number(u.promptTokenCount ?? 0);
  const thoughts = Number(u.thoughtsTokenCount ?? 0);
  const candidates = Number(u.candidatesTokenCount ?? 0);
  const total = u.totalTokenCount !== undefined ? Number(u.totalTokenCount) : undefined;
  const usage = {
    inputTokens: Math.max(0, prompt - cacheRead),
    outputTokens: candidates + thoughts,
    reasoningTokens: thoughts,
    totalTokens: total,
  };
  if (cacheRead > 0) usage.cacheReadTokens = cacheRead;
  return usage;
}
function classifyError(err) {
  const text = `${String(err.status ?? "")} ${String(err.code ?? "")} ${String(err.message ?? "")}`.toLowerCase();
  if (/429|quota|rate|limit/.test(text)) return /quota|balance|limit/.test(text) && !/rate/.test(text) ? "QUOTA" : "RATE_LIMIT";
  if (/\b(401|403|unauthor|permission|forbidden)\b/.test(text)) return "INVALID_CREDENTIAL";
  if (/timeout|timed?out/.test(text)) return "TIMEOUT";
  if (/context|window|token.*exceed/.test(text)) return "CONTEXT_WINDOW_EXCEEDED";
  return "TRANSPORT";
}
