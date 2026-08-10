# TypeScript 服务切片公理（ImmerStateCreator）

适用范围：TypeScript 服务中由 `ImmerStateCreator` 实现的生产者切片。

除非负责人明确批准，以下定律不得例外。

## 基本定律

1. **唯一生产者定律**：一个状态只能由所属切片生产；该切片只能读写自身状态。
2. **公开边界定律**：`Actions` 是公开操作；`PrivateActions` 是内部操作，禁止进入外部契约。
3. **闭合定律**：切片只能调用自身 Actions、PrivateActions，并读取声明的 `nodeState_t`。
4. **单向依赖定律**：切片禁止导入主 store、其他业务切片或任何 `index.ts`。
5. **唯一组合定律**：`ImmerStateCreator` 只能由同一运行端的主 store 组合。
6. **主仓库定律**：主 store 只组合切片、注入运行时能力、配置中间件和持久化。
7. **消费者定律**：写入两个及以上切片的事务必须由消费者完成；消费者只能调用主 store。
8. **边界验证定律**：外部输入进入 Actions 时验证；外部结果写入状态前验证。
9. **持久化定律**：持久化只保存白名单业务数据。
10. **最小语义定律**：不增加语义的文件、对象、函数和类禁止存在。

依赖方向唯一：

```text
运行时实体 → nodeState.ts → 主 store → 业务切片 → 消费者
```

反向依赖一律禁止。

## 标准切片

```ts
import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import { z } from "zod";

const itemValidator = z.object({ id: z.string().min(1) });
type Item = z.infer<typeof itemValidator>;

type nodeState_t = {
  itemInput: unknown;
};

type ItemSlice = {
  item: Item | null;
  itemActions: {
    read(): void;
  };
  itemPrivateActions: {
    stateSet(input: unknown): void;
  };
};

const itemStore: ImmerStateCreator<ItemSlice, nodeState_t> = (set, get) => ({
  item: null,
  itemActions: {
    read() {
      get().itemPrivateActions.stateSet(get().itemInput);
    },
  },
  itemPrivateActions: {
    stateSet(input) {
      const item = itemValidator.parse(input);
      set(state => {
        state.item = item;
      });
    },
  },
});

export { itemValidator, type nodeState_t };
export default itemStore;
```

约束：

- 默认导出只能是当前切片的 `ImmerStateCreator`。
- 类型、验证器、初始值、常量和通信契约定义在所属 `store.ts`。
- 无数据、无 Actions、无 PrivateActions 或无 `nodeState_t` 时直接省略。
- `unknown` 只允许位于外部边界，并立即验证。
- 方法使用明确名称、参数和返回值；禁止万能方法和任意回调。
- Actions 与 PrivateActions 均只处理本切片。

## 运行时注入定律

业务切片不得运行时导入宿主模块。需要 Node、Electron 或其他宿主能力时，由所属 `store.ts` 声明扁平的最小 `nodeState_t`，由同目录 `nodeState.ts` 提供实体。

`nodeState_t` 的顶层成员只能是运行时值或实体引用，禁止是函数。实体可以保留其原生方法，但禁止把业务操作包装成注入方法。

`nodeState_t` 禁止：

- 嵌套命名空间或 Actions；
- 函数、回调和执行器；
- 超出本切片需求的运行时值；
- 包含业务判断或跨切片操作。

## 组合定律

```text
slice/
├─ store.ts       # nodeState_t 与业务切片
└─ nodeState.ts   # nodeState_t 的运行时实体实现
```

`nodeState.ts` 默认导出标准 `ImmerStateCreator<nodeState_t>`，只生产本切片声明的运行时值，不包含 Actions，不消费业务切片。

`nodeState.ts` 只能通过 `import type` 加载所属 `store.ts` 的 `nodeState_t`；`store.ts` 禁止加载 `nodeState.ts`。

主 store 直接组合运行时值切片与业务切片：

```ts
type Store = ReturnType<typeof itemNodeState>
  & ReturnType<typeof itemStore>;

const store = createStore<Store>()(
  cwdPersist({
    cwd: app.getPath("userData"),
    initializer: immer((...options) => ({
      ...itemNodeState<Store>(...options),
      ...itemStore<Store>(...options),
    })),
    name: pkg.name,
  }),
);
```

组合时必须由 TypeScript 验证 `nodeState.ts` 满足所属 `nodeState_t`。不同切片的 `nodeState_t` 通过扁平成员组合；成员名在主 store 内必须唯一。

## 单地址通信定律

一个切片在 TypeScript 服务采用的任何通信方式下只能暴露一个通信地址。通信方式包括 IPC、HTTP、RPC、WebSocket、SSE、消息队列及其等价形式。

通信地址必须等于切片名。框架要求的语法符号不属于名称，例如 HTTP 的 `/account` 仍视为 `account`。

切片名在同一主 store 内唯一，并同时作为：

```text
目录名
状态名
Actions 前缀
PrivateActions 前缀
通信地址
```

切片 `account` 只能使用 `account`：IPC channel 为 `account`，HTTP 路径为 `/account`，RPC 方法、WebSocket 事件和消息主题均为 `account`。

读取、写入、删除、调用、响应、推送、订阅和取消共用该地址；具体操作由契约中的 `method` 可辨识联合区分。

禁止为同一切片创建第二个地址、地址集合、动作地址、请求地址与推送地址。以下形式一律禁止：

```text
account/read
account.remove
account:stateUpdated
account-events
{ read: "account-read", update: "account-update" }
```

框架可使用不同发送原语，但必须使用同一通信地址；不得用适配器、包装函数、文件或对象把一个切片伪装成多个地址。框架无法满足时，停止修改并请求决策。

传输适配层只透明转发框架原语，不识别切片、方法或数据；Electron 的 preload 属于传输适配层。

## 消费者定律

纯切片禁止 `index.ts`。

`index.ts` 只允许：

- 应用或框架生命周期；
- 框架要求的路由入口；
- 写入两个及以上业务切片的消费者。

消费者只调用主 store，不导入切片 creator，不调用其他业务 `index.ts`，不保存状态。

只调用一个切片的 `index.ts` 必须删除，逻辑归还该切片。

## 跨运行端同构定律

- 同构的是切片名、数据和通信契约，不是 store 实例。
- 生产端 `store.ts` 是验证器和契约来源，且必须可被消费端安全加载。
- 消费端只加载生产端的具名类型和契约，禁止加载生产端 creator 或主 store。
- 各运行端的 creator 分别由本端主 store 组合。
- 消费端只调用自身 Actions，并以生产端推送状态为准。
- UI 是最终消费者时，可组合多个切片，但不得直接调用传输层。

## 持久化定律

- 生产端主 store 使用业务数据白名单。
- 消费端默认不持久化生产端权威状态。
- Actions、PrivateActions、`nodeState_t` 成员、窗口、会话、连接、定时器和进程句柄禁止持久化。
- 宿主框架管理的数据归宿主框架；例如 Cookie、IndexedDB 和 Chromium 缓存归 Electron Session。

## 禁止

- `store.ts → index.ts`；
- 业务切片运行时导入宿主模块；
- `process.ts`；
- 业务切片级 `public.ts`；
- 纯转发 `index.ts`；
- service、manager、processor；
- Actions 转发对象；
- 动态 import 隐藏依赖；
- 默认参数或回调隐藏依赖；
- 无类型约束的契约对象；
- 无明确消费者的 Promise 和异常；
- 为少量代码拆分无独立语义的文件。

出现新增公共层、第二通信地址或其等价通道、跨切片依赖、数据结构变化或弱化类型的需求时，停止修改并请求决策。
