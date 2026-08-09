import {
  BrowserWindow as ElectronBrowserWindow,
  session,
} from "electron";

type BrowserPartitionWindowOptions = {
  height: number;
  minHeight: number;
  minWidth: number;
  onClose?(): void;
  parent: ElectronBrowserWindow;
  partition: string;
  title: string;
  url: string;
  width: number;
};

class BrowserPartitionWindow {
  private disposed = false;
  private readonly ready: Promise<void>;
  readonly value: ElectronBrowserWindow;

  private constructor(options: BrowserPartitionWindowOptions) {
    this.value = new ElectronBrowserWindow({
      autoHideMenuBar: true,
      parent: options.parent,
      width: options.width,
      height: options.height,
      minWidth: options.minWidth,
      minHeight: options.minHeight,
      show: false,
      title: options.title,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        partition: options.partition,
        sandbox: true,
      },
    });
    this.ready = this.value.loadURL(options.url);
    this.value.on("close", () => {
      if (!this.disposed) options.onClose?.();
    });
    this.value.on("closed", () => {
      this.disposed = true;
    });
  }

  static async open(
    options: BrowserPartitionWindowOptions,
  ): Promise<BrowserPartitionWindow> {
    const window = new BrowserPartitionWindow(options);
    await window.show();
    return window;
  }

  static async storageClear(partition: string): Promise<void> {
    await session.fromPartition(partition).clearData();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (!this.value.isDestroyed()) this.value.destroy();
  }

  async show(): Promise<void> {
    if (this.disposed) throw new Error("BrowserPartitionWindow 已释放");
    await this.ready;
    if (this.value.isMinimized()) this.value.restore();
    this.value.show();
    this.value.focus();
  }

  async storageFlush(): Promise<void> {
    if (this.disposed) return;
    await this.value.webContents.session.flushStorageData();
  }
}

export default BrowserPartitionWindow;
