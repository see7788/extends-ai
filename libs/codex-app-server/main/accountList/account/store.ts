import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import type BrowserPartitionWindow from "browser-partition-main/BrowserWindow.ts";
import type { BrowserWindow as ElectronBrowserWindow, WebContents } from "electron";
import { z } from "zod";

const accountIdValidator = z.string().regex(/^[a-f0-9]{24}$/);
const partitionValidator = z.string().regex(
  /^persist:codex-app-server\.account\.[a-z0-9-]{1,80}$/,
);
const webAccessValidator = z.object({
  type: z.literal("electron"),
  partition: partitionValidator,
});
const accountValidator = z.object({
  id: accountIdValidator,
  label: z.string().trim().min(1).max(120),
  enabled: z.boolean(),
  importedAt: z.string().datetime({ offset: true }),
  sourceFileName: z.string().trim().min(1).max(255),
  webAccess: webAccessValidator.nullable().default(null),
});
const accountStateValidator = z.record(accountIdValidator, accountValidator);
const readValidator = z.object({ accountId: accountIdValidator });
const labelSetValidator = readValidator.extend({
  label: z.string().trim().min(1).max(120),
});
const enabledSetValidator = readValidator.extend({ enabled: z.boolean() });
const resultValidator = z.object({ ok: z.literal(true) });
const requestValidator = z.discriminatedUnion("method", [
  z.object({ method: z.literal("stateRead") }),
  labelSetValidator.extend({ method: z.literal("labelSet") }),
  readValidator.extend({ method: z.literal("officialOpen") }),
]);
const messageValidator = z.object({
  method: z.literal("stateUpdated"),
  value: accountStateValidator,
});

type Account = z.infer<typeof accountValidator>;
type WebAccess = z.infer<typeof webAccessValidator>;
type AccountState = z.infer<typeof accountStateValidator>;
type AccountReadInput = z.infer<typeof readValidator>;
type LabelSetInput = z.infer<typeof labelSetValidator>;
type EnabledSetInput = z.infer<typeof enabledSetValidator>;
type AccountSlice = {
  account: AccountState;
  accountActions: {
    accountSet(input: Account): void;
    accountDelete(input: z.infer<typeof readValidator>): void;
    communicationStart(): () => void;
    enabledClear(): void;
    dispose(): void;
    normalize(): void;
    labelSet(input: LabelSetInput): void;
    enabledSet(input: EnabledSetInput): void;
    officialOpen(input: AccountReadInput): Promise<void>;
  };
};
type nodeState_t = {
  browserPartitionWindow: Pick<typeof BrowserPartitionWindow, "open">;
  electronBrowserWindow: Pick<typeof ElectronBrowserWindow, "fromWebContents">;
  webContents?: WebContents;
};

const initial: AccountState = {};
const account = {
  accountIdValidator,
  accountStateValidator,
  accountValidator,
  channel: "account",
  initial,
  input: {
    enabledSet: enabledSetValidator,
    labelSet: labelSetValidator,
    officialOpen: readValidator,
    read: readValidator,
  },
  webAccessValidator,
  messageValidator,
  requestValidator,
  resultValidator,
};

const accountStore: ImmerStateCreator<
  AccountSlice,
  nodeState_t
> = (set, get) => {
  let officialPartition: string | undefined;
  let officialWindow: Awaited<ReturnType<typeof BrowserPartitionWindow.open>> | undefined;
  const stateSend = (): void => get().webContents?.send(
    account.channel,
    messageValidator.parse({ method: "stateUpdated", value: get().account }),
  );
  return ({
  account: structuredClone(initial),
  accountActions: {
    accountSet(input) {
      const value = accountValidator.parse(input);
      set(state => {
        if (value.enabled) {
          for (const current of Object.values(state.account)) {
            current.enabled = false;
          }
        }
        state.account[value.id] = value;
      });
      stateSend();
    },
    accountDelete(input) {
      const { accountId } = readValidator.parse(input);
      set(state => {
        delete state.account[accountId];
      });
      stateSend();
    },
    communicationStart() {
      const contents = get().webContents;
      if (!contents || contents.isDestroyed()) throw new Error("WebContents 不可用");
      contents.ipc.handle(account.channel, async (_event, input: unknown) => {
        const requestValue = account.requestValidator.parse(input);
        switch (requestValue.method) {
        case "stateRead":
          return account.accountStateValidator.parse(get().account);
        case "labelSet":
          get().accountActions.labelSet(requestValue);
          break;
        case "officialOpen":
          await get().accountActions.officialOpen(requestValue);
          break;
        }
        return account.resultValidator.parse({ ok: true });
      });
      return () => contents.ipc.removeHandler(account.channel);
    },
    enabledClear() {
      set(state => {
        for (const item of Object.values(state.account)) item.enabled = false;
      });
      stateSend();
    },
    dispose() {
      officialWindow?.dispose();
      officialWindow = undefined;
      officialPartition = undefined;
    },
    normalize() {
      const value = accountStateValidator.parse(get().account);
      set(state => {
        state.account = value;
      });
      stateSend();
    },
    labelSet(input) {
      const value = labelSetValidator.parse(input);
      set(state => {
        const current = state.account[value.accountId];
        if (!current) throw new Error(`账号不存在: ${value.accountId}`);
        current.label = value.label;
      });
      stateSend();
    },
    enabledSet(input) {
      const value = enabledSetValidator.parse(input);
      set(state => {
        const current = state.account[value.accountId];
        if (!current) throw new Error(`账号不存在: ${value.accountId}`);
        if (!value.enabled) return;
        for (const item of Object.values(state.account)) {
          item.enabled = item.id === value.accountId;
        }
      });
      stateSend();
    },
    async officialOpen(input) {
      const { accountId } = readValidator.parse(input);
      const selected = get().account[accountId];
      if (!selected) throw new Error(`账号不存在：${accountId}`);
      if (!selected.webAccess) throw new Error("该账号没有内嵌网页登录会话");
      const partition = selected.webAccess.partition;
      if (officialWindow && officialPartition === partition) {
        await officialWindow.show();
        return;
      }
      officialWindow?.dispose();
      const contents = get().webContents;
      if (!contents || contents.isDestroyed()) throw new Error("账号管理窗口不可用");
      const parent = get().electronBrowserWindow.fromWebContents(contents);
      if (!parent) throw new Error("无法取得账号管理窗口");
      let created: Awaited<ReturnType<typeof BrowserPartitionWindow.open>> | undefined;
      created = await get().browserPartitionWindow.open({
        height: 780,
        minHeight: 520,
        minWidth: 760,
        onClose: () => {
          if (officialWindow !== created) return;
          officialWindow = undefined;
          officialPartition = undefined;
        },
        parent,
        partition,
        title: "ChatGPT",
        url: "https://chatgpt.com/",
        width: 1100,
      });
      officialWindow = created;
      officialPartition = partition;
    },
  },
  });
};

export {
  account,
  type Account,
  type AccountReadInput,
  type AccountSlice,
  type AccountState,
  type EnabledSetInput,
  type LabelSetInput,
  type nodeState_t,
  type WebAccess,
};
export default accountStore;
