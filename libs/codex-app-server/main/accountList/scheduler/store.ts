import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import type { WebContents } from "electron";
import { z } from "zod";
import type { GlobalSettingsSlice } from "../../globalSettings/store.ts";

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
type Run = () => Promise<void>;
type SchedulerSlice = {
  scheduler: Scheduler;
  schedulerActions: {
    install(): () => void;
    normalize(): void;
    runNow(): Promise<void>;
    runStart(): void;
    runFinish(input: RunFinishInput): void;
    start(run: Run): void;
    stop(): void;
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

const schedulerStore: ImmerStateCreator<
  SchedulerSlice,
  GlobalSettingsSlice & { webContents?: WebContents }
> = (set, get, api) => {
  let run: Run | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let unsubscribeSettings: (() => void) | undefined;
  const timerClear = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const schedule = (): void => {
    timerClear();
    const settings = get().globalSettings;
    const state = get().scheduler;
    if (!run || !settings.maintenanceEnabled) return;
    const retry = Boolean(state.error)
      && state.consecutiveFailures <= settings.maintenanceRetryCount;
    const delay = retry
      ? settings.maintenanceRetryIntervalMinutes * 60 * 1000
      : settings.maintenanceIntervalHours * 60 * 60 * 1000;
    const lastRunAt = state.lastRunAt ? Date.parse(state.lastRunAt) : Number.NaN;
    const nextRunAt = Number.isFinite(lastRunAt)
      ? Math.max(Date.now(), lastRunAt + delay)
      : Date.now();
    const remaining = Math.max(0, nextRunAt - Date.now());
    timer = setTimeout(() => {
      timer = undefined;
      if (Date.now() < nextRunAt) {
        schedule();
        return;
      }
      void run?.().finally(schedule);
    }, Math.min(remaining, 2_147_000_000));
  };
  const stateSend = (): void => get().webContents?.send(
    scheduler.channel.stateUpdated,
    schedulerValidator.parse(get().scheduler),
  );
  return ({
  scheduler: structuredClone(initial),
  schedulerActions: {
    install() {
      const contents = get().webContents;
      if (!contents || contents.isDestroyed()) {
        throw new Error("CodexAppServer WebContents 不可用");
      }
      contents.ipc.handle(scheduler.channel.runNow, async () => {
        await get().schedulerActions.runNow();
        return resultValidator.parse({ ok: true });
      });
      contents.ipc.handle(scheduler.channel.stateRead, () => (
        schedulerValidator.parse(get().scheduler)
      ));
      return () => {
        contents.ipc.removeHandler(scheduler.channel.runNow);
        contents.ipc.removeHandler(scheduler.channel.stateRead);
      };
    },
    normalize() {
      const value = schedulerValidator.safeParse(get().scheduler);
      set(state => {
        state.scheduler = value.success
          ? { ...value.data, running: false }
          : structuredClone(initial);
      });
      stateSend();
    },
    async runNow() {
      if (!run) return;
      timerClear();
      try {
        await run();
      } finally {
        schedule();
      }
    },
    runStart() {
      set(state => {
        state.scheduler.running = true;
        state.scheduler.error = null;
      });
      stateSend();
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
      stateSend();
    },
    start(input) {
      get().schedulerActions.normalize();
      run = input;
      unsubscribeSettings?.();
      unsubscribeSettings = api.subscribe((state, previous) => {
        if (state.globalSettings !== previous.globalSettings) schedule();
      });
      schedule();
    },
    stop() {
      timerClear();
      unsubscribeSettings?.();
      unsubscribeSettings = undefined;
      run = undefined;
    },
  },
  });
};

export type { SchedulerSlice };
export { scheduler };
export default schedulerStore;
