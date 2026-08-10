import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import type { WebContents } from "electron";
import { castDraft } from "immer";
import { z } from "zod";

const accountIdValidator = z.string().regex(/^[a-f0-9]{24}$/);
const accountCommandValidator = z.object({ accountId: accountIdValidator });
const nullableMetricValidator = z.number().nonnegative().nullable();
const resultValidator = z.object({
  summary: z.object({
    lifetimeTokens: nullableMetricValidator,
    peakDailyTokens: nullableMetricValidator,
    longestRunningTurnSec: nullableMetricValidator,
    currentStreakDays: nullableMetricValidator,
    longestStreakDays: nullableMetricValidator,
  }).passthrough(),
  dailyUsageBuckets: z.array(z.object({
    startDate: z.string(),
    tokens: z.number().nonnegative(),
  }).passthrough()).nullable(),
}).passthrough();
const accountStateValidator = z.object({
  status: z.enum(["idle", "loading", "ready", "error"]),
  value: resultValidator.nullable(),
  updatedAt: z.string().datetime({ offset: true }).nullable(),
  error: z.string().nullable(),
});
const usageValidator = z.object({
  byAccountId: z.record(accountIdValidator, accountStateValidator),
});
const resultSetValidator = accountCommandValidator.extend({
  result: resultValidator,
  updatedAt: z.string().datetime({ offset: true }),
});
const errorSetValidator = accountCommandValidator.extend({ error: z.string() });
const requestValidator = z.discriminatedUnion("method", [
  z.object({ method: z.literal("stateRead") }),
]);
const messageValidator = z.object({
  method: z.literal("stateUpdated"),
  value: usageValidator,
});

type Usage = z.infer<typeof usageValidator>;
type AccountInput = z.infer<typeof accountCommandValidator>;
type UsageSlice = {
  usage: Usage;
  usageActions: {
    accountDelete(input: AccountInput): void;
    communicationStart(): () => void;
    loadingSet(input: AccountInput): void;
    resultSet(input: z.infer<typeof resultSetValidator>): void;
    errorSet(input: z.infer<typeof errorSetValidator>): void;
  };
};
type nodeState_t = { webContents?: WebContents };

const accountStateInitial: z.infer<typeof accountStateValidator> = {
  status: "idle",
  value: null,
  updatedAt: null,
  error: null,
};
const initial: Usage = { byAccountId: {} };
const usage = {
  accountStateInitial,
  accountStateValidator,
  channel: "usage",
  initial,
  input: {
    command: accountCommandValidator,
    errorSet: errorSetValidator,
    resultSet: resultSetValidator,
  },
  messageValidator,
  requestValidator,
  resultValidator,
  usageValidator,
};

const usageStore: ImmerStateCreator<UsageSlice, nodeState_t> = (set, get) => {
  const stateSend = (): void => get().webContents?.send(
    usage.channel,
    messageValidator.parse({ method: "stateUpdated", value: get().usage }),
  );
  return {
    usage: structuredClone(initial),
    usageActions: {
      accountDelete(input) {
        const { accountId } = accountCommandValidator.parse(input);
        set(state => { delete state.usage.byAccountId[accountId]; });
        stateSend();
      },
      communicationStart() {
        const contents = get().webContents;
        if (!contents || contents.isDestroyed()) throw new Error("WebContents 不可用");
        contents.ipc.handle(usage.channel, (_event, input: unknown) => {
          usage.requestValidator.parse(input);
          return usage.usageValidator.parse(get().usage);
        });
        return () => contents.ipc.removeHandler(usage.channel);
      },
      loadingSet(input) {
        const value = accountCommandValidator.parse(input);
        set(state => {
          const previous = state.usage.byAccountId[value.accountId];
          state.usage.byAccountId[value.accountId] = {
            status: "loading",
            value: previous?.value ?? null,
            updatedAt: previous?.updatedAt ?? null,
            error: null,
          };
        });
        stateSend();
      },
      resultSet(input) {
        const value = resultSetValidator.parse(input);
        set(state => {
          state.usage.byAccountId[value.accountId] = {
            status: "ready",
            value: castDraft(value.result),
            updatedAt: value.updatedAt,
            error: null,
          };
        });
        stateSend();
      },
      errorSet(input) {
        const value = errorSetValidator.parse(input);
        set(state => {
          const previous = state.usage.byAccountId[value.accountId];
          state.usage.byAccountId[value.accountId] = {
            status: "error",
            value: previous?.value ?? null,
            updatedAt: previous?.updatedAt ?? null,
            error: value.error,
          };
        });
        stateSend();
      },
    },
  };
};

export { usage, type AccountInput, type Usage, type UsageSlice, type nodeState_t };
export default usageStore;
