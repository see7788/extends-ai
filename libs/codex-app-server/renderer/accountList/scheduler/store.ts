import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import { scheduler as producer } from "codex-app-server-main/accountList/scheduler/store.ts";
import type { IpcSlice } from "browser-partition-renderer/public.ts";
import { z } from "zod";

const schedulerValidator = producer.schedulerValidator;
type Scheduler = z.infer<typeof schedulerValidator>;
type SchedulerSlice = {
  scheduler: Scheduler;
  schedulerActions: {
    connect(): () => void;
    runNow(): Promise<void>;
    stateSet(input: Scheduler): void;
  };
};

const scheduler = {
  channel: producer.channel,
  resultValidator: producer.resultValidator,
  schedulerValidator,
};

const schedulerStore: ImmerStateCreator<
  SchedulerSlice,
  IpcSlice
> = (set, get) => ({
  scheduler: structuredClone(producer.initial),
  schedulerActions: {
    connect() {
      return get().ipcActions.stateConnect({
        error: console.error,
        readChannel: scheduler.channel.stateRead,
        stateSet: get().schedulerActions.stateSet,
        stateUpdatedChannel: scheduler.channel.stateUpdated,
        validator: scheduler.schedulerValidator,
      });
    },
    async runNow() {
      await get().ipcActions.read({
        channel: scheduler.channel.runNow,
        resultValidator: scheduler.resultValidator,
      });
    },
    stateSet(input) {
      const value = schedulerValidator.parse(input);
      set(state => {
        state.scheduler = value;
      });
    },
  },
});

export { scheduler };
export default schedulerStore;
