// ../../.pi/agent/npm/node_modules/pi-antigravity/src/models/models.ts
var PROVIDER_ID = "antigravity";
var PROVIDER_NAME = "Antigravity";
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
var RUNTIME_MAX_OUTPUT_TOKENS = {
  "gemini-3.8-flash": 65536,
  "gemini-3.8-flash-low": 65536,
  "gemini-3.8-flash-medium": 65536,
  "gemini-3.8-flash-high": 65536,
  "gemini-3.7-flash": 65536,
  "gemini-3.7-flash-tiered": 65536,
  "gemini-3.7-flash-low": 65536,
  "gemini-3.7-flash-medium": 65536,
  "gemini-3.7-flash-high": 65536,
  "gemini-3.6-flash": 65536,
  "gemini-3.6-flash-low": 65536,
  "gemini-3.6-flash-medium": 65536,
  "gemini-3.6-flash-high": 65536,
  "gemini-3.5-flash": 65536,
  "gemini-3.5-flash-extra-low": 65536,
  "gemini-3.5-flash-low": 65536,
  "gemini-3-flash-agent": 65536,
  "gemini-3.1-pro": 65535,
  "gemini-3.1-pro-low": 65535,
  "gemini-3.1-pro-high": 65535,
  "gemini-pro-agent": 65535,
  "claude-opus-4-6": 64000,
  "claude-opus-4-6-thinking": 64000,
  "claude-sonnet-4-6": 64000,
  "gpt-oss-120b": 32768,
  "gpt-oss-120b-medium": 32768
};
function getMaxOutputTokens(modelId, runtimeModel) {
  if (runtimeModel && RUNTIME_MAX_OUTPUT_TOKENS[runtimeModel] !== undefined) {
    return RUNTIME_MAX_OUTPUT_TOKENS[runtimeModel];
  }
  if (RUNTIME_MAX_OUTPUT_TOKENS[modelId] !== undefined) {
    return RUNTIME_MAX_OUTPUT_TOKENS[modelId];
  }
  if (runtimeModel) {
    if (runtimeModel.startsWith("claude-"))
      return 64000;
    if (runtimeModel.startsWith("gpt-oss-"))
      return 32768;
    if (runtimeModel.startsWith("gemini-3.1-pro") || runtimeModel === "gemini-pro-agent")
      return 65535;
    if (runtimeModel.startsWith("gemini-"))
      return 65536;
  }
  return 8192;
}
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
var currentModels = ANTIGRAVITY_MODELS;
var currentRouting = { ...ANTIGRAVITY_ROUTING };
function getCurrentAntigravityModels() {
  return currentModels;
}
function getCurrentAntigravityRouting() {
  return currentRouting;
}
function getCurrentAntigravityCatalog() {
  return { models: currentModels, routing: currentRouting };
}
function applyAntigravityCatalog(catalog) {
  currentModels = catalog.models;
  currentRouting = catalog.routing;
}
function resetAntigravityCatalogForTests() {
  currentModels = ANTIGRAVITY_MODELS;
  currentRouting = { ...ANTIGRAVITY_ROUTING };
}
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
function getFallbackRuntimeModel(runtimeModel, effort) {
  if (runtimeModel.startsWith("gemini-3.8-flash-")) {
    return runtimeModel.replace("gemini-3.8-flash-", "gemini-3.7-flash-");
  }
  if (runtimeModel === "gemini-3.8-flash") {
    return "gemini-3.7-flash-low";
  }
  if (runtimeModel === "gemini-3.7-flash-tiered") {
    return getAntigravityRequestModelId("gemini-3.6-flash", effort);
  }
  if (runtimeModel.startsWith("gemini-3.7-flash-")) {
    return runtimeModel.replace("gemini-3.7-flash-", "gemini-3.6-flash-");
  }
  if (runtimeModel === "gemini-3.7-flash") {
    return "gemini-3.6-flash-low";
  }
  return;
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
function registerModelEnum(wireModelId, modelEnum) {
  if (wireModelId && modelEnum) {
    modelEnumCache.set(wireModelId, modelEnum);
  }
}
function registerDiscoveredModelEnums(models) {
  if (!models)
    return;
  for (const [wireId, info] of Object.entries(models)) {
    if (typeof info?.model === "string" && info.model) {
      modelEnumCache.set(wireId, info.model);
    }
  }
}
function getModelEnum(wireModelId) {
  const direct = modelEnumCache.get(wireModelId) || ANTIGRAVITY_MODEL_ENUM[wireModelId];
  if (direct)
    return direct;
  const routed = getAntigravityRequestModelId(wireModelId, undefined);
  return modelEnumCache.get(routed) || ANTIGRAVITY_MODEL_ENUM[routed];
}
function snapshotDynamicModelEnums() {
  return Object.fromEntries(modelEnumCache);
}
function restoreDynamicModelEnums(modelEnums) {
  modelEnumCache.clear();
  for (const [wireModelId, modelEnum] of Object.entries(modelEnums)) {
    if (wireModelId && modelEnum)
      modelEnumCache.set(wireModelId, modelEnum);
  }
}
function clearModelEnumCache() {
  modelEnumCache.clear();
}
function getThinkingConfig(modelId, effort) {
  if (modelId.startsWith("claude-")) {
    if (!effort || effort === "off")
      return { includeThoughts: false, thinkingBudget: 0 };
    return { includeThoughts: true, thinkingBudget: 1024 };
  }
  if (modelId.startsWith("gpt-oss-")) {
    if (!effort || effort === "off")
      return { includeThoughts: false, thinkingBudget: 0 };
    return { includeThoughts: true, thinkingBudget: 8192 };
  }
  if (modelId.startsWith("gemini-3.5-flash") || modelId === "gemini-3-flash-agent") {
    if (!effort || effort === "off")
      return { includeThoughts: false, thinkingBudget: 0 };
    const thinkingBudget = effort === "high" || effort === "xhigh" ? 1e4 : effort === "medium" ? 4000 : 1000;
    return { includeThoughts: true, thinkingBudget };
  }
  if (modelId.startsWith("gemini-3.1-pro") || modelId === "gemini-pro-agent") {
    if (!effort || effort === "off")
      return { includeThoughts: false, thinkingBudget: 0 };
    return {
      includeThoughts: true,
      thinkingBudget: effort === "high" || effort === "xhigh" ? 10001 : 1001
    };
  }
  if (modelId.startsWith("gemini-")) {
    if (!effort || effort === "off")
      return { includeThoughts: false, thinkingBudget: 0 };
    const thinkingBudget = effort === "high" || effort === "xhigh" ? -1 : effort === "medium" ? 4000 : 1000;
    return { includeThoughts: true, thinkingBudget };
  }
  return;
}
export {
  ANTIGRAVITY_MODELS,
  ANTIGRAVITY_MODEL_ENUM,
  ANTIGRAVITY_ROUTING,
  PROVIDER_ID,
  PROVIDER_NAME,
  RUNTIME_MAX_OUTPUT_TOKENS,
  applyAntigravityCatalog,
  clearModelEnumCache,
  getAntigravityRequestModelId,
  getCurrentAntigravityCatalog,
  getCurrentAntigravityModels,
  getCurrentAntigravityRouting,
  getFallbackRuntimeModel,
  getMaxOutputTokens,
  getModelEnum,
  getThinkingConfig,
  registerDiscoveredModelEnums,
  registerModelEnum,
  resetAntigravityCatalogForTests,
  restoreDynamicModelEnums,
  snapshotDynamicModelEnums
};
