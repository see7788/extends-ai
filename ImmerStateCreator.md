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
业务 store.ts → nodeState_t ┐
运行时实体 ────────────────→ 主仓库 nodeState.ts → 主 store → 业务切片 → 消费者
```

反向依赖一律禁止。

## 标准切片

声明顺序固定为：

```text
imports
→ 基础验证器
→ 组合验证器
→ 由验证器推导的业务类型
→ nodeState_t 与切片类型
→ 初始值和通信契约
→ ImmerStateCreator
→ exports
```

`store.ts` 顶层只能出现上述类别。实现常量、辅助函数、类、连接器、计时器和错误转换必须定义在 `ImmerStateCreator` 内，并归属 Actions、PrivateActions 或 creator 私有实体；禁止 Actions 转发到顶层执行碎片。只有验证器、初始值或通信契约自身包含的常量可以位于顶层。

可序列化业务类型只能由完整验证器推导。禁止先手写业务类型再补验证器；宿主实体、框架类型和不可序列化的内部句柄不受此条限制。

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

业务切片不得运行时导入宿主模块。需要 Node、Electron 或其他宿主能力时，由所属 `store.ts` 声明扁平的最小 `nodeState_t`，由主仓库目录内唯一的 `nodeState.ts` 提供实体。

`nodeState.ts` 以主 store 为边界：每个独立主 store 必须且只能有一个；仅提供可复用切片、不创建主 store 的库不得提供 `nodeState.ts`，只导出各切片的 `nodeState_t` 需求。

`nodeState_t` 的顶层成员只能是运行时值或实体引用，禁止是函数。实体可以保留其原生方法，但禁止把业务操作包装成注入方法。

`nodeState_t` 禁止：

- 嵌套命名空间或 Actions；
- 函数、回调和执行器；
- 超出本切片需求的运行时值；
- 包含业务判断或跨切片操作。

## 组合定律

```text
main/store/
├─ index.ts       # 主 store
└─ nodeState.ts   # 全部 nodeState_t 的运行时实体实现
```

`nodeState.ts` 默认导出标准 `ImmerStateCreator<NodeState>`。`NodeState` 是全部业务切片所声明 `nodeState_t` 的交叉类型；该切片只生产运行时值，不包含 Actions，不消费业务切片。

`nodeState.ts` 只能通过 `import type` 加载业务 `store.ts` 的 `nodeState_t`；业务 `store.ts` 禁止加载 `nodeState.ts`。

主 store 直接组合运行时值切片与业务切片：

```ts
type Store = ReturnType<typeof nodeState>
  & ReturnType<typeof itemStore>;

const store = createStore<Store>()(
  cwdPersist({
    cwd: app.getPath("userData"),
    initializer: immer((...options) => ({
      ...nodeState<Store>(...options),
      ...itemStore<Store>(...options),
    })),
    name: pkg.name,
  }),
);
```

组合时必须由 TypeScript 验证 `nodeState.ts` 满足全部 `nodeState_t`。相同语义的运行时值必须复用同名成员；不同语义的成员名在主 store 内必须唯一。

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

## 入口消费定律

每个运行端只有一个主 store。只有主 store 可以导入并组合 `ImmerStateCreator`。

切片分为两种：

```text
生产者切片
├─ 可以拥有数据
├─ 只读写自身数据
└─ Actions 只完成自身增、改、删、查

消费者切片
├─ 只有 Actions
├─ 不保存数据，不参与持久化
├─ 通过 get() 直接调用生产者 Actions
└─ 不调用其他消费者 Actions
```

唯一业务调用链：

```text
执行入口
└─ 本运行端主 store
   ├─ 生产者 Actions
   └─ 消费者 Actions
      └─ 生产者 Actions
```

Electron 生命周期、IPC、Hono 路由、定时器回调和 UI 事件都是执行入口。每个执行入口的第一次业务调用，必须是从本运行端主 store 直接取得的 Actions。

单切片业务直接调用生产者 Actions。仅出现一次的跨切片业务，由当前执行入口透明调用多个生产者 Actions；需要复用的跨切片业务，定义只有 Actions 的消费者切片。

每个运行端只有一个根执行入口。根执行入口只能直接消费主 store，不得导入或调用任何业务目录的 `index.ts`。

服务端业务切片目录只允许存在 `store.ts`，禁止存在 `index.ts`。IPC、生命周期或路由注册不能使业务目录成为执行入口；它们必须由根执行入口直接注册，或由框架明确登记的 `routers.ts` 注册。

服务端只允许两类 `index.ts`：

```text
<运行端>/index.ts        # 唯一根执行入口
<运行端>/store/index.ts  # 唯一主 store
```

根执行入口可以导入主 store 和业务 `store.ts` 提供的通信契约，不得导入其他内部 `index.ts`。业务执行链不得导出或调用预绑定 Actions、业务代理对象、`install` 对象或转发方法。

React 路由导入业务切片的 `index.tsx` 页面组件属于界面组合，不属于服务端业务调用。

没有主 store 的纯切片库只提供 creator，由最终消费它的应用主 store 组合。测试也必须创建最小主 store，不得直接消费 creator。

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

持久化白名单必须由具名类型和逐项对象字面量共同约束：

```ts
type PersistedState = Pick<Store, "item">;

const persistedStateRead = (state: Store): PersistedState => ({
  item: structuredClone(state.item),
});

store.persist.setOptions({
  partialize: state => persistedStateRead(state) as Store,
});
```

`as Store` 只适配持久化中间件的类型限制，不得包裹手写对象。禁止展开整个 state、删除黑名单字段或依赖序列化器自动忽略运行时值；新增持久化成员必须先加入 `PersistedState`。

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
