import { app } from "electron";
import { errorText } from "../../public.ts";
import { accountAuthPath } from "../../process.ts";
import store from "../../store.ts";
import { authSessions } from "./store.ts";

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
  const storeDispose = store.getState().authSessionsActions.install();
  const contents = store.getState().webContents;
  if (!contents || contents.isDestroyed()) {
    throw new Error("CodexAppServer WebContents 不可用");
  }
  contents.ipc.handle(authSessions.channel.read, async (_event, input: unknown) => {
    await read(input);
    return authSessions.resultValidator.parse({ ok: true });
  });
  return () => {
    contents.ipc.removeHandler(authSessions.channel.read);
    storeDispose();
  };
};

export default install;
