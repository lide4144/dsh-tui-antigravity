# dsh-llm-antigravity — 原生 dsh LLM 适配器移植设计（工作文档）

目标（goal-7ac5d454）：把 pi-antigravity（Rahularya01）的 Cloud Code Assist 直连实现，移植为
dsh（DeepSeek Harness）web profile 的**原生 LLM 适配器插件**——进程内、无常驻服务，GUI Models 可直接
选用 provider `antigravity` / 模型 `gemini-3.8-flash`（thinking low/medium/high，3 端点容错、目录折叠与
Pi 语义一致），复用同一 Google OAuth client（用户已授权）。

## 已确认事实（截至 round 2）

- dsh web profile 构成：bundle 层 `dsh-base` + `dsh-web-app`，其上叠用户 `cordis.patch.yml`（当前 `[]`）。
  `~/.dsh/profiles/web/cordis.yml` 是启动时生成的组合根，勿手改；package.json `dsh.profile.patchReload: "live"`
  表示用户 patch 可热重载。
- 模块装载：`@deepseek-ai/*` 与 cordis 装载器位于 `~/.dsh/profiles/node_modules`（web 目录无自己的
  node_modules）；profile 用 pnpm workspace（nodeLinker hoisted）。
- dsh LLM 层：`dsh-llm` 提供 provider 无关服务（ctx.llm），`dsh-llm-deepseek`（deepseek-official）与
  `dsh-llm-pi-ai`（多协议适配，休眠零路由，靠 settings 分节 `llm-pi-ai:` 激活）为现有适配器。
  GUI Models 页（`dsh-client-ui-settings-models`）支持自定义 OpenAI 兼容路由 —— 但那是标准协议路径。
- pi-antigravity 直连 Google 内部 API：`{endpoint}/v1internal:loadCodeAssist | fetchAvailableModels |
  streamGenerateContent?alt=sse`，3 端点候选（daily-cloudcode-pa → daily-cloudcode-pa.sandbox → cloudcode-pa），
  OAuth client 1071006060591-…（与 dvcrn 代理同一 client，redirect localhost:51121/oauth-callback）。
- 现状对照物（保留中，勿删）：dvcrn 代理跑在 9878（后台任务 + autostart）；`~/.dsh/settings.yaml` 里已注册
  `llm-pi-ai.providers.antigravity`（openai-completions → 127.0.0.1:9878/v1，模型 gemini-3.8-flash-tiered）。
  原生插件验证通过后，这两个可再清理。

## 待研究结论喂入的部分（3 个子代理 running）

A. dsh 插件挂载配方（cordis 插件包结构、装包方式、patch 行、热重载/重启）。
B. dsh-llm 适配器接口（注册路由、StreamChunk 词汇、模型元数据、settings/credentials seam、推理等级）。
C. pi-antigravity 依赖边界映射（纯函数可移植清单、pi-ai 强耦合点、请求/SSE 线格式样例）。

## 预设计决策（可被研究结论推翻，标注原因）

1. Provider 路由名：`antigravity`（与 pi/dvcrn 一致；小写连字符合法）。
2. 认证：复用同一 Google OAuth client；首选接入 dsh credentials seam（等 B 结论）；退路是读取既有
   `~/.pi/agent/auth.json` 或 dvcrn oauth_creds.json 并自行刷新（等 C 结论确认 refresh 语义）。
3. 模型命名：暴露公开 id `gemini-3.8-flash`（另可带 3.7/3.6/3.5-flash、claude-sonnet/opus-4-6、
   gpt-oss-120b、gemini-3.1-pro），thinking low/medium/high → runtime id 折叠（pi 语义），
   不暴露 `-tiered` 等内部运行时 id。
4. 端点策略：3 端点候选 + 跨端点目录合并 + 生成故障转移（pi 语义），而非 dvcrn 的单端点。
5. 工具调用：dsh 工具（JSON Schema 风格）→ Cloud Code functionCall 桥（移植 pi convertTools 的形状映射）。
6. 验收标准：a) GUI Models 出现并可选 antigravity/gemini-3.8-flash；b) 新会话用该模型完成一轮对话；
   c) thinking level 切换生效；d) 无需 dvcrn 代理/9878；e) 进程内（dsh web 重启后即用）。

## 执行顺序（research 完成后）

1. 依据 A 在 workspace 搭包 + 装进 web profile + 用户 patch 挂载行。
2. 依据 B 实现 adapter 注册与 chunk 词汇（lib/index.js + lib/provider.js …）。
3. 依据 C 移植纯函数（auth/client/models/grouping/envelope/SSE），自写 dsh 侧薄 shim。
4. 凭据接入（优先 dsh seam；退化方案读既有文件 + 自刷新）。
5. 本地 smoke：直接用 ctx.llm 路径或等价单测请求 gemini-3.8-flash。
6. 用户在 GUI 验证（重启 dsh web 由用户执行，会影响本会话）→ 验收 → 清理 dvcrn 配置（与用户确认）。

## Round 3 进展
- 三份研究报告+四份转发全部到位；插件包/挂载/热重载、LlmAdapter 抽象与 chunk 词汇、Message 结构
  （tool-result=user 消息、replayState 在 assistant.source）、错误码/LlmError、attributionHeaders、凭据
  record(grant payload, scope=llm-antigravity/antigravity) 均已核实（dsh-llm/types|message|index/error/
  attribution.d.ts、dsh-llm-deepseek index.js 1989-2059 为模板）。
- 纯核心已转译：lib/core.js（node 冒烟通过；getAntigravityRequestModelId('gemini-3.8-flash','medium')
  ='gemini-3.8-flash-medium'，thinkingBudget medium=4000，ENDPOINT_FALLBACKS 3 端点）。
- 桩插件已 symlink 至 ~/.dsh/profiles/web/node_modules/dsh-llm-antigravity，cordis.patch.yml 已加 insert
  行（llm-antigravity, inject llm）→ patchReload live。
- 待办：实现子代理 f61c4c8a 写 lib/wire.js|adapter.js|index.js + test/run.mjs；随后 node 测试/修复；
  最终用户重启 dsh web 验证 GUI（重启会中断本会话）；验证通过后清理 dvcrn 代理与 llm-pi-ai.antigravity 设置。
- 关键实现决策：reasoningEffort low/medium/high（default low）；text-only（遇 image 抛
  UNSUPPORTED_CONTENT）；thoughtSignature 回放经 finish.replayState.blocks 保存、assistant.source.
  replayState 读回（provider==='antigravity' 才信）；凭据懒加载顺序 records→env/file(dvcrn oauth_creds.
  json)→~/.pi/agent/auth.json，5min 内到期自动 refreshAntigravityToken；UA 用 CLI UA（attribution 后覆盖，
  代码注释说明）。

## Round 6-7 进展（实现完成，待 GUI 激活验证）
- 实现（全部离线测试 PASS + node --check 通过）：
  - lib/wire.js：dsh→Cloud Code 请求信封（contents/systemInstruction/generationConfig/sessionId/
    labels/requestType/requestId）、工具 schema 归一化、thinkingConfig、SSE→dsh chunk 组装器
    （reasoning/text/tool-call/usage/finish、thoughtSignature 回放 replayState.blocks、空响应 EMPTY_RESPONSE）。
  - lib/adapter.js：createAntigravityAdapter({LlmError,attributionHeaders,logger,credentialsService})
    工厂；凭据懒加载（record llm-antigravity/antigravity → dvcrn oauth_creds.json → pi auth.json，
    5min 内自动 refreshAntigravityToken）；runtime 候选+3 端点容错；yieldedAny 防重复。
  - lib/index.js：cordis 插件（name llm-antigravity / inject ['llm'] / apply）：registerAdapter(['antigravity'])
    + registerConfigurableProviders（Models 目录行）。
- 实测：scripts/smoke-live.mjs 真网原生直连成功——runtime gemini-3.8-flash-medium @ daily-cloudcode-pa，
  finish stop，usage {input 93, output 82(含 reasoning 79)}，文本精确 "native-ok"（不经 dvcrn 代理）。
- 模块解析坑：Node ESM 按 symlink realpath 解析 → 插件 workspace 内需 node_modules/@deepseek-ai →
  npx 缓存链接（已加）；profile symlink 路径 import lib/index.js OK。
- 待用户：重启 dsh web（新代码才会被加载；重启中断本会话）→ GUI Models 应现 "Google Antigravity (AI Pro)"，
  picker 选 antigravity/gemini-3.8-flash 对话验证 → 通过后清理 dvcrn 代理与 autostart（若用户同意）。
