import { app } from "electron";
import cwdPersist from "extends-zustand/cwdPersist";
import { createStore } from "zustand/vanilla";
import { immer } from "zustand/middleware/immer";
import accountsStore, { accounts } from "./accounts/store.ts";
import cookieImportStore, { cookieImport } from "./cookieImport/store.ts";
import loginStore, { login } from "./login/store.ts";
import pkg from "./package.json";

type Store = ReturnType<typeof accountsStore>
  & ReturnType<typeof cookieImportStore>
  & ReturnType<typeof loginStore>;

const store = createStore<Store>()(
  cwdPersist({
    cwd: app.getPath("userData"),
    initializer: immer((...options) => ({
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

const accountsState = accounts.accountsValidator.safeParse(store.getState().accounts);
if (accountsState.success) store.setState({ accounts: accountsState.data });
else store.setState({ accounts: structuredClone(accounts.initial) });
store.setState({ login: structuredClone(login.initial) });

const cookieImportState = cookieImport.cookieImportValidator.safeParse(
  store.getState().cookieImport,
);
if (cookieImportState.success) {
  store.setState({
    cookieImport: {
      ...cookieImportState.data,
      activeBrowserId: null,
      authorizationExpiresAt: null,
      error: null,
      errorBrowserId: null,
      status: cookieImportState.data.candidate ? "ready" : "idle",
    },
  });
} else {
  const previous = store.getState().cookieImport as Partial<
    typeof cookieImport.initial
  >;
  store.setState({
    cookieImport: {
      ...structuredClone(cookieImport.initial),
      authorizationTimeoutSeconds: typeof previous.authorizationTimeoutSeconds === "number"
        ? previous.authorizationTimeoutSeconds
        : cookieImport.initial.authorizationTimeoutSeconds,
    },
  });
}

export default store;
