import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import { app } from "electron";
import * as childProcess from "node:child_process";
import * as crypto from "node:crypto";
import * as fileSystem from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import process from "node:process";
import type { nodeState_t } from "./store.ts";

type NodeState = Omit<nodeState_t, "webContents_nodestate">;

const nodeState: ImmerStateCreator<NodeState> = () => ({
  app_getPath_desktop_nodestate: app.getPath("desktop"),
  childProcess_execFile_nodestate: childProcess.execFile,
  childProcess_spawn_nodestate: childProcess.spawn,
  crypto_createHash_nodestate: crypto.createHash,
  fileSystem_access_nodestate: fileSystem.access,
  os_homedir_nodestate: os.homedir,
  path_basename_nodestate: path.basename,
  path_join_nodestate: path.join,
  path_resolve_nodestate: path.resolve,
  process_env_LOCALAPPDATA_nodestate: process.env.LOCALAPPDATA,
  process_env_PROGRAMFILES_nodestate: process.env.ProgramFiles,
  process_env_PROGRAMFILES_X86_nodestate: process.env["ProgramFiles(x86)"],
  process_env_USERPROFILE_nodestate: process.env.USERPROFILE,
  process_platform_nodestate: process.platform,
});

export default nodeState;
