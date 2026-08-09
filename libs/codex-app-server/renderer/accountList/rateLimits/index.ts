import { useStore } from "zustand";
import store from "../../store/index.ts";
import { invoke, read, subscribe } from "browser-partition-renderer/public.ts";
import { rateLimits, type RateLimitsReadInput } from "./store.ts";

const rateLimitsIndex = {
  async read(input: RateLimitsReadInput): Promise<void> {
    await invoke({
      channel: rateLimits.channel.read,
      input,
      inputValidator: rateLimits.input.command,
      resultValidator: rateLimits.commandResultValidator,
    });
    await rateLimitsIndex.stateRead();
  },
  async stateRead(): Promise<void> {
    const state = await read({
      channel: rateLimits.channel.stateRead,
      resultValidator: rateLimits.rateLimitsValidator,
    });
    store.getState().rateLimitsActions.stateSet(state);
  },
  stateSubscribe(): () => void {
    return subscribe({
      channel: rateLimits.channel.stateUpdated,
      resultValidator: rateLimits.rateLimitsValidator,
      run: store.getState().rateLimitsActions.stateSet,
    });
  },
  use(accountId: string) {
    return useStore(store, state => state.rateLimits.byAccountId[accountId]);
  },
};

export default rateLimitsIndex;
