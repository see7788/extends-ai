import { app, ipcMain, type IpcMainInvokeEvent, type WebContents } from "electron";
import { errorText } from "../../public.ts";
import { accountAuthPath } from "../../process.ts";
import store from "../../store.ts";
import { usage } from "./store.ts";

let renderer: WebContents | undefined;
const rendererSet = (event: IpcMainInvokeEvent): void => {
  renderer = event.sender;
};

export const read = async (input: unknown): Promise<void> => {
    const value = usage.input.command.parse(input);
    const account = store.getState().account[value.accountId];
    if (!account) throw new Error(`账号不存在：${value.accountId}`);
    store.getState().usageActions.loadingSet(value);
    try {
      const result = await store.getState().connectionActions.request({
        accountId: value.accountId,
        authFile: accountAuthPath(app.getPath("userData"), value.accountId),
        materializedCodexHome: account.enabled
          ? store.getState().globalSettings.codexHome ?? undefined
          : undefined,
        method: "account/usage/read",
        resultValidator: usage.resultValidator,
      });
      store.getState().usageActions.resultSet({
        accountId: value.accountId,
        result,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      store.getState().usageActions.errorSet({
        accountId: value.accountId,
        error: errorText(error),
      });
      throw error;
    }
};

const install = (): (() => void) => {
    const stateRead = () => usage.usageValidator.parse(store.getState().usage);
    ipcMain.handle(usage.channel.read, async (event, input: unknown) => {
      rendererSet(event);
      await read(input);
      return usage.commandResultValidator.parse({ ok: true });
    });
    ipcMain.handle(usage.channel.stateRead, event => {
      rendererSet(event);
      return stateRead();
    });
    const unsubscribe = store.subscribe((state, previous) => {
      if (state.usage !== previous.usage && renderer && !renderer.isDestroyed()) {
        renderer.send(usage.channel.stateUpdated, stateRead());
      }
    });
    return () => {
      unsubscribe();
      renderer = undefined;
      ipcMain.removeHandler(usage.channel.read);
      ipcMain.removeHandler(usage.channel.stateRead);
    };
};

export default install;
