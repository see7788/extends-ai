import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { stateConnect } from "browser-partition-renderer/public.ts";
import authJsonCreateStore, { authJsonCreate } from "./accountAdd/authJsonCreate/store.ts";
import authJsonImportStore, { authJsonImport } from "./accountAdd/authJsonImport/store.ts";
import globalSettingsStore, { globalSettings } from "./globalSettings/store.ts";
import accountStore, { account } from "./accountList/account/store.ts";
import accountsStore, { accounts } from "./accountList/accounts/store.ts";
import authSessionsStore, { authSessions } from "./accountList/authSessions/store.ts";
import rateLimitsStore, { rateLimits } from "./accountList/rateLimits/store.ts";
import schedulerStore, { scheduler } from "./accountList/scheduler/store.ts";
import usageStore, { usage } from "./accountList/usage/store.ts";
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

const stateError = (error: unknown): void => console.error(error);
const stateUnsubscribe = [
  stateConnect({
    error: stateError,
    readChannel: authJsonCreate.channel.stateRead,
    stateSet: store.getState().authJsonCreateActions.stateSet,
    stateUpdatedChannel: authJsonCreate.channel.stateUpdated,
    validator: authJsonCreate.authJsonCreateValidator,
  }),
  stateConnect({
    error: stateError,
    readChannel: authJsonImport.channel.stateRead,
    stateSet: store.getState().authJsonImportActions.stateSet,
    stateUpdatedChannel: authJsonImport.channel.stateUpdated,
    validator: authJsonImport.authJsonImportValidator,
  }),
  stateConnect({
    error: stateError,
    readChannel: globalSettings.channel.stateRead,
    stateSet: store.getState().globalSettingsActions.stateSet,
    stateUpdatedChannel: globalSettings.channel.stateUpdated,
    validator: globalSettings.globalSettingsValidator,
  }),
  stateConnect({
    error: stateError,
    readChannel: account.channel.stateRead,
    stateSet: store.getState().accountActions.stateSet,
    stateUpdatedChannel: account.channel.stateUpdated,
    validator: account.accountValidator,
  }),
  stateConnect({
    error: stateError,
    readChannel: accounts.channel.stateRead,
    stateSet: store.getState().accountsActions.stateSet,
    stateUpdatedChannel: accounts.channel.stateUpdated,
    validator: accounts.accountsValidator,
  }),
  stateConnect({
    error: stateError,
    readChannel: authSessions.channel.stateRead,
    stateSet: store.getState().authSessionsActions.stateSet,
    stateUpdatedChannel: authSessions.channel.stateUpdated,
    validator: authSessions.authSessionsValidator,
  }),
  stateConnect({
    error: stateError,
    readChannel: rateLimits.channel.stateRead,
    stateSet: store.getState().rateLimitsActions.stateSet,
    stateUpdatedChannel: rateLimits.channel.stateUpdated,
    validator: rateLimits.rateLimitsValidator,
  }),
  stateConnect({
    error: stateError,
    readChannel: scheduler.channel.stateRead,
    stateSet: store.getState().schedulerActions.stateSet,
    stateUpdatedChannel: scheduler.channel.stateUpdated,
    validator: scheduler.schedulerValidator,
  }),
  stateConnect({
    error: stateError,
    readChannel: usage.channel.stateRead,
    stateSet: store.getState().usageActions.stateSet,
    stateUpdatedChannel: usage.channel.stateUpdated,
    validator: usage.usageValidator,
  }),
];
if (import.meta.hot) {
  import.meta.hot.dispose(() => stateUnsubscribe.forEach(unsubscribe => unsubscribe()));
}

export default store;
