import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import { scheduler as producer } from "codex-app-server-main/accountList/scheduler/store.ts";
import { z } from "zod";

const schedulerValidator = producer.schedulerValidator;
type Scheduler = z.infer<typeof schedulerValidator>;
type SchedulerSlice = {
  scheduler: Scheduler;
  schedulerActions: {
    stateSet(input: Scheduler): void;
  };
};

const scheduler = {
  channel: producer.channel,
  resultValidator: producer.resultValidator,
  schedulerValidator,
};

const schedulerStore: ImmerStateCreator<SchedulerSlice> = set => ({
  scheduler: structuredClone(producer.initial),
  schedulerActions: {
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
