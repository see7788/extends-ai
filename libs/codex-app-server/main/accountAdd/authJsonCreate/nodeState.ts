import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import { app } from "electron";
import * as childProcess from "node:child_process";
import * as fileSystem from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import process from "node:process";
import * as readline from "node:readline";
import type { nodeState_t } from "./store.ts";

type NodeState = Omit<nodeState_t, "webContents_nodestate">;

const nodeState: ImmerStateCreator<NodeState> = () => ({
  app_getPath_temp_nodestate: app.getPath("temp"),
  childProcess_execFile_nodestate: childProcess.execFile,
  childProcess_spawn_nodestate: childProcess.spawn,
  fileSystem_access_nodestate: fileSystem.access,
  fileSystem_mkdtemp_nodestate: fileSystem.mkdtemp,
  fileSystem_readFile_nodestate: fileSystem.readFile,
  fileSystem_rm_nodestate: fileSystem.rm,
  os_homedir_nodestate: os.homedir,
  path_join_nodestate: path.join,
  process_env_APPDATA_nodestate: process.env.APPDATA,
  process_env_CODEX_EXECUTABLE_nodestate: process.env.CODEX_EXECUTABLE,
  process_env_HOME_nodestate: process.env.HOME,
  process_env_LOCALAPPDATA_nodestate: process.env.LOCALAPPDATA,
  process_env_PATH_nodestate: process.env.PATH,
  process_env_PATHEXT_nodestate: process.env.PATHEXT,
  process_env_SystemRoot_nodestate: process.env.SystemRoot,
  process_env_TEMP_nodestate: process.env.TEMP,
  process_env_TMP_nodestate: process.env.TMP,
  process_env_USERPROFILE_nodestate: process.env.USERPROFILE,
  process_platform_nodestate: process.platform,
  readline_createInterface_nodestate: readline.createInterface,
});

export default nodeState;
