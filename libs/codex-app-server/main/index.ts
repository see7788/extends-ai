import { app, BrowserWindow, dialog } from "electron";
import { browser } from "browser-partition-main/browser/store.ts";
import BrowserPartitionWindow from "browser-partition-main/BrowserWindow.ts";
import { randomUUID } from "node:crypto";
import { cp, mkdir, open, readdir, rename, rm, stat, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import process from "node:process";
import { authJsonCreate } from "./accountAdd/authJsonCreate/store.ts";
import { authJsonImport } from "./accountAdd/authJsonImport/store.ts";
import { account } from "./accountList/account/store.ts";
import { accounts } from "./accountList/accounts/store.ts";
import { authSessions } from "./accountList/authSessions/store.ts";
import { rateLimits } from "./accountList/rateLimits/store.ts";
import { scheduler } from "./accountList/scheduler/store.ts";
import { usage } from "./accountList/usage/store.ts";
import { globalSettings } from "./globalSettings/store.ts";
import store from "./store/index.ts";

const preloadPath = () => join(
  app.getAppPath(),
  "out",
  "preload",
  "browser-partition-preload.cjs",
);
const electronRendererUrlRead = (): string | undefined => {
  const value = process.env.ELECTRON_RENDERER_URL?.trim();
  if (!value) return undefined;
  return new URL(value).toString();
};
const pathExists = async (value: string): Promise<boolean> => {
  try {
    await stat(value);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
};
const pathSame = (left: string, right: string): boolean => process.platform === "win32"
  ? left.toLowerCase() === right.toLowerCase()
  : left === right;
const pathInside = (parent: string, child: string): boolean => {
  const value = relative(parent, child);
  return Boolean(value) && !value.startsWith("..") && !isAbsolute(value);
};
const directoryWritableAssert = async (directory: string): Promise<void> => {
  const probe = join(directory, `.codex-app-server-write-${randomUUID()}.tmp`);
  try {
    await mkdir(directory, { recursive: true });
    const handle = await open(probe, "wx");
    await handle.close();
    await unlink(probe);
  } catch (error) {
    await unlink(probe).catch(() => undefined);
    throw new Error(`目录不可写：${directory}`, { cause: error });
  }
};
const pathWritableAssert = async (value: string): Promise<void> => {
  let existing = value;
  while (!await pathExists(existing)) {
    const parent = dirname(existing);
    if (parent === existing) throw new Error(`找不到可写的父目录：${value}`);
    existing = parent;
  }
  const state = await stat(existing);
  if (!state.isDirectory()) throw new Error(`路径不是目录：${existing}`);
  await directoryWritableAssert(existing);
};
const codexHomeMove = async (
  source: string | null,
  target: string,
): Promise<{ oldPathCleanupFailed: boolean }> => {
  if (!source) {
    await pathWritableAssert(target);
    return { oldPathCleanupFailed: false };
  }
  if (pathSame(source, target)) return { oldPathCleanupFailed: false };
  if (pathInside(source, target) || pathInside(target, source)) {
    throw new Error("新旧 CODEX_HOME 不能互相嵌套");
  }
  await pathWritableAssert(target);
  if (!await pathExists(source)) return { oldPathCleanupFailed: false };
  if (!(await stat(source)).isDirectory()) throw new Error(`原 CODEX_HOME 不是目录：${source}`);
  if (await pathExists(target)) {
    if (!(await stat(target)).isDirectory()) throw new Error(`新 CODEX_HOME 不是目录：${target}`);
    if ((await readdir(target)).length > 0) throw new Error(`新 CODEX_HOME 不是空目录：${target}`);
    await rm(target, { recursive: true });
  }
  await mkdir(dirname(target), { recursive: true });
  try {
    await rename(source, target);
    return { oldPathCleanupFailed: false };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
  }
  try {
    await cp(source, target, { errorOnExist: true, force: false, recursive: true });
  } catch (error) {
    await rm(target, { force: true, recursive: true });
    throw new Error("CODEX_HOME 复制失败，原目录保持不变", { cause: error });
  }
  let oldPathCleanupFailed = false;
  await rm(source, { recursive: true }).catch(() => {
    oldPathCleanupFailed = true;
  });
  return { oldPathCleanupFailed };
};

class CodexAppServer {
  private disposed = false;
  private readonly disposeCommunication: Array<() => void>;
  private readonly ready: Promise<void>;
  private readonly window: BrowserWindow;

  constructor() {
    this.window = new BrowserWindow({
      autoHideMenuBar: true,
      width: 1100,
      height: 760,
      minWidth: 760,
      minHeight: 520,
      show: false,
      title: "Codex 账号管理",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        partition: "persist:codex-app-server",
        preload: preloadPath(),
        sandbox: true,
      },
    });
    store.setState({ webContents: this.window.webContents });
    store.getState().authJsonImportActions.operationCancel();
    const contents = this.window.webContents;
    let officialPartition: string | undefined;
    let officialWindow: BrowserPartitionWindow | undefined;
    contents.ipc.handle(browser.channel, async (_event, input: unknown) => {
      const request = browser.requestValidator.parse(input);
      switch (request.method) {
      case "applicationsRead":
        return browser.result.applicationsRead.parse(
          await store.getState().browserActions.applicationsRead(),
        );
      }
    });
    contents.ipc.handle(authSessions.channel, async (_event, input: unknown) => {
      const request = authSessions.requestValidator.parse(input);
      switch (request.method) {
      case "stateRead":
        return authSessions.authSessionsValidator.parse(store.getState().authSessions);
      case "read":
        await store.getState().accountListActions.authSessionsRead(request);
        return authSessions.resultValidator.parse({ ok: true });
      }
    });
    contents.ipc.handle(rateLimits.channel, async (_event, input: unknown) => {
      const request = rateLimits.requestValidator.parse(input);
      switch (request.method) {
      case "stateRead":
        return rateLimits.rateLimitsValidator.parse(store.getState().rateLimits);
      case "read":
        await store.getState().accountListActions.rateLimitsRead(request);
        return rateLimits.commandResultValidator.parse({ ok: true });
      }
    });
    contents.ipc.handle(usage.channel, async (_event, input: unknown) => {
      const request = usage.requestValidator.parse(input);
      switch (request.method) {
      case "stateRead":
        return usage.usageValidator.parse(store.getState().usage);
      case "read":
        await store.getState().accountListActions.usageRead(request);
        return usage.commandResultValidator.parse({ ok: true });
      }
    });
    contents.ipc.handle(scheduler.channel, async (_event, input: unknown) => {
      const request = scheduler.requestValidator.parse(input);
      switch (request.method) {
      case "stateRead":
        return scheduler.schedulerValidator.parse(store.getState().scheduler);
      case "runNow":
        await store.getState().accountListActions.runNow();
        return scheduler.commandResultValidator.parse({ ok: true });
      }
    });
    contents.ipc.handle(account.channel, async (event, input: unknown) => {
      const request = account.requestValidator.parse(input);
      if (request.method === "stateRead") {
        return account.accountStateValidator.parse(store.getState().account);
      }
      if (request.method === "enabledSet") {
        await store.getState().accountListActions.enabledSet(request);
        return account.resultValidator.parse({ ok: true });
      }
      if (request.method === "labelSet") {
        store.getState().accountActions.labelSet(request);
        return account.resultValidator.parse({ ok: true });
      }
      const { accountId } = request;
      const selected = store.getState().account[accountId];
      if (!selected) throw new Error(`账号不存在：${accountId}`);
      if (!selected.webAccess) throw new Error("该账号没有内嵌网页登录会话");
      const partition = selected.webAccess.partition;
      if (officialWindow && officialPartition === partition) {
        await officialWindow.show();
        return account.resultValidator.parse({ ok: true });
      }
      officialWindow?.dispose();
      const parent = BrowserWindow.fromWebContents(event.sender);
      if (!parent) throw new Error("无法取得账号管理窗口");
      let created: BrowserPartitionWindow | undefined;
      created = await BrowserPartitionWindow.open({
        height: 780,
        minHeight: 520,
        minWidth: 760,
        onClose: () => {
          if (officialWindow !== created) return;
          officialWindow = undefined;
          officialPartition = undefined;
        },
        parent,
        partition,
        title: "ChatGPT",
        url: "https://chatgpt.com/",
        width: 1100,
      });
      officialWindow = created;
      officialPartition = partition;
      return account.resultValidator.parse({ ok: true });
    });
    contents.ipc.handle(accounts.channel, async (_event, input: unknown) => {
      const request = accounts.requestValidator.parse(input);
      switch (request.method) {
      case "stateRead":
        return accounts.stateValidator.parse(store.getState().accounts);
      case "accountDelete":
        await store.getState().accountListActions.accountDelete(request);
        return accounts.resultValidator.parse({ ok: true });
      }
    });
    contents.ipc.handle(authJsonCreate.channel, async (_event, input: unknown) => {
      const request = authJsonCreate.requestValidator.parse(input);
      switch (request.method) {
      case "stateRead":
        return authJsonCreate.authJsonCreateValidator.parse(store.getState().authJsonCreate);
      case "cancel":
        return authJsonCreate.result.cancel.parse({
          canceled: store.getState().accountAddActions.authJsonCreateCancel(),
        });
      case "create":
        await store.getState().accountAddActions.authJsonCreate(request);
        return authJsonCreate.result.create.parse({ created: true });
      }
    });
    contents.ipc.handle(authJsonImport.channel, async (_event, input: unknown) => {
      const request = authJsonImport.requestValidator.parse(input);
      if (request.method === "stateRead") {
        return authJsonImport.authJsonImportValidator.parse(store.getState().authJsonImport);
      }
      const actions = store.getState().authJsonImportActions;
      actions.operationStart();
      try {
        const imported = request.method === "clipboard"
          ? await store.getState().accountAddActions.clipboardImport()
          : request.method === "default"
            ? await store.getState().accountAddActions.defaultImport()
            : await store.getState().accountAddActions.selectImport();
        actions.operationSucceed();
        return authJsonImport.result.import.parse({ imported });
      } catch (error) {
        actions.operationFail({ error: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    });
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
      await store.getState().accountListActions.pause();
      try {
        const result = await codexHomeMove(current, codexHome);
        store.getState().globalSettingsActions.codexHomeSet({ codexHome });
        if (result.oldPathCleanupFailed) {
          console.warn(`CODEX_HOME 已迁移，但原目录未能清理：${current ?? "未配置"}`);
        }
      } finally {
        store.getState().accountListActions.resume();
      }
    };
    contents.ipc.handle(globalSettings.channel, async (_event, input: unknown) => {
      const request = globalSettings.requestValidator.parse(input);
      switch (request.method) {
      case "stateRead":
        return globalSettings.globalSettingsValidator.parse(store.getState().globalSettings);
      case "maintenanceEnabledSet":
        store.getState().globalSettingsActions.maintenanceEnabledSet(request);
        return globalSettings.resultValidator.parse({ ok: true });
      case "maintenanceIntervalHoursSet":
        store.getState().globalSettingsActions.maintenanceIntervalHoursSet(request);
        return globalSettings.resultValidator.parse({ ok: true });
      case "maintenanceRetryCountSet":
        store.getState().globalSettingsActions.maintenanceRetryCountSet(request);
        return globalSettings.resultValidator.parse({ ok: true });
      case "maintenanceRetryIntervalMinutesSet":
        store.getState().globalSettingsActions.maintenanceRetryIntervalMinutesSet(request);
        return globalSettings.resultValidator.parse({ ok: true });
      case "codexHomeDefaultRestore":
        await codexHomeSet({ codexHome: join(app.getPath("home"), ".codex") });
        return globalSettings.resultValidator.parse({ ok: true });
      case "codexHomeSelect": {
        const result = await dialog.showOpenDialog(this.window, {
          buttonLabel: "选择",
          defaultPath: store.getState().globalSettings.codexHome ?? undefined,
          properties: ["openDirectory", "createDirectory"],
          title: "选择 CODEX_HOME",
        });
        const codexHome = result.filePaths[0];
        if (!result.canceled && codexHome) await codexHomeSet({ codexHome });
        return globalSettings.resultValidator.parse({ ok: true });
      }
      }
    });
    this.disposeCommunication = [
      () => {
        contents.ipc.removeHandler(browser.channel);
        contents.ipc.removeHandler(authSessions.channel);
        contents.ipc.removeHandler(rateLimits.channel);
        contents.ipc.removeHandler(usage.channel);
        contents.ipc.removeHandler(scheduler.channel);
        contents.ipc.removeHandler(account.channel);
        contents.ipc.removeHandler(accounts.channel);
        contents.ipc.removeHandler(authJsonCreate.channel);
        contents.ipc.removeHandler(authJsonImport.channel);
        contents.ipc.removeHandler(globalSettings.channel);
        store.getState().accountAddActions.dispose();
        officialWindow?.dispose();
        officialWindow = undefined;
        officialPartition = undefined;
      },
    ];
    const route = store.getState().accounts.order.length === 0 ? "/" : "/accounts";
    const initialize = Promise.resolve().then(async () => {
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
      await store.getState().accountListActions.initialize();
      if (!this.disposed) store.getState().accountListActions.start();
    });
    this.ready = Promise.all([
      initialize,
      this.rendererLoad(route),
    ]).then(() => undefined);
    this.window.on("close", event => {
      if (this.disposed) return;
      event.preventDefault();
      this.window.hide();
    });
  }

  async show(): Promise<void> {
    if (this.disposed) throw new Error("CodexAppServer 已释放");
    await this.ready;
    if (this.window.isMinimized()) this.window.restore();
    this.window.show();
    this.window.focus();
  }

  hide(): void {
    this.window.hide();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    store.getState().accountListActions.stop();
    for (const run of this.disposeCommunication.reverse()) run();
    store.setState({ webContents: undefined });
    if (!this.window.isDestroyed()) this.window.destroy();
  }

  private rendererLoad(route: string): Promise<void> {
    const rendererUrl = electronRendererUrlRead();
    if (rendererUrl) {
      const url = new URL(
        "codex-app-server-renderer/",
        rendererUrl,
      );
      url.hash = route;
      return this.window.loadURL(url.toString());
    }
    return this.window.loadFile(join(
      app.getAppPath(),
      "out",
      "renderer",
      "codex-app-server-renderer",
      "index.html",
    ), { hash: route });
  }
}

export default CodexAppServer;
