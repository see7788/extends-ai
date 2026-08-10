import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import store from "./store/index.ts";

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
    store.setState({
      loginWindow: this.window,
      webContents: this.window.webContents,
    });
    this.disposeCommunication = [
      store.getState().browserActions.communicationStart(),
      store.getState().accountsActions.communicationStart(),
      store.getState().cookieImportActions.communicationStart(),
      store.getState().loginActions.communicationStart(),
      store.getState().accountAddActions.communicationStart(),
      store.getState().accountListActions.communicationStart(),
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
    store.getState().accountAddActions.dispose();
    store.getState().accountsActions.dispose();
    store.getState().loginActions.cancel();
    for (const run of this.disposeCommunication.reverse()) run();
    store.setState({ loginWindow: undefined, webContents: undefined });
    if (!this.window.isDestroyed()) this.window.destroy();
  }

  private rendererLoad(): Promise<void> {
    const rendererUrl = store.getState().electronRendererUrl;
    if (rendererUrl) {
      return this.window.loadURL(new URL(
        "login-renderer/",
        rendererUrl,
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
