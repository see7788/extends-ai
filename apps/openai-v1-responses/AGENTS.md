# AGENTS.md

项目目标
  把已登录的 ChatGPT 网页适配为 Codex Responses 大模型服务。
  话题和消息以 ChatGPT 官方账号数据为准。
  上级 kasm-chatgpt 仅作为 pnpm workspace 容器；本应用目录为 openai-v1-responses。

技术栈
  全部源码、协议、扩展和服务统一使用 TypeScript。
  RPC 统一使用 invoke-protocol，不重复实现注册、校验、分发或代理机制。
  invoke-protocol 的基础库来自 runtimeproxy/libs/invoke-protocol，业务项目只定义具体协议实体。

分层原则
  openai-v1-responses/ 是应用根目录，包含 lib-* 协议库项目、云端服务和下载路由。
  需要跨项目调用的业务项目或切片拥有自己的 invoke-protocol.ts；纯 Hono 路由直接提供 HTTP 接口，上层 index.ts 负责组装和挂载。
  具体协议由生产者定义，消费者按需消费，不重复实现 RPC 机制。

项目角色约定
  没有 index.ts 运行入口的项目归入 lib，只提供协议实体或可复用能力。
  有 index.ts 运行入口的项目归入 app，由入口负责路由、组合或服务挂载。
  Chrome 扩展的 service_worker.ts 和 content_scripts/index.ts 属于 MV3 运行入口。

推荐目录结构
  ```text
  openai-v1-responses/
  ├─ AGENTS.md                         AI 协作规则与架构约束
  ├─ lib-chatgpt-com/
  │  ├─ package.json                   ChatGPT 协议包定义
  │  └─ invoke-protocol.ts             ChatGPT 话题、模型和消息协议
  ├─ lib-responses-zod/
  │  ├─ package.json                   Responses 协议库包定义
  │  └─ invoke-protocol.ts             Responses schema、错误码和校验协议
  ├─ users/                            用户云空间和 P2P 文件服务
  │  ├─ package.json                   Hono 项目定义
  │  ├─ index.ts                       组合四个业务切片并挂载 Hono
  │  ├─ space/
  │  │  ├─ index.ts                    空间分配和配额路由
  │  │  └─ invoke-protocol.ts          空间协议生产者
  │  ├─ files/
  │  │  ├─ index.ts                    上传、下载和文件管理路由
  │  │  └─ invoke-protocol.ts          文件协议生产者
  │  ├─ mcp/
  │  │  ├─ index.ts                    用户 MCP 路由
  │  │  └─ invoke-protocol.ts          MCP 协议生产者
  │  └─ p2p/
  │     ├─ index.ts                    用户间文件传输路由
  │     └─ invoke-protocol.ts          P2P 协议生产者
  ├─ responses-kasmvnc-chrome/         用户 Chrome 实例控制
  │  ├─ package.json                   Hono 项目定义
  │  ├─ index.ts                       按用户分配实例和空闲自动停止
  │  └─ invoke-protocol.ts             实例管理协议生产者
  ├─ responses-chrome-extension/       云端 Chrome 扩展应用
  │  ├─ package.json                   CRXJS 项目定义
  │  ├─ vite.config.ts                 CRXJS 打包配置
  │  └─ src/
  │     ├─ manifest.ts                 Chrome 扩展清单
  │     ├─ background/
  │     │  ├─ service_worker.ts         background.service_worker 入口
  │     │  └─ invoke-protocol.ts        扩展协议生产者
  │     └─ content_scripts/
  │        └─ index.ts                  content_scripts 页面侧入口
  ├─ responses-llm/                    消费校验、用户、实例和扩展协议的入口
  │  ├─ package.json                   Hono 项目定义
  │  └─ index.ts                       Codex Responses 请求入口
  ├─ download-codex-config-toml/      下载 codex config.toml 的 Hono 路由
  │  ├─ package.json                   路由包定义
  │  └─ index.ts                      Hono 路由入口
  ├─ download-vscode-extension/       下载 VS Code 配置的 Hono 路由
  │  ├─ package.json                   下载包定义和发布配置
  │  └─ index.ts                      下载入口
  ├─ index/                            Hono 服务统一组织项目
  │  ├─ package.json                   Hono 组合项目定义
  │  └─ index.ts                      组织和挂载各 Hono 服务
  ├─ dist/                             发布产物
  └─ .log/                             临时日志和测试输出
  ```
  实际目录位于 `kasm-chatgpt/apps/openai-v1-responses/`；上级 `kasm-chatgpt` 仅作为 pnpm workspace 容器。

协议消费方向
  responses-chrome-extension 消费 lib-chatgpt-com 的 ChatGPT 协议。
  responses-llm 按需消费 lib-responses-zod、users 各切片、responses-kasmvnc-chrome 和 responses-chrome-extension 的协议。
  users/index.ts 只组合四个 users 切片；index/index.ts 只组合各个云端项目。
  responses-llm 需要用户空间、文件或 MCP 时调用对应切片，需要浏览器时先调用 responses-kasmvnc-chrome，再通过扩展的 PeerJS 挂载调用 ChatGPT。
  users 和 responses-kasmvnc-chrome 保持独立，由 index/index.ts 统一挂载。
  Codex 只调用 responses-llm 的 HTTP Responses 接口；两个 download 路由只提供配置文件。

协议实体规则
  RPC 协议文件共八个：
    lib-chatgpt-com/invoke-protocol.ts：话题、模型、消息和结果协议。
    lib-responses-zod/invoke-protocol.ts：Responses schema、错误码和校验协议。
    users/space/invoke-protocol.ts：用户空间协议。
    users/files/invoke-protocol.ts：文件上传下载协议。
    users/mcp/invoke-protocol.ts：用户 MCP 协议。
    users/p2p/invoke-protocol.ts：用户间 P2P 文件传输协议。
    responses-kasmvnc-chrome/invoke-protocol.ts：浏览器实例管理协议。
    responses-chrome-extension/src/background/invoke-protocol.ts：扩展协议，包含 PeerJS 挂载。
  每个单向协议由生产者拥有一个 invoke-protocol.ts。
  生产者通过 Remote 注册业务方法，并负责 dispatchInit()。
  扩展协议的 PeerJS 连接使用 dispatchPeerJsInit() 和 invokePeerJsInit()；两者内部复用基础库的 send-on 挂载。
  协议文件位于生产者的运行角色目录。
  业务协议类可以继承 Remote，也可以组合 Remote。
  消费者直接导入协议实例，调用 invokeInit() 或 invokeXxxInit()。
  一对多只增加多个 invokeXxxInit()，每个消费者拥有自己的通信适配。
  双向通信使用两个独立的 invoke-protocol.ts。
  协议文件同时包含路由、Zod schema、处理函数、生产者挂载和消费者代理。
  协议方法、schema、处理函数、挂载和消费者代理集中在所属协议文件，并按业务切片拆分。

生产者上下文
  生产者可以扩展 Remote 的 ctx，把浏览器会话、适配器、日志器和存储注入处理函数。
  ctx 留在生产者内部；返回值包含可传输的数据。
  消费者只看到由 Zod schema 推导出的输入和输出类型。
  返回值必须是可传输的数据，类实例的方法保留在本地代理对象上。

ChatGPT 协议
  lib-chatgpt-com/invoke-protocol.ts 统一定义真实 chat_id、话题、模型、消息和结果协议。
  协议包含话题列表、创建、重命名、归档、模型目录、推理档位、发送、取消、文本、图片、工具状态、完成事件和错误。

Codex Responses
  lib-responses-zod 的 invoke-protocol.ts 定义 Responses 请求、响应、错误和稳定错误码。
  responses-llm 需要用户空间、文件或 MCP 时调用 users 对应切片协议，需要浏览器时调用 responses-kasmvnc-chrome，再通过 PeerJS 挂载调用扩展协议。
  Codex 只消费 responses-llm 的 HTTP Responses 接口；两个 download 路由只提供配置文件。

错误码
  E001 需要登录或页面会话失效
  E002 页面适配或提交参数失败
  E003 扩展与 Responses 服务通信失败
  E004 页面结果超时
  E005 页面事件或返回解析失败
  E006 Responses 服务内部错误
  所有错误返回 Codex 兼容 JSON、稳定错误码和中文明文；异常正常抛出并设置超时。

开发、发行、使用
  开发
    1. pnpm install --frozen-lockfile
    2. 启动目标 openai-v1-responses 中的 Hono 项目。
    3. 验证文本、图片、工具、话题管理、取消和错误返回。
    4. 运行类型检查，并完成各库和各 Hono 项目的真实流程验证。
  发行
    1. 锁定依赖并完成全部检查。
    2. 独立构建两个 lib-* 项目和各个 Hono 项目。
    3. 发布两个 download Hono 路由、lib-responses-zod 包和配置说明。
    4. 不发布 Cookie、Token、用户数据或开发密钥。
  用户
    1. 选择 download-codex-config-toml 或 download-vscode-extension 下载方式。
    2. 下载 config.toml 或安装 VS Code 下载包。
    3. 打开 ChatGPT 官方网页并正常登录。
    4. 在 Codex 中配置服务地址和 Responses 协议。
    5. 直接使用 Codex；云端服务提供 ChatGPT 协议和 Codex 协议。

实现原则
  谁定义协议，谁就是生产者，谁负责 dispatchInit()。
  页面协议变化集中处理在 lib-chatgpt-com，服务层直接消费协议。
  只在有实际复用或需要导出时增加文件级成员。
  临时输出、测试产物和调试数据只放项目 .log。
