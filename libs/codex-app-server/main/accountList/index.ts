import { errorText } from "../public.ts";
import store from "../store.ts";
import { read as authSessionsRead } from "./authSessions/index.ts";
import { read as rateLimitsRead } from "./rateLimits/index.ts";
import { start as schedulerStart, stop as schedulerStop } from "./scheduler/index.ts";
import { read as usageRead } from "./usage/index.ts";

let refreshing: Promise<void> | undefined;
const queryStateClear = (): void => {
  const state = store.getState();
  for (const accountId of Object.keys(state.authSessions.byAccountId)) {
    state.authSessionsActions.accountDelete({ accountId });
  }
  for (const accountId of Object.keys(state.rateLimits.byAccountId)) {
    state.rateLimitsActions.accountDelete({ accountId });
  }
  for (const accountId of Object.keys(state.usage.byAccountId)) {
    state.usageActions.accountDelete({ accountId });
  }
};
const dataMissing = (): boolean => store.getState().accounts.order.some(accountId => (
  Boolean(store.getState().account[accountId])
  && (
    !store.getState().authSessions.byAccountId[accountId]
    || !store.getState().rateLimits.byAccountId[accountId]
    || !store.getState().usage.byAccountId[accountId]
  )
));

export const refresh = (): Promise<void> => {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      store.getState().schedulerActions.runStart();
      let refreshError: string | null = null;
      for (const accountId of store.getState().accounts.order) {
        if (!store.getState().account[accountId]) continue;
        if (
          store.getState().authSessions.byAccountId[accountId]?.status
          === "requiresLogin"
        ) continue;
        try {
          await authSessionsRead({ accountId });
          await rateLimitsRead({ accountId });
          await usageRead({ accountId });
        } catch (error) {
          refreshError ??= errorText(error);
        }
      }
      store.getState().schedulerActions.runFinish({
        lastRunAt: new Date().toISOString(),
        error: refreshError,
      });
    })().finally(() => {
      refreshing = undefined;
    });
    return refreshing;
};

const start = (): void => {
    queryStateClear();
    if (store.getState().globalSettings.codexHome) {
      store.getState().accountActions.enabledNormalize();
    } else {
      store.getState().accountActions.enabledClear();
    }
    schedulerStart(refresh);
    if (dataMissing()) void refresh();
};

export const pause = async (): Promise<void> => {
    schedulerStop();
    await refreshing;
};

export const resume = (): void => {
    schedulerStart(refresh);
};

export const stop = (): void => {
    schedulerStop();
};

export default start;
