﻿import type { ImmerStateCreator } from "zustand-lib/immerStateCreator";
import { type DataConnection } from 'peerjs';
export type store_t = {
  mcpBridge: {
    //dataConnectionSet: Map<DataConnection,string>;//dataConnection.connectionId,dataConnection.peer,dataConnection.metadata
  }
  mcpBridgeActions: {
    readonly password: (value: string) => boolean;
  };
}
const store: ImmerStateCreator<store_t> = () => ({
  mcpBridge: { },
  mcpBridgeActions: {
    password() {
      return true
    }
  },
});

export default store;
