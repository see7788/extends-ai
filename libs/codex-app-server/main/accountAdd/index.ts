import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  app,
  BrowserWindow as ElectronBrowserWindow,
  ipcMain,
  type IpcMainInvokeEvent,
  type WebContents,
} from "electron";
import { errorText } from "../public.ts";
import { accountAuthPath, authFileCopy, authFileCopySync } from "../process.ts";
import store from "../store.ts";
import {
  pause as accountListPause,
  refresh as accountListRefresh,
  resume as accountListResume,
} from "../accountList/index.ts";
import { enabledSet } from "../accountList/account/index.ts";
import authJsonCreateRun from "./authJsonCreate/index.ts";
import { authJsonCreate } from "./authJsonCreate/store.ts";
import authJsonImportRun, {
  importClipboard,
  importDefault,
  importPath,
  selectPath,
} from "./authJsonImport/index.ts";
import { authJsonImport } from "./authJsonImport/store.ts";

type AccountOperationActions = {
  operationCancel(): void;
  operationFail(input: { error: string }): void;
  operationStart(input: { previousAccountId: string | null }): void;
  operationSucceed(): void;
};
let renderer: WebContents | undefined;

const rendererSet = (event: IpcMainInvokeEvent): void => {
  renderer = event.sender;
};
const parentRead = (event: IpcMainInvokeEvent): ElectronBrowserWindow => {
  const parent = ElectronBrowserWindow.fromWebContents(event.sender);
  if (!parent) throw new Error("无法取得账号管理窗口");
  return parent;
};
const canceled = (error: unknown): boolean => (
  error instanceof Error && error.name === "AbortError"
);
const enabledAccountIdRead = (): string | null => (
  Object.values(store.getState().account).find(account => account.enabled)?.id ?? null
);
const codexHomeRead = (): string => {
  const codexHome = store.getState().globalSettings.codexHome;
  if (!codexHome) throw new Error("请先配置 CODEX_HOME");
  return codexHome;
};
const enabledAccountRestore = async (accountId: string | null): Promise<void> => {
  const actions = store.getState().accountActions;
  if (accountId && store.getState().account[accountId]) {
    await enabledSet({ accountId, enabled: true });
    return;
  }
  actions.enabledClear();
};
const enabledAccountRestoreSync = (accountId: string | null): void => {
  const actions = store.getState().accountActions;
  const account = accountId ? store.getState().account[accountId] : undefined;
  const codexHome = store.getState().globalSettings.codexHome;
  if (account && codexHome) {
    const backupAuth = accountAuthPath(app.getPath("userData"), account.id);
    if (existsSync(backupAuth)) {
      authFileCopySync(backupAuth, join(codexHome, "auth.json"));
      actions.enabledSet({ accountId: account.id, enabled: true });
      return;
    }
  }
  actions.enabledClear();
};
const accountRun = async (
  run: () => Promise<string>,
  actions?: AccountOperationActions,
): Promise<string> => {
  const codexHome = codexHomeRead();
  await accountListPause();
  try {
    const previousAccountId = enabledAccountIdRead();
    const materializedAuth = join(codexHome, "auth.json");
    if (previousAccountId && existsSync(materializedAuth)) {
      await authFileCopy(
        materializedAuth,
        accountAuthPath(app.getPath("userData"), previousAccountId),
      );
    }
    actions?.operationStart({ previousAccountId });
    try {
      store.getState().accountActions.enabledClear();
      const accountId = await run();
      await enabledSet({ accountId, enabled: true });
      actions?.operationSucceed();
      void accountListRefresh();
      return accountId;
    } catch (error) {
      await enabledAccountRestore(previousAccountId);
      if (canceled(error)) actions?.operationCancel();
      else actions?.operationFail({ error: errorText(error) });
      throw error;
    }
  } finally {
    accountListResume();
  }
};
const send = (channel: string, value: unknown): void => {
  if (renderer && !renderer.isDestroyed()) renderer.send(channel, value);
};
const install = (): (() => void) => {
    const interrupted = [store.getState().authJsonImport]
      .find(value => value.status === "working");
    if (interrupted) enabledAccountRestoreSync(interrupted.previousAccountId);
    store.getState().authJsonImportActions.operationCancel();

    ipcMain.handle(authJsonCreate.channel.create, async (event, input: unknown) => {
      rendererSet(event);
      const carrier = authJsonCreate.input.create.parse(input);
      const actions = store.getState().authJsonCreateActions;
      const imported = await store.getState().authJsonImportActions.run({
        type: "authJsonCreate",
        execute: async signal => {
          actions.operationStart(carrier);
          const controller = new AbortController();
          const timeout = setTimeout(
            () => controller.abort(),
            store.getState().authJsonCreate.authorizationTimeoutSeconds * 1_000,
          );
          signal.addEventListener("abort", () => controller.abort(), { once: true });
          try {
            const accountId = await accountRun(async () => {
              const result = await authJsonCreateRun({ carrier, controller });
              return authJsonImportRun(result.source);
            });
            actions.operationSucceed();
            return accountId;
          } catch (error) {
            actions.operationCancel();
            throw error;
          } finally {
            clearTimeout(timeout);
          }
        },
      });
      return authJsonCreate.result.create.parse({
        created: imported !== undefined,
      });
    });
    ipcMain.handle(authJsonCreate.channel.cancel, (event, input: unknown) => {
      rendererSet(event);
      authJsonCreate.input.command.parse(input);
      return authJsonCreate.result.cancel.parse({
        canceled: store.getState().authJsonImportActions.cancel("authJsonCreate"),
      });
    });
    ipcMain.handle(authJsonCreate.channel.stateRead, event => {
      rendererSet(event);
      return authJsonCreate.authJsonCreateValidator.parse(store.getState().authJsonCreate);
    });

    ipcMain.handle(authJsonImport.channel.clipboard, async (event, input: unknown) => {
      rendererSet(event);
      authJsonImport.input.command.parse(input);
      const imported = await store.getState().authJsonImportActions.run({
        type: "authJsonImport",
        execute: () => accountRun(
          () => importClipboard(),
          store.getState().authJsonImportActions,
        ),
      });
      return authJsonImport.result.import.parse({ imported: imported !== undefined });
    });
    ipcMain.handle(authJsonImport.channel.default, async (event, input: unknown) => {
      rendererSet(event);
      authJsonImport.input.command.parse(input);
      const imported = await store.getState().authJsonImportActions.run({
        type: "authJsonImport",
        execute: () => accountRun(
          () => importDefault(),
          store.getState().authJsonImportActions,
        ),
      });
      return authJsonImport.result.import.parse({ imported: imported !== undefined });
    });
    ipcMain.handle(authJsonImport.channel.select, async (event, input: unknown) => {
      rendererSet(event);
      authJsonImport.input.command.parse(input);
      const sourcePath = await selectPath(parentRead(event));
      if (!sourcePath) return authJsonImport.result.import.parse({ imported: false });
      const imported = await store.getState().authJsonImportActions.run({
        type: "authJsonImport",
        execute: () => accountRun(
          () => importPath(sourcePath),
          store.getState().authJsonImportActions,
        ),
      });
      return authJsonImport.result.import.parse({ imported: imported !== undefined });
    });
    ipcMain.handle(authJsonImport.channel.stateRead, event => {
      rendererSet(event);
      return authJsonImport.authJsonImportValidator.parse(store.getState().authJsonImport);
    });

    const unsubscribe = store.subscribe((state, previous) => {
      if (state.authJsonCreate !== previous.authJsonCreate) {
        send(
          authJsonCreate.channel.stateUpdated,
          authJsonCreate.authJsonCreateValidator.parse(state.authJsonCreate),
        );
      }
      if (state.authJsonImport !== previous.authJsonImport) {
        send(
          authJsonImport.channel.stateUpdated,
          authJsonImport.authJsonImportValidator.parse(state.authJsonImport),
        );
      }
    });
    return () => {
      store.getState().authJsonImportActions.dispose();
      unsubscribe();
      renderer = undefined;
      ipcMain.removeHandler(authJsonCreate.channel.cancel);
      ipcMain.removeHandler(authJsonCreate.channel.create);
      ipcMain.removeHandler(authJsonCreate.channel.stateRead);
      ipcMain.removeHandler(authJsonImport.channel.clipboard);
      ipcMain.removeHandler(authJsonImport.channel.default);
      ipcMain.removeHandler(authJsonImport.channel.select);
      ipcMain.removeHandler(authJsonImport.channel.stateRead);
    };
};

export default install;
