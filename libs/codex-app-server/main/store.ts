import cwdPersist from "extends-zustand/cwdPersist";
import { app, type WebContents } from "electron";
import { createStore } from "zustand/vanilla";
import { immer } from "zustand/middleware/immer";
import browserStore from "browser-partition-main/browser/store.ts";
import authJsonCreateStore, { authJsonCreate } from "./accountAdd/authJsonCreate/store.ts";
import authJsonImportStore from "./accountAdd/authJsonImport/store.ts";
import globalSettingsStore from "./globalSettings/store.ts";
import accountStore from "./accountList/account/store.ts";
import accountsStore from "./accountList/accounts/store.ts";
import authSessionsStore, { authSessions } from "./accountList/authSessions/store.ts";
import connectionStore from "./accountList/connection/store.ts";
import rateLimitsStore, { rateLimits } from "./accountList/rateLimits/store.ts";
import schedulerStore from "./accountList/scheduler/store.ts";
import usageStore, { usage } from "./accountList/usage/store.ts";
import pkg from "./package.json";

type Store = { webContents?: WebContents }
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
  & ReturnType<typeof schedulerStore>;

const store = createStore<Store>()(
  cwdPersist({
    initializer: immer((...options) => ({
      webContents: undefined,
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
    })),
    cwd: app.getPath("userData"),
    name: pkg.name,
  }),
);

store.persist.setOptions({
  partialize: state => ({
    account: state.account,
    authJsonCreate: {
      ...structuredClone(authJsonCreate.initial),
      authorizationTimeoutSeconds: state.authJsonCreate.authorizationTimeoutSeconds,
      history: state.authJsonCreate.history,
    },
    authJsonImport: state.authJsonImport,
    globalSettings: state.globalSettings,
    accounts: state.accounts,
    authSessions: structuredClone(authSessions.initial),
    rateLimits: structuredClone(rateLimits.initial),
    scheduler: state.scheduler,
    usage: structuredClone(usage.initial),
  }) as Store,
});

export default store;
