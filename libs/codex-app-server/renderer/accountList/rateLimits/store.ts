import type { ImmerStateCreator } from "zustand-lib/immerStateCreator";
import {
  type AccountInput,
  rateLimits as producer,
  type RateLimits,
} from "codex-app-server-main/accountList/rateLimits/store.ts";
import type { IpcSlice } from "browser-partition-renderer/public.ts";
import { accountList } from "codex-app-server-main/accountList/store.ts";
type RateLimitsSlice = {
  rateLimits: RateLimits;
  rateLimitsActions: {
    connect(): () => void;
    read(input: AccountInput): Promise<void>;
    stateSet(input: RateLimits): void;
  };
};

const rateLimitsStore: ImmerStateCreator<
  RateLimitsSlice,
  IpcSlice
> = (set, get) => ({
  rateLimits: structuredClone(producer.initial),
  rateLimitsActions: {
    connect() {
      void get().ipcActions.invoke({
        channel: producer.channel,
        input: { method: "stateRead" as const },
        inputValidator: producer.requestValidator,
        resultValidator: producer.rateLimitsValidator,
      }).then(get().rateLimitsActions.stateSet).catch(console.error);
      return get().ipcActions.subscribe({
        channel: producer.channel,
        resultValidator: producer.messageValidator,
        run: message => get().rateLimitsActions.stateSet(message.value),
      });
    },
    async read(input) {
      await get().ipcActions.invoke({
        channel: accountList.channel,
        input: { input, method: "rateLimitsRead" as const },
        inputValidator: accountList.request.rateLimitsRead,
        resultValidator: accountList.result.command,
      });
    },
    stateSet(input) {
      const value = producer.rateLimitsValidator.parse(input);
      set(state => {
        state.rateLimits = value;
      });
    },
  },
});

export default rateLimitsStore;
