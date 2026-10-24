// dsh-llm-antigravity — native dsh LLM adapter plugin.
// Registers provider route 'antigravity' (Google Cloud Code Assist direct,
// ported from pi-antigravity semantics). In-process; no sidecar service.
// Cordis plugin object shape mirrors @deepseek-ai/dsh-llm-deepseek.
import { LlmError, LlmAdapter, attributionHeaders } from "@deepseek-ai/dsh-llm";
import { createAntigravityAdapter } from "./adapter.js";
import { createAuthStore } from './auth-store.js';
import { createAuthCommand } from './auth.js';

export const name = "llm-antigravity";

// Requires the dsh-llm service. Credentials/settings seams are optional extras.
export const inject = ["llm"];

export function apply(ctx, _config) {
  const store = createAuthStore();
  const adapter = createAntigravityAdapter({
    LlmError,
    LlmAdapter,
    attributionHeaders,
    logger: ctx.logger,
    credentialsService: () => store,
  });

  const registration = ctx.llm.registerAdapter(["antigravity"], adapter);
  const commands = ctx.get?.('commands');
  const questions = ctx.get?.('userQuestions');
  const lifetime = new AbortController();
  const handleAuth = createAuthCommand(store, { ask: questions?.ask.bind(questions) });
  const releaseCommand = commands?.register({
    name: 'antigravity-auth',
    description: 'Antigravity 登录、状态与退出',
    recordInput: false,
    handler: invocation => handleAuth({ ...invocation, signal: invocation.signal
      ? AbortSignal.any([invocation.signal, lifetime.signal]) : lifetime.signal }),
  });
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
    lifetime.abort();
    try {
      releaseCommand?.();
      directory();
    } finally {
      registration();
    }
  };
}
