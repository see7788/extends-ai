import type { IpcSlice } from "browser-partition-renderer/public.ts";
import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import {
  accounts as producer,
  type AccountResult,
  type Accounts,
  type EmailInput,
} from "login-main/accounts/store.ts";
type AccountsSlice = {
  accounts: Accounts;
  accountsActions: {
    connect(): () => void;
    cookieImportConsume(): Promise<AccountResult>;
    open(input: EmailInput): Promise<void>;
    remove(input: EmailInput): Promise<void>;
    stateSet(input: Accounts): void;
    validate(input: EmailInput): Promise<void>;
  };
};

const accountsStore: ImmerStateCreator<AccountsSlice, IpcSlice> = (set, get) => ({
  accounts: structuredClone(producer.initial),
  accountsActions: {
    async cookieImportConsume() {
      return (await get().ipcActions.invoke({
        channel: producer.channel,
        input: { method: "cookieImportConsume" as const },
        inputValidator: producer.request.cookieImportConsume,
        resultValidator: producer.result.account,
      })).account;
    },
    connect() {
      const ipc = get().ipcActions;
      const stateSet = get().accountsActions.stateSet;
      void ipc.invoke({
        channel: producer.channel,
        input: { method: "stateRead" as const },
        inputValidator: producer.request.stateRead,
        resultValidator: producer.accountsValidator,
      }).then(stateSet).catch(console.error);
      return ipc.subscribe({
        channel: producer.channel,
        resultValidator: producer.accountsValidator,
        run: stateSet,
      });
    },
    async open(input) {
      await get().ipcActions.invoke({
        channel: producer.channel,
        input: { input, method: "open" as const },
        inputValidator: producer.request.open,
        resultValidator: producer.result.command,
      });
    },
    async remove(input) {
      await get().ipcActions.invoke({
        channel: producer.channel,
        input: { input, method: "remove" as const },
        inputValidator: producer.request.remove,
        resultValidator: producer.result.command,
      });
    },
    stateSet(input) {
      const value = producer.accountsValidator.parse(input);
      set(state => {
        state.accounts = structuredClone(value);
      });
    },
    async validate(input) {
      await get().ipcActions.invoke({
        channel: producer.channel,
        input: { input, method: "validate" as const },
        inputValidator: producer.request.validate,
        resultValidator: producer.result.command,
      });
    },
  },
});

export { producer as accounts };
export default accountsStore;
