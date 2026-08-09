import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { electronRendererUrlRead } from "./process.ts";
import accountAddIndex from "./accountAdd/index.ts";
import globalSettingsIndex from "./globalSettings/index.ts";
import accountListIndex from "./accountList/index.ts";
import accountIndex from "./accountList/account/index.ts";
import accountsIndex from "./accountList/accounts/index.ts";
import authSessionsIndex from "./accountList/authSessions/index.ts";
import rateLimitsIndex from "./accountList/rateLimits/index.ts";
import schedulerIndex from "./accountList/scheduler/index.ts";
import usageIndex from "./accountList/usage/index.ts";
import store from "./store.ts";

const preloadPath = () => join(
  app.getAppPath(),
  "out",
  "preload",
  "browser-partition-preload.cjs",
);

class CodexAppServer {
  private disposed = false;
  private readonly disposeCommunication: Array<() => void>;
  private readonly ready: Promise<void>;
  private readonly window: BrowserWindow;

  constructor() {
    globalSettingsIndex.initialize();
    accountIndex.initialize();
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
    this.disposeCommunication = [
      globalSettingsIndex.install(),
      accountAddIndex.install(),
      accountIndex.install(),
      accountsIndex.install(),
      authSessionsIndex.install(),
      rateLimitsIndex.install(),
      schedulerIndex.install(),
      usageIndex.install(),
    ];
    const route = store.getState().accounts.order.length === 0 ? "/" : "/accounts";
    this.ready = this.rendererLoad(route);
    this.window.on("close", event => {
      if (this.disposed) return;
      event.preventDefault();
      this.window.hide();
    });
    accountListIndex.start();
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
    accountListIndex.stop();
    for (const run of this.disposeCommunication.reverse()) run();
    if (!this.window.isDestroyed()) this.window.destroy();
  }

  private rendererLoad(route: string): Promise<void> {
    const rendererUrl = electronRendererUrlRead();
    if (rendererUrl) {
      const url = new URL(
        "codex-app-server-renderer/",
        `${rendererUrl}/`,
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
