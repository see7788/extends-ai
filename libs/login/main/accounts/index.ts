import {
  BrowserWindow as ElectronBrowserWindow,
  type IpcMainInvokeEvent,
} from "electron";
import BrowserPartitionWindow from "browser-partition-main/BrowserWindow/index.ts";
import store from "../store.ts";
import { accounts } from "./store.ts";

const parentRead = (event: IpcMainInvokeEvent): ElectronBrowserWindow => {
  const parent = ElectronBrowserWindow.fromWebContents(event.sender);
  if (!parent) throw new Error("无法取得 Login 父窗口");
  return parent;
};

const install = (): (() => void) => {
  const contents = store.getState().webContents;
  if (!contents || contents.isDestroyed()) {
    throw new Error("Login WebContents 不可用");
  }
  contents.ipc.handle(accounts.channel.cookieImportConsume, async (_event, input: unknown) => {
    accounts.input.command.parse(input);
    const candidate = store.getState().cookieImport.candidate;
    if (store.getState().cookieImport.status !== "ready" || !candidate) {
      throw new Error("没有待识别的浏览器登录态");
    }
    const value = await store.getState().accountsActions.candidateConsume({
      partition: candidate.partition,
      source: {
        browserId: candidate.browserId,
        browserName: candidate.browserName,
      },
    });
    store.getState().cookieImportActions.candidateClear({
      partition: candidate.partition,
    });
    return accounts.result.account.parse({ account: value });
  });
  contents.ipc.handle(accounts.channel.open, async (event, input: unknown) => (
    accounts.result.command.parse({
      completed: await store.getState().accountsActions.open(
        input,
        parentRead(event),
      ),
    })
  ));
  contents.ipc.handle(accounts.channel.remove, async (_event, input: unknown) => {
    const value = accounts.input.email.parse(input);
    const sources = store.getState().accounts.byEmail[value.email]?.sources ?? [];
    const completed = await store.getState().accountsActions.remove(value);
    if (completed) {
      for (const source of sources) {
        const candidatePartition = store.getState().cookieImportActions.historyRemove({
          browserId: source.browserId,
        });
        if (candidatePartition) {
          await BrowserPartitionWindow.storageClear(candidatePartition).catch(() => undefined);
        }
      }
    }
    return accounts.result.command.parse({ completed });
  });
  contents.ipc.handle(accounts.channel.validate, async (_event, input: unknown) => (
    accounts.result.command.parse({
      completed: await store.getState().accountsActions.validate(input),
    })
  ));
  contents.ipc.handle(accounts.channel.stateRead, () => (
    accounts.accountsValidator.parse(store.getState().accounts)
  ));
  return () => {
    store.getState().accountsActions.dispose();
    contents.ipc.removeHandler(accounts.channel.cookieImportConsume);
    contents.ipc.removeHandler(accounts.channel.open);
    contents.ipc.removeHandler(accounts.channel.remove);
    contents.ipc.removeHandler(accounts.channel.stateRead);
    contents.ipc.removeHandler(accounts.channel.validate);
  };
};

export default install;
