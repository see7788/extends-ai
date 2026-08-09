import { createStore } from "zustand/vanilla";
import { immer } from "zustand/middleware/immer";
import accountsStore from "./accounts/store.ts";
import cookieImportStore from "./cookieImport/store.ts";
import loginStore from "./login/store.ts";

type Store = ReturnType<typeof accountsStore>
  & ReturnType<typeof cookieImportStore>
  & ReturnType<typeof loginStore>;

const store = createStore<Store>()(
  immer((...options) => ({
    ...accountsStore(...options),
    ...cookieImportStore(...options),
    ...loginStore(...options),
  })),
);

export default store;
