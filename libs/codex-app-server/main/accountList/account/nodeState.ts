import BrowserPartitionWindow from "browser-partition-main/BrowserWindow.ts";
import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import { BrowserWindow } from "electron";
import type { nodeState_t } from "./store.ts";

type NodeState = Omit<nodeState_t, "webContents_nodestate">;

const nodeState: ImmerStateCreator<NodeState> = () => ({
  browserPartitionWindow_open_nodestate: BrowserPartitionWindow.open.bind(BrowserPartitionWindow),
  browserWindow_fromWebContents_nodestate: BrowserWindow.fromWebContents.bind(BrowserWindow),
});

export default nodeState;
