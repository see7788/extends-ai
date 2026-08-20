import type { ImmerStateCreator } from "zustand-lib/immerStateCreator";
import * as electron from "electron";
import { app } from "electron";
import * as crypto from "node:crypto";
import * as fileSystem from "node:fs/promises";
import * as path from "node:path";
import type { nodeState_t } from "./store.ts";

type NodeState = Omit<nodeState_t, "webContents_nodestate">;

const nodeState: ImmerStateCreator<NodeState> = () => ({
  app_getPath_temp_nodestate: app.getPath("temp"),
  app_getPath_userData_nodestate: app.getPath("userData"),
  browserWindow_fromWebContents_nodestate: electron.BrowserWindow.fromWebContents.bind(electron.BrowserWindow),
  clipboard_readText_nodestate: electron.clipboard.readText.bind(electron.clipboard),
  crypto_createHash_nodestate: crypto.createHash,
  dialog_showOpenDialog_nodestate: electron.dialog.showOpenDialog.bind(electron.dialog),
  fileSystem_mkdir_nodestate: fileSystem.mkdir,
  fileSystem_mkdtemp_nodestate: fileSystem.mkdtemp,
  fileSystem_readFile_nodestate: fileSystem.readFile,
  fileSystem_rm_nodestate: fileSystem.rm,
  fileSystem_writeFile_nodestate: fileSystem.writeFile,
  path_basename_nodestate: path.basename,
  path_dirname_nodestate: path.dirname,
  path_join_nodestate: path.join,
  path_resolve_nodestate: path.resolve,
});

export default nodeState;
