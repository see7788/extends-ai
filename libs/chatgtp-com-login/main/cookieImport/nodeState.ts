import type { ImmerStateCreator } from "zustand-lib/immerStateCreator";
import { session } from "electron";
import * as fileSystem from "node:fs/promises";
import type { nodeState_t } from "./store.ts";

type NodeState = Omit<nodeState_t, "webContents_nodestate">;

const nodeState: ImmerStateCreator<NodeState> = () => ({
  fileSystem_readFile_nodestate: fileSystem.readFile,
  fileSystem_stat_nodestate: fileSystem.stat,
  session_fromPartition_nodestate: session.fromPartition.bind(session),
});

export default nodeState;
