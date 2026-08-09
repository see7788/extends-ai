import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import { accounts as producer } from "login-main/accounts/store.ts";

type AccountsSlice = {
  accounts: ReturnType<typeof producer.accountsValidator.parse>;
  accountsActions: {
    stateSet(input: ReturnType<typeof producer.accountsValidator.parse>): void;
  };
};

const accountsStore: ImmerStateCreator<AccountsSlice> = set => ({
  accounts: structuredClone(producer.initial),
  accountsActions: {
    stateSet(input) {
      set(state => {
        state.accounts = structuredClone(input);
      });
    },
  },
});

export { producer as accounts };
export default accountsStore;
