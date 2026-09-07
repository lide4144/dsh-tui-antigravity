// ../../.pi/agent/npm/node_modules/pi-antigravity/src/diagnostics/diagnostics.ts
import { AsyncLocalStorage } from "node:async_hooks";

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
var modelEnumCache = new Map;

// ../../.pi/agent/npm/node_modules/pi-antigravity/src/utils/util.ts
var sessionTrajectoryMap = new Map;

// ../../.pi/agent/npm/node_modules/pi-antigravity/src/utils/security.ts
var LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
function redactSecrets(text) {
  return text.replace(/\bya29\.[A-Za-z0-9._~+/-]+=*/g, "[redacted-access-token]").replace(/\b1\/[A-Za-z0-9_-]{20,}/g, "[redacted-refresh-token]").replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]").replace(/("?(?:access_token|refresh_token|id_token|token|client_secret|code_verifier|authorization)"?\s*[:=]\s*")[^"]*(")/gi, "$1[redacted]$2").replace(/("?(?:access_token|refresh_token|id_token|token|client_secret|code_verifier|authorization)"?\s*[:=]\s*)[^\s&,}]+/gi, "$1[redacted]");
}

// ../../.pi/agent/npm/node_modules/pi-antigravity/src/diagnostics/diagnostics.ts
var storage = new AsyncLocalStorage;
var lastSnapshot = {};
function currentBag() {
  return storage.getStore() ?? lastSnapshot;
}
async function runWithDiagnostics(fn) {
  const bag = {};
  return storage.run(bag, async () => {
    try {
      return await fn();
    } finally {
      lastSnapshot = { ...bag };
    }
  });
}
function getLastDiagnostics() {
  return lastSnapshot;
}
function getCurrentEndpoint() {
  return currentBag().endpoint;
}
function getCurrentMatchedModelDebug() {
  return currentBag().matchedModelDebug;
}
function getCurrentAvailableModels() {
  return currentBag().availableModels;
}
function setLastStatus(status) {
  currentBag().status = status;
}
function setLastEndpoint(endpoint) {
  currentBag().endpoint = endpoint;
}
function setLastError(error) {
  currentBag().error = error === undefined ? undefined : redactSecrets(error).slice(0, 800);
}
function setLastProjectId(projectId) {
  currentBag().projectId = projectId;
}
function setLastResolvedRuntimeModel(model) {
  currentBag().resolvedRuntimeModel = model;
}
function setLastAvailableModels(models) {
  currentBag().availableModels = models;
}
function setLastMatchedModelDebug(debug) {
  currentBag().matchedModelDebug = debug === undefined ? undefined : redactSecrets(debug).slice(0, 1200);
}
function setLastLatencyMs(ms) {
  currentBag().latencyMs = ms;
}
function setLastMaskedEmail(email) {
  currentBag().maskedEmail = email;
}
function setLastTokenExpiry(expiry) {
  currentBag().tokenExpiry = expiry;
}
function setLastToolSchemaWarnings(warnings) {
  currentBag().toolSchemaWarnings = warnings === undefined ? undefined : redactSecrets(warnings.join(" | ")).slice(0, 1200);
}
function resetDiagnosticsForTests() {
  lastSnapshot = {};
}
export {
  getCurrentAvailableModels,
  getCurrentEndpoint,
  getCurrentMatchedModelDebug,
  getLastDiagnostics,
  resetDiagnosticsForTests,
  runWithDiagnostics,
  setLastAvailableModels,
  setLastEndpoint,
  setLastError,
  setLastLatencyMs,
  setLastMaskedEmail,
  setLastMatchedModelDebug,
  setLastProjectId,
  setLastResolvedRuntimeModel,
  setLastStatus,
  setLastTokenExpiry,
  setLastToolSchemaWarnings
};
