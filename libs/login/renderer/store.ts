import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { stateConnect } from "browser-partition-renderer/public.ts";
import accountsStore, { accounts } from "./accounts/store.ts";
import cookieImportStore, { cookieImport } from "./cookieImport/store.ts";
import loginStore, { login } from "./login/store.ts";

type Store = ReturnType<typeof accountsStore>
  & ReturnType<typeof cookieImportStore>
  & ReturnType<typeof loginStore>;

const store = create<Store>()(
  immer((...options) => ({
    ...accountsStore(...options),
    ...cookieImportStore(...options),
    ...loginStore(...options),
  })),
);

const stateError = (error: unknown): void => console.error(error);
const stateUnsubscribe = [
  stateConnect({
    error: stateError,
    readChannel: login.channel.stateRead,
    stateSet: store.getState().loginActions.stateSet,
    stateUpdatedChannel: login.channel.stateUpdated,
    validator: login.loginValidator,
  }),
  stateConnect({
    error: stateError,
    readChannel: cookieImport.channel.stateRead,
    stateSet: store.getState().cookieImportActions.stateSet,
    stateUpdatedChannel: cookieImport.channel.stateUpdated,
    validator: cookieImport.cookieImportValidator,
  }),
  stateConnect({
    error: stateError,
    readChannel: accounts.channel.stateRead,
    stateSet: store.getState().accountsActions.stateSet,
    stateUpdatedChannel: accounts.channel.stateUpdated,
    validator: accounts.accountsValidator,
  }),
];
if (import.meta.hot) {
  import.meta.hot.dispose(() => stateUnsubscribe.forEach(unsubscribe => unsubscribe()));
}

export default store;
