import { app, ipcMain, type IpcMainInvokeEvent, type WebContents } from "electron";
import { isAbsolute, join, resolve } from "node:path";
import { pause as accountListPause, resume as accountListResume } from "../accountList/index.ts";
import { codexHomeMove, pathSame } from "../process.ts";
import store from "../store.ts";
import { globalSettings } from "./store.ts";

let renderer: WebContents | undefined;
const rendererSet = (event: IpcMainInvokeEvent): void => {
  renderer = event.sender;
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

const codexHomeDelete = async (): Promise<void> => {
    if (store.getState().authJsonImport.status === "working") {
      throw new Error("账号添加期间不能删除 CODEX_HOME 配置");
    }
    await accountListPause();
    try {
      store.getState().globalSettingsActions.codexHomeDelete();
      store.getState().accountActions.enabledClear();
    } finally {
      accountListResume();
    }
};

const codexHomeDefaultRestore = async (): Promise<void> => {
    await codexHomeSet({
      codexHome: join(app.getPath("home"), ".codex"),
    });
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
    const stateRead = () => globalSettings.globalSettingsValidator.parse(
      store.getState().globalSettings,
    );
    ipcMain.handle(globalSettings.channel.codexHomeSet, async (event, input: unknown) => {
      rendererSet(event);
      await codexHomeSet(input);
      return globalSettings.resultValidator.parse({ ok: true });
    });
    ipcMain.handle(globalSettings.channel.codexHomeDefaultRestore, async (event, input: unknown) => {
      rendererSet(event);
      globalSettings.input.command.parse(input);
      await codexHomeDefaultRestore();
      return globalSettings.resultValidator.parse({ ok: true });
    });
    ipcMain.handle(globalSettings.channel.codexHomeDelete, async (event, input: unknown) => {
      rendererSet(event);
      globalSettings.input.command.parse(input);
      await codexHomeDelete();
      return globalSettings.resultValidator.parse({ ok: true });
    });
    ipcMain.handle(globalSettings.channel.maintenanceEnabledSet, (event, input: unknown) => {
      rendererSet(event);
      store.getState().globalSettingsActions.maintenanceEnabledSet(
        globalSettings.input.maintenanceEnabledSet.parse(input),
      );
      return globalSettings.resultValidator.parse({ ok: true });
    });
    ipcMain.handle(globalSettings.channel.maintenanceIntervalHoursSet, (event, input: unknown) => {
      rendererSet(event);
      store.getState().globalSettingsActions.maintenanceIntervalHoursSet(
        globalSettings.input.maintenanceIntervalHoursSet.parse(input),
      );
      return globalSettings.resultValidator.parse({ ok: true });
    });
    ipcMain.handle(globalSettings.channel.maintenanceRetryCountSet, (event, input: unknown) => {
      rendererSet(event);
      store.getState().globalSettingsActions.maintenanceRetryCountSet(
        globalSettings.input.maintenanceRetryCountSet.parse(input),
      );
      return globalSettings.resultValidator.parse({ ok: true });
    });
    ipcMain.handle(
      globalSettings.channel.maintenanceRetryIntervalMinutesSet,
      (event, input: unknown) => {
        rendererSet(event);
        store.getState().globalSettingsActions.maintenanceRetryIntervalMinutesSet(
          globalSettings.input.maintenanceRetryIntervalMinutesSet.parse(input),
        );
        return globalSettings.resultValidator.parse({ ok: true });
      },
    );
    ipcMain.handle(globalSettings.channel.stateRead, event => {
      rendererSet(event);
      return stateRead();
    });
    const unsubscribe = store.subscribe((state, previous) => {
      if (
        state.globalSettings !== previous.globalSettings
        && renderer
        && !renderer.isDestroyed()
      ) renderer.send(globalSettings.channel.stateUpdated, stateRead());
    });
    return () => {
      unsubscribe();
      renderer = undefined;
      ipcMain.removeHandler(globalSettings.channel.codexHomeDefaultRestore);
      ipcMain.removeHandler(globalSettings.channel.codexHomeDelete);
      ipcMain.removeHandler(globalSettings.channel.codexHomeSet);
      ipcMain.removeHandler(globalSettings.channel.maintenanceEnabledSet);
      ipcMain.removeHandler(globalSettings.channel.maintenanceIntervalHoursSet);
      ipcMain.removeHandler(globalSettings.channel.maintenanceRetryCountSet);
      ipcMain.removeHandler(globalSettings.channel.maintenanceRetryIntervalMinutesSet);
      ipcMain.removeHandler(globalSettings.channel.stateRead);
    };
};

export default install;
