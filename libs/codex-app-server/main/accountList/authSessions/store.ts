import type { ImmerStateCreator } from "zustand-lib/immerStateCreator";
import type { WebContents } from "electron";
import { z } from "zod";

const accountIdValidator = z.string().regex(/^[a-f0-9]{24}$/);
const accountCommandValidator = z.object({ accountId: accountIdValidator });
const accountReadResultValidator = z.object({
  account: z.object({
    type: z.string(),
    email: z.string().email().nullable().optional(),
    planType: z.string().nullable().optional(),
  }).passthrough().nullable(),
  requiresOpenaiAuth: z.boolean(),
}).passthrough();
const authSessionValidator = z.object({
  accountId: accountIdValidator,
  status: z.enum(["unknown", "checking", "authenticated", "requiresLogin", "error"]),
  authMode: z.string().nullable(),
  accountType: z.string().nullable(),
  email: z.string().email().nullable(),
  planType: z.string().nullable(),
  requiresOpenaiAuth: z.boolean().nullable(),
  lastCheckedAt: z.string().datetime({ offset: true }).nullable(),
  error: z.string().nullable(),
});
const authSessionsValidator = z.object({
  byAccountId: z.record(accountIdValidator, authSessionValidator),
});
const resultSetValidator = accountCommandValidator.extend({
  checkedAt: z.string().datetime({ offset: true }),
  result: accountReadResultValidator,
});
const errorSetValidator = accountCommandValidator.extend({
  checkedAt: z.string().datetime({ offset: true }),
  error: z.string(),
});
const requestValidator = z.discriminatedUnion("method", [
  z.object({ method: z.literal("stateRead") }),
]);
const messageValidator = z.object({
  method: z.literal("stateUpdated"),
  value: authSessionsValidator,
});

type AuthSessions = z.infer<typeof authSessionsValidator>;
type AccountCommandInput = z.infer<typeof accountCommandValidator>;
type AuthSessionsSlice = {
  authSessions: AuthSessions;
  authSessionsActions: {
    accountDelete(input: AccountCommandInput): void;
    communicationStart(): () => void;
    loadingSet(input: AccountCommandInput): void;
    resultSet(input: z.infer<typeof resultSetValidator>): void;
    errorSet(input: z.infer<typeof errorSetValidator>): void;
  };
};
type nodeState_t = { webContents_nodestate?: WebContents };

const initial: AuthSessions = { byAccountId: {} };
const authSessions = {
  accountReadResultValidator,
  authSessionValidator,
  authSessionsValidator,
  channel: "authSessions",
  initial,
  input: {
    command: accountCommandValidator,
    errorSet: errorSetValidator,
    loadingSet: accountCommandValidator,
    resultSet: resultSetValidator,
  },
  messageValidator,
  requestValidator,
};

const authSessionsStore: ImmerStateCreator<AuthSessionsSlice, nodeState_t> = (set, get) => {
  const emptySession = (accountId: string) => ({
    accountId,
    status: "unknown" as const,
    authMode: null,
    accountType: null,
    email: null,
    planType: null,
    requiresOpenaiAuth: null,
    lastCheckedAt: null,
    error: null,
  });
  const requiresLoginError = (error: string): boolean => [
    /refresh token was revoked/i,
    /log out and sign in again/i,
    /authentication required/i,
    /unauthenticated/i,
    /login required/i,
  ].some(pattern => pattern.test(error));
  const stateSend = (): void => get().webContents_nodestate?.send(
    authSessions.channel,
    messageValidator.parse({ method: "stateUpdated", value: get().authSessions }),
  );
  return {
    authSessions: structuredClone(initial),
    authSessionsActions: {
    accountDelete(input) {
        const { accountId } = accountCommandValidator.parse(input);
        set(state => { delete state.authSessions.byAccountId[accountId]; });
      stateSend();
    },
    communicationStart() {
      const contents = get().webContents_nodestate;
      if (!contents || contents.isDestroyed()) throw new Error("WebContents 不可用");
      contents.ipc.handle(authSessions.channel, (_event, input: unknown) => {
        authSessions.requestValidator.parse(input);
        return authSessions.authSessionsValidator.parse(get().authSessions);
      });
      return () => contents.ipc.removeHandler(authSessions.channel);
    },
      loadingSet(input) {
        const value = accountCommandValidator.parse(input);
        set(state => {
          const previous = state.authSessions.byAccountId[value.accountId]
            ?? emptySession(value.accountId);
          state.authSessions.byAccountId[value.accountId] = {
            ...previous,
            status: "checking",
            error: null,
          };
        });
        stateSend();
      },
      resultSet(input) {
        const value = resultSetValidator.parse(input);
        set(state => {
          state.authSessions.byAccountId[value.accountId] = {
            accountId: value.accountId,
            status: value.result.account?.type === "chatgpt" ? "authenticated" : "requiresLogin",
            authMode: value.result.account?.type ?? null,
            accountType: value.result.account?.type ?? null,
            email: value.result.account?.email ?? null,
            planType: value.result.account?.planType ?? null,
            requiresOpenaiAuth: value.result.requiresOpenaiAuth,
            lastCheckedAt: value.checkedAt,
            error: null,
          };
        });
        stateSend();
      },
      errorSet(input) {
        const value = errorSetValidator.parse(input);
        set(state => {
          const previous = state.authSessions.byAccountId[value.accountId]
            ?? emptySession(value.accountId);
          const requiresLogin = requiresLoginError(value.error);
          state.authSessions.byAccountId[value.accountId] = {
            ...previous,
            status: requiresLogin ? "requiresLogin" : "error",
            requiresOpenaiAuth: requiresLogin ? true : previous.requiresOpenaiAuth,
            lastCheckedAt: value.checkedAt,
            error: value.error,
          };
        });
        stateSend();
      },
    },
  };
};

export {
  authSessions,
  type AccountCommandInput,
  type AuthSessions,
  type AuthSessionsSlice,
  type nodeState_t,
};
export default authSessionsStore;
