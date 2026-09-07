// dsh-llm-antigravity — native dsh LLM adapter plugin.
// Registers provider route 'antigravity' (Google Cloud Code Assist direct,
// ported from pi-antigravity semantics). In-process; no sidecar service.
// Cordis plugin object shape mirrors @deepseek-ai/dsh-llm-deepseek.
import { LlmError, LlmAdapter, attributionHeaders } from "@deepseek-ai/dsh-llm";
import { createAntigravityAdapter } from "./adapter.js";

export const name = "llm-antigravity";

// Requires the dsh-llm service. Credentials/settings seams are optional extras.
export const inject = ["llm"];

export function apply(ctx, _config) {
  const adapter = createAntigravityAdapter({
    LlmError,
    LlmAdapter,
    attributionHeaders,
    logger: ctx.logger,
    credentialsService: () => ctx.get?.("credentials"),
  });

  const registration = ctx.llm.registerAdapter(["antigravity"], adapter);
  let directory = () => {};
  if (typeof ctx.llm.registerConfigurableProviders === "function") {
    directory = ctx.llm.registerConfigurableProviders([
      {
        provider: "antigravity",
        displayName: "Google Antigravity (AI Pro)",
        settingsNs: "llm-antigravity",
        settingsPath: [],
      },
    ]);
  }

  ctx.logger?.info?.(
    "llm-antigravity: native Cloud Code Assist adapter active (provider 'antigravity'; models gemini-3.8-flash & co).",
  );

  return () => {
    try {
      directory();
    } finally {
      registration();
    }
  };
}
