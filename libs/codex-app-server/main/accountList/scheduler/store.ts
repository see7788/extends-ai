import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import { z } from "zod";

const schedulerValidator = z.object({
  running: z.boolean(),
  consecutiveFailures: z.number().int().nonnegative(),
  lastRunAt: z.string().datetime({ offset: true }).nullable(),
  error: z.string().nullable(),
});
const runFinishValidator = schedulerValidator.pick({ lastRunAt: true, error: true });
const resultValidator = z.object({ ok: z.literal(true) });

type Scheduler = z.infer<typeof schedulerValidator>;
type RunFinishInput = z.infer<typeof runFinishValidator>;
type SchedulerSlice = {
  scheduler: Scheduler;
  schedulerActions: {
    normalize(): void;
    runStart(): void;
    runFinish(input: RunFinishInput): void;
  };
};

const initial: Scheduler = {
  running: false,
  consecutiveFailures: 0,
  lastRunAt: null,
  error: null,
};
const scheduler = {
  channel: {
    runNow: "account-list:scheduler-run-now",
    stateRead: "account-list:scheduler-state-read",
    stateUpdated: "account-list:scheduler-state-updated",
  },
  initial,
  input: {
    runFinish: runFinishValidator,
  },
  schedulerValidator,
  resultValidator,
};

const schedulerStore: ImmerStateCreator<SchedulerSlice> = (set, get) => ({
  scheduler: structuredClone(initial),
  schedulerActions: {
    normalize() {
      const value = schedulerValidator.safeParse(get().scheduler);
      set(state => {
        state.scheduler = value.success
          ? { ...value.data, running: false }
          : structuredClone(initial);
      });
    },
    runStart() {
      set(state => {
        state.scheduler.running = true;
        state.scheduler.error = null;
      });
    },
    runFinish(input) {
      const value = runFinishValidator.parse(input);
      set(state => {
        state.scheduler.running = false;
        state.scheduler.lastRunAt = value.lastRunAt;
        state.scheduler.error = value.error;
        state.scheduler.consecutiveFailures = value.error
          ? state.scheduler.consecutiveFailures + 1
          : 0;
      });
    },
  },
});

export { scheduler };
export default schedulerStore;
