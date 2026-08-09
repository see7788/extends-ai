# extends-ai

## 当前应用组合

- `apps/main` 只实例化 Codex 账号维护窗口；托盘只保留“打开 Codex 账号管理”和“退出”。
- `libs/login` 源码作为独立库保留，不由当前应用实例化，也不进入当前应用的 Vite renderer 输入。
- Codex 的 `authJsonCreate` 只允许选择外部浏览器完成官方登录；不再提供 Electron 内置登录载体。

## Login 执行约定

- 从其他浏览器导入是纯生产过程：发现浏览器、取得授权、读取 Cookie、写入新的候选 Electron partition、返回候选结果。
- `cookieImport` 不访问账号接口、不解析 email、不判断有效期、不打开预览窗口、不记录业务账号；只持久化自身每个浏览器最后一次成功导入的时间。
- `accounts` 是登录态的唯一识别者：内嵌登录由主进程直接调用识别；外部浏览器 Cookie 候选由用户手工交给它识别。它负责 email、状态、同 email 合并、保存账号及账号操作。
- `accounts` 删除账号成功后，由主进程消费者按该账号的来源调用 `cookieImport.historyRemove`；`cookieImport` 只清理自己的导入历史及同源候选，renderer 只渲染两个切片推送的新状态。
- 同一个 email 永远只显示和持久化为一个业务账号；来源浏览器只是该账号的元数据。
- 账号状态只有 `valid / expired / unknown`。网络失败、服务端 5xx 或响应结构变化必须是 `unknown`，不得删除账号。
- 新候选验证成功以后才替换旧 partition；任一前置步骤失败都保留旧登录态。
- 打开 Login 只发现并展示浏览器，不自动启动或导入任何外部浏览器；用户选择一个来源后只处理该来源。
- 系统浏览器“可发现”不等于“可导入”：当前只对能够直接打开用户授权远程调试入口的 Chrome 系列开放 Cookie 导入；Edge、旧版 Chromium 与 Firefox 以禁用暗色显示“暂不支持”，且不提供点击事件。浏览器实例按 `executablePath + launchArguments` 归一，相同 exe 但不同 `--user-data-dir`、`--profile-directory` 或其他参数的真实多实例不会合并。
- Login 的两个生产者按切片直接对应两张透明 AntD Card：Card 使用自身标题，内部只放常开、无额外配色的原始 AntD Tree。`login → 内嵌登录`、`cookieImport → 其他浏览器导入`；后者每行只呈现浏览器名称与真实状态或操作。
- 两棵生产者 Tree 只呈现各自状态。内嵌登录由 main 入口把 `login` 生产者与 `accounts` 识别者串联，识别成功后自动关闭窗口并直接显示账号；`cookieImport` 的浏览器根节点按状态显示“导入 / 重新导入 / 取消”的文字与图标及授权倒计时。候选存在时显示“已导入待识别”，accounts 自己提供已识别 browserId，只有 app 消费层将它组合为“已导入已识别 / 识别完成”。
- “其他浏览器导入”只响应用户单击的一个 browserId；罗列浏览器不触发串行、并行或批量导入。
- cookieImport 为授权流程固定打开一个新增浏览器窗口，并在成功、手动取消或自动取消后关闭该窗口；用户原有浏览器窗口不属于本次资源，不关闭。
- main/renderer 同构；每个 `store.ts` 只定义自身切片，Action 只接收明确业务输入，不接收 runtime 对象或任意执行回调；跨切片串联只允许在消费者 `index.ts`。
- 框架要求的 preload 在 dev 中编译为 `.cjs`；所有业务窗口共用唯一公共 preload，不再保留重复业务 preload 子包。
- 开发期间保持 `electron-vite dev --watch` 与 renderer HMR，不执行生产打包。

## Login 逐步待办与验收

### 0. 公共通信去重

- [x] `browser-partition/preload` 是唯一 `contextBridge / ipcRenderer` 实现。
- [x] `browser-partition/renderer/public.ts` 是唯一 renderer 类型化 `invoke / read / subscribe` 实现。
- [x] Login 与 Codex 源码均消费 `browser-partition-preload.cjs`；当前应用只构建 Codex renderer。
- [x] 删除 `login-preload`、`codex-app-server-preload` 及两个重复 renderer `public.ts`。
- 验收：全仓库检索只允许公共目录出现 `contextBridge`、`ipcRenderer`、`preloadRead`。

### 1. 纯化 cookieImport

- [x] `cookieImport.create` 只返回 `{ browserId, browserName, partition }` 候选结果。
- [x] 每次导入使用新的临时候选 partition；导入失败清理本次候选，账号识别失败保留候选供用户重试。
- [x] renderer 的同名切片只同步主进程进度、59 秒授权倒计时、取消、错误和导入历史。
- [x] 导入历史只含 browserId、浏览器名称和最后成功时间；不夹带 email、`/api/auth/session`、预览窗口或“导入并预览”契约。
- 验收：`cookieImport` 目录不存在账号请求与 `BrowserPartitionWindow.open`，main/renderer 分别通过类型检查。

### 2. main/accounts 消费者切片

- [x] 消费候选 partition 后才请求登录态信息并识别 email。
- [x] 将结果分类为 `valid / expired / unknown`，同 email 原子合并来源信息。
- [x] 验证成功后替换旧 partition 并消费候选；失败保留旧账号和待识别候选。
- [x] 持久化账号、partition 引用、来源、最后检查时间和状态；不把 Cookie 内容写入 Zustand。
- 验收：同 email 多来源只有一个账号；失败、取消和 unknown 均不损坏原账号。

### 3. renderer/accounts 同构切片

- [x] 直接消费 main/accounts 的验证器与类型，不复制验证器，不消费切片仓库实例。
- [x] 提供手工消费现有候选、打开、重新验证和移除的透明调用。
- [x] 外部浏览器候选的“识别账号 + 图标”位于 cookieImport Tree 的“已导入待识别”子节点；它只在 renderer 透明调用 accounts 契约，不把识别业务放入 main/cookieImport。
- [x] 识别成功后候选节点消失，renderer/accounts 独立显示 email 账号卡片。
- [x] 页面只响应 main 推送的账号及进度状态，不伪造成功或启用状态。
- 验收：renderer store 不持久化；主进程状态变化能完整推送并通过验证器。

### 4. Login 单来源人工交接

- [x] Login 打开时只读取并展示浏览器列表，不自动启动或导入浏览器。
- [x] 用户选择一个来源后，`cookieImport` 只生产候选并停在 `ready`；第二次人工点击才由 `accounts` 消费。
- [x] 当前来源的进度、倒计时、取消和错误准确归属；失败或取消只结束该来源。
- 验收：不存在批量授权窗口、自动循环、并发导入和生产者调用消费者的逆向依赖。

### 5. 内嵌登录归一

- [x] `login` 只创建/打开隔离登录 partition，不在生产者内识别或持久化账号。
- [x] Electron 根据隔离 Session 的页面加载与 Cookie 变化触发 `accounts` 识别；成功直接持久化账号并关闭窗口，不增加人工“完成”步骤。
- [x] 关闭或取消不产生虚假账号，也不破坏已有账号。
- 验收：内嵌登录自动识别；外部浏览器导入保持候选与人工识别，二者不伪造账号。

### 6. 账号操作与页面收口

- [x] 账号卡片支持打开 ChatGPT.com、重新验证、重新导入和移除。
- [x] 保留原动画背景；普通卡片白底黑字，使用中账号只用主题绿色背景与白字，不加流光、阴影、危险色或额外高亮。
- [x] 操作默认直接执行，不使用确认弹窗；按钮只保留普通文字与图标，真正的错误状态才使用错误色。
- [x] email 是卡片标题；套餐与“移出管理”紧贴标题显示在同一行；不显示无信息增量的“已登录”标识，来源、导入时间、检查时间与其余详情统一收进“账号信息”。
- [x] 当前操作只显示一个 spinner、一个倒计时和一个取消入口。
- 验收：同 email 单卡片；所有按钮均由 main 执行并以 main 状态为准。

### 7. 持久化与开发态总验收

- [x] `login-main` 的 `cwdPersist` 只保存自身 accounts、cookieImport 导入历史和等待人工识别的 Cookie 候选引用；内嵌登录运行状态重启后恢复为 idle。
- [x] Cookie、IndexedDB 和缓存仅由 Electron Session 管理。
- [x] 同步本 README 与最终源码目录；完成相关子包 typecheck 和 dev 实际运行观察。
- [x] 保持 dev/HMR；生产打包只在项目最后统一执行。
- [ ] 人工验收：本次新增的浏览器授权窗口在手动取消、自动取消和成功导入后关闭，用户原有窗口保持不变。
- [x] 运行验收：没有 profile 参数的 qxxq / Google Chrome 快捷入口被确认属于同一浏览器实例并归一为一个来源；同 email 只形成一个账号卡片。
- [ ] 人工验收：在内嵌窗口完成登录后自动形成 email 账号卡片并关闭窗口；提前关闭只取消操作且不产生账号。

### 8. 后置工作

- [ ] Login 全部完成以后，再继续 `codex-app-server` 的 auth.json 创建与导入对接。

### 当前工作树中间状态

- 公共通信去重已完成并通过公共 preload/renderer 类型检查。
- `cookieImport` 主进程生产者已经纯化并完成目录级验收；自己的导入历史用于区分“导入/重新导入”。renderer 在候选子节点提供人工“识别账号”按钮，但识别方法和账号卡片仍由 accounts 提供。
- 内嵌登录由 Electron 监听隔离 Session 的页面加载和 Cookie 变化，主进程 accounts 识别成功后立即持久化账号并自动关闭窗口；提前关闭只取消本次操作。只有 `cookieImport` 保留 `ready` 候选与人工识别步骤。
- 公共 preload、Login 独立源码、动画瀑布流和持久化白名单已经完成；当前应用已与 Login 窗口脱钩。
- 当前剩余三项必须由用户完成浏览器授权/官方登录的人工验收；生产打包仍明确后置。

本文件是 pnpm 工作区唯一维护文档。具体库不再单独维护 README；未完成事项记录在下方目录树对应节点。

```text
extends-ai/
├─ apps/main/                         # Electron 生命周期、Codex 托盘/窗口及公共 preload 构建入口
│  └─ 已验收：开发态每个 renderer 只有一个入口并保持 HMR
├─ libs/browser-partition/            # 无业务状态的浏览器与隔离窗口生产者
│  ├─ main/
│  │  ├─ browser/                     # 发现、校验并打开系统浏览器
│  │  └─ BrowserWindow/               # 创建指定 Electron Session 的隔离窗口
│  ├─ preload/                        # 唯一通用安全 bridge；被所有业务窗口直接加载
│  └─ renderer/                       # 唯一公共类型化 invoke/read/subscribe 与浏览器调用
│     └─ 已验收：无主仓库、无业务状态
├─ libs/login/                         # ChatGPT.com 登录态工具，独立于 Codex 账号业务
│  ├─ main/
│  │  ├─ login/                       # 内嵌登录 partition 生产者
│  │  ├─ cookieImport/                # 外部浏览器 Cookie 候选及自身导入历史生产者
│  │  └─ accounts/                    # 登录态识别、同 email 合并、持久化与账号操作消费者
│  └─ renderer/                       # 登录态页面
│     ├─ login/                       # 同构镜像主进程 login 状态
│     ├─ cookieImport/                # 同构镜像 cookieImport 进度与导入历史
│     ├─ accounts/                    # 同构镜像业务账号状态与透明操作
│     ├─ public/                      # 公共 UI 成品；当前只有唯一毛玻璃 Card
│     ├─ app.tsx                      # 唯一页面消费者；只负责背景与 Masonry 组合
│     ├─ store.ts                     # 只组合 renderer 同名切片
│     ├─ routers.tsx                  # Hash Router 路由集合
│     └─ index.tsx                    # React 根与 RouterProvider 启动入口
└─ libs/codex-app-server/              # auth.json 导入、账号管理、查询和唯一物化 CODEX_HOME
   ├─ main/
   │  ├─ accountAdd/
   │  │  ├─ authJsonCreate/           # 选择外部浏览器完成官方登录，创建并导入 auth.json
   │  │  └─ authJsonImport/           # 导入并验证已有 auth.json
   │  ├─ accountList/                 # 已有账号、认证、额度、用量与定时查询
   │  └─ globalSettings/              # 唯一 CODEX_HOME 与查询设置
   └─ renderer/                       # 账号添加、列表、详情和全局设置页面；消费公共 bridge
      ├─ accountAdd/
      │  ├─ authJsonCreate/           # 外部浏览器一级列表、59 秒倒计时、取消与重新导入
      │  └─ authJsonImport/           # 文件导入：自身 store、通信、操作与 Card/Tree
      ├─ accountList/
      │  ├─ account/                  # 单账号启用、官网访问与账号卡片
      │  ├─ accounts/                 # 账号集合监听、移除操作与空状态
      │  ├─ authSessions/             # 登录态监听、查询与本切片 UI
      │  ├─ rateLimits/               # 额度监听、查询与本切片 UI
      │  ├─ scheduler/                # 全账号查询执行状态与本切片 UI
      │  └─ usage/                    # 用量监听、查询与本切片 UI
      ├─ globalSettings/              # 全局设置 store、通信、操作与本切片 UI
      ├─ theme/store.ts               # renderer 主题数据切片，无虚假 UI
      ├─ public/                      # 无业务的公共 UI 与文本工具
      ├─ app.tsx                      # 应用壳：主题上下文与路由 Outlet
      ├─ store.ts                     # 只组合 renderer 同名切片
      ├─ routers.tsx                  # Hash Router 路由集合
      ├─ index.tsx                    # React 根与 RouterProvider 启动入口
      └─ 已验收：业务切片不直接组装其他切片 UI
```

## 持久化边界

- 自有业务数据统一使用 `cwdPersist({ cwd: app.getPath("userData"), name: package.name })`，实际写入 `userData/.zustand/<package.name>.json`。
- Cookie、IndexedDB、缓存等 Chromium 数据由 Electron Session 管理，不复制到 Zustand，也不视为业务仓库数据。
- `login-main` 的 cookieImport 只在 Zustand 保存浏览器导入历史元数据；Cookie 内容仍只存在 Electron Session。
- renderer store 不持久化；查询结果 `authSessions`、`rateLimits`、`usage` 只保留在主进程内存并推送。
- `codex-app-server` 仅持久化账号记录、唯一 CODEX_HOME 和全局查询配置；任意时刻最多物化一个 `auth.json`。
- auth.json 导入只校验并保存账号副本；导入与账号列表启动都不选择账号，启用账号只由账号切片的明确操作执行。
- 主 store 使用明确白名单持久化；当前 `login-main.json` 与 `codex-app-server-main.json` 只包含所属切片。
- 拆库前的 `browser-partition-main.json` 是不再读取的静态遗留文件，不属于当前运行仓库。

## 已确认原则

- main/renderer 以业务切片同构：main 切片拥有数据、Actions、验证器与执行方法；renderer 同名切片消费其验证器、镜像状态并呈现交互。
- 每个独立业务 renderer 根目录固定存在 `store.ts / routers.tsx / index.tsx`；即使只有一个页面，也使用 `react-router-dom` 的 Hash Router。
- renderer 业务切片目录固定只有 `store.ts / index.tsx`：通信、监听、操作和本切片 UI 统一由同一个 `index.tsx` 承担，不再并存 `index.ts` 与 `index.tsx`，也不保留套壳转发入口。
- 每个 `store.ts` 只定义本切片的 `<切片名>` 与 `<切片名>Actions`；主 `store.ts` 只组合切片。
- renderer 业务切片的 `index.tsx` 只负责自身通信、监听、操作和 UI；根切片的 `index.tsx` 可以透明组合自己的子切片。
- `app.tsx` 只负责应用主题上下文与路由 `Outlet`，不转发页面、不拥有业务 store，也不替根切片组合业务 UI。
- `public/` 只保存无业务的公共组件与工具，不保存页面壳或业务转发。
- `browser-partition` 是纯能力生产者，不拥有 Zustand 主仓库和业务状态。
- `browser-partition-preload` 只提供公共 bridge 工厂；真正的 preload 所有权属于 `login` 与 `codex-app-server`。
- `login` 与 `codex-app-server` 相互独立，只共同消费 `browser-partition`。
- `authJsonCreate` 只有一个官方创建流程，指定的外部浏览器是唯一 `openAuthUrl` 载体；每次只新开并追踪一个授权窗口，成功、页面取消、59 秒超时或失败后统一关闭，用户直接关闭该窗口等价于取消。
- 自动查询与立即查询只查询账号信息；Token 是否刷新交给官方 Codex App Server 判断，不实现强制刷新。
- 启用账号由主进程唯一控制，renderer 不伪造启用状态。

## 当前执行顺序

- [x] 修复开发态重复 renderer 入口并恢复 auth.json 页面。
- [x] 验证 `browser-partition` 无主仓库、公共 preload 工厂以及两端消费者。
- [x] 主 store 采用持久化白名单，确保当前 JSON 只写入所属切片。
- [x] login 的 `login` 与 `cookieImport` 状态由 main 推送并在 renderer 同构呈现；内嵌登录自动交给 accounts 识别，cookieImport 自己记录导入历史并在成功后停在 `ready`，只由人工操作交给 accounts。
- [x] codex-app-server renderer 收口为切片 UI + 根切片消费者：`accountAdd/index.tsx` 与 `accountList/index.tsx` 分别透明组合自身子切片，`app.tsx` 只保留应用壳。
- [ ] 接入成人端权限通信后限制 CODEX_HOME 可见性开关。
- [x] 完成相关包 typecheck 与开发态 main/preload/renderer 运行验收；生产构建继续后置。
