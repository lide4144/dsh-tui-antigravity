// Core re-export entry: the pure pi-antigravity logic (no pi-ai runtime, no Pi API)
// ported/transpiled for the native dsh adapter. Bundled by bun into lib/core.js.
export {
  refreshAntigravityToken,
  getApiKey,
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI,
  AUTH_URL,
  TOKEN_URL,
  SCOPES,
} from "../auth/oauth.js";

export {
  PROVIDER_ID,
  PROVIDER_NAME,
  ANTIGRAVITY_MODELS,
  ANTIGRAVITY_ROUTING,
  RUNTIME_MAX_OUTPUT_TOKENS,
  getMaxOutputTokens,
  getAntigravityRequestModelId,
  getFallbackRuntimeModel,
  getThinkingConfig,
  registerDiscoveredModelEnums,
  getModelEnum,
} from "../models/models.js";

export {
  DEFAULT_ENDPOINT,
  ENDPOINT_FALLBACKS,
  endpointCandidates,
  defaultUserAgent,
  antigravityHeaders,
  stableProjectId,
  defaultProjectId,
  resolveProjectId,
  parseApiKey,
  loadCodeAssist,
  fetchAvailableModelsCatalog,
  fetchAvailableRuntimeModel,
} from "../client/client.js";

export { buildAntigravityCatalog, resolvedCatalog, isSelectableRuntimeModelId } from "../models/grouping.js";
