import { app, ipcMain, type IpcMainInvokeEvent, type WebContents } from "electron";
import { errorText } from "../../public.ts";
import { accountAuthPath } from "../../process.ts";
import store from "../../store.ts";
import { authSessions } from "./store.ts";

let renderer: WebContents | undefined;
const rendererSet = (event: IpcMainInvokeEvent): void => {
  renderer = event.sender;
};
export const read = async (input: unknown): Promise<void> => {
  const value = authSessions.input.command.parse(input);
  const account = store.getState().account[value.accountId];
  if (!account) throw new Error(`账号不存在：${value.accountId}`);
  store.getState().authSessionsActions.loadingSet({
    accountId: value.accountId,
  });
  try {
    const result = await store.getState().connectionActions.request({
      accountId: value.accountId,
      authFile: accountAuthPath(app.getPath("userData"), value.accountId),
      materializedCodexHome: account.enabled
        ? store.getState().globalSettings.codexHome ?? undefined
        : undefined,
      method: "account/read",
      params: { refreshToken: false },
      resultValidator: authSessions.accountReadResultValidator,
    });
    store.getState().authSessionsActions.resultSet({
      accountId: value.accountId,
      checkedAt: new Date().toISOString(),
      result,
    });
  } catch (error) {
    store.getState().authSessionsActions.errorSet({
      accountId: value.accountId,
      checkedAt: new Date().toISOString(),
      error: errorText(error),
    });
    throw error;
  }
};

const install = (): (() => void) => {
    const stateRead = () => authSessions.authSessionsValidator.parse(
      store.getState().authSessions,
    );
    ipcMain.handle(authSessions.channel.read, async (event, input: unknown) => {
      rendererSet(event);
      await read(input);
      return authSessions.resultValidator.parse({ ok: true });
    });
    ipcMain.handle(authSessions.channel.stateRead, event => {
      rendererSet(event);
      return stateRead();
    });
    const unsubscribe = store.subscribe((state, previous) => {
      if (
        state.authSessions !== previous.authSessions
        && renderer
        && !renderer.isDestroyed()
      ) renderer.send(authSessions.channel.stateUpdated, stateRead());
    });
    return () => {
      unsubscribe();
      renderer = undefined;
      ipcMain.removeHandler(authSessions.channel.read);
      ipcMain.removeHandler(authSessions.channel.stateRead);
    };
};

export default install;
