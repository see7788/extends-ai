import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import authJsonCreateStore from "./accountAdd/authJsonCreate/store.ts";
import authJsonImportStore from "./accountAdd/authJsonImport/store.ts";
import globalSettingsStore from "./globalSettings/store.ts";
import accountStore from "./accountList/account/store.ts";
import accountsStore from "./accountList/accounts/store.ts";
import authSessionsStore from "./accountList/authSessions/store.ts";
import rateLimitsStore from "./accountList/rateLimits/store.ts";
import schedulerStore from "./accountList/scheduler/store.ts";
import usageStore from "./accountList/usage/store.ts";
import themeStore from "./theme/store.ts";

type Store = ReturnType<typeof accountStore>
  & ReturnType<typeof authJsonCreateStore>
  & ReturnType<typeof authJsonImportStore>
  & ReturnType<typeof globalSettingsStore>
  & ReturnType<typeof accountsStore>
  & ReturnType<typeof authSessionsStore>
  & ReturnType<typeof rateLimitsStore>
  & ReturnType<typeof usageStore>
  & ReturnType<typeof schedulerStore>
  & ReturnType<typeof themeStore>;

const store = create<Store>()(
  immer((...options) => ({
    ...accountStore(...options),
    ...authJsonCreateStore(...options),
    ...authJsonImportStore(...options),
    ...globalSettingsStore(...options),
    ...accountsStore(...options),
    ...authSessionsStore(...options),
    ...rateLimitsStore(...options),
    ...usageStore(...options),
    ...schedulerStore(...options),
    ...themeStore(...options),
  })),
);

export default store;
