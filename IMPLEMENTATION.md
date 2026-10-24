# dsh-tui Antigravity 适配工作记录

## 范围

在原生 DSH LlmAdapter 上增加终端可用的 OAuth 与凭据生命周期；不启动代理，不修改运行中的用户 profile，不读取现有用户凭据。真实账号授权与生成验收需由用户参与。

## 上游

- 基础源码：https://github.com/zsp1987/dsh-llm-antigravity （保留其 Git 历史与 MIT LICENSE）。
- 参考：https://github.com/V1ki/dsh-plugin-subscriptions 。其管理界面依赖 Web，不直接整包移植。

## 初始验证

`node test/run.mjs`：8 个上游测试通过。此结果仅为离线基础测试，不证明当前宿主契约或真实上游可用。

## 初始审查发现

- 基础适配器没有交互登录入口，自动读取外部工具凭据，刷新后仅在宿主 credentials record 来源时持久化。
- 缺少 access token 或 expires 时刷新条件不完整。
- HTTP 失败当前无差别尝试后备端点，应限制为尚未输出的可恢复错误。
- src/vendor/auth/oauth.js 与 lib/core.js 含大型打包代码，需明确来源与避免进一步无谓复制。
- OAuth 复用函数有 state/PKCE 与手动回调，但网络请求取消、超时和交互清理需单独审查。

## 已实现与验证

- 独立 `/antigravity-auth login|status|logout`，认证问卷采用 secret/auth 标记，不覆盖 `/auth`。
- 手动回调 OAuth：PKCE、state 校验、5 分钟取消/超时、项目发现。
- 私有文件存储、0700/0600、原子更新、刷新 CAS，默认不读取其他应用凭据。
- 修复 finish.replayState、并行工具 ID、截断/安全拒绝误成功，以及端点 fallback/reader 清理。
- `npm run check` 通过；`node test/host-contract.mjs` 使用本机真实 DSH LlmAdapter 类验证通过。开发目录 node_modules 仅链接本机 dsh-llm peer，未改宿主。
- `npm pack --dry-run --ignore-scripts --cache /home/lide/Projects/.npm-antigravity-cache` 与 `git diff --check` 通过；默认 npm 缓存不可写，使用工作区缓存完成打包清单验证。

## 仍待验证/完善

尚未安装进运行中的 profile、未真实授权或调用上游。静态模型表不代表实际权限，动态目录与额度 UI 未实现；自动刷新仍复用上游网络实现，取消/超时需进一步加固。完整边界和安装步骤见 README.md。
