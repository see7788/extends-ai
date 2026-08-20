import type { ImmerStateCreator } from "zustand-lib/immerStateCreator";
import * as crypto from "node:crypto";
import * as fileSystem from "node:fs/promises";
import * as path from "node:path";
import process from "node:process";
import type { nodeState_t } from "./store.ts";

type NodeState = Omit<nodeState_t, "webContents_nodestate">;

const nodeState: ImmerStateCreator<NodeState> = () => ({
  crypto_randomUUID_nodestate: crypto.randomUUID,
  fileSystem_cp_nodestate: fileSystem.cp,
  fileSystem_mkdir_nodestate: fileSystem.mkdir,
  fileSystem_open_nodestate: fileSystem.open,
  fileSystem_readdir_nodestate: fileSystem.readdir,
  fileSystem_rename_nodestate: fileSystem.rename,
  fileSystem_rm_nodestate: fileSystem.rm,
  fileSystem_stat_nodestate: fileSystem.stat,
  fileSystem_unlink_nodestate: fileSystem.unlink,
  path_dirname_nodestate: path.dirname,
  path_isAbsolute_nodestate: path.isAbsolute,
  path_join_nodestate: path.join,
  path_relative_nodestate: path.relative,
  path_resolve_nodestate: path.resolve,
  process_platform_nodestate: process.platform,
});

export default nodeState;
