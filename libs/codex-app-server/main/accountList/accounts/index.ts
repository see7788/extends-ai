import store from "../../store.ts";
import { enabledSet } from "../account/index.ts";
import { accounts } from "./store.ts";

const read = () => {
    return accounts.stateValidator.parse(store.getState().accounts);
};

const accountDelete = async (input: unknown): Promise<void> => {
    const value = accounts.input.accountDelete.parse(input);
    const current = store.getState().account[value.accountId];
    if (current?.enabled) {
      const replacement = store.getState().accounts.order.find(
        accountId => accountId !== value.accountId && store.getState().account[accountId],
      );
      if (replacement) {
        await enabledSet({ accountId: replacement, enabled: true });
      }
    }
    store.getState().accountsActions.accountDelete(value);
    store.getState().accountActions.accountDelete(value);
    store.getState().authSessionsActions.accountDelete(value);
    store.getState().rateLimitsActions.accountDelete(value);
    store.getState().usageActions.accountDelete(value);
};

const install = (): (() => void) => {
    const contents = store.getState().webContents;
    if (!contents || contents.isDestroyed()) {
      throw new Error("CodexAppServer WebContents 不可用");
    }
    contents.ipc.handle(accounts.channel.accountDelete, async (_event, input: unknown) => {
      await accountDelete(input);
      return accounts.resultValidator.parse({ ok: true });
    });
    contents.ipc.handle(accounts.channel.stateRead, read);
    return () => {
      contents.ipc.removeHandler(accounts.channel.accountDelete);
      contents.ipc.removeHandler(accounts.channel.stateRead);
    };
};

export default install;
