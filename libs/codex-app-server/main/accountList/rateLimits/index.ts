import { app, ipcMain, type IpcMainInvokeEvent, type WebContents } from "electron";
import { errorText } from "../../public.ts";
import { accountAuthPath } from "../../process.ts";
import store from "../../store.ts";
import { rateLimits } from "./store.ts";

let renderer: WebContents | undefined;
const rendererSet = (event: IpcMainInvokeEvent): void => {
  renderer = event.sender;
};

const rateLimitsIndex = {
  async read(input: unknown): Promise<void> {
    const value = rateLimits.input.command.parse(input);
    const account = store.getState().account[value.accountId];
    if (!account) throw new Error(`账号不存在：${value.accountId}`);
    store.getState().rateLimitsActions.loadingSet(value);
    try {
      const result = await store.getState().connectionActions.request({
        accountId: value.accountId,
        authFile: accountAuthPath(app.getPath("userData"), value.accountId),
        materializedCodexHome: account.enabled
          ? store.getState().globalSettings.codexHome ?? undefined
          : undefined,
        method: "account/rateLimits/read",
        resultValidator: rateLimits.resultValidator,
      });
      store.getState().rateLimitsActions.resultSet({
        accountId: value.accountId,
        result,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      store.getState().rateLimitsActions.errorSet({
        accountId: value.accountId,
        error: errorText(error),
      });
      throw error;
    }
  },
  install(): () => void {
    const stateRead = () => rateLimits.rateLimitsValidator.parse(store.getState().rateLimits);
    ipcMain.handle(rateLimits.channel.read, async (event, input: unknown) => {
      rendererSet(event);
      await rateLimitsIndex.read(input);
      return rateLimits.commandResultValidator.parse({ ok: true });
    });
    ipcMain.handle(rateLimits.channel.stateRead, event => {
      rendererSet(event);
      return stateRead();
    });
    const unsubscribe = store.subscribe((state, previous) => {
      if (state.rateLimits !== previous.rateLimits && renderer && !renderer.isDestroyed()) {
        renderer.send(rateLimits.channel.stateUpdated, stateRead());
      }
    });
    return () => {
      unsubscribe();
      renderer = undefined;
      ipcMain.removeHandler(rateLimits.channel.read);
      ipcMain.removeHandler(rateLimits.channel.stateRead);
    };
  },
};

export default rateLimitsIndex;
