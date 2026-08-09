import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
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
const commandResultValidator = z.object({ ok: z.literal(true) });

type Usage = z.infer<typeof usageValidator>;
type AccountInput = z.infer<typeof accountCommandValidator>;
type ResultSetInput = z.infer<typeof resultSetValidator>;
type ErrorSetInput = z.infer<typeof errorSetValidator>;
type UsageSlice = {
  usage: Usage;
  usageActions: {
    accountDelete(input: AccountInput): void;
    loadingSet(input: AccountInput): void;
    resultSet(input: ResultSetInput): void;
    errorSet(input: ErrorSetInput): void;
  };
};

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
  channel: {
    read: "account-list:usage-read",
    stateRead: "account-list:usage-state-read",
    stateUpdated: "account-list:usage-state-updated",
  },
  commandResultValidator,
  initial,
  input: {
    command: accountCommandValidator,
    errorSet: errorSetValidator,
    resultSet: resultSetValidator,
  },
  resultValidator,
  usageValidator,
};

const usageStore: ImmerStateCreator<UsageSlice> = (set, get) => ({
  usage: structuredClone(initial),
  usageActions: {
    accountDelete(input) {
      const { accountId } = accountCommandValidator.parse(input);
      set(state => {
        delete state.usage.byAccountId[accountId];
      });
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
    },
  },
});

export { usage };
export default usageStore;
