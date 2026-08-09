import { useStore } from "zustand";
import store from "../../store.ts";
import { invoke, read, subscribe } from "browser-partition-renderer/public.ts";
import { usage, type UsageReadInput } from "./store.ts";

const usageIndex = {
  async read(input: UsageReadInput): Promise<void> {
    await invoke({
      channel: usage.channel.read,
      input,
      inputValidator: usage.input.command,
      resultValidator: usage.commandResultValidator,
    });
    await usageIndex.stateRead();
  },
  async stateRead(): Promise<void> {
    const state = await read({
      channel: usage.channel.stateRead,
      resultValidator: usage.usageValidator,
    });
    store.getState().usageActions.stateSet(state);
  },
  stateSubscribe(): () => void {
    return subscribe({
      channel: usage.channel.stateUpdated,
      resultValidator: usage.usageValidator,
      run: store.getState().usageActions.stateSet,
    });
  },
  use(accountId: string) {
    return useStore(store, state => state.usage.byAccountId[accountId]);
  },
};

export default usageIndex;
