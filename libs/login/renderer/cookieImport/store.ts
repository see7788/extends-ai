import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import { cookieImport as producer } from "login-main/cookieImport/store.ts";

type CookieImportSlice = {
  cookieImport: ReturnType<typeof producer.cookieImportValidator.parse>;
  cookieImportActions: {
    stateSet(input: ReturnType<typeof producer.cookieImportValidator.parse>): void;
  };
};

const cookieImportStore: ImmerStateCreator<CookieImportSlice> = set => ({
  cookieImport: structuredClone(producer.initial),
  cookieImportActions: {
    stateSet(input) {
      set(state => {
        state.cookieImport = structuredClone(input);
      });
    },
  },
});

export { producer as cookieImport };
export default cookieImportStore;
