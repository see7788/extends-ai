import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import { z } from "zod";
import { browser } from "browser-partition-main/browser/store.ts";

const candidateValidator = z.object({
  browserId: browser.browserIdValidator,
  browserName: z.string().trim().min(1).max(120),
  partition: z.string().trim().min(1),
});
const importRecordValidator = candidateValidator.omit({ partition: true }).extend({
  importedAt: z.string().datetime({ offset: true }),
});
const importHistoryValidator = z.record(
  browser.browserIdValidator,
  importRecordValidator,
);
const cookieImportValidator = z.object({
  activeBrowserId: browser.browserIdValidator.nullable(),
  authorizationExpiresAt: z.string().datetime({ offset: true }).nullable(),
  authorizationTimeoutSeconds: z.number().int().min(1).max(3_600),
  candidate: candidateValidator.nullable(),
  error: z.string().nullable(),
  errorBrowserId: browser.browserIdValidator.nullable(),
  history: importHistoryValidator.default({}),
  status: z.enum(["idle", "working", "ready", "error"]),
});
const createValidator = z.object({ browserId: browser.browserIdValidator });
const candidateClearValidator = candidateValidator.pick({ partition: true });
const authorizationTimeoutSecondsSetValidator = cookieImportValidator.pick({
  authorizationTimeoutSeconds: true,
});
const authorizationStartValidator = z.object({
  expiresAt: z.string().datetime({ offset: true }),
});
const operationFailValidator = z.object({ error: z.string().min(1) });
const commandValidator = z.object({});
const cancelResultValidator = z.object({ canceled: z.boolean() });
const discardResultValidator = z.object({ discarded: z.boolean() });
const settingResultValidator = z.object({ updated: z.boolean() });
const devToolsMessageValidator = z.object({
  id: z.number().int().positive().optional(),
  sessionId: z.string().min(1).optional(),
  result: z.unknown().optional(),
  error: z.object({
    code: z.number().int(),
    message: z.string().min(1),
  }).passthrough().optional(),
}).passthrough();
const devToolsTargetsValidator = z.object({
  targetInfos: z.array(z.object({
    targetId: z.string().min(1),
    type: z.string().min(1),
    url: z.string(),
  }).passthrough()),
});
const devToolsAttachedValidator = z.object({ sessionId: z.string().min(1) });
const browserCookieValidator = z.object({
  name: z.string().min(1).max(4096),
  value: z.string().max(1024 * 1024),
  domain: z.string().trim().min(1).max(255),
  path: z.string().max(4096),
  expires: z.number().finite(),
  httpOnly: z.boolean(),
  secure: z.boolean(),
  session: z.boolean(),
  sameSite: z.enum(["Strict", "Lax", "None"]).optional(),
  partitionKey: z.unknown().optional(),
}).passthrough();
const browserCookiesValidator = z.object({
  cookies: z.array(browserCookieValidator).max(512),
});

type CookieImport = z.infer<typeof cookieImportValidator>;
type CookieImportSlice = {
  cookieImport: CookieImport;
  cookieImportActions: {
    authorizationFinish(): void;
    authorizationStart(input: z.infer<typeof authorizationStartValidator>): void;
    authorizationTimeoutSecondsSet(
      input: z.infer<typeof authorizationTimeoutSecondsSetValidator>,
    ): void;
    candidateClear(input: z.infer<typeof candidateClearValidator>): boolean;
    cancel(): boolean;
    dispose(): void;
    operationCancel(): void;
    operationFail(input: z.infer<typeof operationFailValidator>): void;
    operationStart(input: z.infer<typeof createValidator>): void;
    operationSucceed(input: z.infer<typeof candidateValidator>): void;
    run<T>(execute: (signal: AbortSignal) => Promise<T>): Promise<T | undefined>;
  };
};

let active: AbortController | undefined;
const canceled = (error: unknown): boolean => (
  error instanceof Error && error.name === "AbortError"
);
const initial: CookieImport = {
  activeBrowserId: null,
  authorizationExpiresAt: null,
  authorizationTimeoutSeconds: 59,
  candidate: null,
  error: null,
  errorBrowserId: null,
  history: {},
  status: "idle",
};
const cookieImport = {
  candidateValidator,
  channel: {
    authorizationTimeoutSecondsSet: "login:cookie-import:authorization-timeout-seconds-set",
    cancel: "login:cookie-import:cancel",
    discard: "login:cookie-import:discard",
    start: "login:cookie-import:start",
    stateRead: "login:cookie-import:state-read",
    stateUpdated: "login:cookie-import:state-updated",
  },
  cookieImportValidator,
  cookiesValidator: browserCookiesValidator,
  devToolsAttachedValidator,
  devToolsMessageValidator,
  devToolsTargetsValidator,
  importHistoryValidator,
  initial,
  input: {
    authorizationStart: authorizationStartValidator,
    authorizationTimeoutSecondsSet: authorizationTimeoutSecondsSetValidator,
    candidateClear: candidateClearValidator,
    command: commandValidator,
    create: createValidator,
    operationFail: operationFailValidator,
  },
  result: {
    cancel: cancelResultValidator,
    discard: discardResultValidator,
    start: z.object({ completed: z.boolean() }),
    setting: settingResultValidator,
  },
};

const cookieImportStore: ImmerStateCreator<CookieImportSlice> = set => ({
  cookieImport: structuredClone(initial),
  cookieImportActions: {
    authorizationFinish() {
      set(state => {
        state.cookieImport.authorizationExpiresAt = null;
      });
    },
    authorizationStart(input) {
      const value = authorizationStartValidator.parse(input);
      set(state => {
        state.cookieImport.authorizationExpiresAt = value.expiresAt;
      });
    },
    authorizationTimeoutSecondsSet(input) {
      const value = authorizationTimeoutSecondsSetValidator.parse(input);
      set(state => {
        state.cookieImport.authorizationTimeoutSeconds = value.authorizationTimeoutSeconds;
      });
    },
    candidateClear(input) {
      const value = candidateClearValidator.parse(input);
      let cleared = false;
      set(state => {
        if (state.cookieImport.status !== "ready"
          || state.cookieImport.candidate?.partition !== value.partition) return;
        state.cookieImport.activeBrowserId = null;
        state.cookieImport.authorizationExpiresAt = null;
        state.cookieImport.candidate = null;
        state.cookieImport.error = null;
        state.cookieImport.errorBrowserId = null;
        state.cookieImport.status = "idle";
        cleared = true;
      });
      return cleared;
    },
    cancel() {
      if (!active || active.signal.aborted) return false;
      active.abort();
      return true;
    },
    dispose() {
      active?.abort();
      active = undefined;
    },
    operationCancel() {
      set(state => {
        state.cookieImport.activeBrowserId = null;
        state.cookieImport.authorizationExpiresAt = null;
        state.cookieImport.candidate = null;
        state.cookieImport.error = null;
        state.cookieImport.errorBrowserId = null;
        state.cookieImport.status = "idle";
      });
    },
    operationFail(input) {
      const value = operationFailValidator.parse(input);
      set(state => {
        const browserId = state.cookieImport.activeBrowserId;
        state.cookieImport.activeBrowserId = null;
        state.cookieImport.authorizationExpiresAt = null;
        state.cookieImport.candidate = null;
        state.cookieImport.error = value.error;
        state.cookieImport.errorBrowserId = browserId;
        state.cookieImport.status = "error";
      });
    },
    operationStart(input) {
      const value = createValidator.parse(input);
      set(state => {
        state.cookieImport.activeBrowserId = value.browserId;
        state.cookieImport.authorizationExpiresAt = null;
        state.cookieImport.candidate = null;
        state.cookieImport.error = null;
        state.cookieImport.errorBrowserId = null;
        state.cookieImport.status = "working";
      });
    },
    operationSucceed(input) {
      const value = candidateValidator.parse(input);
      set(state => {
        state.cookieImport.activeBrowserId = null;
        state.cookieImport.authorizationExpiresAt = null;
        state.cookieImport.candidate = value;
        state.cookieImport.error = null;
        state.cookieImport.errorBrowserId = null;
        state.cookieImport.history[value.browserId] = {
          browserId: value.browserId,
          browserName: value.browserName,
          importedAt: new Date().toISOString(),
        };
        state.cookieImport.status = "ready";
      });
    },
    async run<T>(execute: (signal: AbortSignal) => Promise<T>): Promise<T | undefined> {
      if (active) throw new Error("已有 Cookie 导入操作正在进行");
      const controller = new AbortController();
      active = controller;
      try {
        return await execute(controller.signal);
      } catch (error) {
        if (canceled(error)) return undefined;
        throw error;
      } finally {
        if (active === controller) active = undefined;
      }
    },
  },
});

export { cookieImport };
export default cookieImportStore;
