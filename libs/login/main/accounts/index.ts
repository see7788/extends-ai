import {
  BrowserWindow as ElectronBrowserWindow,
  ipcMain,
  type IpcMainInvokeEvent,
  type WebContents,
} from "electron";
import store from "../store.ts";
import { accounts } from "./store.ts";

type AccountsRuntime = Parameters<
  ReturnType<typeof store.getState>["accountsActions"]["candidateConsume"]
>[1];

const parentRead = (event: IpcMainInvokeEvent): ElectronBrowserWindow => {
  const parent = ElectronBrowserWindow.fromWebContents(event.sender);
  if (!parent) throw new Error("无法取得 Login 父窗口");
  return parent;
};

const install = (runtime: AccountsRuntime): (() => void) => {
  const renderers = new Set<WebContents>();
  const rendererSet = (event: IpcMainInvokeEvent): void => {
    renderers.add(event.sender);
  };
  ipcMain.handle(accounts.channel.cookieImportConsume, async (event, input: unknown) => {
    rendererSet(event);
    accounts.input.command.parse(input);
    const candidate = store.getState().cookieImport.candidate;
    if (store.getState().cookieImport.status !== "ready" || !candidate) {
      throw new Error("没有待识别的浏览器登录态");
    }
    try {
      return accounts.result.account.parse({
        account: await store.getState().accountsActions.candidateConsume({
          partition: candidate.partition,
          source: {
            browserId: candidate.browserId,
            browserName: candidate.browserName,
          },
        }, runtime),
      });
    } finally {
      store.getState().cookieImportActions.candidateClear({
        partition: candidate.partition,
      });
    }
  });
  ipcMain.handle(accounts.channel.open, async (event, input: unknown) => {
    rendererSet(event);
    return accounts.result.command.parse({
      completed: await store.getState().accountsActions.open(
        input,
        parentRead(event),
        runtime,
      ),
    });
  });
  ipcMain.handle(accounts.channel.remove, async (event, input: unknown) => {
    rendererSet(event);
    return accounts.result.command.parse({
      completed: await store.getState().accountsActions.remove(input, runtime),
    });
  });
  ipcMain.handle(accounts.channel.validate, async (event, input: unknown) => {
    rendererSet(event);
    return accounts.result.command.parse({
      completed: await store.getState().accountsActions.validate(input, runtime),
    });
  });
  ipcMain.handle(accounts.channel.stateRead, event => {
    rendererSet(event);
    return accounts.accountsValidator.parse(store.getState().accounts);
  });
  const unsubscribe = store.subscribe((state, previous) => {
    if (state.accounts === previous.accounts) return;
    const value = accounts.accountsValidator.parse(state.accounts);
    for (const renderer of renderers) {
      if (renderer.isDestroyed()) renderers.delete(renderer);
      else renderer.send(accounts.channel.stateUpdated, value);
    }
  });
  return () => {
    store.getState().accountsActions.dispose();
    unsubscribe();
    renderers.clear();
    ipcMain.removeHandler(accounts.channel.cookieImportConsume);
    ipcMain.removeHandler(accounts.channel.open);
    ipcMain.removeHandler(accounts.channel.remove);
    ipcMain.removeHandler(accounts.channel.stateRead);
    ipcMain.removeHandler(accounts.channel.validate);
  };
};

export default install;
