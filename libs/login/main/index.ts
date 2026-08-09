import { app, BrowserWindow, session } from "electron";
import { join } from "node:path";
import BrowserPartitionWindow from "browser-partition-main/BrowserWindow/index.ts";
import accountsInstall from "./accounts/index.ts";
import cookieImportInstall from "./cookieImport/index.ts";
import loginInstall from "./login/index.ts";
import store from "./store.ts";
import { electronRendererUrlRead } from "./process.ts";

const preloadPath = () => join(
  app.getAppPath(),
  "out",
  "preload",
  "browser-partition-preload.cjs",
);

class Login {
  private disposed = false;
  private readonly disposeCommunication: Array<() => void>;
  private readonly ready: Promise<void>;
  private readonly window: BrowserWindow;

  constructor() {
    this.window = new BrowserWindow({
      autoHideMenuBar: true,
      width: 760,
      height: 620,
      minWidth: 620,
      minHeight: 460,
      show: false,
      title: "ChatGPT 登录态",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        partition: "persist:login",
        preload: preloadPath(),
        sandbox: true,
      },
    });
    const accountsRuntime = {
      fetch: (
        partition: string,
        url: string,
        signal?: AbortSignal,
      ) => session.fromPartition(partition).fetch(
        url,
        {
          credentials: "include",
          ...(signal ? { signal } : {}),
        },
      ),
      storageClear: BrowserPartitionWindow.storageClear,
      windowOpen: async (value: {
        onClose(): void;
        parent: unknown;
        partition: string;
        title: string;
      }) => {
        const window = await BrowserPartitionWindow.open({
          height: 760,
          minHeight: 520,
          minWidth: 760,
          onClose: value.onClose,
          parent: value.parent as BrowserWindow,
          partition: value.partition,
          title: value.title,
          url: "https://chatgpt.com/",
          width: 920,
        });
        return { dispose: () => window.dispose() };
      },
    };
    this.disposeCommunication = [
      accountsInstall(accountsRuntime),
      loginInstall(partition => (
        store.getState().accountsActions.loginIdentify(partition, accountsRuntime)
      )),
      cookieImportInstall(),
    ];
    this.ready = this.rendererLoad();
    this.window.on("close", event => {
      if (this.disposed) return;
      event.preventDefault();
      this.window.hide();
    });
  }

  async show(): Promise<void> {
    if (this.disposed) throw new Error("Login 已释放");
    await this.ready;
    if (this.window.isMinimized()) this.window.restore();
    this.window.show();
    this.window.focus();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const run of this.disposeCommunication.reverse()) run();
    if (!this.window.isDestroyed()) this.window.destroy();
  }

  private rendererLoad(): Promise<void> {
    const rendererUrl = electronRendererUrlRead();
    if (rendererUrl) {
      return this.window.loadURL(new URL(
        "login-renderer/",
        `${rendererUrl}/`,
      ).toString());
    }
    return this.window.loadFile(join(
      app.getAppPath(),
      "out",
      "renderer",
      "login-renderer",
      "index.html",
    ));
  }

}

export default Login;
