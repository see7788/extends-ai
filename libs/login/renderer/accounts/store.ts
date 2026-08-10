import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import { accounts as producer } from "login-main/accounts/public.ts";
import type { IpcSlice } from "browser-partition-renderer/public.ts";

type EmailInput = ReturnType<typeof producer.input.email.parse>;
type Account = ReturnType<typeof producer.result.account.parse>["account"];

type AccountsSlice = {
  accounts: ReturnType<typeof producer.accountsValidator.parse>;
  accountsActions: {
    connect(): () => void;
    cookieImportConsume(): Promise<Account>;
    open(input: EmailInput): Promise<void>;
    remove(input: EmailInput): Promise<void>;
    stateSet(input: ReturnType<typeof producer.accountsValidator.parse>): void;
    validate(input: EmailInput): Promise<void>;
  };
};

const accountsStore: ImmerStateCreator<
  AccountsSlice,
  IpcSlice
> = (set, get) => ({
  accounts: structuredClone(producer.initial),
  accountsActions: {
    async cookieImportConsume() {
      return (await get().ipcActions.invoke({
        channel: producer.channel.cookieImportConsume,
        input: {},
        inputValidator: producer.input.command,
        resultValidator: producer.result.account,
      })).account;
    },
    connect() {
      return get().ipcActions.stateConnect({
        error: console.error,
        readChannel: producer.channel.stateRead,
        stateSet: get().accountsActions.stateSet,
        stateUpdatedChannel: producer.channel.stateUpdated,
        validator: producer.accountsValidator,
      });
    },
    async open(input) {
      await get().ipcActions.invoke({
        channel: producer.channel.open,
        input,
        inputValidator: producer.input.email,
        resultValidator: producer.result.command,
      });
    },
    async remove(input) {
      await get().ipcActions.invoke({
        channel: producer.channel.remove,
        input,
        inputValidator: producer.input.email,
        resultValidator: producer.result.command,
      });
    },
    stateSet(input) {
      set(state => {
        state.accounts = structuredClone(input);
      });
    },
    async validate(input) {
      await get().ipcActions.invoke({
        channel: producer.channel.validate,
        input,
        inputValidator: producer.input.email,
        resultValidator: producer.result.command,
      });
    },
  },
});

export { producer as accounts };
export default accountsStore;
