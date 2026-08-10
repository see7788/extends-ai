import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import {
  account as producer,
  type AccountState,
  type AccountReadInput,
  type EnabledSetInput,
  type LabelSetInput,
} from "codex-app-server-main/accountList/account/store.ts";
import type { IpcSlice } from "browser-partition-renderer/public.ts";
import { accountList } from "codex-app-server-main/accountList/store.ts";

type AccountSlice = {
  account: AccountState;
  accountActions: {
    connect(): () => void;
    enabledSet(input: EnabledSetInput): Promise<void>;
    labelSet(input: LabelSetInput): Promise<void>;
    officialOpen(input: AccountReadInput): Promise<void>;
    stateSet(input: AccountState): void;
  };
};

const accountStore: ImmerStateCreator<
  AccountSlice,
  IpcSlice
> = (set, get) => ({
  account: structuredClone(producer.initial),
  accountActions: {
    connect() {
      void get().ipcActions.invoke({
        channel: producer.channel,
        input: { method: "stateRead" as const },
        inputValidator: producer.requestValidator,
        resultValidator: producer.accountStateValidator,
      }).then(get().accountActions.stateSet).catch(console.error);
      return get().ipcActions.subscribe({
        channel: producer.channel,
        resultValidator: producer.messageValidator,
        run: message => get().accountActions.stateSet(message.value),
      });
    },
    async enabledSet(input) {
      await get().ipcActions.invoke({
        channel: accountList.channel,
        input: { input, method: "enabledSet" as const },
        inputValidator: accountList.request.enabledSet,
        resultValidator: accountList.result.command,
      });
    },
    async labelSet(input) {
      await get().ipcActions.invoke({
        channel: producer.channel,
        input: { method: "labelSet" as const, ...input },
        inputValidator: producer.requestValidator,
        resultValidator: producer.resultValidator,
      });
    },
    async officialOpen(input) {
      await get().ipcActions.invoke({
        channel: producer.channel,
        input: { method: "officialOpen" as const, ...input },
        inputValidator: producer.requestValidator,
        resultValidator: producer.resultValidator,
      });
    },
    stateSet(input) {
      const value = producer.accountStateValidator.parse(input);
      set(state => {
        state.account = value;
      });
    },
  },
});

export default accountStore;
