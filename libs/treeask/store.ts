import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import codexcliStore, { type nodeState_t } from "./codexcli/store.ts";

type Store = ReturnType<typeof codexcliStore> & nodeState_t;

const store = create<Store>()(
  immer((...options) => ({
    ...codexcliStore<Store>(...options),
    crypto_randomUUID_nodestate: globalThis.crypto.randomUUID.bind(globalThis.crypto),
    fetch_nodestate: globalThis.fetch.bind(globalThis),
  })),
);

export default store;
