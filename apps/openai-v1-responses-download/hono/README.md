# openai-v1-responses-download-hono

Hono 本机 Codex Responses API 中转后端。前端独立放在同级项目 `openai-v1-responses-download-react`，由 `hono-vite-config/plugin` 的 renderer 集成构建。

## 项目职责

- 本项目：Hono API、PeerJS Node 连接、Responses API 转换、Codex 配置文件生成。
- `openai-v1-responses-download-react`：React + Ant Design 页面，使用 `invoke-protocol` 的消费者适配器调用 default 切片 RPC，并使用独立 SSE 适配器订阅任务状态。

## 源码组织

```text
src/
├── default/
│   ├── index.ts       # 默认路由：跳转 UI、连接、health
│   ├── auth.ts        # auth.json、config.toml、桌面快捷方式生成及 API Key 校验
│   ├── peer.ts        # PeerJS Node 连接、会话状态与纯字符串收发
│   ├── tasks.ts       # 安装任务状态、步骤历史与订阅
│   └── rpc.ts         # default 切片的 invoke-protocol 路由注册与分发
├── v1-responses/
│   └── index.ts       # POST /v1/responses
├── declare/
│   └── hono.ts        # Vite 生成的 Server / origin / URL helper
├── app.ts             # 组合 Hono 路由
└── index.ts           # 创建 Node Server、关闭时清理 PeerJS 会话
```

所有模块统一使用 default export。

## PeerJS 连接验证

React 页面粘贴 `peerjs-create-token` 生成的完整 URL。URL 包含随机 token。Hono 发起 PeerJS 连接时把 token 放入 PeerJS 原生 `metadata`；接收端在 `connection.metadata` 中验证。验证通过后 DataConnection 才用于纯字符串收发。

metadata 只用于连接身份验证，不改变连接建立后的字符串通信约定。

Hono 进程内复用同一个本机 PeerJS signaling Peer；安装重试只重建 DataConnection，不销毁 signaling Peer，避免本机动态 Peer ID 变化后被大脑端持久化的 `allowedPeerIds` 白名单拒绝。安装文件生成失败也不会销毁 signaling Peer。第三步诊断会显示本机 Peer ID，便于核对大脑端白名单。Hono 服务进程重启后 Peer ID 会重新分配；若大脑端已启用白名单，需要将新的本机 Peer ID 加入白名单。

## invoke-protocol 与 SSE

RPC 属于 `default` 切片，不设置全局 RPC 层。`src/default/rpc.ts` 使用 `invoke-protocol` 的 `Base` / `Register` 注册 `steps`、`connect` 等业务方法，并通过 `dispatchRoute` 分发。Hono 只提供 `POST /rpc` 传输入口，不重新定义业务方法或参数结构。

React 项目的 `src/default/rpc.ts` 使用 `Remote.invokeProxyInitFromInvoke`，将类型安全的方法调用适配到 Hono HTTP。路由类型通过 pnpm workspace 子路径 `openai-v1-responses-download-hono/default/rpc` 消费。`invoke-protocol` 仅作为依赖使用，不修改其源码。

SSE 不属于 request/response RPC。React 的 `src/default/events.ts` 是本项目自己的 SSE 消费适配器，封装 EventSource、事件解析和订阅释放。`GET /events?taskId=...` 推送完整安装任务；任务事件带递增 event id 并保留历史，浏览器重连时根据 `Last-Event-ID` 补发遗漏事件。页面只订阅类型化任务状态，不直接处理原始 SSE 字符串。

步骤定义由 `rpc.steps()` 从服务端提供；连接任务创建后，所有步骤状态、成功结果和失败错误只通过 SSE 推送。React 不推断进度、不轮询、不刷新页面。

本项目开发服务关闭 Vite HMR（`server.hmr: false`）：页面不会因为源码变更自动重载；修改前端源码后需要手动重启开发服务或刷新浏览器。Vite 后端代理不代理 WebSocket，避免 HMR 与 Hono HTTP 路由冲突。

## Codex 独立环境

连接验证成功后，在当前 Windows 用户目录生成：

```text
%USERPROFILE%/
└── .vscode-codex/
    ├── auth.json
    ├── config.toml
    └── vscode-user-data/
```

API Key 模式的 `auth.json` 使用 Codex 的 API Key 存储结构：`OPENAI_API_KEY`、`tokens: null`、`last_refresh: null`，不写入 `auth_mode: "apikey"`。如果已有有效 `auth.json`，安装时保留原 Key，避免重装后轮换密钥导致正在运行的 Codex 继续使用旧 Key。缺失或格式无效时才重新生成。`config.toml` 仅在内容变化时更新；配置目录和 VS Code User Data 目录只创建、不清空；快捷方式固定重写到 `.vscode-codex/vscode-codex.lnk`。

不会修改用户原有的 `%USERPROFILE%/.codex`。

快捷方式固定写入 `%USERPROFILE%/.vscode-codex/vscode-codex.lnk`。不访问桌面目录，不尝试桌面优先或回退逻辑。快捷方式直接启动 PowerShell 内嵌命令，临时设置 `CODEX_HOME=%USERPROFILE%/.vscode-codex`，再启动 VS Code，不生成 `.ps1`。页面同时提供「启动 VS Code」按钮，由本机 Hono 服务启动同一套独立环境。

VS Code 使用独立的 `--user-data-dir`，扩展目录复用当前用户的 `.vscode/extensions`，避免重复安装扩展。

快捷方式和启动按钮目前仅支持 Windows。

## Vite 与 devPort

`devPort = 11400` 是本项目业务端口，开发期 Hono 内部端口为 `11401`。它们都不是 PeerJS signaling server 端口。

本项目不使用 `ubuntu-lib/peerjs` 或 `ubuntu-lib/ports` 插件。PeerJS 连接参数完全从 React 页面粘贴的完整 URL 解析。

Codex API base URL 从 Vite 生成的 `declare/hono.ts` 的 `origin` 计算：`new URL("/v1", hono.origin)`。

## 启动与构建

```powershell
pnpm --filter openai-v1-responses-download-hono dev
pnpm --filter openai-v1-responses-download-react typecheck
pnpm --filter openai-v1-responses-download-hono typecheck
pnpm --filter openai-v1-responses-download-hono build
```

## PeerJS 数据原则

PeerJS DataConnection 只传一条问题字符串和一条完整回答字符串。没有 JSON 信封、request id、type、chunk、done、cancel 或自定义协议。

同一连接上的问答必须串行。Hono 收到完整回答后生成 Responses JSON 或 SSE；当前 SSE 是对完整回答的分段合成，不是实时 token 流。
