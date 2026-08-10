import type { BrowserWindow as ElectronBrowserWindow } from "electron";
import BrowserPartitionWindow from "browser-partition-main/BrowserWindow/index.ts";

type LoginOpenOptions = {
  identify(partition: string): Promise<boolean>;
  parent: ElectronBrowserWindow;
  partition: string;
};

type LoginOpen = {
  cancel(): void;
  result: Promise<void>;
};

const canceledError = (): Error => {
  const error = new Error("内嵌登录已取消");
  error.name = "AbortError";
  return error;
};

const loginOpen = (options: LoginOpenOptions): LoginOpen => {
  let finish: (error?: Error) => void = () => undefined;
  const result = new Promise<void>((resolve, reject) => {
    let identifying = false;
    let settled = false;
    let watchingStop = (): void => undefined;
    let window: Awaited<ReturnType<typeof BrowserPartitionWindow.open>> | undefined;

    finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      watchingStop();
      window?.dispose();
      if (error) {
        void BrowserPartitionWindow.storageClear(options.partition).catch(() => undefined);
        reject(error);
        return;
      }
      resolve();
    };

    const identifyRun = async (): Promise<void> => {
      if (identifying || settled) return;
      identifying = true;
      try {
        if (await options.identify(options.partition)) finish();
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      } finally {
        identifying = false;
      }
    };

    void BrowserPartitionWindow.open({
      height: 760,
      minHeight: 520,
      minWidth: 760,
      onClose: () => finish(canceledError()),
      parent: options.parent,
      partition: options.partition,
      title: "ChatGPT.com",
      url: "https://chatgpt.com/",
      width: 920,
    }).then(value => {
      window = value;
      if (settled) {
        value.dispose();
        return;
      }
      const contents = value.value.webContents;
      const cookies = contents.session.cookies;
      const identifySchedule = (): void => {
        void identifyRun();
      };
      contents.on("did-stop-loading", identifySchedule);
      cookies.on("changed", identifySchedule);
      watchingStop = () => {
        contents.removeListener("did-stop-loading", identifySchedule);
        cookies.removeListener("changed", identifySchedule);
      };
      void identifyRun();
    }).catch(error => finish(
      error instanceof Error ? error : new Error(String(error)),
    ));
  });

  return {
    cancel: () => finish(canceledError()),
    result,
  };
};

export { loginOpen };
