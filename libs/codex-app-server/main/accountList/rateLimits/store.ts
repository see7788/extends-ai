import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import type { WebContents } from "electron";
import { castDraft } from "immer";
import { z } from "zod";

const accountIdValidator = z.string().regex(/^[a-f0-9]{24}$/);
const accountCommandValidator = z.object({ accountId: accountIdValidator });
const windowValidator = z.object({
  usedPercent: z.number(),
  windowDurationMins: z.number().nonnegative(),
  resetsAt: z.number().int().nonnegative(),
}).passthrough();
const bucketValidator = z.object({
  limitId: z.string().min(1),
  limitName: z.string().nullable().optional(),
  primary: windowValidator.nullable().optional(),
  secondary: windowValidator.nullable().optional(),
  rateLimitReachedType: z.string().nullable().optional(),
  planType: z.string().nullable().optional(),
  credits: z.unknown().optional(),
}).passthrough();
const resetCreditValidator = z.object({
  id: z.string().min(1),
  resetType: z.string(),
  status: z.string(),
  grantedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative().nullable(),
  title: z.string().nullable(),
  description: z.string().nullable(),
}).passthrough();
const resultValidator = z.object({
  rateLimits: bucketValidator.nullable().optional(),
  rateLimitsByLimitId: z.record(z.string(), bucketValidator).optional(),
  rateLimitResetCredits: z.object({
    availableCount: z.number().int().nonnegative(),
    credits: z.array(resetCreditValidator).nullable(),
  }).passthrough().nullable().optional(),
}).passthrough();
const accountStateValidator = z.object({
  status: z.enum(["idle", "loading", "ready", "error"]),
  value: resultValidator.nullable(),
  updatedAt: z.string().datetime({ offset: true }).nullable(),
  error: z.string().nullable(),
});
const rateLimitsValidator = z.object({
  byAccountId: z.record(accountIdValidator, accountStateValidator),
});
const resultSetValidator = accountCommandValidator.extend({
  result: resultValidator,
  updatedAt: z.string().datetime({ offset: true }),
});
const errorSetValidator = accountCommandValidator.extend({ error: z.string() });
const commandResultValidator = z.object({ ok: z.literal(true) });
const requestValidator = z.discriminatedUnion("method", [
  z.object({ method: z.literal("stateRead") }),
  accountCommandValidator.extend({ method: z.literal("read") }),
]);
const messageValidator = z.object({
  method: z.literal("stateUpdated"),
  value: rateLimitsValidator,
});

type RateLimits = z.infer<typeof rateLimitsValidator>;
type AccountInput = z.infer<typeof accountCommandValidator>;
type RateLimitsSlice = {
  rateLimits: RateLimits;
  rateLimitsActions: {
    accountDelete(input: AccountInput): void;
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
const initial: RateLimits = { byAccountId: {} };
const rateLimits = {
  accountStateInitial,
  accountStateValidator,
  bucketValidator,
  channel: "rateLimits",
  commandResultValidator,
  initial,
  input: {
    command: accountCommandValidator,
    errorSet: errorSetValidator,
    resultSet: resultSetValidator,
  },
  messageValidator,
  rateLimitsValidator,
  requestValidator,
  resetCreditValidator,
  resultValidator,
  windowValidator,
};

const rateLimitsStore: ImmerStateCreator<RateLimitsSlice, nodeState_t> = (set, get) => {
  const stateSend = (): void => get().webContents?.send(
    rateLimits.channel,
    messageValidator.parse({ method: "stateUpdated", value: get().rateLimits }),
  );
  return {
    rateLimits: structuredClone(initial),
    rateLimitsActions: {
      accountDelete(input) {
        const { accountId } = accountCommandValidator.parse(input);
        set(state => { delete state.rateLimits.byAccountId[accountId]; });
        stateSend();
      },
      loadingSet(input) {
        const value = accountCommandValidator.parse(input);
        set(state => {
          const previous = state.rateLimits.byAccountId[value.accountId];
          state.rateLimits.byAccountId[value.accountId] = {
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
          state.rateLimits.byAccountId[value.accountId] = {
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
          const previous = state.rateLimits.byAccountId[value.accountId];
          state.rateLimits.byAccountId[value.accountId] = {
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

export {
  rateLimits,
  type AccountInput,
  type RateLimits,
  type RateLimitsSlice,
  type nodeState_t,
};
export default rateLimitsStore;
