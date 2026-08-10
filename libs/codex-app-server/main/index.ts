import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import process from "node:process";
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
    store.setState({ webContents_nodestate: this.window.webContents });
    store.getState().authJsonImportActions.operationCancel();
    this.disposeCommunication = [
      store.getState().browserActions.communicationStart(),
      store.getState().authSessionsActions.communicationStart(),
      store.getState().rateLimitsActions.communicationStart(),
      store.getState().usageActions.communicationStart(),
      store.getState().schedulerActions.communicationStart(),
      store.getState().accountActions.communicationStart(),
      store.getState().accountsActions.communicationStart(),
      store.getState().authJsonCreateActions.communicationStart(),
      store.getState().authJsonImportActions.communicationStart(),
      store.getState().globalSettingsActions.communicationStart(),
      store.getState().accountAddActions.communicationStart(),
      store.getState().accountListActions.communicationStart(),
    ];
    const route = store.getState().accounts.order.length === 0 ? "/" : "/accounts";
    const initialize = Promise.resolve().then(async () => {
      const current = store.getState().globalSettings;
      const codexHome = current.codexHome === ""
        ? join(app.getPath("home"), ".codex")
        : current.codexHome;
      store.getState().globalSettingsActions.initialize({
        codexHome: codexHome || null,
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
    store.getState().accountAddActions.dispose();
    store.getState().accountActions.dispose();
    for (const run of this.disposeCommunication.reverse()) run();
    store.setState({ webContents_nodestate: undefined });
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
