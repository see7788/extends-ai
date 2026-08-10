import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  app,
  BrowserWindow as ElectronBrowserWindow,
  type IpcMainInvokeEvent,
} from "electron";
import BrowserPartitionWindow from "browser-partition-main/BrowserWindow/index.ts";
import { accountAuthPath, authFileCopy, authFileCopySync } from "../../process.ts";
import store from "../../store.ts";
import { account } from "./store.ts";

const officialUrl = "https://chatgpt.com/";
let officialPartition: string | undefined;
let officialWindow: BrowserPartitionWindow | undefined;

const parentRead = (event: IpcMainInvokeEvent): ElectronBrowserWindow => {
  const parent = ElectronBrowserWindow.fromWebContents(event.sender);
  if (!parent) throw new Error("无法取得账号管理窗口");
  return parent;
};

const officialOpen = async (
  input: unknown,
  parent: ElectronBrowserWindow,
): Promise<void> => {
    const { accountId } = account.input.officialOpen.parse(input);
    const selected = store.getState().account[accountId];
    if (!selected) throw new Error(`账号不存在：${accountId}`);
    if (!selected.webAccess) {
      throw new Error("该账号没有内嵌网页登录会话，请通过内嵌 ChatGPT 登录重新添加");
    }
    const partition = selected.webAccess.partition;
    if (officialWindow && officialPartition === partition) {
      await officialWindow.show();
      return;
    }
    officialWindow?.dispose();
    officialWindow = undefined;
    officialPartition = undefined;
    let created: BrowserPartitionWindow | undefined;
    created = await BrowserPartitionWindow.open({
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
      url: officialUrl,
      width: 1100,
    });
    officialWindow = created;
    officialPartition = partition;
};

export const enabledSet = async (input: unknown): Promise<void> => {
    const value = account.input.enabledSet.parse(input);
    if (!value.enabled) return;
    const selected = store.getState().account[value.accountId];
    if (!selected) throw new Error(`账号不存在：${value.accountId}`);
    const codexHome = store.getState().globalSettings.codexHome;
    if (!codexHome) throw new Error("请先配置 CODEX_HOME");
    const materializedAuth = join(codexHome, "auth.json");
    const current = Object.values(store.getState().account).find(item => item.enabled);
    if (current && current.id !== value.accountId && existsSync(materializedAuth)) {
      await authFileCopy(
        materializedAuth,
        accountAuthPath(app.getPath("userData"), current.id),
      );
    }
    await authFileCopy(
      accountAuthPath(app.getPath("userData"), value.accountId),
      materializedAuth,
    );
    store.getState().accountActions.enabledSet(value);
};

export const initialize = (): void => {
    store.getState().accountActions.normalize();
    const enabled = Object.values(store.getState().account).find(value => value.enabled);
    const codexHome = store.getState().globalSettings.codexHome;
    if (!enabled || !codexHome) return;
    const materializedAuth = join(codexHome, "auth.json");
    const backupAuth = accountAuthPath(app.getPath("userData"), enabled.id);
    if (!existsSync(materializedAuth) && existsSync(backupAuth)) {
      authFileCopySync(backupAuth, materializedAuth);
    }
};

const install = (): (() => void) => {
    const contents = store.getState().webContents;
    if (!contents || contents.isDestroyed()) {
      throw new Error("CodexAppServer WebContents 不可用");
    }
    const stateRead = () => account.accountStateValidator.parse(store.getState().account);
    contents.ipc.handle(account.channel.enabledSet, async (_event, input: unknown) => {
      await enabledSet(input);
      return account.resultValidator.parse({ ok: true });
    });
    contents.ipc.handle(account.channel.labelSet, (_event, input: unknown) => {
      store.getState().accountActions.labelSet(account.input.labelSet.parse(input));
      return account.resultValidator.parse({ ok: true });
    });
    contents.ipc.handle(account.channel.officialOpen, async (event, input: unknown) => {
      await officialOpen(input, parentRead(event));
      return account.resultValidator.parse({ ok: true });
    });
    contents.ipc.handle(account.channel.stateRead, stateRead);
    return () => {
      officialWindow?.dispose();
      officialWindow = undefined;
      officialPartition = undefined;
      contents.ipc.removeHandler(account.channel.enabledSet);
      contents.ipc.removeHandler(account.channel.labelSet);
      contents.ipc.removeHandler(account.channel.officialOpen);
      contents.ipc.removeHandler(account.channel.stateRead);
    };
};

export default install;
