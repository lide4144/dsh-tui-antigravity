// ../../.pi/agent/npm/node_modules/pi-antigravity/src/types/enums.ts
var ThinkingEffort;
((ThinkingEffort) => {
  ThinkingEffort["Off"] = "off";
  ThinkingEffort["Minimal"] = "minimal";
  ThinkingEffort["Low"] = "low";
  ThinkingEffort["Medium"] = "medium";
  ThinkingEffort["High"] = "high";
  ThinkingEffort["Xhigh"] = "xhigh";
})(ThinkingEffort ||= {});
var ToolChoice;
((ToolChoice) => {
  ToolChoice["Auto"] = "auto";
  ToolChoice["None"] = "none";
  ToolChoice["Any"] = "any";
  ToolChoice["Required"] = "required";
})(ToolChoice ||= {});
var GeminiToolCallingMode;
((GeminiToolCallingMode) => {
  GeminiToolCallingMode["None"] = "NONE";
  GeminiToolCallingMode["Any"] = "ANY";
  GeminiToolCallingMode["Auto"] = "AUTO";
  GeminiToolCallingMode["Validated"] = "VALIDATED";
})(GeminiToolCallingMode ||= {});
var GeminiRole;
((GeminiRole) => {
  GeminiRole["User"] = "user";
  GeminiRole["Model"] = "model";
})(GeminiRole ||= {});
var AntigravityRequestType;
((AntigravityRequestType) => {
  AntigravityRequestType["Agent"] = "agent";
})(AntigravityRequestType ||= {});
var AntigravityUserAgent;
((AntigravityUserAgent) => {
  AntigravityUserAgent["Antigravity"] = "antigravity";
})(AntigravityUserAgent ||= {});
var StopReason;
((StopReason) => {
  StopReason["Stop"] = "stop";
  StopReason["Length"] = "length";
  StopReason["ToolUse"] = "toolUse";
  StopReason["Error"] = "error";
})(StopReason ||= {});
// ../../.pi/agent/npm/node_modules/pi-antigravity/src/types/types.ts
var ANTIGRAVITY_API = "antigravity-api";
export {
  ANTIGRAVITY_API,
  AntigravityRequestType,
  AntigravityUserAgent,
  GeminiRole,
  GeminiToolCallingMode,
  StopReason,
  ThinkingEffort,
  ToolChoice
};
