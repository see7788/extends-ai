# extends-ai

Electron 多账号工具工作区。切片约束以 [`ImmerStateCreator.md`](./ImmerStateCreator.md) 为唯一准则；本文只记录当前源码结构与职责。

```text
extends-ai/
├─ apps/main/                         # Electron 最终应用与 electron-vite 配置
│  ├─ index.ts                        # 应用生命周期入口
│  ├─ electron.vite.config.ts         # main/preload/renderer 构建入口
│  └─ tsconfig.json
├─ libs/browser-partition/            # 可复用浏览器发现与分区窗口能力，无独立主 store
│  ├─ main/
│  │  ├─ BrowserWindow.ts             # Electron partition 窗口实体
│  │  └─ browser/store.ts             # 浏览器生产者切片，唯一频道 browser
│  ├─ preload/index.ts                # 唯一 contextBridge/ipcRenderer 转发
│  └─ renderer/public.ts              # renderer IPC 能力切片
├─ libs/login/                        # 独立 ChatGPT 登录态管理应用
│  ├─ main/
│  │  ├─ index.ts                     # 唯一服务端入口，注册切片频道
│  │  ├─ store/
│  │  │  ├─ index.ts                  # 唯一 main store 与持久化白名单
│  │  │  └─ nodeState.ts              # 本 store 的运行时实体
│  │  ├─ accounts/store.ts            # 已识别账号生产者
│  │  ├─ cookieImport/store.ts        # 外部浏览器 Cookie 导入生产者
│  │  └─ login/store.ts               # Electron 内嵌登录生产者
│  └─ renderer/
│     ├─ index.tsx / routers.tsx       # React 与路由入口
│     ├─ app.tsx / store.ts            # UI 消费者与唯一 renderer store
│     ├─ accounts/                     # accounts 同构切片与 UI
│     ├─ cookieImport/                 # cookieImport 同构切片与 UI
│     └─ login/                        # login 同构切片与 UI
├─ libs/codex-app-server/             # Codex auth.json、账号详情与额度维护应用
│  ├─ main/
│  │  ├─ index.ts                     # 唯一服务端入口；窗口、生命周期与频道注册
│  │  ├─ store/
│  │  │  ├─ index.ts                  # 唯一 main store 与持久化白名单
│  │  │  └─ nodeState.ts              # 本 store 的运行时实体
│  │  ├─ accountAdd/
│  │  │  ├─ store.ts                  # 无数据消费者切片，组合添加账号流程
│  │  │  ├─ authJsonCreate/store.ts   # auth.json 创建状态与官方登录生产者
│  │  │  └─ authJsonImport/store.ts   # auth.json 导入状态生产者
│  │  ├─ accountList/
│  │  │  ├─ store.ts                  # 无数据消费者切片，组合账号维护流程
│  │  │  ├─ account/store.ts           # 单账号生产者
│  │  │  ├─ accounts/store.ts          # 账号顺序生产者
│  │  │  ├─ authSessions/store.ts      # 认证状态生产者
│  │  │  ├─ connection/store.ts        # Codex App Server 连接生产者
│  │  │  ├─ rateLimits/store.ts        # 额度生产者
│  │  │  ├─ scheduler/store.ts         # 调度状态生产者
│  │  │  └─ usage/store.ts             # 用量生产者
│  │  └─ globalSettings/store.ts       # 全局设置生产者
│  └─ renderer/
│     ├─ index.tsx / routers.tsx       # React 与路由入口
│     ├─ app.tsx / store.ts            # UI 消费者与唯一 renderer store
│     ├─ accountAdd/                    # 添加账号同构切片与 UI
│     ├─ accountList/                   # 账号维护同构切片与 UI
│     ├─ globalSettings/                # 全局设置同构切片与 UI
│     ├─ public/                        # 纯 UI 公共组件
│     └─ theme/                         # renderer 本地主题切片
├─ ImmerStateCreator.md                # TypeScript 服务切片定律
├─ pnpm-workspace.yaml
└─ package.json
```

## 当前边界

- 服务端业务目录只存在 `store.ts`；仅运行端根和主 store 允许 `index.ts`。
- 每个服务端切片只有与切片同名的一个频道；方法由频道载荷的 `method` 区分。
- 每个生产者只改自身状态；`accountAdd`、`accountList` 是无数据消费者切片，只调用生产者 Actions。
- renderer 切片直接加载对应 main `store.ts` 提供的具名类型、验证器与频道契约。
- `browser-partition/preload` 是工作区唯一 Electron preload 实现。
- Node/Electron 实体仅由各独立 main store 的 `store/nodeState.ts` 注入；持久化使用逐项白名单。

## 开发验证

```bash
pnpm dev
pnpm typecheck
```

打包只在最终验收阶段执行：

```bash
pnpm build
```
