import { app, type WebContents } from "electron";
import cwdPersist from "extends-zustand/cwdPersist";
import { createStore } from "zustand/vanilla";
import { immer } from "zustand/middleware/immer";
import browserStore from "browser-partition-main/browser/store.ts";
import accountsStore from "./accounts/store.ts";
import cookieImportStore from "./cookieImport/store.ts";
import loginStore, { login } from "./login/store.ts";
import pkg from "./package.json";

type Store = { webContents?: WebContents }
  & ReturnType<typeof browserStore>
  & ReturnType<typeof accountsStore>
  & ReturnType<typeof cookieImportStore>
  & ReturnType<typeof loginStore>;

const store = createStore<Store>()(
  cwdPersist({
    cwd: app.getPath("userData"),
    initializer: immer((...options) => ({
      webContents: undefined,
      ...browserStore(...options),
      ...accountsStore(...options),
      ...cookieImportStore(...options),
      ...loginStore(...options),
    })),
    name: pkg.name,
  }),
);

store.persist.setOptions({
  partialize: state => ({
    accounts: state.accounts,
    cookieImport: {
      ...state.cookieImport,
      activeBrowserId: null,
      authorizationExpiresAt: null,
      error: null,
      errorBrowserId: null,
      status: state.cookieImport.candidate ? "ready" : "idle",
    },
    login: structuredClone(login.initial),
  }) as Store,
});

export default store;
