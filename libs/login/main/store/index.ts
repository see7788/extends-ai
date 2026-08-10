import browserStore from "browser-partition-main/browser/store.ts";
import cwdPersist from "extends-zustand/cwdPersist";
import { app } from "electron";
import { createStore } from "zustand/vanilla";
import { immer } from "zustand/middleware/immer";
import accountsStore from "../accounts/store.ts";
import cookieImportStore from "../cookieImport/store.ts";
import loginStore, { login } from "../login/store.ts";
import pkg from "../package.json";
import nodeState from "./nodeState.ts";

type Store = ReturnType<typeof nodeState>
  & ReturnType<typeof browserStore>
  & ReturnType<typeof accountsStore>
  & ReturnType<typeof cookieImportStore>
  & ReturnType<typeof loginStore>;
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
      ...nodeState<Store>(...options),
      ...browserStore<Store>(...options),
      ...accountsStore<Store>(...options),
      ...cookieImportStore<Store>(...options),
      ...loginStore<Store>(...options),
    })),
    name: pkg.name,
  }),
);

store.persist.setOptions({
  partialize: state => persistedStateRead(state) as Store,
});

export default store;
