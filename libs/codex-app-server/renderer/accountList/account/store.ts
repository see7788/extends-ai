import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import { account as producer } from "codex-app-server-main/accountList/account/store.ts";
import type { IpcSlice } from "browser-partition-renderer/public.ts";
import { z } from "zod";

const accountValidator = producer.accountStateValidator;
type Account = z.infer<typeof producer.accountValidator>;
type AccountState = z.infer<typeof accountValidator>;
type AccountEnabledSetInput = z.infer<typeof producer.input.enabledSet>;
type AccountLabelSetInput = z.infer<typeof producer.input.labelSet>;
type AccountOfficialOpenInput = z.infer<typeof producer.input.officialOpen>;
type AccountSlice = {
  account: AccountState;
  accountActions: {
    connect(): () => void;
    enabledSet(input: AccountEnabledSetInput): Promise<void>;
    labelSet(input: AccountLabelSetInput): Promise<void>;
    officialOpen(input: AccountOfficialOpenInput): Promise<void>;
    stateSet(input: AccountState): void;
  };
};

const account = {
  accountIdValidator: producer.accountIdValidator,
  accountValidator,
  channel: producer.channel,
  input: producer.input,
  resultValidator: producer.resultValidator,
};
const accountStore: ImmerStateCreator<
  AccountSlice,
  IpcSlice
> = (set, get) => ({
  account: structuredClone(producer.initial),
  accountActions: {
    connect() {
      return get().ipcActions.stateConnect({
        error: console.error,
        readChannel: account.channel.stateRead,
        stateSet: get().accountActions.stateSet,
        stateUpdatedChannel: account.channel.stateUpdated,
        validator: account.accountValidator,
      });
    },
    async enabledSet(input) {
      await get().ipcActions.invoke({
        channel: account.channel.enabledSet,
        input,
        inputValidator: account.input.enabledSet,
        resultValidator: account.resultValidator,
      });
    },
    async labelSet(input) {
      await get().ipcActions.invoke({
        channel: account.channel.labelSet,
        input,
        inputValidator: account.input.labelSet,
        resultValidator: account.resultValidator,
      });
    },
    async officialOpen(input) {
      await get().ipcActions.invoke({
        channel: account.channel.officialOpen,
        input,
        inputValidator: account.input.officialOpen,
        resultValidator: account.resultValidator,
      });
    },
    stateSet(input) {
      const value = accountValidator.parse(input);
      set(state => {
        state.account = value;
      });
    },
  },
});

export {
  account,
  type Account,
  type AccountEnabledSetInput,
  type AccountLabelSetInput,
  type AccountOfficialOpenInput,
};
export default accountStore;
