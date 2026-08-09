import { errorText } from "../public.ts";
import store from "../store.ts";
import authSessionsIndex from "./authSessions/index.ts";
import rateLimitsIndex from "./rateLimits/index.ts";
import schedulerIndex from "./scheduler/index.ts";
import usageIndex from "./usage/index.ts";

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

const accountListIndex = {
  refresh(): Promise<void> {
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
          await authSessionsIndex.read({ accountId });
          await rateLimitsIndex.read({ accountId });
          await usageIndex.read({ accountId });
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
  },
  start(): void {
    queryStateClear();
    if (store.getState().globalSettings.codexHome) {
      store.getState().accountActions.enabledNormalize();
    } else {
      store.getState().accountActions.enabledClear();
    }
    schedulerIndex.start(accountListIndex.refresh);
    if (dataMissing()) void accountListIndex.refresh();
  },
  async pause(): Promise<void> {
    schedulerIndex.stop();
    await refreshing;
  },
  resume(): void {
    schedulerIndex.start(accountListIndex.refresh);
  },
  stop(): void {
    schedulerIndex.stop();
  },
};

export default accountListIndex;
