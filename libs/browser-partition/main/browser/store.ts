import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import type { WebContents } from "electron";
import { browser } from "./public.ts";
import {
  applicationRead as browserApplicationRead,
  applicationsRead as browserApplicationsRead,
  executableOpen as browserExecutableOpen,
  open as browserOpen,
  remoteDebugRead as browserRemoteDebugRead,
  windowClose as browserWindowClose,
  windowHandlesRead as browserWindowHandlesRead,
  windowOpen as browserWindowOpen,
  windowOpenRead as browserWindowOpenRead,
} from "./process.ts";

type BrowserApplication = ReturnType<typeof browser.browserApplicationValidator.parse>;
type BrowserApplications = ReturnType<typeof browser.browserApplicationsValidator.parse>;
type RemoteDebug = {
  devToolsActivePortPath: string;
  inspectUrl: string;
};
type WindowOpen = {
  close(): Promise<boolean>;
  closed: Promise<void>;
};
type BrowserSlice = {
  browserActions: {
    applicationRead(input: unknown): Promise<BrowserApplication>;
    applicationsRead(): Promise<BrowserApplications>;
    executableOpen(
      executablePath: string,
      url: string,
      launchArguments?: string[],
    ): Promise<void>;
    install(): () => void;
    open(input: unknown): Promise<void>;
    remoteDebugRead(
      executablePath: string,
      launchArguments?: string[],
    ): Promise<RemoteDebug>;
    windowClose(executablePath: string, handle: number): Promise<boolean>;
    windowHandlesRead(executablePath: string): Promise<number[]>;
    windowOpen(
      executablePath: string,
      url: string,
      launchArguments?: string[],
      signal?: AbortSignal,
    ): Promise<WindowOpen>;
    windowOpenRead(executablePath: string): Promise<boolean>;
  };
};

const browserStore: ImmerStateCreator<
  BrowserSlice,
  { webContents?: WebContents }
> = (_set, get) => ({
  browserActions: {
    async applicationRead(input) {
      return browserApplicationRead(input);
    },
    async applicationsRead() {
      return browserApplicationsRead();
    },
    async executableOpen(executablePath, url, launchArguments) {
      await browserExecutableOpen(
        executablePath,
        url,
        launchArguments,
      );
    },
    install() {
      const contents = get().webContents;
      if (!contents || contents.isDestroyed()) {
        throw new Error("Browser WebContents 不可用");
      }
      contents.ipc.handle(browser.channel.applicationsRead, async (_event, input: unknown) => {
        browser.input.command.parse(input);
        return get().browserActions.applicationsRead();
      });
      return () => contents.ipc.removeHandler(browser.channel.applicationsRead);
    },
    async open(input) {
      await browserOpen(input);
    },
    async remoteDebugRead(executablePath, launchArguments) {
      return browserRemoteDebugRead(
        executablePath,
        launchArguments,
      );
    },
    async windowClose(executablePath, handle) {
      return browserWindowClose(executablePath, handle);
    },
    async windowHandlesRead(executablePath) {
      return browserWindowHandlesRead(executablePath);
    },
    async windowOpen(executablePath, url, launchArguments, signal) {
      return browserWindowOpen(
        executablePath,
        url,
        launchArguments,
        signal,
      );
    },
    async windowOpenRead(executablePath) {
      return browserWindowOpenRead(executablePath);
    },
  },
});

export { browser, type BrowserSlice };
export default browserStore;
