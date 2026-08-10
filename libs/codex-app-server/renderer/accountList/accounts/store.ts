import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import {
  accounts as producer,
  type AccountInput,
  type Accounts,
} from "codex-app-server-main/accountList/accounts/store.ts";
import type { IpcSlice } from "browser-partition-renderer/public.ts";
type AccountsSlice = {
  accounts: Accounts;
  accountsActions: {
    accountDelete(input: AccountInput): Promise<void>;
    connect(): () => void;
    stateSet(input: Accounts): void;
  };
};

const accountsStore: ImmerStateCreator<
  AccountsSlice,
  IpcSlice
> = (set, get) => ({
  accounts: structuredClone(producer.initial),
  accountsActions: {
    async accountDelete(input) {
      await get().ipcActions.invoke({
        channel: producer.channel,
        input: { method: "accountDelete" as const, ...input },
        inputValidator: producer.requestValidator,
        resultValidator: producer.resultValidator,
      });
    },
    connect() {
      void get().ipcActions.invoke({
        channel: producer.channel,
        input: { method: "stateRead" as const },
        inputValidator: producer.requestValidator,
        resultValidator: producer.accountsValidator,
      }).then(get().accountsActions.stateSet).catch(console.error);
      return get().ipcActions.subscribe({
        channel: producer.channel,
        resultValidator: producer.messageValidator,
        run: message => get().accountsActions.stateSet(message.value),
      });
    },
    stateSet(input) {
      const value = producer.accountsValidator.parse(input);
      set(state => {
        state.accounts = value;
      });
    },
  },
});

export default accountsStore;
