import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import accountsStore from "./accounts/store.ts";
import cookieImportStore from "./cookieImport/store.ts";
import loginStore from "./login/store.ts";

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

export default store;
