// adapter.js — native dsh LlmAdapter for Google Cloud Code Assist (Antigravity).
// In-process (no sidecar). Wire/auth semantics ported from pi-antigravity (MIT).
// Factory injects the dsh-only bits (LlmError, attributionHeaders) and the
// credentials service accessor so offline tests run without '@deepseek-ai/dsh-llm'.
import * as core from "./core.js";
import { buildRequest, createSseAssembler, defaultEffortForModel, effortsForModel } from "./wire.js";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PROVIDER = "antigravity";
const DISPLAY = "Google Antigravity (AI Pro)";
const RECORD_SCOPE = "llm-antigravity";
const RECORD_ID = "antigravity";
const CLI_UA = "antigravity/cli/1.1.23 (aidev_client; os_type=linux; arch=amd64; cl=974125021; auth_method=consumer)";

export function createAntigravityAdapter(opts) {
  const { LlmError, LlmAdapter, attributionHeaders, logger, credentialsService } = opts ?? {};
  const llmErr = (message, code, cause) => (cause ? new LlmError(message, code, { cause }) : new LlmError(message, code));

  // ── credential store (record-first, then dvcrn/pi files), auto-refresh ─────
  const memo = { creds: null, lock: null };
  function fileCreds() {
    if (process.env.CLOUDCODE_OAUTH_CREDS) return normalize(rawOf(process.env.CLOUDCODE_OAUTH_CREDS));
    const explicit = process.env.CLOUDCODE_OAUTH_CREDS_PATH;
    const candidates = explicit
      ? [explicit]
      : [join(homedir(), ".config", "antigravity-oauth-proxy", "oauth_creds.json"), join(homedir(), ".pi", "agent", "auth.json")];
    for (const p of candidates) {
      try {
        return normalize(JSON.parse(readFileSync(p, "utf8")));
      } catch {
        /* next */
      }
    }
    return null;
  }
  function rawOf(json) {
    try {
      return JSON.parse(json);
    } catch {
      return null;
    }
  }
  function normalize(raw) {
    if (!raw) return null;
    const a = raw.antigravity && typeof raw.antigravity === "object" ? raw.antigravity : null;
    if (a && (a.refresh || a.access)) {
      return { refresh: a.refresh, access: a.access, expires: a.expires, projectId: a.projectId, email: a.email };
    }
    if (raw.refresh_token || raw.access_token) {
      return {
        refresh: raw.refresh_token,
        access: raw.access_token,
        expires: raw.expiry_date ? Number(raw.expiry_date) : undefined,
        projectId: raw.projectId,
        email: raw.email,
      };
    }
    return null;
  }
  const credsSvc = () => (typeof credentialsService === "function" ? credentialsService() : credentialsService);
  async function recordCreds() {
    const svc = credsSvc();
    if (!svc || typeof svc.readRecord !== "function") return null;
    try {
      const rec = await svc.readRecord(`${RECORD_SCOPE}/${RECORD_ID}`);
      const p = rec && rec.kind === "grant" ? rec.payload : undefined;
      if (p && (p.refresh || p.access)) {
        return { refresh: p.refresh, access: p.access, expires: p.expires, projectId: p.projectId, email: p.email };
      }
    } catch {
      /* not stored */
    }
    return null;
  }
  async function persistRecord(c) {
    const svc = credsSvc();
    if (!svc || typeof svc.modifyRecord !== "function") return;
    try {
      await svc.modifyRecord(`${RECORD_SCOPE}/${RECORD_ID}`, () => ({ kind: "grant", payload: { type: "oauth", ...c } }));
    } catch (err) {
      logger?.warn?.(`llm-antigravity: could not persist OAuth record: ${err?.message ?? err}`);
    }
  }
  function needsRefresh(c) {
    return Boolean(c.expires) && Date.now() + 5 * 60 * 1000 >= Number(c.expires);
  }
  async function ensureCreds() {
    if (memo.lock) return memo.lock;
    memo.lock = (async () => {
      let c = await recordCreds();
      const fromRecord = Boolean(c);
      if (!c) c = fileCreds();
      if (!c || !c.refresh) {
        throw llmErr(
          "No Antigravity OAuth credentials: store grant record llm-antigravity/antigravity, set CLOUDCODE_OAUTH_CREDS, " +
            "or place oauth_creds.json at ~/.config/antigravity-oauth-proxy/.",
          "MISSING_CREDENTIAL",
        );
      }
      if (needsRefresh(c)) {
        try {
          const r = await core.refreshAntigravityToken(c);
          c = {
            refresh: r.refresh ?? c.refresh,
            access: r.access,
            expires: r.expires,
            projectId: r.projectId ?? c.projectId,
            email: r.email ?? c.email,
          };
          if (fromRecord) await persistRecord(c);
        } catch (err) {
          throw llmErr(`Antigravity OAuth refresh failed: ${err?.message ?? err}`, "AUTH", err);
        }
      }
      if (!c.access) throw llmErr("Antigravity OAuth record has no access token", "MISSING_CREDENTIAL");
      memo.creds = c;
      return c;
    })().finally(() => {
      memo.lock = null;
    });
    return memo.lock;
  }

  // ── model catalog (static pi catalog; text-only modalities) ─────────────────
  const catalog = (core.ANTIGRAVITY_MODELS ?? [])
    .filter((m) => m && m.id)
    .map((m) => ({
      provider: PROVIDER,
      id: m.id,
      name: m.name ?? m.id,
      description: `Via Antigravity (Google AI Pro) — ${m.id}`,
      inputModalities: ["text"],
      context: { contextWindow: m.contextWindow ?? 1048576 },
      defaultMaxTokens: m.maxTokens,
      reasoning: {
        efforts: effortsForModel(m.id).map((id) => ({ id, name: id })),
        defaultEffort: defaultEffortForModel(m.id),
      },
    }));
  const modelById = new Map(catalog.map((m) => [m.id, m]));

  function mapHttpStatus(status) {
    if (status === 401 || status === 403) return "AUTH";
    if (status === 404) return "INVALID_REQUEST";
    if (status === 429) return "RATE_LIMIT";
    return "TRANSPORT";
  }

  const impl = {
    providerInfo(provider) {
      return { id: provider, name: DISPLAY };
    },
    async listModels(provider) {
      return catalog;
    },
    async resolveModel(provider, model, _signal) {
      const found = modelById.get(model);
      if (!found) throw llmErr(`antigravity: unknown model "${model}"`, "UNKNOWN_MODEL");
      return found;
    },
    providerRetryPolicy() {
      return undefined; // harness normal defaults
    },
    imageRequestPricing() {
      return undefined;
    },
    async prepareCall(provider, model, signal) {
      return {
        model: await impl.resolveModel(provider, model, signal),
        stream: (options) => impl.stream(options),
      };
    },
    async *stream(options) {
      if (options.stop && options.stop.length > 0) {
        throw llmErr("antigravity: stop sequences are unsupported by the Cloud Code API", "UNSUPPORTED_OPTION");
      }
      const c = await ensureCreds();
      const model = options.model;
      const effort = options.reasoningEffort ?? defaultEffortForModel(model);
      const baseRuntime = core.getAntigravityRequestModelId?.(model, effort) ?? model;
      const runtimeCandidates = [baseRuntime, core.getFallbackRuntimeModel?.(baseRuntime, effort)].filter(Boolean);
      const modelMeta = modelById.get(model);
      const maxTokens =
        options.maxTokens !== undefined
          ? Math.min(options.maxTokens, core.getMaxOutputTokens?.(model, baseRuntime) ?? options.maxTokens)
          : modelMeta?.defaultMaxTokens ?? core.getMaxOutputTokens?.(model, baseRuntime);
      const projectId = c.projectId || core.defaultProjectId?.(c.email || "antigravity-default");
      const requestIndex = (options.messages ?? []).filter((m) => m && m.role === "assistant").length;

      const endpoints = core.endpointCandidates?.() ?? core.ENDPOINT_FALLBACKS ?? [];
      const seenRuntime = new Set();
      let yieldedAny = false;
      let lastErr = null;

      for (const runtimeModel of runtimeCandidates) {
        if (seenRuntime.has(runtimeModel)) continue;
        seenRuntime.add(runtimeModel);
        const body = buildRequest({
          projectId,
          modelPublicId: model,
          runtimeModel,
          effort,
          maxTokens,
          system: options.system,
          messages: options.messages ?? [],
          tools: options.tools ?? [],
          requestIndex,
        });
        for (const endpoint of endpoints) {
          const controller = new AbortController();
          const onAbort = () => controller.abort();
          options.signal?.addEventListener?.("abort", onAbort, { once: true });
          let reader;
          try {
            const headers = {
              ...(attributionHeaders?.() ?? {}),
              ...core.antigravityHeaders(c.access),
              "User-Agent": CLI_UA,
            };
            const res = await fetch(`${endpoint}/v1internal:streamGenerateContent?alt=sse`, {
              method: "POST",
              headers,
              body: JSON.stringify(body),
              signal: controller.signal,
            });
            if (!res.ok) {
              const text = await res.text().catch(() => "");
              lastErr = llmErr(
                `Antigravity upstream ${res.status} on ${endpoint} (model ${runtimeModel}): ${text.slice(0, 300)}`,
                mapHttpStatus(res.status),
              );
              continue;
            }
            reader = res.body?.getReader?.();
            if (!reader) throw new Error("empty response body");

            const buffer = [];
            const assembler = createSseAssembler((chunk) => {
              buffer.push(chunk);
            });

            async function* pump() {
              const decoder = new TextDecoder();
              let partial = "";
              const feedLine = (line) => {
                const t = line.trim();
                if (!t.startsWith("data:")) return;
                const data = t.slice(5).trim();
                if (!data || data === "[DONE]") return;
                try {
                  assembler.feed(JSON.parse(data));
                } catch {
                  /* skip malformed */
                }
              };
              while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                partial += decoder.decode(value, { stream: true });
                const lines = partial.split("\n");
                partial = lines.pop() ?? "";
                for (const line of lines) feedLine(line);
                while (buffer.length > 0) yield buffer.shift();
              }
              if (partial.trim()) feedLine(partial);
              assembler.finish();
              while (buffer.length > 0) yield buffer.shift();
            }

            for await (const chunk of pump()) {
              if (options.signal?.aborted) throw llmErr("Antigravity request aborted", "ABORTED");
              yieldedAny = true;
              yield chunk;
            }
            return; // success on this endpoint
          } catch (err) {
            if (options.signal?.aborted) throw llmErr("Antigravity request aborted", "ABORTED", err);
            if (yieldedAny) throw err; // partial output already streamed: do not retry (would duplicate)
            lastErr = err && typeof err === "object" && err.name === "LlmError"
              ? err
              : llmErr(`Antigravity transport error on ${endpoint}: ${err?.message ?? err}`, "TRANSPORT", err);
            void reader;
          } finally {
            options.signal?.removeEventListener?.("abort", onAbort);
          }
        }
      }
      throw lastErr ?? llmErr("Antigravity: no usable endpoint", "TRANSPORT");
    },
  };

  if (LlmAdapter) {
    // Runtime contract (dsh-llm): adapter must be instanceof LlmAdapter (registry
    // calls providerRetryPolicy/prepareCall/... unconditionally). Delegate all to impl.
    class AntigravityAdapter extends LlmAdapter {
      constructor() {
        super();
      }
      providerInfo(p) {
        return impl.providerInfo(p);
      }
      providerRetryPolicy(p) {
        return impl.providerRetryPolicy(p);
      }
      imageRequestPricing(p, m) {
        return impl.imageRequestPricing(p, m);
      }
      listModels(p) {
        return impl.listModels(p);
      }
      resolveModel(p, m, s) {
        return impl.resolveModel(p, m, s);
      }
      prepareCall(p, m, s) {
        return impl.prepareCall(p, m, s);
      }
      stream(options) {
        return impl.stream(options);
      }
    }
    return new AntigravityAdapter();
  }
  return impl;
}

export { PROVIDER, DISPLAY, RECORD_SCOPE, RECORD_ID };
