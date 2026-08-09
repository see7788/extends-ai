import { randomUUID } from "node:crypto";
import {
  BrowserWindow as ElectronBrowserWindow,
  ipcMain,
  type IpcMainInvokeEvent,
  type WebContents,
} from "electron";
import BrowserPartitionWindow from "browser-partition-main/BrowserWindow/index.ts";
import store from "../store.ts";
import { login } from "./store.ts";

const canceledError = (): Error => {
  const error = new Error("内嵌登录已取消");
  error.name = "AbortError";
  return error;
};
type Active = {
  cancel(): void;
};
let active: Active | undefined;
const parentRead = (event: IpcMainInvokeEvent): ElectronBrowserWindow => {
  const parent = ElectronBrowserWindow.fromWebContents(event.sender);
  if (!parent) throw new Error("无法取得 Login 父窗口");
  return parent;
};

const loginIndex = {
  cancel(): boolean {
    if (!active) return false;
    active.cancel();
    return true;
  },
  create(parent: ElectronBrowserWindow): Promise<{ partition: string }> {
    if (active) throw new Error("已有内嵌登录窗口正在使用");
    if (store.getState().login.status === "ready") {
      throw new Error("已有待识别的内嵌登录态");
    }
    const partition = `persist:login.chatgpt.${randomUUID()}`;
    store.getState().loginActions.operationStart({ partition });
    return new Promise((resolve, reject) => {
      let settled = false;
      let window: BrowserPartitionWindow | undefined;
      const finish = (error?: Error): void => {
        if (settled) return;
        settled = true;
        active = undefined;
        if (error) {
          store.getState().loginActions.operationCancel();
          window?.dispose();
          void BrowserPartitionWindow.storageClear(partition).catch(() => undefined);
          reject(error);
        } else {
          store.getState().loginActions.operationSucceed();
          resolve({ partition });
        }
      };
      active = { cancel: () => finish(canceledError()) };
      void BrowserPartitionWindow.open({
        height: 760,
        minHeight: 520,
        minWidth: 760,
        onClose: () => finish(),
        parent,
        partition,
        title: "ChatGPT.com",
        url: "https://chatgpt.com/",
        width: 920,
      }).then(value => {
        window = value;
        if (settled) value.dispose();
      }).catch(error => finish(error instanceof Error ? error : new Error(String(error))));
    });
  },
  install(): () => void {
    const renderers = new Set<WebContents>();
    const rendererSet = (event: IpcMainInvokeEvent): void => {
      renderers.add(event.sender);
    };
    ipcMain.handle(login.channel.cancel, (event, input: unknown) => {
      rendererSet(event);
      login.input.command.parse(input);
      return login.result.cancel.parse({ canceled: loginIndex.cancel() });
    });
    ipcMain.handle(login.channel.start, async (event, input: unknown) => {
      rendererSet(event);
      login.input.command.parse(input);
      await loginIndex.create(parentRead(event));
      return login.result.start.parse({ completed: true });
    });
    ipcMain.handle(login.channel.stateRead, event => {
      rendererSet(event);
      return login.loginValidator.parse(store.getState().login);
    });
    const unsubscribe = store.subscribe((state, previous) => {
      if (state.login === previous.login) return;
      const value = login.loginValidator.parse(state.login);
      for (const renderer of renderers) {
        if (renderer.isDestroyed()) renderers.delete(renderer);
        else renderer.send(login.channel.stateUpdated, value);
      }
    });
    return () => {
      loginIndex.cancel();
      unsubscribe();
      renderers.clear();
      ipcMain.removeHandler(login.channel.cancel);
      ipcMain.removeHandler(login.channel.start);
      ipcMain.removeHandler(login.channel.stateRead);
    };
  },
};

export default loginIndex;
