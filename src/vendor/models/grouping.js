// ../../.pi/agent/npm/node_modules/pi-antigravity/src/models/grouping.ts
var THINKING_SUFFIXES = [
  { suffix: "extra-low", level: "low" /* Low */ },
  { suffix: "extra-high", level: "xhigh" /* Xhigh */ },
  { suffix: "thinking", level: "high" /* High */ },
  { suffix: "minimal", level: "minimal" /* Minimal */ },
  { suffix: "medium", level: "medium" /* Medium */ },
  { suffix: "high", level: "high" /* High */ },
  { suffix: "low", level: "low" /* Low */ }
];
var DISPLAY_LEVELS = [
  { pattern: /\(\s*extra\s*low\s*\)/i, level: "low" /* Low */ },
  { pattern: /\(\s*extra\s*high\s*\)/i, level: "xhigh" /* Xhigh */ },
  { pattern: /\(\s*thinking\s*\)/i, level: "high" /* High */ },
  { pattern: /\(\s*minimal\s*\)/i, level: "minimal" /* Minimal */ },
  { pattern: /\(\s*medium\s*\)/i, level: "medium" /* Medium */ },
  { pattern: /\(\s*high\s*\)/i, level: "high" /* High */ },
  { pattern: /\(\s*low\s*\)/i, level: "low" /* Low */ }
];
var RUNTIME_ALIASES = {
  "gemini-3-flash-agent": { publicId: "gemini-3.5-flash", level: "high" /* High */ },
  "gemini-pro-agent": { publicId: "gemini-3.1-pro", level: "high" /* High */ }
};
var PI_LEVELS = [
  "off" /* Off */,
  "minimal" /* Minimal */,
  "low" /* Low */,
  "medium" /* Medium */,
  "high" /* High */,
  "xhigh" /* Xhigh */,
  "max"
];
var ZERO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
function isSelectableRuntimeModelId(id) {
  if (!/^(gemini-|claude-|gpt-oss-)/i.test(id) || /\s/.test(id) || /^MODEL_/i.test(id)) {
    return false;
  }
  if (/^(chat_|tab_)/i.test(id))
    return false;
  if (/image/i.test(id))
    return false;
  return true;
}
function resolvedCatalog(discovered, current) {
  if (discovered && discovered.models.length > 0)
    return discovered;
  return current;
}
function buildAntigravityCatalog(rawModels, fallback) {
  const groups = new Map;
  for (const [runtimeId, info] of Object.entries(rawModels)) {
    if (!isSelectableRuntimeModelId(runtimeId))
      continue;
    if (info?.isInternal)
      continue;
    const displayName = modelDisplayName(info);
    if (runtimeId.endsWith("-tiered")) {
      const baseId = runtimeId.slice(0, -"-tiered".length);
      const group = ensureGroup(groups, baseId);
      absorbMetadata(group, info, displayName);
      if (!group.unsuffixed)
        group.unsuffixed = runtimeId;
      continue;
    }
    const alias = RUNTIME_ALIASES[runtimeId];
    const suffix = alias ? undefined : parseThinkingSuffix(runtimeId);
    const publicId = alias?.publicId ?? suffix?.baseId ?? runtimeId;
    const group = ensureGroup(groups, publicId);
    absorbMetadata(group, info, displayName);
    const level = alias?.level ?? levelFromDisplayName(displayName) ?? suffix?.level;
    if (level)
      group.variants[level] = runtimeId;
    else
      group.unsuffixed = runtimeId;
  }
  mergeAgentSingletons(groups);
  if (groups.size === 0)
    return fallback;
  const models = [];
  const routing = {};
  for (const group of groups.values()) {
    const fallbackModel = fallback.models.find((model) => model.id === group.publicId);
    const fallbackRouting = fallback.routing[group.publicId];
    if (fallbackModel && fallbackRouting) {
      models.push(fallbackModel);
      routing[group.publicId] = fallbackRouting;
      continue;
    }
    const synthesized = synthesizeModel(group, fallback.models);
    models.push(synthesized.model);
    routing[group.publicId] = synthesized.routing;
  }
  for (const fallbackModel of fallback.models) {
    if (routing[fallbackModel.id])
      continue;
    const fallbackRouting = fallback.routing[fallbackModel.id];
    if (!fallbackRouting)
      continue;
    models.push(fallbackModel);
    routing[fallbackModel.id] = fallbackRouting;
  }
  models.sort(comparePublicModels);
  return { models, routing };
}
function ensureGroup(groups, publicId) {
  const existing = groups.get(publicId);
  if (existing)
    return existing;
  const created = {
    publicId,
    variants: {},
    displayNames: []
  };
  groups.set(publicId, created);
  return created;
}
function absorbMetadata(group, info, displayName) {
  if (displayName)
    group.displayNames.push(displayName);
  if (info?.supportsThinking === true)
    group.supportsThinking = true;
  else if (info?.supportsThinking === false && group.supportsThinking !== true) {
    group.supportsThinking = false;
  }
  if (info?.supportsImages === true)
    group.supportsImages = true;
  if (info?.supportsImages === false && group.supportsImages === undefined) {
    group.supportsImages = false;
  }
}
function mergeAgentSingletons(groups) {
  for (const [publicId, group] of [...groups.entries()]) {
    if (!publicId.endsWith("-agent"))
      continue;
    if (Object.keys(group.variants).length > 0)
      continue;
    const family = displayFamily(group.displayNames[0]);
    if (!family)
      continue;
    const target = [...groups.values()].find((candidate) => candidate.publicId !== publicId && candidate.displayNames.some((name) => displayFamily(name) === family));
    if (!target || !group.unsuffixed)
      continue;
    const level = levelFromDisplayName(group.displayNames[0]) ?? "high" /* High */;
    target.variants[level] = group.unsuffixed;
    absorbMetadata(target, { supportsThinking: group.supportsThinking }, group.displayNames[0]);
    groups.delete(publicId);
  }
}
function parseThinkingSuffix(runtimeId) {
  const lower = runtimeId.toLowerCase();
  for (const { suffix, level } of THINKING_SUFFIXES) {
    if (lower.endsWith(`-${suffix}`)) {
      return { baseId: runtimeId.slice(0, -(suffix.length + 1)), level };
    }
  }
  return;
}
function levelFromDisplayName(displayName) {
  if (!displayName)
    return;
  for (const { pattern, level } of DISPLAY_LEVELS) {
    if (pattern.test(displayName))
      return level;
  }
  return;
}
function modelDisplayName(info) {
  if (!info)
    return;
  if (typeof info.displayName === "string" && info.displayName)
    return info.displayName;
  if (typeof info.label === "string" && info.label)
    return info.label;
  if (typeof info.modelName === "string" && info.modelName)
    return info.modelName;
  return;
}
function displayFamily(displayName) {
  if (!displayName)
    return;
  return displayName.replace(/\s*\((?:extra\s*low|extra\s*high|low|medium|high|minimal|thinking)\)\s*$/i, "").trim().toLowerCase();
}
function synthesizeModel(group, fallbackModels) {
  const template = familyTemplate(group.publicId, fallbackModels);
  const advertisedLevels = advertisedThinkingLevels(group);
  const routing = routingFromVariants(group.publicId, group.variants, group.unsuffixed);
  const supportsImages = group.supportsImages ?? template?.input.includes("image") ?? true;
  const reasoning = advertisedLevels.size > 0 || group.supportsThinking === true || group.supportsThinking === undefined && Boolean(template?.reasoning);
  return {
    model: {
      id: group.publicId,
      name: publicModelName(group),
      reasoning,
      thinkingLevelMap: reasoning ? thinkingLevelMapFromLevels(advertisedLevels) : undefined,
      input: supportsImages ? ["text", "image"] : ["text"],
      cost: template?.cost ?? ZERO_COST,
      contextWindow: template?.contextWindow ?? 128000,
      maxTokens: template?.maxTokens ?? 8192
    },
    routing
  };
}
function advertisedThinkingLevels(group) {
  const levels = new Set(Object.keys(group.variants));
  if (levels.size > 0)
    return levels;
  if (group.supportsThinking === false)
    return levels;
  if (group.supportsThinking === true || group.unsuffixed) {
    levels.add("high" /* High */);
  }
  return levels;
}
function routingFromVariants(publicId, variants, unsuffixed) {
  const defaultRequestId = variants["low" /* Low */] ?? variants["minimal" /* Minimal */] ?? variants["medium" /* Medium */] ?? variants["high" /* High */] ?? unsuffixed ?? publicId;
  const pick = (...keys) => {
    for (const key of keys) {
      const id = variants[key];
      if (id)
        return id;
    }
    return unsuffixed ?? defaultRequestId;
  };
  return {
    off: pick("low" /* Low */, "minimal" /* Minimal */, "medium" /* Medium */, "high" /* High */),
    routing: {
      minimal: pick("minimal" /* Minimal */, "low" /* Low */, "medium" /* Medium */, "high" /* High */),
      low: pick("low" /* Low */, "minimal" /* Minimal */, "medium" /* Medium */, "high" /* High */),
      medium: pick("medium" /* Medium */, "low" /* Low */, "high" /* High */, "minimal" /* Minimal */),
      high: pick("high" /* High */, "medium" /* Medium */, "low" /* Low */, "minimal" /* Minimal */),
      xhigh: pick("xhigh" /* Xhigh */, "high" /* High */, "medium" /* Medium */, "low" /* Low */)
    },
    defaultRequestId
  };
}
function thinkingLevelMapFromLevels(levels) {
  const map = {};
  for (const level of PI_LEVELS) {
    map[level] = levels.has(level) ? level : null;
  }
  if (levels.size === 0)
    map.high = "high";
  return map;
}
function familyTemplate(publicId, fallbackModels) {
  if (/^gemini-.*-flash/i.test(publicId)) {
    return fallbackModels.find((model) => /^gemini-.*-flash/i.test(model.id));
  }
  if (/^gemini-.*-pro/i.test(publicId)) {
    return fallbackModels.find((model) => /^gemini-.*-pro/i.test(model.id));
  }
  if (publicId.startsWith("claude-opus")) {
    return fallbackModels.find((model) => model.id.startsWith("claude-opus"));
  }
  if (publicId.startsWith("claude-")) {
    return fallbackModels.find((model) => model.id.startsWith("claude-sonnet")) ?? fallbackModels.find((model) => model.id.startsWith("claude-"));
  }
  if (publicId.startsWith("gpt-oss")) {
    return fallbackModels.find((model) => model.id.startsWith("gpt-oss"));
  }
  if (publicId.startsWith("gemini-")) {
    return fallbackModels.find((model) => model.id.startsWith("gemini-"));
  }
  return;
}
function publicModelName(group) {
  const family = group.displayNames.map((name) => displayFamily(name)).find(Boolean);
  if (family) {
    return `${titleCase(family)} (Antigravity)`;
  }
  return `${humanizePublicId(group.publicId)} (Antigravity)`;
}
function titleCase(value) {
  return value.replace(/\b([a-z])/g, (char) => char.toUpperCase());
}
function humanizePublicId(id) {
  const tokens = id.split("-");
  const words = [];
  for (let i = 0;i < tokens.length; i++) {
    const token = tokens[i];
    if (!token)
      continue;
    const next = tokens[i + 1];
    if (token === "gpt" && next === "oss") {
      words.push("GPT-OSS");
      i++;
      continue;
    }
    if (/^\d+$/.test(token) && next && /^\d+$/.test(next)) {
      words.push(`${token}.${next}`);
      i++;
      continue;
    }
    if (/^\d/.test(token)) {
      words.push(token.toUpperCase());
      continue;
    }
    words.push(token.charAt(0).toUpperCase() + token.slice(1));
  }
  return words.join(" ");
}
function parseGeminiVersion(id) {
  const match = id.match(/^gemini-(\d+)(?:\.(\d+))?/i);
  if (!match)
    return 0;
  return Number(match[1]) * 1000 + Number(match[2] || 0);
}
function comparePublicModels(a, b) {
  const rankA = modelRank(a.id);
  const rankB = modelRank(b.id);
  if (rankA[0] !== rankB[0])
    return rankA[0] - rankB[0];
  if (rankA[1] !== rankB[1])
    return rankA[1] - rankB[1];
  return a.id.localeCompare(b.id);
}
function modelRank(id) {
  const version = parseGeminiVersion(id);
  if (/^gemini-.*flash/i.test(id) && !/pro/i.test(id))
    return [0, -version];
  if (id.startsWith("claude-opus"))
    return [1, 0];
  if (id.startsWith("claude-sonnet"))
    return [2, 0];
  if (id.startsWith("claude-"))
    return [3, 0];
  if (/^gemini-.*pro/i.test(id))
    return [4, -version];
  if (id.startsWith("gemini-"))
    return [5, -version];
  if (id.startsWith("gpt-oss"))
    return [6, 0];
  return [7, 0];
}
export {
  buildAntigravityCatalog,
  humanizePublicId,
  isSelectableRuntimeModelId,
  resolvedCatalog
};
