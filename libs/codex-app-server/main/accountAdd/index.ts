import {
  BrowserWindow as ElectronBrowserWindow,
  type IpcMainInvokeEvent,
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

const parentRead = (event: IpcMainInvokeEvent): ElectronBrowserWindow => {
  const parent = ElectronBrowserWindow.fromWebContents(event.sender);
  if (!parent) throw new Error("无法取得账号管理窗口");
  return parent;
};
const install = (): (() => void) => {
    const contents = store.getState().webContents;
    if (!contents || contents.isDestroyed()) {
      throw new Error("CodexAppServer WebContents 不可用");
    }
    store.getState().authJsonImportActions.operationCancel();

    contents.ipc.handle(authJsonCreate.channel.create, async (_event, input: unknown) => {
      const carrier = authJsonCreate.input.create.parse(input);
      const result = await authJsonCreateRun({ carrier });
      await authJsonImportRun(result.source);
      return authJsonCreate.result.create.parse({ created: true });
    });
    contents.ipc.handle(authJsonCreate.channel.cancel, (_event, input: unknown) => {
      authJsonCreate.input.command.parse(input);
      return authJsonCreate.result.cancel.parse({
        canceled: store.getState().authJsonCreateActions.cancel(),
      });
    });
    contents.ipc.handle(authJsonCreate.channel.stateRead, () => (
      authJsonCreate.authJsonCreateValidator.parse(store.getState().authJsonCreate)
    ));

    contents.ipc.handle(authJsonImport.channel.clipboard, async (_event, input: unknown) => {
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
    contents.ipc.handle(authJsonImport.channel.default, async (_event, input: unknown) => {
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
    contents.ipc.handle(authJsonImport.channel.select, async (event, input: unknown) => {
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
    contents.ipc.handle(authJsonImport.channel.stateRead, () => (
      authJsonImport.authJsonImportValidator.parse(store.getState().authJsonImport)
    ));
    return () => {
      store.getState().authJsonCreateActions.dispose();
      contents.ipc.removeHandler(authJsonCreate.channel.cancel);
      contents.ipc.removeHandler(authJsonCreate.channel.create);
      contents.ipc.removeHandler(authJsonCreate.channel.stateRead);
      contents.ipc.removeHandler(authJsonImport.channel.clipboard);
      contents.ipc.removeHandler(authJsonImport.channel.default);
      contents.ipc.removeHandler(authJsonImport.channel.select);
      contents.ipc.removeHandler(authJsonImport.channel.stateRead);
    };
};

export default install;
