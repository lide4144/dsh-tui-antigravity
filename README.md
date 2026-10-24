# dsh-tui-antigravity（开发预览）

面向 **dsh-tui 的 DSH 内核**的 Antigravity 原生模型提供方。不启动 HTTP 代理，不把工具执行交给上游 Agent。

基于 [zsp1987/dsh-llm-antigravity](https://github.com/zsp1987/dsh-llm-antigravity)，保留 MIT 许可；协议基础来自 [pi-antigravity](https://github.com/Rahularya01/pi-antigravity)。本项目尚未发布 npm。

## 状态与边界

- 本机契约基准：DSH `0.2.1-rc.3`、dsh-tui `0.17.0`、Node 22。
- 提供原生流式适配、工具调用签名回放、独立认证命令及凭据刷新。
- **尚未真实账号验收，不能保证账号资格、模型可用性或接口长期兼容。**
- 当前模型目录来自上游静态表，不代表账号实际拥有的模型；动态发现与额度 UI 尚未实现，未登录时也可能看到静态模型。
- 自动刷新仍复用上游实现；刷新网络请求自身尚未接入取消/超时（取消后会阻止后续生成）。正式使用前需继续加固。
- 文本与工具调用范围；不宣称图片输入、图片生成支持。
- 仅适用于 DSH backend，不适用于 Claude/Codex 独立后端。
- 非 Google 官方插件。使用内部协议和公开桌面 OAuth client identity，使用前自行评估服务条款及账号风险。

## 安装（需用户自行确认后执行）

确认信任代码后，在终端执行：

```sh
dsh plugin --profile dsh-tui add github:lide4144/dsh-tui-antigravity
```

本地开发安装可改用该仓库检出目录的绝对路径。

然后重启 dsh-tui。若目标 profile 名不是 `dsh-tui`，替换为实际名称。不要同时启用其他占用 `antigravity` 路由的适配器。

本包是原生 ESM，无构建步骤；宿主提供 `@deepseek-ai/dsh-llm` peer。版本范围刻意限定于当前契约基准，其他版本需要重新验证。

安装机制参考本机 dsh-tui `plugins.md`「装包本身已在终端里可用」与 `configuration.md`「/provider」；本项目使用独立命令，不覆盖内置 `/auth`。

## 登录与使用

```text
/antigravity-auth login
/antigravity-auth status
/model
/antigravity-auth logout
```

登录问卷中打开 Google 授权链接，完成后将地址栏中的**完整回调 URL 粘贴到认证问卷**，不要发到聊天。此预览版采用手动回调，不占用本机端口；浏览器显示 localhost 无法连接属于预期，地址栏仍有授权回调。整个流程上限 5 分钟，Esc 可取消。

账号需先在官方 Antigravity 完成初始化。登录成功后，用 `/model` 选择 `antigravity` 下的模型；若上游拒绝，不能仅凭静态目录判断账号支持。

凭据保存在 `$DSH_HOME/plugins/antigravity/auth.json`（未设 DSH_HOME 时为 `~/.dsh/plugins/antigravity/auth.json`）。目录 0700、文件 0600，原子写入；**不是加密凭据库**。插件默认不读取 Pi、代理或其他应用的凭据。logout 只删除本插件本地凭据，不撤销 Google 端授权。

自定义 OAuth client 可通过上游支持的 `ANTIGRAVITY_CLIENT_ID` / `ANTIGRAVITY_CLIENT_SECRET` 环境变量设置，在启动前配置。网络遵循宿主的全局 fetch 路由；此预览版没有独立代理设置界面。

## 验证

```sh
npm run check
```

离线测试使用假凭据和模拟网络，包括基础 wire、真实 SSE→下一轮工具回放、并行工具 ID、安全终止、取消、端点重试边界、PKCE/回调 state 与文件权限。它们不能替代真实账号与 TUI 安装验收。

`src/vendor/` 与 `lib/core.js` 为保留的上游打包实现，体积较大；当前直接 ESM 运行，不声称已建立可重现 vendor 构建链。旧 `scripts/smoke-*.mjs` 为上游遗留，不作为本插件的安装或验收路径。
