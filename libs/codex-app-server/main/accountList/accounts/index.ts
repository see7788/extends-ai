import { ipcMain, type IpcMainInvokeEvent, type WebContents } from "electron";
import store from "../../store.ts";
import accountIndex from "../account/index.ts";
import { accounts } from "./store.ts";

let renderer: WebContents | undefined;
const rendererSet = (event: IpcMainInvokeEvent): void => {
  renderer = event.sender;
};

const accountsIndex = {
  read() {
    return accounts.stateValidator.parse(store.getState().accounts);
  },
  async delete(input: unknown): Promise<void> {
    const value = accounts.input.accountDelete.parse(input);
    const current = store.getState().account[value.accountId];
    if (current?.enabled) {
      const replacement = store.getState().accounts.order.find(
        accountId => accountId !== value.accountId && store.getState().account[accountId],
      );
      if (replacement) {
        await accountIndex.enabledSet({ accountId: replacement, enabled: true });
      }
    }
    store.getState().accountsActions.accountDelete(value);
    store.getState().accountActions.accountDelete(value);
    store.getState().authSessionsActions.accountDelete(value);
    store.getState().rateLimitsActions.accountDelete(value);
    store.getState().usageActions.accountDelete(value);
  },
  install(): () => void {
    ipcMain.handle(accounts.channel.accountDelete, async (event, input: unknown) => {
      rendererSet(event);
      await accountsIndex.delete(input);
      return accounts.resultValidator.parse({ ok: true });
    });
    ipcMain.handle(accounts.channel.stateRead, event => {
      rendererSet(event);
      return accountsIndex.read();
    });
    const unsubscribe = store.subscribe((state, previous) => {
      if (state.accounts !== previous.accounts && renderer && !renderer.isDestroyed()) {
        renderer.send(accounts.channel.stateUpdated, accountsIndex.read());
      }
    });
    return () => {
      unsubscribe();
      renderer = undefined;
      ipcMain.removeHandler(accounts.channel.accountDelete);
      ipcMain.removeHandler(accounts.channel.stateRead);
    };
  },
};

export default accountsIndex;
