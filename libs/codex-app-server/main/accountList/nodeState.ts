import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import * as electron from "electron";
import { app } from "electron";
import * as fileSystem from "node:fs/promises";
import * as path from "node:path";
import type { nodeState_t } from "./store.ts";

type NodeState = Omit<nodeState_t, "webContents_nodestate">;

const nodeState: ImmerStateCreator<NodeState> = () => ({
  app_getPath_home_nodestate: app.getPath("home"),
  app_getPath_userData_nodestate: app.getPath("userData"),
  browserWindow_fromWebContents_nodestate: electron.BrowserWindow.fromWebContents.bind(electron.BrowserWindow),
  dialog_showOpenDialog_nodestate: electron.dialog.showOpenDialog.bind(electron.dialog),
  fileSystem_cp_nodestate: fileSystem.cp,
  fileSystem_mkdir_nodestate: fileSystem.mkdir,
  fileSystem_stat_nodestate: fileSystem.stat,
  path_dirname_nodestate: path.dirname,
  path_join_nodestate: path.join,
});

export default nodeState;
