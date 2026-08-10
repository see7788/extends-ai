import { app } from "electron";
import { errorText } from "../../public.ts";
import { accountAuthPath } from "../../process.ts";
import store from "../../store.ts";
import { rateLimits } from "./store.ts";

export const read = async (input: unknown): Promise<void> => {
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
};

const install = (): (() => void) => {
  const storeDispose = store.getState().rateLimitsActions.install();
  const contents = store.getState().webContents;
  if (!contents || contents.isDestroyed()) {
    throw new Error("CodexAppServer WebContents 不可用");
  }
  contents.ipc.handle(rateLimits.channel.read, async (_event, input: unknown) => {
    await read(input);
    return rateLimits.commandResultValidator.parse({ ok: true });
  });
  return () => {
    contents.ipc.removeHandler(rateLimits.channel.read);
    storeDispose();
  };
};

export default install;
