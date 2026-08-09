import type { BrowserWindow as ElectronBrowserWindow } from "electron";
import BrowserPartitionWindow from "browser-partition-main/BrowserWindow/index.ts";

const officialUrl = "https://chatgpt.com/";
let current: AccountBrowserWindow | undefined;

class AccountBrowserWindow {
  private readonly partition: string;
  private readonly value: BrowserPartitionWindow;

  private constructor(
    partition: string,
    value: BrowserPartitionWindow,
  ) {
    this.partition = partition;
    this.value = value;
  }

  static async open(
    parent: ElectronBrowserWindow,
    partition: string,
  ): Promise<AccountBrowserWindow> {
    if (current?.partition === partition) {
      await current.show();
      return current;
    }
    if (current) {
      current.dispose();
    }
    let created: AccountBrowserWindow | undefined;
    const value = await BrowserPartitionWindow.open({
      height: 780,
      minHeight: 520,
      minWidth: 760,
      onClose: () => {
        if (current === created) current = undefined;
      },
      parent,
      partition,
      title: "ChatGPT",
      url: officialUrl,
      width: 1100,
    });
    created = new AccountBrowserWindow(partition, value);
    current = created;
    return current;
  }

  async show(): Promise<void> {
    await this.value.show();
  }

  dispose(): void {
    if (current === this) current = undefined;
    this.value.dispose();
  }
}

export default AccountBrowserWindow;
