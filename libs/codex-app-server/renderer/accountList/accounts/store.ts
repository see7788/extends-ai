import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import { accounts as producer } from "codex-app-server-main/accountList/accounts/store.ts";
import type { IpcSlice } from "browser-partition-renderer/public.ts";
import { z } from "zod";

const accountsValidator = producer.stateValidator;
type Accounts = z.infer<typeof accountsValidator>;
type AccountsDeleteInput = z.infer<typeof producer.input.accountDelete>;
type AccountsSlice = {
  accounts: Accounts;
  accountsActions: {
    accountDelete(input: AccountsDeleteInput): Promise<void>;
    connect(): () => void;
    stateSet(input: Accounts): void;
  };
};

const accounts = {
  accountsValidator,
  channel: producer.channel,
  input: producer.input,
  resultValidator: producer.resultValidator,
};

const accountsStore: ImmerStateCreator<
  AccountsSlice,
  IpcSlice
> = (set, get) => ({
  accounts: structuredClone(producer.initial),
  accountsActions: {
    async accountDelete(input) {
      await get().ipcActions.invoke({
        channel: accounts.channel.accountDelete,
        input,
        inputValidator: accounts.input.accountDelete,
        resultValidator: accounts.resultValidator,
      });
    },
    connect() {
      return get().ipcActions.stateConnect({
        error: console.error,
        readChannel: accounts.channel.stateRead,
        stateSet: get().accountsActions.stateSet,
        stateUpdatedChannel: accounts.channel.stateUpdated,
        validator: accounts.accountsValidator,
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
