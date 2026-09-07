# dsh-llm-antigravity

A native LLM adapter plugin for [DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness) that connects in-process to **Google Cloud Code Assist (Antigravity)**.

Allows your `dsh` Web GUI and agents to directly use Gemini and Claude models (including **Gemini 3.8 Flash**, Gemini 3.7 Flash, Claude Sonnet 4.6, Claude Opus 4.6, etc.) using your **Google AI Pro** plan entitlements via OAuth, with zero external proxy sidecars required.

---

## Features

- **Native in-process adapter**: Implements `@deepseek-ai/dsh-llm`'s `LlmAdapter` contract directly. No standalone HTTP proxy daemon required.
- **Direct Cloud Code Assist wire protocol**: Speaks the internal Google RPC protocol (`v1internal:streamGenerateContent`) with proper request envelopes, session trajectory IDs, thinking configurations, and protobuf struct encapsulation.
- **Thought signature replay**: Preserves and restores Gemini 3.x `thoughtSignature` across tool-calling loops, preventing upstream 400 validation errors. Gracefully falls back to observation blocks when migrating across providers.
- **Auto token refresh**: Reuses existing Google OAuth credentials from your system and refreshes expired access tokens automatically before request dispatch.
- **3-Endpoint fallback**: Automatic routing across Google endpoints (`daily-cloudcode-pa.googleapis.com`, `daily-cloudcode-pa.sandbox.googleapis.com`, and `cloudcode-pa.googleapis.com`).

---

## Supported Models

| Model ID | Name | Thinking Levels | Context Window |
|---|---|---|---|
| `gemini-3.8-flash` | Gemini 3.8 Flash (Antigravity) | low, medium, high | 1,048,576 |
| `gemini-3.7-flash` | Gemini 3.7 Flash (Antigravity) | low, medium, high | 1,048,576 |
| `gemini-3.6-flash` | Gemini 3.6 Flash (Antigravity) | low, medium, high | 1,048,576 |
| `gemini-3.5-flash` | Gemini 3.5 Flash (Antigravity) | low, medium, high | 1,048,576 |
| `gemini-3.1-pro` | Gemini 3.1 Pro (Antigravity) | low, high | 1,048,576 |
| `claude-sonnet-4-6` | Claude Sonnet 4.6 (Antigravity) | high | 200,000 |
| `claude-opus-4-6` | Claude Opus 4.6 (Antigravity) | high | 250,000 |
| `gpt-oss-120b` | GPT-OSS 120B (Antigravity) | medium | 131,072 |

---

## Installation & Setup

### 1. Prerequisites
You need Google OAuth credentials that have access to Antigravity (such as an active Google AI Pro plan). The plugin automatically checks for OAuth credentials in:
1. `$CLOUDCODE_OAUTH_CREDS` (JSON string)
2. `$CLOUDCODE_OAUTH_CREDS_PATH`
3. `~/.config/antigravity-oauth-proxy/oauth_creds.json`
4. `~/.pi/agent/auth.json` (if you already logged in using Pi)

### 2. Install into DeepSeek Harness Profile

Clone or link this repository into your `dsh` web profile:

```bash
mkdir -p ~/.dsh/profiles/web/node_modules
ln -sfn ~/Projects/dsh-llm-antigravity ~/.dsh/profiles/web/node_modules/dsh-llm-antigravity
```

### 3. Register Plugin in `cordis.patch.yml`

Edit `~/.dsh/profiles/web/cordis.patch.yml`:

```yaml
- insert:
    - id: llm-antigravity
      name: dsh-llm-antigravity
      inject:
        - llm
```

### 4. Restart `dsh web`

Restart your `dsh web` service. In the Web UI:
1. Navigate to **Settings → Models**.
2. **Google Antigravity (AI Pro)** will appear in the providers directory.
3. In any chat session, select **antigravity / Gemini 3.8 Flash (Antigravity)** as your active model.

---

## Testing

Run unit tests:
```bash
node test/run.mjs
```

Run live request verification against Cloud Code Assist API:
```bash
node scripts/smoke-live.mjs
```

---

## Acknowledgments

- Wire protocol logic and routing behaviors adapted from [Rahularya01/pi-antigravity](https://github.com/Rahularya01/pi-antigravity).

---

## License

[MIT](LICENSE)
