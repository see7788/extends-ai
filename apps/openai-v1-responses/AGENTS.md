# AGENTS.md

项目目标
  把已登录的 ChatGPT 网页适配为 Codex Responses 大模型服务。
  话题和消息以 ChatGPT 官方账号数据为准。
  上级 kasm-chatgpt 仅作为 pnpm workspace 容器；本应用目录为 openai-v1-responses。

技术栈
  全部源码、协议、扩展和服务统一使用 TypeScript。
  RPC 统一使用 invoke-protocol，不重复实现注册、校验、分发或代理机制。
  invoke-protocol 的基础库来自 runtimeproxy/libs/invoke-protocol，业务项目只定义具体协议实体。
  跨端地址、端口和路径由 config/config.ts 显式提供；不通过 Node 环境变量注入。

分层原则
  openai-v1-responses/ 是应用根目录，包含 lib-* 协议库、云端服务和下载路由。
  需要跨项目调用的业务切片拥有自己的 invoke-protocol.ts；纯 Hono 路由直接提供 HTTP 接口，上层 honorouter.ts 负责组合和挂载。
  具体协议由生产者定义，消费者按需消费，不重复实现 RPC 机制。
  WebSocket 透明中继只负责连接、配对、原样转发和断开清理，不理解任何业务协议。

项目角色约定
  没有 Hono 运行入口的项目归入 lib，只提供协议实体或可复用能力。
  有 honorouter.ts 运行入口的项目归入 app，由入口负责路由、组合或服务挂载。
  Chrome 扩展的 content_scripts/index.ts 是页面侧运行入口；扩展不使用 background Service Worker。
  Responses 业务适配由页面侧协议完成，不单独设置 responses-llm 业务项目。

推荐目录结构
  ```text
  openai-v1-responses/
  ├─ AGENTS.md                         AI 协作规则与架构约束
  ├─ config/                           跨项目显式配置，不读取 Node 环境变量
  │  ├─ package.json
  │  └─ config.ts
  ├─ lib-chatgpt-com/
  │  ├─ package.json                   ChatGPT 协议包定义
  │  └─ invoke-protocol.ts             ChatGPT 话题、模型和消息协议
  ├─ users/                            用户云空间和 P2P 文件服务
  │  ├─ package.json
  │  ├─ honorouter.ts                  组合用户切片并挂载 Hono
  │  ├─ space/
  │  │  ├─ honorouter.ts               空间路由
  │  │  └─ invoke-protocol.ts          空间协议生产者
  │  ├─ files/
  │  │  ├─ honorouter.ts               文件路由
  │  │  └─ invoke-protocol.ts          文件协议生产者
  │  ├─ mcp/
  │  │  ├─ honorouter.ts               用户 MCP 路由
  │  │  └─ invoke-protocol.ts          用户 MCP 协议生产者
  │  └─ p2p/
  │     ├─ honorouter.ts               用户间文件传输路由
  │     └─ invoke-protocol.ts          用户间 P2P 文件传输协议生产者
  ├─ responses-kasmvnc-chrome/         用户 Chrome 实例控制
  │  ├─ package.json
  │  ├─ honorouter.ts                  按用户分配实例和空闲自动停止
  │  └─ invoke-protocol.ts             实例管理协议生产者
  ├─ responses-chrome-extension/       云端 Chrome 扩展应用
  │  ├─ package.json
  │  ├─ vite.config.ts                 CRXJS 打包配置
  │  ├─ tsconfig.json                  扩展 TypeScript 配置
  │  └─ src/
  │     ├─ manifest.ts                 Chrome 扩展清单
  │     └─ content_scripts/
  │        ├─ invoke-protocol.ts       页面 Responses 业务协议和鉴权错误
  │        └─ index.ts                  WebSocket 页面侧运行入口
  ├─ index/                            服务统一组织和透明中继项目
  │  ├─ package.json
  │  └─ honorouter.ts                 组合各云端服务并启动透明中继
  ├─ download-codex-config-toml/       下载 Codex config.toml 的 Hono 路由
  ├─ download-vscode-extension/        下载 VS Code 配置的 Hono 路由
  └─ .log/                             临时日志和测试输出
  ```
  实际目录位于 apps/openai-v1-responses/；父级 extends-ai 才是 pnpm workspace 容器。

协议消费方向
  responses-chrome-extension/content_scripts 消费 lib-chatgpt-com 的 ChatGPT 协议并完成页面挂载。
  content_scripts/index.ts 负责 WebSocket 收发，content_scripts/invoke-protocol.ts 负责事件转换和 ChatGPT 本体协议调用。
  users 和 responses-kasmvnc-chrome 当前保留目录但暂不实现，由 index/honorouter.ts 暂不挂载。
  Codex 通过 Responses HTTP 或 WebSocket 连接透明中继；透明中继只配对和转发，不消费业务协议。
  Codex 只调用配置中的 Responses 入口；透明中继不保存话题、模型、用户或页面状态。

协议实体规则
  每个单向协议由生产者拥有一个 invoke-protocol.ts。
  当前协议生产者为：
    lib-chatgpt-com/invoke-protocol.ts：ChatGPT 话题、模型和消息方法。
    users/space/invoke-protocol.ts：用户空间协议。
    users/files/invoke-protocol.ts：文件上传下载协议。
    users/mcp/invoke-protocol.ts：用户 MCP 协议。
    users/p2p/invoke-protocol.ts：用户间 P2P 文件传输协议。
    responses-kasmvnc-chrome/invoke-protocol.ts：浏览器实例管理协议。
     responses-chrome-extension/src/content_scripts/invoke-protocol.ts：页面侧 Responses 适配协议。
  协议文件只定义并注册实体；运行入口负责注入上下文和建立传输，消费者直接导入协议实例并调用对应 invokeInit() 或 invokeXxxInit()。
  透明 WebSocket 中继没有 invoke-protocol.ts，因为它不理解业务消息。
  双向通信使用两个独立的单向协议；同一协议的多消费者通过多个独立传输挂载。
  生产者上下文只留在生产者内部，返回值必须是可传输数据；Window、Map、WebSocket 和连接对象不能进入返回值。

ChatGPT 本体协议
  lib-chatgpt-com/invoke-protocol.ts 直接注册 ChatGPT 官方请求方法，并导出 context_t 供页面挂载类复用。
  上下文注入 Window 和 chatgpt_com_state；状态是本体协议的配套上下文，不另拆状态协议。
  普通 JSON 请求使用 Axios，流式 SSE 使用上下文 Window.fetch。
  注册名使用点号风格并保持官方语义：conversation.list、conversation.search、conversation.batch、conversation.get、conversation.rename、conversation.update、conversation.delete、model.list、model.select、conversation.send、conversation.stop。
  模型目录返回模型 slug 和支持的 thinking_effort；发送接口把工具声明映射为 local_function_names 和 local_function_signatures。
  chatId 始终表示 ChatGPT 官方 conversation_id；话题、模型和推理档位由 chatgpt_com_state 缓存，连续发送优先读取状态。

页面侧 Responses 适配
  responses-chrome-extension/src/content_scripts/invoke-protocol.ts 是页面侧 Responses 业务协议定义。
  它合并 lib-chatgpt-com，并定义自己的 responses_context；运行时由 content_scripts/index.ts 注入 Window、chatgpt_com_state 和 WebSocket 会话状态。
  口令、登录状态、页面错误、Responses 错误和中文错误文本都在该协议文件中实现。
  声明给 ChatGPT 的函数工具由页面返回的 recipient 转换为 Responses function_call 事件；工具结果随下一轮输入带回页面。
  Responses 事件和 ChatGPT 页面事件只在页面侧转换；透明中继不做 JSON 解析或业务路由。
  content_scripts/index.ts 只负责建立 WebSocket、注入一次上下文和发送协议结果，不重复定义业务方法。

错误码
  E001 需要登录或页面会话失效
  E002 页面适配或提交参数失败
  E003 页面与透明中继连接失败
  E004 页面结果超时
  E005 页面事件或返回解析失败
  E006 Responses 服务内部错误
  业务错误由页面侧转换为 Responses error 或 response.failed 事件；透明中继只返回传输级关闭、超时和连接错误。

开发、发行、使用
  开发
    1. pnpm install --frozen-lockfile
    2. 启动透明 WebSocket 中继和目标 Hono 项目。
    3. 构建并加载 responses-chrome-extension。
    4. 打开 ChatGPT 官方网页并正常登录。
    5. 验证文本、图片、工具、话题管理、取消和错误返回。
    6. 运行类型检查，并完成真实流程验证。
  发行
    1. 锁定依赖并完成全部检查。
    2. 构建 lib-*、扩展和各 Hono 项目。
    3. 发布 config.toml 下载路由和扩展下载路由。
    4. 不发布 Cookie、Token、用户数据或开发密钥。
  用户
    1. 选择 download-codex-config-toml 或 download-vscode-extension 下载方式。
    2. 下载 config.toml 或安装 VS Code 下载包。
    3. 打开 ChatGPT 官方网页并正常登录。
    4. 在 Codex 中配置 Responses 服务地址和 WebSocket 能力。
    5. 直接使用 Codex；页面扩展负责 ChatGPT 协议和鉴权提示。

实现原则
  谁定义协议，谁就是生产者，谁负责 dispatchInit()。
  页面协议变化集中处理在 lib-chatgpt-com，Responses 适配集中处理在 content_scripts/invoke-protocol.ts。
  透明中继只做连接基础设施，不创建业务协议，不保存业务状态。
  只在有实际复用或需要导出时增加文件级成员。
  临时输出、测试产物和调试数据只放项目 .log。
  各个可发行项目使用自己的 Vite 配置；index 只负责运行时组合，不作为所有项目的公共打包配置。
