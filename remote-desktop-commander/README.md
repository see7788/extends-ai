# Remote Desktop Commander

## 项目结构

属于父级 `F:\pro\extends-ai` pnpm workspace；本目录不是独立 pnpm 仓库。

```text
remote-desktop-commander/
├── use/
│   ├── vscode-extension/      # VS Code 容器：页面与 Runtime 生命周期
│   └── commander-peerjs/      # 本机能力：官方 Desktop Commander + PeerJS
├── create/
│   ├── chatgpt-com-peerjs/    # ChatGPT 端 PeerJS 能力
│   └── chrome-extension/      # 浏览器扩展：页面注入与 Tab 管理
├── .log/
└── README.md
```

## 对应关系

- `vscode-extension` ↔ `kasm-vnc`：一个 VS Code Extension 容器对应一个 KasmVNC 浏览器容器。
- 一个 VS Code Extension 可以管理多个话题页面；一个 Chrome Extension 可以管理同一浏览器中的多个 ChatGPT Tab。
- **话题 = 浏览器 Tab = 一个 Commander PeerJS Runtime。** 三者一一对应。
- VS Code 中每个话题有一个独立嵌入页面；同一个 VS Code 窗口可以同时打开多个话题页面。
- 工作区路径只是对应 Runtime 的工作目录，不是 Runtime 唯一标识；同一工作区允许多个 Runtime。

## 核心通信

```text
chatgpt-com-peerjs
        ⇅
      PeerJS
        ⇅
commander-peerjs
```

- `chatgpt-com-peerjs`：ChatGPT 端，负责工具调用决策、消息发出和结果接收。
- `commander-peerjs`：本机 Node 端，组合官方 Desktop Commander，负责 MCP 工具发现、参数校验和工具执行。
- PeerJS 是两端直接使用的双向传输通道；MCP 定义工具发现、调用、结果和错误的消息语义。
- Chrome Extension 只是 ChatGPT 端的浏览器注入与 Observer 部署载体，不是核心通信中间层。
- VS Code Extension 只是本机 Runtime 的容器与管理界面，不转发 MCP 工具消息。

不增加 HTTP、SSE 或额外 MCP 转发服务。

## 连接方式

沿用 v1 的复制/粘贴方式：ChatGPT 端生成并展示 PeerJS 连接参数，VS Code Extension 粘贴后启动对应的 `commander-peerjs` Runtime 并建立连接。当前不实现复杂鉴权。

## 开发约定

- pnpm workspace 属于父级 `F:\pro\extends-ai`；各项目保留自己的 `package.json`。
- workspace 包之间使用包名，不使用跨项目相对源码路径。
- 只修改本项目；其他 extends 仓库中的库只消费。复用代码采用复制后修改。
- Mihomo/VPN 不使用全局模式，需要时按需调用。
- 临时文件和日志放在 `.log`。

## 当前进度

- 目录已按 `use` 和 `create` 两侧对齐。
- `use/commander-peerjs` 已有项目入口清单；官方 Desktop Commander 与 PeerJS 的通信适配尚未实现。
- `create/chatgpt-com-peerjs` 已建立目录，ChatGPT 端 PeerJS 通信尚未实现。
- VS Code Extension 仍有旧版实现，需简化为 Runtime 容器；旧代码存在字符串未闭合的类型检查错误，详见 `.log/workspace-typecheck.log`。
- Chrome Extension 已可独立构建和通过类型检查，但目前仍是旧版单连接实现，尚未完成多 Tab 管理和页面 Observer 的最终实现。
- 尚未完成端到端真实通信验证。

开发期间只维护结构、关键实现和实时进度；完成后再补充简洁的使用说明。
