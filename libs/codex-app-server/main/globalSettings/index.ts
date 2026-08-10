import {
  app,
  BrowserWindow as ElectronBrowserWindow,
  dialog,
  type IpcMainInvokeEvent,
} from "electron";
import { isAbsolute, join, resolve } from "node:path";
import { pause as accountListPause, resume as accountListResume } from "../accountList/index.ts";
import { codexHomeMove, pathSame } from "../process.ts";
import store from "../store.ts";
import { globalSettings } from "./store.ts";

const parentRead = (event: IpcMainInvokeEvent): ElectronBrowserWindow => {
  const parent = ElectronBrowserWindow.fromWebContents(event.sender);
  if (!parent) throw new Error("无法取得账号管理窗口");
  return parent;
};

const pathNormalize = (value: string): string => {
  if (!isAbsolute(value)) throw new Error(`CODEX_HOME 必须是绝对路径：${value}`);
  return resolve(value);
};

const codexHomeSet = async (input: unknown): Promise<void> => {
  const value = globalSettings.input.codexHomeSet.parse(input);
  const codexHome = pathNormalize(value.codexHome);
  const current = store.getState().globalSettings.codexHome;
  if (current && pathSame(current, codexHome)) return;
  if (store.getState().authJsonImport.status === "working") {
    throw new Error("账号添加期间不能迁移 CODEX_HOME");
  }
  await accountListPause();
  try {
    const result = await codexHomeMove(current, codexHome);
    store.getState().globalSettingsActions.codexHomeSet({ codexHome });
    if (result.oldPathCleanupFailed) {
      console.warn(`CODEX_HOME 已迁移，但原目录未能清理：${current ?? "未配置"}`);
    }
  } finally {
    accountListResume();
  }
};

export const codexHomeDefaultRestore = async (): Promise<void> => {
  await codexHomeSet({
    codexHome: join(app.getPath("home"), ".codex"),
  });
};

export const codexHomeSelect = async (input: unknown): Promise<void> => {
  const event = input as IpcMainInvokeEvent;
  const current = store.getState().globalSettings.codexHome;
  const result = await dialog.showOpenDialog(parentRead(event), {
    title: "选择 CODEX_HOME",
    buttonLabel: "选择",
    defaultPath: current ?? undefined,
    properties: ["openDirectory", "createDirectory"],
  });
  const codexHome = result.filePaths[0];
  if (!result.canceled && codexHome) await codexHomeSet({ codexHome });
};

export const initialize = (): void => {
  const current = store.getState().globalSettings;
  const codexHome = current.codexHome === ""
    ? join(app.getPath("home"), ".codex")
    : current.codexHome;
  store.getState().globalSettingsActions.initialize({
    codexHome: codexHome ? pathNormalize(codexHome) : null,
    maintenanceEnabled: current.maintenanceEnabled,
    maintenanceIntervalHours: current.maintenanceIntervalHours,
    maintenanceRetryCount: current.maintenanceRetryCount,
    maintenanceRetryIntervalMinutes: current.maintenanceRetryIntervalMinutes,
  });
};

const install = (): (() => void) => {
  const storeDispose = store.getState().globalSettingsActions.install();
  const contents = store.getState().webContents;
  if (!contents || contents.isDestroyed()) {
    throw new Error("CodexAppServer WebContents 不可用");
  }
  contents.ipc.handle(globalSettings.channel.codexHomeSelect, async (event, input: unknown) => {
    globalSettings.input.command.parse(input);
    await codexHomeSelect(event);
    return globalSettings.resultValidator.parse({ ok: true });
  });
  contents.ipc.handle(
    globalSettings.channel.codexHomeDefaultRestore,
    async (_event, input: unknown) => {
      globalSettings.input.command.parse(input);
      await codexHomeDefaultRestore();
      return globalSettings.resultValidator.parse({ ok: true });
    },
  );
  return () => {
    contents.ipc.removeHandler(globalSettings.channel.codexHomeDefaultRestore);
    contents.ipc.removeHandler(globalSettings.channel.codexHomeSelect);
    storeDispose();
  };
};

export default install;
