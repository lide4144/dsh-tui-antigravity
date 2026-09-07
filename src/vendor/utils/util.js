// ../../.pi/agent/npm/node_modules/pi-antigravity/src/utils/util.ts
import { createHash } from "node:crypto";

// ../../.pi/agent/npm/node_modules/pi-antigravity/src/models/models.ts
var ANTIGRAVITY_ROUTING = {
  "claude-opus-4-6": {
    routing: {
      minimal: "claude-opus-4-6-thinking",
      low: "claude-opus-4-6-thinking",
      medium: "claude-opus-4-6-thinking",
      high: "claude-opus-4-6-thinking"
    },
    defaultRequestId: "claude-opus-4-6-thinking"
  },
  "claude-sonnet-4-6": {
    off: "claude-sonnet-4-6",
    routing: {
      minimal: "claude-sonnet-4-6",
      low: "claude-sonnet-4-6",
      medium: "claude-sonnet-4-6",
      high: "claude-sonnet-4-6",
      xhigh: "claude-sonnet-4-6"
    },
    defaultRequestId: "claude-sonnet-4-6"
  },
  "gemini-3.1-pro": {
    off: "gemini-3.1-pro-low",
    routing: {
      minimal: "gemini-3.1-pro-low",
      low: "gemini-3.1-pro-low",
      medium: "gemini-3.1-pro-low",
      high: "gemini-pro-agent",
      xhigh: "gemini-pro-agent"
    },
    defaultRequestId: "gemini-3.1-pro-low"
  },
  "gemini-3.8-flash": {
    off: "gemini-3.8-flash-low",
    routing: {
      minimal: "gemini-3.8-flash-low",
      low: "gemini-3.8-flash-low",
      medium: "gemini-3.8-flash-medium",
      high: "gemini-3.8-flash-high",
      xhigh: "gemini-3.8-flash-high"
    },
    defaultRequestId: "gemini-3.8-flash-low"
  },
  "gemini-3.7-flash": {
    off: "gemini-3.7-flash-low",
    routing: {
      minimal: "gemini-3.7-flash-low",
      low: "gemini-3.7-flash-low",
      medium: "gemini-3.7-flash-medium",
      high: "gemini-3.7-flash-high",
      xhigh: "gemini-3.7-flash-high"
    },
    defaultRequestId: "gemini-3.7-flash-low"
  },
  "gemini-3.6-flash": {
    off: "gemini-3.6-flash-low",
    routing: {
      minimal: "gemini-3.6-flash-low",
      low: "gemini-3.6-flash-low",
      medium: "gemini-3.6-flash-medium",
      high: "gemini-3.6-flash-high",
      xhigh: "gemini-3.6-flash-high"
    },
    defaultRequestId: "gemini-3.6-flash-low"
  },
  "gemini-3.5-flash": {
    off: "gemini-3.5-flash-extra-low",
    routing: {
      minimal: "gemini-3.5-flash-extra-low",
      low: "gemini-3.5-flash-extra-low",
      medium: "gemini-3.5-flash-low",
      high: "gemini-3-flash-agent",
      xhigh: "gemini-3-flash-agent"
    },
    defaultRequestId: "gemini-3.5-flash-extra-low"
  },
  "gpt-oss-120b": {
    off: "gpt-oss-120b-medium",
    routing: {
      minimal: "gpt-oss-120b-medium",
      low: "gpt-oss-120b-medium",
      medium: "gpt-oss-120b-medium",
      high: "gpt-oss-120b-medium"
    },
    defaultRequestId: "gpt-oss-120b-medium"
  }
};
var geminiFlashCost = { input: 0.1, output: 0.4, cacheRead: 0.025, cacheWrite: 0.1 };
var geminiProCost = { input: 1.25, output: 5, cacheRead: 0.3125, cacheWrite: 1.25 };
var claudeSonnetCost = { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 };
var claudeOpusCost = { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 };
var gptOssCost = { input: 0.6, output: 2.4, cacheRead: 0.15, cacheWrite: 0.6 };
var thinkingLevelMaps = {
  lowMediumHigh: {
    off: null,
    minimal: null,
    low: "low",
    medium: "medium",
    high: "high",
    xhigh: null,
    max: null
  },
  lowHigh: {
    off: null,
    minimal: null,
    low: "low",
    medium: null,
    high: "high",
    xhigh: null,
    max: null
  },
  thinking: {
    off: null,
    minimal: null,
    low: null,
    medium: null,
    high: "high",
    xhigh: null,
    max: null
  },
  medium: {
    off: null,
    minimal: null,
    low: null,
    medium: "medium",
    high: null,
    xhigh: null,
    max: null
  }
};
var ANTIGRAVITY_MODELS = [
  {
    id: "gemini-3.8-flash",
    name: "Gemini 3.8 Flash (Antigravity)",
    reasoning: true,
    thinkingLevelMap: thinkingLevelMaps.lowMediumHigh,
    input: ["text", "image"],
    cost: geminiFlashCost,
    contextWindow: 1048576,
    maxTokens: 65536
  },
  {
    id: "gemini-3.7-flash",
    name: "Gemini 3.7 Flash (Antigravity)",
    reasoning: true,
    thinkingLevelMap: thinkingLevelMaps.lowMediumHigh,
    input: ["text", "image"],
    cost: geminiFlashCost,
    contextWindow: 1048576,
    maxTokens: 65536
  },
  {
    id: "gemini-3.6-flash",
    name: "Gemini 3.6 Flash (Antigravity)",
    reasoning: true,
    thinkingLevelMap: thinkingLevelMaps.lowMediumHigh,
    input: ["text", "image"],
    cost: geminiFlashCost,
    contextWindow: 1048576,
    maxTokens: 65536
  },
  {
    id: "claude-opus-4-6",
    name: "Claude Opus 4.6 (Antigravity)",
    reasoning: true,
    thinkingLevelMap: thinkingLevelMaps.thinking,
    input: ["text", "image"],
    cost: claudeOpusCost,
    contextWindow: 250000,
    maxTokens: 64000
  },
  {
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6 (Antigravity)",
    reasoning: true,
    thinkingLevelMap: thinkingLevelMaps.thinking,
    input: ["text", "image"],
    cost: claudeSonnetCost,
    contextWindow: 200000,
    maxTokens: 64000
  },
  {
    id: "gemini-3.1-pro",
    name: "Gemini 3.1 Pro (Antigravity)",
    reasoning: true,
    thinkingLevelMap: thinkingLevelMaps.lowHigh,
    input: ["text", "image"],
    cost: geminiProCost,
    contextWindow: 1048576,
    maxTokens: 65535
  },
  {
    id: "gemini-3.5-flash",
    name: "Gemini 3.5 Flash (Antigravity)",
    reasoning: true,
    thinkingLevelMap: thinkingLevelMaps.lowMediumHigh,
    input: ["text", "image"],
    cost: geminiFlashCost,
    contextWindow: 1048576,
    maxTokens: 65536
  },
  {
    id: "gpt-oss-120b",
    name: "GPT-OSS 120B (Antigravity)",
    reasoning: true,
    thinkingLevelMap: thinkingLevelMaps.medium,
    input: ["text"],
    cost: gptOssCost,
    contextWindow: 131072,
    maxTokens: 32768
  }
];
var currentRouting = { ...ANTIGRAVITY_ROUTING };
function getAntigravityRequestModelId(modelId, effort) {
  const r = currentRouting[modelId] ?? ANTIGRAVITY_ROUTING[modelId];
  if (!r)
    return modelId;
  if (effort === undefined || effort === "off") {
    return r.off ?? r.routing?.minimal ?? r.routing?.low ?? r.defaultRequestId ?? modelId;
  }
  const effortKey = effort;
  if (effortKey === "xhigh" /* Xhigh */) {
    return r.routing?.xhigh ?? r.routing?.high ?? r.routing?.low ?? r.routing?.minimal ?? r.off ?? r.defaultRequestId ?? modelId;
  }
  return r.routing?.[effortKey] ?? r.routing?.low ?? r.routing?.minimal ?? r.off ?? r.defaultRequestId ?? modelId;
}
var ANTIGRAVITY_MODEL_ENUM = {
  "gemini-3.8-flash": "MODEL_PLACEHOLDER_M318",
  "gemini-3.8-flash-high": "MODEL_PLACEHOLDER_M318",
  "gemini-3.8-flash-medium": "MODEL_PLACEHOLDER_M319",
  "gemini-3.8-flash-low": "MODEL_PLACEHOLDER_M320",
  "gemini-3.8-flash-tiered": "MODEL_PLACEHOLDER_M322",
  "gemini-3.7-flash": "MODEL_PLACEHOLDER_M298",
  "gemini-3.7-flash-high": "MODEL_PLACEHOLDER_M298",
  "gemini-3.7-flash-medium": "MODEL_PLACEHOLDER_M299",
  "gemini-3.7-flash-low": "MODEL_PLACEHOLDER_M300",
  "gemini-3.7-flash-tiered": "MODEL_PLACEHOLDER_M301",
  "gemini-3.6-flash": "MODEL_PLACEHOLDER_M71",
  "gemini-3.6-flash-high": "MODEL_PLACEHOLDER_M71",
  "gemini-3.6-flash-medium": "MODEL_PLACEHOLDER_M72",
  "gemini-3.6-flash-low": "MODEL_PLACEHOLDER_M73",
  "gemini-3.6-flash-tiered": "MODEL_PLACEHOLDER_M196",
  "gemini-3.5-flash": "MODEL_PLACEHOLDER_M20",
  "gemini-3.5-flash-extra-low": "MODEL_PLACEHOLDER_M187",
  "gemini-3.5-flash-low": "MODEL_PLACEHOLDER_M20",
  "gemini-3-flash-agent": "MODEL_PLACEHOLDER_M84",
  "gemini-3.1-pro": "MODEL_PLACEHOLDER_M36",
  "gemini-3.1-pro-low": "MODEL_PLACEHOLDER_M36",
  "gemini-3.1-pro-high": "MODEL_PLACEHOLDER_M37",
  "gemini-pro-agent": "MODEL_PLACEHOLDER_M16",
  "claude-sonnet-4-6": "MODEL_PLACEHOLDER_M35",
  "claude-opus-4-6": "MODEL_PLACEHOLDER_M26",
  "claude-opus-4-6-thinking": "MODEL_PLACEHOLDER_M26",
  "gpt-oss-120b": "MODEL_OPENAI_GPT_OSS_120B_MEDIUM",
  "gpt-oss-120b-medium": "MODEL_OPENAI_GPT_OSS_120B_MEDIUM"
};
var modelEnumCache = new Map;
function getModelEnum(wireModelId) {
  const direct = modelEnumCache.get(wireModelId) || ANTIGRAVITY_MODEL_ENUM[wireModelId];
  if (direct)
    return direct;
  const routed = getAntigravityRequestModelId(wireModelId, undefined);
  return modelEnumCache.get(routed) || ANTIGRAVITY_MODEL_ENUM[routed];
}

// ../../.pi/agent/npm/node_modules/pi-antigravity/src/utils/util.ts
function antigravityEnv(name) {
  return process.env[`ANTIGRAVITY_${name}`] || process.env[`NOAGY_${name}`];
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function asString(value) {
  return typeof value === "string" && value ? value : undefined;
}
function sanitizeText(text) {
  return String(text ?? "").replace(/[\uD800-\uDFFF]/g, "�");
}
function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function nowRequestId() {
  return antigravityRequestEnvelope("unknown", false).requestId;
}
function stableUuid(seed) {
  const bytes = createHash("sha1").update(seed).digest().subarray(0, 16);
  bytes[6] = bytes[6] & 15 | 80;
  bytes[8] = bytes[8] & 63 | 128;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
var sessionTrajectoryMap = new Map;
function resolveSessionTrajectory(context) {
  const firstMsg = context?.messages?.[0];
  if (!firstMsg) {
    return { conversationId: crypto.randomUUID(), trajectoryId: crypto.randomUUID() };
  }
  const contentSeed = typeof firstMsg.content === "string" ? firstMsg.content.slice(0, 64) : Array.isArray(firstMsg.content) ? JSON.stringify(firstMsg.content[0] ?? "").slice(0, 64) : "";
  const seed = `${firstMsg.role || "user"}:${firstMsg.timestamp || ""}:${contentSeed}`;
  let entry = sessionTrajectoryMap.get(seed);
  if (!entry) {
    entry = {
      conversationId: stableUuid(`antigravity:conv:${seed}`),
      trajectoryId: stableUuid(`antigravity:traj:${seed}`)
    };
    sessionTrajectoryMap.set(seed, entry);
    if (sessionTrajectoryMap.size > 64) {
      const oldestKey = sessionTrajectoryMap.keys().next().value;
      if (oldestKey !== undefined)
        sessionTrajectoryMap.delete(oldestKey);
    }
  }
  return entry;
}
function clearSessionTrajectoryMap() {
  sessionTrajectoryMap.clear();
}
function antigravityRequestEnvelope(wireModelId, optionsOrIsClaude = false) {
  const options = typeof optionsOrIsClaude === "boolean" ? { isClaude: optionsOrIsClaude } : optionsOrIsClaude;
  const isClaude = Boolean(options.isClaude);
  const isNonGemini = Boolean(options.isNonGemini || isClaude);
  const step = Math.max(1, options.step ?? 1);
  const lastStepIndex = options.lastStepIndex ?? String(Math.max(0, step - 1));
  const requestIndex = options.requestIndex ?? options.userTurnIndex ?? Math.max(0, step - 1);
  const agentId = options.conversationId || crypto.randomUUID();
  const trajectoryId = options.trajectoryId || crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const sessionId = String(new DataView(bytes.buffer, bytes.byteOffset, 8).getBigInt64(0, true));
  const claudeLabel = isClaude ? "true" : "false";
  const nonGeminiLabel = isNonGemini ? "true" : "false";
  const labels = {
    last_step_index: lastStepIndex,
    request_id: `${trajectoryId}-${requestIndex}`,
    trajectory_id: trajectoryId,
    used_claude: claudeLabel,
    used_claude_conservative: claudeLabel,
    used_non_gemini_model: nonGeminiLabel
  };
  const modelEnum = getModelEnum(wireModelId);
  if (modelEnum) {
    labels.model_enum = modelEnum;
  }
  return {
    requestId: `agent/${agentId}/${Date.now()}/${trajectoryId}/${step}`,
    sessionId,
    labels
  };
}
export {
  antigravityEnv,
  antigravityRequestEnvelope,
  asString,
  clearSessionTrajectoryMap,
  escapeHtml,
  escapeRegExp,
  isRecord,
  nowRequestId,
  resolveSessionTrajectory,
  sanitizeText,
  stableUuid
};
