import { ipcMain, type IpcMainInvokeEvent, type WebContents } from "electron";
import store from "../../store.ts";
import { scheduler } from "./store.ts";

type Run = () => Promise<void>;

let renderer: WebContents | undefined;
let run: Run | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let unsubscribeSettings: (() => void) | undefined;
const rendererSet = (event: IpcMainInvokeEvent): void => {
  renderer = event.sender;
};
const timerClear = (): void => {
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
};
const schedule = (): void => {
  timerClear();
  const settings = store.getState().globalSettings;
  const state = store.getState().scheduler;
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

export const runNow = async (): Promise<void> => {
    if (!run) return;
    timerClear();
    try {
      await run();
    } finally {
      schedule();
    }
};

export const start = (input: Run): void => {
    store.getState().schedulerActions.normalize();
    run = input;
    unsubscribeSettings?.();
    unsubscribeSettings = store.subscribe((state, previous) => {
      if (state.globalSettings !== previous.globalSettings) schedule();
    });
    schedule();
};

export const stop = (): void => {
    timerClear();
    unsubscribeSettings?.();
    unsubscribeSettings = undefined;
    run = undefined;
};

const install = (): (() => void) => {
    const stateRead = () => scheduler.schedulerValidator.parse(store.getState().scheduler);
    ipcMain.handle(scheduler.channel.runNow, async event => {
      rendererSet(event);
      await runNow();
      return scheduler.resultValidator.parse({ ok: true });
    });
    ipcMain.handle(scheduler.channel.stateRead, event => {
      rendererSet(event);
      return stateRead();
    });
    const unsubscribe = store.subscribe((state, previous) => {
      if (state.scheduler !== previous.scheduler && renderer && !renderer.isDestroyed()) {
        renderer.send(scheduler.channel.stateUpdated, stateRead());
      }
    });
    return () => {
      unsubscribe();
      renderer = undefined;
      ipcMain.removeHandler(scheduler.channel.runNow);
      ipcMain.removeHandler(scheduler.channel.stateRead);
    };
};

export default install;
