import {
  ipcMain,
  session,
  type IpcMainInvokeEvent,
  type WebContents,
} from "electron";
import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import {
  applicationRead,
  remoteDebugRead,
  windowOpen,
} from "browser-partition-main/browser/index.ts";
import store from "../store.ts";
import { cookieImport } from "./store.ts";

const install = (): (() => void) => {
  const renderers = new Set<WebContents>();
  const rendererSet = (event: IpcMainInvokeEvent): void => {
    renderers.add(event.sender);
  };
  ipcMain.handle(
    cookieImport.channel.authorizationTimeoutSecondsSet,
    (event, input: unknown) => {
      rendererSet(event);
      store.getState().cookieImportActions.authorizationTimeoutSecondsSet(
        cookieImport.input.authorizationTimeoutSecondsSet.parse(input),
      );
      return cookieImport.result.setting.parse({ updated: true });
    },
  );
  ipcMain.handle(cookieImport.channel.cancel, (event, input: unknown) => {
    rendererSet(event);
    cookieImport.input.command.parse(input);
    return cookieImport.result.cancel.parse({
      canceled: store.getState().cookieImportActions.cancel(),
    });
  });
  ipcMain.handle(cookieImport.channel.start, async (event, input: unknown) => {
    rendererSet(event);
    const value = cookieImport.input.create.parse(input);
    return cookieImport.result.start.parse({
      completed: await store.getState().cookieImportActions.start(value.browserId, {
        applicationRead,
        fileRead: path => readFile(path, "utf8"),
        fileStat: path => stat(path),
        idCreate: randomUUID,
        remoteDebugRead: (executablePath, launchArguments) => (
          remoteDebugRead(executablePath, launchArguments)
        ),
        sessionRead: partition => session.fromPartition(partition),
        windowOpen: (executablePath, url, launchArguments) => (
          windowOpen(executablePath, url, launchArguments)
        ),
      }),
    });
  });
  ipcMain.handle(cookieImport.channel.stateRead, event => {
    rendererSet(event);
    return cookieImport.cookieImportValidator.parse(store.getState().cookieImport);
  });
  const unsubscribe = store.subscribe((state, previous) => {
    if (state.cookieImport === previous.cookieImport) return;
    const value = cookieImport.cookieImportValidator.parse(state.cookieImport);
    for (const renderer of renderers) {
      if (renderer.isDestroyed()) renderers.delete(renderer);
      else renderer.send(cookieImport.channel.stateUpdated, value);
    }
  });
  return () => {
    store.getState().cookieImportActions.dispose();
    unsubscribe();
    renderers.clear();
    ipcMain.removeHandler(cookieImport.channel.authorizationTimeoutSecondsSet);
    ipcMain.removeHandler(cookieImport.channel.cancel);
    ipcMain.removeHandler(cookieImport.channel.start);
    ipcMain.removeHandler(cookieImport.channel.stateRead);
  };
};

export default install;
