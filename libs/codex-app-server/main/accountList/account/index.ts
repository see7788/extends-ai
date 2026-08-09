import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  app,
  BrowserWindow as ElectronBrowserWindow,
  ipcMain,
  type IpcMainInvokeEvent,
  type WebContents,
} from "electron";
import { accountAuthPath, authFileCopy, authFileCopySync } from "../../process.ts";
import store from "../../store.ts";
import AccountBrowserWindow from "./BrowserWindow/index.ts";
import { account } from "./store.ts";

let renderer: WebContents | undefined;
const rendererSet = (event: IpcMainInvokeEvent): void => {
  renderer = event.sender;
};
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
    await AccountBrowserWindow.open(parent, selected.webAccess.partition);
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
    const stateRead = () => account.accountStateValidator.parse(store.getState().account);
    ipcMain.handle(account.channel.enabledSet, async (event, input: unknown) => {
      rendererSet(event);
      await enabledSet(input);
      return account.resultValidator.parse({ ok: true });
    });
    ipcMain.handle(account.channel.labelSet, (event, input: unknown) => {
      rendererSet(event);
      store.getState().accountActions.labelSet(account.input.labelSet.parse(input));
      return account.resultValidator.parse({ ok: true });
    });
    ipcMain.handle(account.channel.officialOpen, async (event, input: unknown) => {
      rendererSet(event);
      await officialOpen(input, parentRead(event));
      return account.resultValidator.parse({ ok: true });
    });
    ipcMain.handle(account.channel.stateRead, event => {
      rendererSet(event);
      return stateRead();
    });
    const unsubscribe = store.subscribe((state, previous) => {
      if (state.account !== previous.account && renderer && !renderer.isDestroyed()) {
        renderer.send(account.channel.stateUpdated, stateRead());
      }
    });
    return () => {
      unsubscribe();
      renderer = undefined;
      ipcMain.removeHandler(account.channel.enabledSet);
      ipcMain.removeHandler(account.channel.labelSet);
      ipcMain.removeHandler(account.channel.officialOpen);
      ipcMain.removeHandler(account.channel.stateRead);
    };
};

export default install;
