import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import {
  type AccountInput,
  usage as producer,
  type Usage,
} from "codex-app-server-main/accountList/usage/store.ts";
import type { IpcSlice } from "browser-partition-renderer/public.ts";
type UsageSlice = {
  usage: Usage;
  usageActions: {
    connect(): () => void;
    read(input: AccountInput): Promise<void>;
    stateSet(input: Usage): void;
  };
};

const usageStore: ImmerStateCreator<
  UsageSlice,
  IpcSlice
> = (set, get) => ({
  usage: structuredClone(producer.initial),
  usageActions: {
    connect() {
      void get().ipcActions.invoke({
        channel: producer.channel,
        input: { method: "stateRead" as const },
        inputValidator: producer.requestValidator,
        resultValidator: producer.usageValidator,
      }).then(get().usageActions.stateSet).catch(console.error);
      return get().ipcActions.subscribe({
        channel: producer.channel,
        resultValidator: producer.messageValidator,
        run: message => get().usageActions.stateSet(message.value),
      });
    },
    async read(input) {
      await get().ipcActions.invoke({
        channel: producer.channel,
        input: { method: "read" as const, ...input },
        inputValidator: producer.requestValidator,
        resultValidator: producer.commandResultValidator,
      });
    },
    stateSet(input) {
      const value = producer.usageValidator.parse(input);
      set(state => {
        state.usage = value;
      });
    },
  },
});

export default usageStore;
