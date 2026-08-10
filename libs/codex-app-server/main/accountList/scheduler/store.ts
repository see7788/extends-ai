import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import type { WebContents } from "electron";
import { z } from "zod";

const schedulerValidator = z.object({
  running: z.boolean(),
  consecutiveFailures: z.number().int().nonnegative(),
  lastRunAt: z.string().datetime({ offset: true }).nullable(),
  error: z.string().nullable(),
});
const runFinishValidator = schedulerValidator.pick({ lastRunAt: true, error: true });
const requestValidator = z.discriminatedUnion("method", [
  z.object({ method: z.literal("stateRead") }),
]);
const messageValidator = z.object({
  method: z.literal("stateUpdated"),
  value: schedulerValidator,
});

type Scheduler = z.infer<typeof schedulerValidator>;
type RunFinishInput = z.infer<typeof runFinishValidator>;
type SchedulerSlice = {
  scheduler: Scheduler;
  schedulerActions: {
    communicationStart(): () => void;
    normalize(): void;
    runStart(): void;
    runFinish(input: RunFinishInput): void;
  };
  schedulerPrivateActions: {
    stateSend(): void;
  };
};
type nodeState_t = { webContents_nodestate?: WebContents };

const initial: Scheduler = {
  running: false,
  consecutiveFailures: 0,
  lastRunAt: null,
  error: null,
};
const scheduler = {
  channel: "scheduler",
  initial,
  messageValidator,
  requestValidator,
  runFinishValidator,
  schedulerValidator,
};

const schedulerStore: ImmerStateCreator<SchedulerSlice, nodeState_t> = (set, get) => ({
  scheduler: structuredClone(initial),
  schedulerActions: {
    communicationStart() {
      const contents = get().webContents_nodestate;
      if (!contents || contents.isDestroyed()) throw new Error("WebContents 不可用");
      contents.ipc.handle(scheduler.channel, (_event, input: unknown) => {
        scheduler.requestValidator.parse(input);
        return scheduler.schedulerValidator.parse(get().scheduler);
      });
      return () => contents.ipc.removeHandler(scheduler.channel);
    },
    normalize() {
      const value = schedulerValidator.safeParse(get().scheduler);
      set(state => {
        state.scheduler = value.success
          ? { ...value.data, running: false }
          : structuredClone(initial);
      });
      get().schedulerPrivateActions.stateSend();
    },
    runStart() {
      set(state => {
        state.scheduler.running = true;
        state.scheduler.error = null;
      });
      get().schedulerPrivateActions.stateSend();
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
      get().schedulerPrivateActions.stateSend();
    },
  },
  schedulerPrivateActions: {
    stateSend() {
      get().webContents_nodestate?.send(scheduler.channel, messageValidator.parse({
        method: "stateUpdated",
        value: get().scheduler,
      }));
    },
  },
});

export type { Scheduler, SchedulerSlice, nodeState_t };
export { scheduler };
export default schedulerStore;
