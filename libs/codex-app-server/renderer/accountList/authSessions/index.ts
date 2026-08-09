import { useStore } from "zustand";
import store from "../../store/index.ts";
import { invoke, read, subscribe } from "browser-partition-renderer/public.ts";
import { authSessions, type AuthSessionsCommandInput } from "./store.ts";

const authSessionsIndex = {
  async read(input: AuthSessionsCommandInput): Promise<void> {
    await invoke({
      channel: authSessions.channel.read,
      input,
      inputValidator: authSessions.input.command,
      resultValidator: authSessions.resultValidator,
    });
    await authSessionsIndex.stateRead();
  },
  async stateRead(): Promise<void> {
    const state = await read({
      channel: authSessions.channel.stateRead,
      resultValidator: authSessions.authSessionsValidator,
    });
    store.getState().authSessionsActions.stateSet(state);
  },
  stateSubscribe(): () => void {
    return subscribe({
      channel: authSessions.channel.stateUpdated,
      resultValidator: authSessions.authSessionsValidator,
      run: store.getState().authSessionsActions.stateSet,
    });
  },
  use(accountId: string) {
    return useStore(store, state => state.authSessions.byAccountId[accountId]);
  },
};

export default authSessionsIndex;
