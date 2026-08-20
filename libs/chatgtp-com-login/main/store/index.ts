import browserStore from "browser-partition-main/browser/store.ts";
import browserNodeState from "browser-partition-main/browser/nodeState.ts";
import cwdPersist from "zustand-lib/cwdPersist";
import { app, type BrowserWindow, type WebContents } from "electron";
import { createStore } from "zustand/vanilla";
import { immer } from "zustand/middleware/immer";
import accountAddStore from "../accountAdd/store.ts";
import accountListStore from "../accountList/store.ts";
import accountsNodeState from "../accounts/nodeState.ts";
import accountsStore from "../accounts/store.ts";
import cookieImportNodeState from "../cookieImport/nodeState.ts";
import cookieImportStore from "../cookieImport/store.ts";
import loginNodeState from "../login/nodeState.ts";
import loginStore, { login } from "../login/store.ts";
import pkg from "../package.json";

type RuntimeState = {
  loginWindow_nodestate?: BrowserWindow;
  webContents_nodestate?: WebContents;
};
type Store = RuntimeState
  & ReturnType<typeof browserNodeState>
  & ReturnType<typeof accountsNodeState>
  & ReturnType<typeof cookieImportNodeState>
  & ReturnType<typeof loginNodeState>
  & ReturnType<typeof browserStore>
  & ReturnType<typeof accountsStore>
  & ReturnType<typeof cookieImportStore>
  & ReturnType<typeof loginStore>
  & ReturnType<typeof accountAddStore>
  & ReturnType<typeof accountListStore>;
type PersistedState = Pick<Store, "accounts" | "cookieImport" | "login">;

const persistedStateRead = (state: Store): PersistedState => ({
  accounts: structuredClone(state.accounts),
  cookieImport: {
    ...structuredClone(state.cookieImport),
    activeBrowserId: null,
    authorizationExpiresAt: null,
    error: null,
    errorBrowserId: null,
    status: state.cookieImport.candidate ? "ready" : "idle",
  },
  login: structuredClone(login.initial),
});

const store = createStore<Store>()(
  cwdPersist({
    cwd: app.getPath("userData"),
    initializer: immer((...options) => ({
      ...browserNodeState<Store>(...options),
      ...accountsNodeState<Store>(...options),
      ...cookieImportNodeState<Store>(...options),
      ...loginNodeState<Store>(...options),
      ...browserStore<Store>(...options),
      ...accountsStore<Store>(...options),
      ...cookieImportStore<Store>(...options),
      ...loginStore<Store>(...options),
      ...accountAddStore<Store>(...options),
      ...accountListStore<Store>(...options),
      loginWindow_nodestate: undefined,
      webContents_nodestate: undefined,
    })),
    name: pkg.name,
  }),
);

store.persist.setOptions({
  partialize: state => persistedStateRead(state) as Store,
});

export default store;
