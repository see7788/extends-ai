import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import { usage as producer } from "codex-app-server-main/accountList/usage/store.ts";
import type { IpcSlice } from "browser-partition-renderer/public.ts";
import { z } from "zod";

const usageValidator = producer.usageValidator;
type Usage = z.infer<typeof usageValidator>;
type UsageReadInput = z.infer<typeof producer.input.command>;
type UsageSlice = {
  usage: Usage;
  usageActions: {
    connect(): () => void;
    read(input: UsageReadInput): Promise<void>;
    stateSet(input: Usage): void;
  };
};

const usage = {
  channel: producer.channel,
  commandResultValidator: producer.commandResultValidator,
  input: producer.input,
  usageValidator,
};
const usageStore: ImmerStateCreator<
  UsageSlice,
  IpcSlice
> = (set, get) => ({
  usage: structuredClone(producer.initial),
  usageActions: {
    connect() {
      return get().ipcActions.stateConnect({
        error: console.error,
        readChannel: usage.channel.stateRead,
        stateSet: get().usageActions.stateSet,
        stateUpdatedChannel: usage.channel.stateUpdated,
        validator: usage.usageValidator,
      });
    },
    async read(input) {
      await get().ipcActions.invoke({
        channel: usage.channel.read,
        input,
        inputValidator: usage.input.command,
        resultValidator: usage.commandResultValidator,
      });
    },
    stateSet(input) {
      const value = usageValidator.parse(input);
      set(state => {
        state.usage = value;
      });
    },
  },
});

export { usage, type UsageReadInput };
export default usageStore;
