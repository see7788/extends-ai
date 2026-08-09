import { app, Menu, Tray, nativeImage } from "electron";
import browserPartitionInstall from "browser-partition-main";
import CodexAppServer from "codex-app-server-main";
import Login from "login-main";
import trayIconPath from "./icon.png?asset";

let codexAppServer: CodexAppServer | undefined;
let browserPartitionDispose: (() => void) | undefined;
let login: Login | undefined;
let tray: Tray | undefined;
if (!app.isPackaged) app.commandLine.appendSwitch("remote-debugging-port", "9222");
const singleInstance = app.requestSingleInstanceLock();

const trayImage = () => {
  const image = nativeImage.createFromPath(trayIconPath);
  if (image.isEmpty()) {
    throw new Error(`托盘图标加载失败：${trayIconPath}`);
  }
  return image;
};

const ready = async (): Promise<void> => {
  browserPartitionDispose = browserPartitionInstall();
  login = new Login();
  codexAppServer = new CodexAppServer();
  tray = new Tray(trayImage());
  tray.setToolTip("Codex 账号管理");
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: "打开 Codex 账号管理",
      click: () => void codexAppServer?.show(),
    },
    {
      label: "打开 ChatGPT 登录态",
      click: () => void login?.show(),
    },
    { type: "separator" },
    {
      label: "退出",
      click: () => app.quit(),
    },
  ]));
  tray.on("double-click", () => void codexAppServer?.show());
  await Promise.all([
    codexAppServer.show(),
    login.show(),
  ]);
};

if (!singleInstance) {
  app.quit();
} else {
  app.whenReady().then(ready).catch(error => {
    console.error(error);
    app.quit();
  });
  app.on("activate", () => void codexAppServer?.show());
  app.on("second-instance", () => void codexAppServer?.show());
  app.on("before-quit", () => {
    codexAppServer?.dispose();
    codexAppServer = undefined;
    login?.dispose();
    login = undefined;
    browserPartitionDispose?.();
    browserPartitionDispose = undefined;
    tray?.destroy();
    tray = undefined;
  });
}
