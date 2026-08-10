import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import type { WebContents } from "electron";
import { z } from "zod";

const accountIdValidator = z.string().regex(/^[a-f0-9]{24}$/);
const accountCommandValidator = z.object({
  accountId: accountIdValidator,
});
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
  status: z.enum([
    "unknown",
    "checking",
    "authenticated",
    "requiresLogin",
    "error",
  ]),
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
const loadingSetValidator = accountCommandValidator;
const resultSetValidator = accountCommandValidator.extend({
  checkedAt: z.string().datetime({ offset: true }),
  result: accountReadResultValidator,
});
const errorSetValidator = accountCommandValidator.extend({
  checkedAt: z.string().datetime({ offset: true }),
  error: z.string(),
});
const resultValidator = z.object({ ok: z.literal(true) });

type AuthSessions = z.infer<typeof authSessionsValidator>;
type LoadingSetInput = z.infer<typeof loadingSetValidator>;
type ResultSetInput = z.infer<typeof resultSetValidator>;
type ErrorSetInput = z.infer<typeof errorSetValidator>;
type AuthSessionsSlice = {
  authSessions: AuthSessions;
  authSessionsActions: {
    accountDelete(input: z.infer<typeof accountCommandValidator>): void;
    install(): () => void;
    loadingSet(input: LoadingSetInput): void;
    resultSet(input: ResultSetInput): void;
    errorSet(input: ErrorSetInput): void;
  };
};

const initial: AuthSessions = { byAccountId: {} };
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

const authSessions = {
  accountReadResultValidator,
  authSessionValidator,
  authSessionsValidator,
  channel: {
    read: "account-list:auth-sessions-read",
    stateRead: "account-list:auth-sessions-state-read",
    stateUpdated: "account-list:auth-sessions-state-updated",
  },
  initial,
  input: {
    command: accountCommandValidator,
    errorSet: errorSetValidator,
    loadingSet: loadingSetValidator,
    resultSet: resultSetValidator,
  },
  resultValidator,
};

const authSessionsStore: ImmerStateCreator<
  AuthSessionsSlice,
  { webContents?: WebContents }
> = (set, get) => {
  const stateSend = (): void => get().webContents?.send(
    authSessions.channel.stateUpdated,
    authSessionsValidator.parse(get().authSessions),
  );
  return ({
  authSessions: structuredClone(initial),
  authSessionsActions: {
    accountDelete(input) {
      const { accountId } = accountCommandValidator.parse(input);
      set(state => {
        delete state.authSessions.byAccountId[accountId];
      });
      stateSend();
    },
    install() {
      const contents = get().webContents;
      if (!contents || contents.isDestroyed()) {
        throw new Error("CodexAppServer WebContents 不可用");
      }
      contents.ipc.handle(authSessions.channel.stateRead, () => (
        authSessionsValidator.parse(get().authSessions)
      ));
      return () => contents.ipc.removeHandler(authSessions.channel.stateRead);
    },
    loadingSet(input) {
      const value = loadingSetValidator.parse(input);
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
          status: value.result.account?.type === "chatgpt"
            ? "authenticated"
            : "requiresLogin",
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
  });
};

export { authSessions };
export default authSessionsStore;
