import cwdPersist from "zustand-lib/cwdPersist";
import { app, type WebContents } from "electron";
import { createStore } from "zustand/vanilla";
import { immer } from "zustand/middleware/immer";
import browserNodeState from "browser-partition-main/browser/nodeState.ts";
import browserStore from "browser-partition-main/browser/store.ts";
import accountAddNodeState from "../accountAdd/nodeState.ts";
import authJsonCreateNodeState from "../accountAdd/authJsonCreate/nodeState.ts";
import authJsonCreateStore, { authJsonCreate } from "../accountAdd/authJsonCreate/store.ts";
import authJsonImportStore from "../accountAdd/authJsonImport/store.ts";
import accountAddStore from "../accountAdd/store.ts";
import globalSettingsNodeState from "../globalSettings/nodeState.ts";
import globalSettingsStore from "../globalSettings/store.ts";
import accountListNodeState from "../accountList/nodeState.ts";
import accountStore from "../accountList/account/store.ts";
import accountNodeState from "../accountList/account/nodeState.ts";
import accountsStore from "../accountList/accounts/store.ts";
import authSessionsStore, { authSessions } from "../accountList/authSessions/store.ts";
import connectionNodeState from "../accountList/connection/nodeState.ts";
import connectionStore from "../accountList/connection/store.ts";
import rateLimitsStore, { rateLimits } from "../accountList/rateLimits/store.ts";
import schedulerStore from "../accountList/scheduler/store.ts";
import usageStore, { usage } from "../accountList/usage/store.ts";
import accountListStore from "../accountList/store.ts";
import pkg from "../package.json";

type RuntimeState = { webContents_nodestate?: WebContents };
type Store = RuntimeState
  & ReturnType<typeof browserNodeState>
  & ReturnType<typeof accountAddNodeState>
  & ReturnType<typeof authJsonCreateNodeState>
  & ReturnType<typeof globalSettingsNodeState>
  & ReturnType<typeof accountListNodeState>
  & ReturnType<typeof accountNodeState>
  & ReturnType<typeof connectionNodeState>
  & ReturnType<typeof browserStore>
  & ReturnType<typeof accountStore>
  & ReturnType<typeof authJsonCreateStore>
  & ReturnType<typeof authJsonImportStore>
  & ReturnType<typeof globalSettingsStore>
  & ReturnType<typeof accountsStore>
  & ReturnType<typeof authSessionsStore>
  & ReturnType<typeof connectionStore>
  & ReturnType<typeof rateLimitsStore>
  & ReturnType<typeof usageStore>
  & ReturnType<typeof schedulerStore>
  & ReturnType<typeof accountAddStore>
  & ReturnType<typeof accountListStore>;
type PersistedState = Pick<
  Store,
  | "account"
  | "accounts"
  | "authJsonCreate"
  | "authJsonImport"
  | "authSessions"
  | "globalSettings"
  | "rateLimits"
  | "scheduler"
  | "usage"
>;

const persistedStateRead = (state: Store): PersistedState => ({
  account: structuredClone(state.account),
  accounts: structuredClone(state.accounts),
  authJsonCreate: {
    ...structuredClone(authJsonCreate.initial),
    authorizationTimeoutSeconds: state.authJsonCreate.authorizationTimeoutSeconds,
    history: structuredClone(state.authJsonCreate.history),
  },
  authJsonImport: structuredClone(state.authJsonImport),
  authSessions: structuredClone(authSessions.initial),
  globalSettings: structuredClone(state.globalSettings),
  rateLimits: structuredClone(rateLimits.initial),
  scheduler: structuredClone(state.scheduler),
  usage: structuredClone(usage.initial),
});

const store = createStore<Store>()(
  cwdPersist({
    initializer: immer((...options) => ({
      ...browserNodeState<Store>(...options),
      ...accountAddNodeState<Store>(...options),
      ...authJsonCreateNodeState<Store>(...options),
      ...globalSettingsNodeState<Store>(...options),
      ...accountListNodeState<Store>(...options),
      ...accountNodeState<Store>(...options),
      ...connectionNodeState<Store>(...options),
      ...browserStore(...options),
      ...accountStore(...options),
      ...authJsonCreateStore(...options),
      ...authJsonImportStore(...options),
      ...globalSettingsStore(...options),
      ...accountsStore(...options),
      ...authSessionsStore(...options),
      ...connectionStore(...options),
      ...rateLimitsStore(...options),
      ...usageStore(...options),
      ...schedulerStore(...options),
      ...accountAddStore(...options),
      ...accountListStore(...options),
      webContents_nodestate: undefined,
    })),
    cwd: app.getPath("userData"),
    name: pkg.name,
  }),
);

store.persist.setOptions({
  partialize: state => persistedStateRead(state) as Store,
});

export default store;
