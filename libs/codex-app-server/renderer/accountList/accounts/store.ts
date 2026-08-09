import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import { accounts as producer } from "codex-app-server-main/accountList/accounts/store.ts";
import { invoke } from "browser-partition-renderer/public.ts";
import { z } from "zod";

const accountsValidator = producer.stateValidator;
type Accounts = z.infer<typeof accountsValidator>;
type AccountsDeleteInput = z.infer<typeof producer.input.accountDelete>;
type AccountsSlice = {
  accounts: Accounts;
  accountsActions: {
    accountDelete(input: AccountsDeleteInput): Promise<void>;
    stateSet(input: Accounts): void;
  };
};

const accounts = {
  accountsValidator,
  channel: producer.channel,
  input: producer.input,
  resultValidator: producer.resultValidator,
};

const accountsStore: ImmerStateCreator<AccountsSlice> = set => ({
  accounts: structuredClone(producer.initial),
  accountsActions: {
    async accountDelete(input) {
      await invoke({
        channel: accounts.channel.accountDelete,
        input,
        inputValidator: accounts.input.accountDelete,
        resultValidator: accounts.resultValidator,
      });
    },
    stateSet(input) {
      const value = accountsValidator.parse(input);
      set(state => {
        state.accounts = value;
      });
    },
  },
});

export { accounts, type AccountsDeleteInput };
export default accountsStore;
