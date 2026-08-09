import {
  BrowserWindow as ElectronBrowserWindow,
  ipcMain,
  type IpcMainInvokeEvent,
  type WebContents,
} from "electron";
import { errorText } from "../public.ts";
import store from "../store.ts";
import authJsonCreateRun from "./authJsonCreate/index.ts";
import { authJsonCreate } from "./authJsonCreate/store.ts";
import authJsonImportRun, {
  importClipboard,
  importDefault,
  importPath,
  selectPath,
} from "./authJsonImport/index.ts";
import { authJsonImport } from "./authJsonImport/store.ts";

let renderer: WebContents | undefined;

const rendererSet = (event: IpcMainInvokeEvent): void => {
  renderer = event.sender;
};
const parentRead = (event: IpcMainInvokeEvent): ElectronBrowserWindow => {
  const parent = ElectronBrowserWindow.fromWebContents(event.sender);
  if (!parent) throw new Error("无法取得账号管理窗口");
  return parent;
};
const send = (channel: string, value: unknown): void => {
  if (renderer && !renderer.isDestroyed()) renderer.send(channel, value);
};
const install = (): (() => void) => {
    store.getState().authJsonImportActions.operationCancel();

    ipcMain.handle(authJsonCreate.channel.create, async (event, input: unknown) => {
      rendererSet(event);
      const carrier = authJsonCreate.input.create.parse(input);
      const result = await authJsonCreateRun({ carrier });
      await authJsonImportRun(result.source);
      return authJsonCreate.result.create.parse({ created: true });
    });
    ipcMain.handle(authJsonCreate.channel.cancel, (event, input: unknown) => {
      rendererSet(event);
      authJsonCreate.input.command.parse(input);
      return authJsonCreate.result.cancel.parse({
        canceled: store.getState().authJsonCreateActions.cancel(),
      });
    });
    ipcMain.handle(authJsonCreate.channel.stateRead, event => {
      rendererSet(event);
      return authJsonCreate.authJsonCreateValidator.parse(store.getState().authJsonCreate);
    });

    ipcMain.handle(authJsonImport.channel.clipboard, async (event, input: unknown) => {
      rendererSet(event);
      authJsonImport.input.command.parse(input);
      const actions = store.getState().authJsonImportActions;
      actions.operationStart();
      try {
        await importClipboard();
        actions.operationSucceed();
        return authJsonImport.result.import.parse({ imported: true });
      } catch (error) {
        actions.operationFail({ error: errorText(error) });
        throw error;
      }
    });
    ipcMain.handle(authJsonImport.channel.default, async (event, input: unknown) => {
      rendererSet(event);
      authJsonImport.input.command.parse(input);
      const actions = store.getState().authJsonImportActions;
      actions.operationStart();
      try {
        await importDefault();
        actions.operationSucceed();
        return authJsonImport.result.import.parse({ imported: true });
      } catch (error) {
        actions.operationFail({ error: errorText(error) });
        throw error;
      }
    });
    ipcMain.handle(authJsonImport.channel.select, async (event, input: unknown) => {
      rendererSet(event);
      authJsonImport.input.command.parse(input);
      const sourcePath = await selectPath(parentRead(event));
      if (!sourcePath) return authJsonImport.result.import.parse({ imported: false });
      const actions = store.getState().authJsonImportActions;
      actions.operationStart();
      try {
        await importPath(sourcePath);
        actions.operationSucceed();
        return authJsonImport.result.import.parse({ imported: true });
      } catch (error) {
        actions.operationFail({ error: errorText(error) });
        throw error;
      }
    });
    ipcMain.handle(authJsonImport.channel.stateRead, event => {
      rendererSet(event);
      return authJsonImport.authJsonImportValidator.parse(store.getState().authJsonImport);
    });

    const unsubscribe = store.subscribe((state, previous) => {
      if (state.authJsonCreate !== previous.authJsonCreate) {
        send(
          authJsonCreate.channel.stateUpdated,
          authJsonCreate.authJsonCreateValidator.parse(state.authJsonCreate),
        );
      }
      if (state.authJsonImport !== previous.authJsonImport) {
        send(
          authJsonImport.channel.stateUpdated,
          authJsonImport.authJsonImportValidator.parse(state.authJsonImport),
        );
      }
    });
    return () => {
      store.getState().authJsonCreateActions.dispose();
      unsubscribe();
      renderer = undefined;
      ipcMain.removeHandler(authJsonCreate.channel.cancel);
      ipcMain.removeHandler(authJsonCreate.channel.create);
      ipcMain.removeHandler(authJsonCreate.channel.stateRead);
      ipcMain.removeHandler(authJsonImport.channel.clipboard);
      ipcMain.removeHandler(authJsonImport.channel.default);
      ipcMain.removeHandler(authJsonImport.channel.select);
      ipcMain.removeHandler(authJsonImport.channel.stateRead);
    };
};

export default install;
