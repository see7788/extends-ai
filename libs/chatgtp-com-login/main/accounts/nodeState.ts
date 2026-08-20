import BrowserPartitionWindow from "browser-partition-main/BrowserWindow.ts";
import type { ImmerStateCreator } from "zustand-lib/immerStateCreator";
import { session } from "electron";
import type { nodeState_t } from "./store.ts";

type NodeState = Omit<nodeState_t, "loginWindow_nodestate">;

const nodeState: ImmerStateCreator<NodeState> = () => ({
  browserPartitionWindow_open_nodestate: BrowserPartitionWindow.open.bind(BrowserPartitionWindow),
  browserPartitionWindow_storageClear_nodestate: BrowserPartitionWindow.storageClear.bind(BrowserPartitionWindow),
  session_fromPartition_nodestate: session.fromPartition.bind(session),
});

export default nodeState;
