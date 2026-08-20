import type { ImmerStateCreator } from "zustand-lib/immerStateCreator";
import {
  accounts as producer,
  type AccountInput,
  type Accounts,
} from "codex-app-server-main/accountList/accounts/store.ts";
import type { IpcSlice } from "browser-partition-renderer/public.ts";
import { accountList } from "codex-app-server-main/accountList/store.ts";
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
        channel: accountList.channel,
        input: { input, method: "accountDelete" as const },
        inputValidator: accountList.request.accountDelete,
        resultValidator: accountList.result.command,
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
