// Two-turn tool-loop smoke: assistant functionCall -> tool-result functionResponse {output}.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as core from "../lib/core.js";
import { buildRequest, createSseAssembler } from "../lib/wire.js";

function readCreds() {
  for (const p of [join(homedir(), ".config", "antigravity-oauth-proxy", "oauth_creds.json"), join(homedir(), ".pi", "agent", "auth.json")]) {
    try { const raw = JSON.parse(readFileSync(p, "utf8")); const a = raw.antigravity; return a ? { ...a, from: p } : { refresh: raw.refresh_token, access: raw.access_token, expires: raw.expiry_date, from: p }; } catch {}
  }
  throw new Error("no creds");
}
let creds = readCreds();
if (!creds.expires || Date.now() + 5 * 60_000 >= Number(creds.expires)) {
  const r = await core.refreshAntigravityToken(creds);
  creds = { ...creds, refresh: r.refresh ?? creds.refresh, access: r.access, expires: r.expires };
}
const projectId = creds.projectId || "aicode-consumers";
const messages = [
  { id: "u1", role: "user", content: [{ type: "text", text: "Run pwd via the bash tool, then tell me the directory." }], source: { kind: "user" } },
  { id: "a1", role: "assistant", content: [{ type: "tool-call", id: "call-1", name: "bash", arguments: '{"command":"pwd"}' }], source: { kind: "model", provider: "antigravity", model: "gemini-3.8-flash" } },
  { id: "r1", role: "user", content: [{ type: "tool-result", toolCallId: "call-1", content: [{ type: "text", text: "/home/szhang/Projects/xhs" }], isError: false }], source: { kind: "tool", callId: "call-1" } },
];
const tools = [{ name: "bash", description: "Run a shell command", parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] } }];
const runtimeModel = "gemini-3.8-flash-medium";
const body = buildRequest({ projectId, modelPublicId: "gemini-3.8-flash", runtimeModel, effort: "medium", maxTokens: core.getMaxOutputTokens("gemini-3.8-flash", runtimeModel), system: "Be brief.", messages, tools, requestIndex: 1 });
const headers = { ...core.antigravityHeaders(creds.access), "User-Agent": "antigravity/cli/1.1.23 (aidev_client; os_type=linux; arch=amd64; cl=974125021; auth_method=consumer)" };
const endpoint = core.endpointCandidates()[0];
const res = await fetch(`${endpoint}/v1internal:streamGenerateContent?alt=sse`, { method: "POST", headers, body: JSON.stringify(body) });
if (!res.ok) { console.log("HTTP", res.status, (await res.text()).slice(0, 400)); process.exit(1); }
const chunks = [];
const asm = createSseAssembler((c) => chunks.push(c));
const reader = res.body.getReader(); const dec = new TextDecoder(); let partial = "";
while (true) { const { value, done } = await reader.read(); if (done) break; partial += dec.decode(value, { stream: true }); const lines = partial.split("\n"); partial = lines.pop() ?? ""; for (const line of lines) { const t = line.trim(); if (!t.startsWith("data:")) continue; const data = t.slice(5).trim(); if (!data || data === "[DONE]") continue; try { asm.feed(JSON.parse(data)); } catch {} } }
asm.finish();
const finish = chunks.find((c) => c.type === "finish");
const text = chunks.filter((c) => c.type === "text-delta").map((c) => c.text).join("");
console.log("finish:", JSON.stringify(finish?.reason));
console.log("text:", text.slice(0, 300));
