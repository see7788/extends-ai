import { BrowserWindow } from "electron";
import preloadPath from "electron-vite-config-lib/preloadCreate/electron";
import rendererLoad from "electron-vite-config-lib/rendererReactPlugin/electron";
import store from "./store/index.ts";

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
        preload: preloadPath("browser-partition-preload"),
        sandbox: true,
      },
    });
    store.setState({
      loginWindow_nodestate: this.window,
      webContents_nodestate: this.window.webContents,
    });
    this.disposeCommunication = [
      store.getState().browserActions.communicationStart(),
      store.getState().accountsActions.communicationStart(),
      store.getState().cookieImportActions.communicationStart(),
      store.getState().loginActions.communicationStart(),
      store.getState().accountAddActions.communicationStart(),
      store.getState().accountListActions.communicationStart(),
    ];
    this.ready = rendererLoad({
      name: "chatgtp-com-login-renderer",
      webContents: this.window.webContents,
    });
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
    store.setState({ loginWindow_nodestate: undefined, webContents_nodestate: undefined });
    if (!this.window.isDestroyed()) this.window.destroy();
  }
}

export default Login;
