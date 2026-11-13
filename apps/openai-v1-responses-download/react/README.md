﻿# openai-v1-responses-download-hono-react

Hono Create Auth JSON 的独立 React + Ant Design 前端项目。页面只提供 PeerJS URL 输入框和连接按钮；不让用户选择 Codex 模型。下方步骤逐项列出身份验证、`.vscode-codex` 内的 `auth.json` / `config.toml` / `vscode-user-data`、桌面快捷方式和独立 VS Code 启动方式。

本项目不包含 Hono Server 或 PeerJS 连接逻辑。它只负责收集 PeerJS URL、通过 `invoke-protocol` 的消费者适配器调用 default 切片 RPC，并通过独立 SSE 适配器接收安装任务状态。

## 开发

由父项目 `openai-v1-responses-download-hono` 的 `hono-vite-config` 通过 `renderer.paths` 加载。本项目不单独启动 Vite，也不需要 `index.html`。

在仓库根目录启动：

```powershell
pnpm --filter openai-v1-responses-download-hono dev
```

页面地址：

`http://127.0.0.1:11400/openai-v1-responses-download-hono-react/`

## 切片消费

- `src/default/rpc.ts`：通过 `Remote.invokeProxyInitFromInvoke` 消费后端 `default` 切片 RPC，方法和参数类型来自 `openai-v1-responses-download-hono/default/rpc`。
- `src/default/events.ts`：封装 `EventSource`，订阅 `install` 与 `peer-status` 事件，负责 JSON 解析和取消订阅。
- `src/App.tsx`：只提交 `rpc.connect()`，并展示服务端提供的步骤定义和 SSE 推送的任务状态。

RPC 和 SSE 是两种独立适配。React 页面不直接处理 Hono 路由协议或 SSE 原始数据，也不推断安装进度。
