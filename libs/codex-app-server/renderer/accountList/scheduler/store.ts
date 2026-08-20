import type { ImmerStateCreator } from "zustand-lib/immerStateCreator";
import {
  scheduler as producer,
  type Scheduler,
} from "codex-app-server-main/accountList/scheduler/store.ts";
import type { IpcSlice } from "browser-partition-renderer/public.ts";
import { accountList } from "codex-app-server-main/accountList/store.ts";
type SchedulerSlice = {
  scheduler: Scheduler;
  schedulerActions: {
    connect(): () => void;
    runNow(): Promise<void>;
    stateSet(input: Scheduler): void;
  };
};

const schedulerStore: ImmerStateCreator<
  SchedulerSlice,
  IpcSlice
> = (set, get) => ({
  scheduler: structuredClone(producer.initial),
  schedulerActions: {
    connect() {
      void get().ipcActions.invoke({
        channel: producer.channel,
        input: { method: "stateRead" as const },
        inputValidator: producer.requestValidator,
        resultValidator: producer.schedulerValidator,
      }).then(get().schedulerActions.stateSet).catch(console.error);
      return get().ipcActions.subscribe({
        channel: producer.channel,
        resultValidator: producer.messageValidator,
        run: message => get().schedulerActions.stateSet(message.value),
      });
    },
    async runNow() {
      await get().ipcActions.invoke({
        channel: accountList.channel,
        input: { method: "runNow" as const },
        inputValidator: accountList.request.runNow,
        resultValidator: accountList.result.command,
      });
    },
    stateSet(input) {
      const value = producer.schedulerValidator.parse(input);
      set(state => {
        state.scheduler = value;
      });
    },
  },
});

export default schedulerStore;
