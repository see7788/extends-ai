# Remote Desktop Commander

## 项目结构

```text
remote-desktop-commander/
├── create/
│   ├── chrome-extension/                  // Chrome 扩展：管理 ChatGPT 话题标签页
│   │   ├── public/                        // 扩展图标等静态资源
│   │   ├── src/
│   │   │   ├── action.default_popup/      // 扩展弹窗：话题列表、搜索、新建、切换、关闭
│   │   │   └── content_scripts/            // ChatGPT 页面注入：话题识别、PeerJS、工具交互
│   │   ├── package.json
│   │   └── vite.config.ts                 // CRXJS 构建、KasmVNC 扩展部署插件
│   │
│   ├── chatgpt-com-peerjs/                // ChatGPT 侧 MCP PeerJS 客户端
│   │   ├── index.ts                       // MCP 初始化、工具发现与调用
│   │   └── bridge.ts                      // 向 VNC Bridge 发布话题与 Peer 地址
│   │
│   └── global/                            // 云端 Hono API：管理多个 KasmVNC 实例
│       ├── src/
│       │   ├── index.ts                   // Hono Server 入口
│       │   ├── message.ts                 // PeerJS 大消息分片与重组
│       │   ├── store.ts                   // 只组合 Zustand 切片
│       │   ├── declare/                    // Vite 插件生成的运行配置
│       │   └── routers/
│       │       ├── index.ts               // 只组合路由切片
│       │       └── kasmvnc/
│       │           ├── index.ts           // KasmVNC REST API、Zod 参数校验
│       │           ├── zod.ts             // 请求验证器定义
│       │           ├── store.ts           // KasmVNC 实例状态定义
│       │           └── fun.ts             // 实例创建、启动、停止、删除
│       ├── package.json
│       └── vite.config.ts                 // Hono 构建 + ubuntu-lib 端口注入、SFTP、PM2 插件
│
├── use/
│   ├── commander-peerjs/                   // VS Code Host 侧：连接每个话题的 PeerJS MCP
│   │   ├── index.ts                       // Desktop Commander 子进程与 MCP 消息转发
│   │   └── bridge.ts                      // 接收 VNC 内 Chrome 扩展的话题映射
│   │
│   └── vscode-extension/                  // VS Code 扩展：VNC Webview 与 Runtime 管理
│       ├── src/
│       │   ├── extension.ts               // 扩展激活与入口
│       │   ├── webview-panel/              // VNC 页面承载与前后端通信
│       │   ├── webview-view/               // 扩展侧边栏 Webview
│       │   ├── tree-view/                  // VS Code 树视图
│       │   └── status-bar/                 // 状态栏
│       └── esbuild.ts                     // VS Code 扩展打包
│
└── README.md                              // 项目架构与结构说明
```

## 通信关系

```text
ChatGPT Tab
  └── MCP PeerJS ── Commander Runtime ── Desktop Commander
        │
        └── Topic Bridge ── VS Code Extension Host
                               │
                               └── VNC Webview
```

- 一个 VNC 实例对应一个 VS Code Extension 实例。
- 一个 VNC 内运行一个 Chromium；Chrome 扩展管理其中多个 ChatGPT 话题 Tab。
- 每个话题 Tab 对应独立 PeerJS MCP Peer 和 Commander Runtime。
- `global` 管理云端多个 VNC 实例；`rdcInstanceId` 用于绑定 VNC 与 VS Code 实例。
- `ubuntu-lib` 只由开发机 Vite 插件消费，负责远程资源分配、上传和部署；服务器运行时不依赖它。

## 核心约定

- Hono 路由按切片组织；`routers/index.ts` 只组合切片。
- 每个切片的 `zod.ts` 只定义 `*_zod` 验证器；路由校验后把解析结果传给业务方法。
- 切片状态定义在自己的 `store.ts`；根 `store.ts` 只组合切片。
- 业务方法较多或涉及生命周期时，放在切片的 `fun.ts` 或 `class.ts`。
- 项目部署配置由 Vite 插件注入；不在业务代码中通过 `process.env` 猜测部署参数。