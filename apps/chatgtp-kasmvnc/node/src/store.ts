﻿import { immer } from "zustand/middleware/immer";
import { createStore } from "zustand/vanilla";
import mcpBridgeStore from "./mcpBridge/store.ts";

export default createStore<ReturnType<typeof mcpBridgeStore>>()(
  immer((...options) => ({
    ...mcpBridgeStore(...options),
  })),
);
