import {
  BrowserWindow as ElectronBrowserWindow,
  ipcMain,
  type IpcMainInvokeEvent,
  type WebContents,
} from "electron";
import { randomUUID } from "node:crypto";
import BrowserPartitionWindow from "browser-partition-main/BrowserWindow/index.ts";
import store from "../store.ts";
import { login } from "./store.ts";

type Identify = (partition: string) => Promise<boolean>;
const parentRead = (event: IpcMainInvokeEvent): ElectronBrowserWindow => {
  const parent = ElectronBrowserWindow.fromWebContents(event.sender);
  if (!parent) throw new Error("无法取得 Login 父窗口");
  return parent;
};

const install = (identify: Identify): (() => void) => {
    const renderers = new Set<WebContents>();
    const rendererSet = (event: IpcMainInvokeEvent): void => {
      renderers.add(event.sender);
    };
    ipcMain.handle(login.channel.cancel, (event, input: unknown) => {
      rendererSet(event);
      login.input.command.parse(input);
      return login.result.cancel.parse({
        canceled: store.getState().loginActions.cancel(),
      });
    });
    ipcMain.handle(login.channel.start, async (event, input: unknown) => {
      rendererSet(event);
      login.input.command.parse(input);
      try {
        await store.getState().loginActions.create(parentRead(event), identify, {
          idCreate: randomUUID,
          storageClear: BrowserPartitionWindow.storageClear,
          windowOpen: async value => {
            const window = await BrowserPartitionWindow.open({
              height: 760,
              minHeight: 520,
              minWidth: 760,
              onClose: value.onClose,
              parent: value.parent as ElectronBrowserWindow,
              partition: value.partition,
              title: "ChatGPT.com",
              url: "https://chatgpt.com/",
              width: 920,
            });
            return {
              contents: {
                cookies: window.value.webContents.session.cookies,
                on: window.value.webContents.on.bind(window.value.webContents),
                removeListener: window.value.webContents.removeListener.bind(
                  window.value.webContents,
                ),
              },
              dispose: () => window.dispose(),
            };
          },
        });
        return login.result.start.parse({ completed: true });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return login.result.start.parse({ completed: false });
        }
        throw error;
      }
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
      store.getState().loginActions.cancel();
      unsubscribe();
      renderers.clear();
      ipcMain.removeHandler(login.channel.cancel);
      ipcMain.removeHandler(login.channel.start);
      ipcMain.removeHandler(login.channel.stateRead);
    };
};

export default install;
