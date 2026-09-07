// Live smoke: native (in-process) request to Google Cloud Code Assist with our wire/core.
// No proxy. Uses stored OAuth creds (dvcrn oauth_creds.json or pi auth.json).
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as core from "../lib/core.js";
import { buildRequest, createSseAssembler, thinkingFor } from "../lib/wire.js";

function readCreds() {
  const paths = [
    process.env.CLOUDCODE_OAUTH_CREDS_PATH,
    join(homedir(), ".config", "antigravity-oauth-proxy", "oauth_creds.json"),
    join(homedir(), ".pi", "agent", "auth.json"),
  ].filter(Boolean);
  for (const p of paths) {
    try {
      const raw = JSON.parse(readFileSync(p, "utf8"));
      const a = raw.antigravity && typeof raw.antigravity === "object" ? raw.antigravity : null;
      if (a && (a.refresh || a.access)) return { ...a, from: p };
      if (raw.refresh_token || raw.access_token)
        return { refresh: raw.refresh_token, access: raw.access_token, expires: raw.expiry_date, from: p };
    } catch {}
  }
  throw new Error("no creds");
}

let creds = readCreds();
console.log("creds source:", creds.from, "| has refresh:", Boolean(creds.refresh));
if (!creds.expires || Date.now() + 5 * 60_000 >= Number(creds.expires)) {
  const r = await core.refreshAntigravityToken(creds);
  creds = { ...creds, refresh: r.refresh ?? creds.refresh, access: r.access, expires: r.expires };
  console.log("refreshed token");
}

const projectId = creds.projectId || "aicode-consumers";
const messages = [{ id: "u1", role: "user", content: [{ type: "text", text: "Reply with exactly: native-ok" }], source: { kind: "user" } }];

const endpoints = core.endpointCandidates();
const candidates = ["gemini-3.8-flash-medium", "gemini-3.8-flash-tiered", "gemini-3.8-flash-high"];
const headers = {
  ...core.antigravityHeaders(creds.access),
  "User-Agent": "antigravity/cli/1.1.23 (aidev_client; os_type=linux; arch=amd64; cl=974125021; auth_method=consumer)",
};

let tried = 0;
outer: for (const runtimeModel of candidates) {
  const body = buildRequest({
    projectId,
    modelPublicId: "gemini-3.8-flash",
    runtimeModel,
    effort: "medium",
    maxTokens: core.getMaxOutputTokens("gemini-3.8-flash", runtimeModel),
    messages,
    requestIndex: 0,
  });
  for (const endpoint of endpoints) {
    tried++;
    try {
      const res = await fetch(`${endpoint}/v1internal:streamGenerateContent?alt=sse`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const t = (await res.text()).slice(0, 200);
        console.log(`[${runtimeModel} @ ${endpoint.replace("https://", "")}] HTTP ${res.status}: ${t}`);
        continue;
      }
      const chunks = [];
      const asm = createSseAssembler((c) => chunks.push(c));
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let partial = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        partial += dec.decode(value, { stream: true });
        const lines = partial.split("\n");
        partial = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const data = t.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            asm.feed(JSON.parse(data));
          } catch {}
        }
      }
      asm.finish();
      const finish = chunks.find((c) => c.type === "finish");
      const text = chunks.filter((c) => c.type === "text-delta").map((c) => c.text).join("");
      const usage = chunks.find((c) => c.type === "usage");
      console.log(`\nSUCCESS runtime=${runtimeModel} endpoint=${endpoint}\nfinish=${JSON.stringify(finish?.reason)}`);
      if (usage) console.log("usage:", JSON.stringify(usage.usage));
      console.log("text:", text.slice(0, 200));
      break outer;
    } catch (err) {
      console.log(`[${runtimeModel} @ ${endpoint.replace("https://", "")}] transport err: ${err.message}`);
    }
  }
}
console.log("\ntried", tried, "combinations");
